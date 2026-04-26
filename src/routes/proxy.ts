import http from 'http';
import crypto from 'crypto';
import { sendJson, sendError, readBody, maskKey } from '../utils/http.js';
import { getErrorMessage } from '../utils/error.js';
import { forwardRequest, forwardStream } from '../services/forwarder.js';
import { logger } from '../logger.js';
import { isKiroProvider } from '../providers/factory.js';
import type { AnthropicRequest, Provider } from '../providers/types.js';
import type { LogEntry, LogDetail } from '../services/log-manager.js';
import type { RouteContext } from './types.js';
import type { PerIpRateLimiter } from '../middleware/auth.js';
import { captureBetaHeader, withBetaQueryParam } from './test-request.js';

/** Recursively strip cache_control from request objects */
function stripCacheControl(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { for (const item of obj) stripCacheControl(item); return; }
  const record = obj as Record<string, unknown>;
  if ('cache_control' in record) delete record.cache_control;
  for (const val of Object.values(record)) stripCacheControl(val);
}

function createTokenSniffer(): {
  processChunk: (chunk: string) => void;
  getUsage: () => { inputTokens: number; outputTokens: number } | null;
} {
  let chunkBuf = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let foundUsage = false;

  function processChunk(chunk: string) {
    chunkBuf += chunk;
    if (chunkBuf.length > 1024 * 1024) {
      chunkBuf = chunkBuf.slice(-512 * 1024);
      return;
    }
    const lines = chunkBuf.split('\n');
    chunkBuf = lines.pop() || '';
    for (const line of lines) {
      const data = line.replace(/^data:\s*/, '').trim();
      if (!data || data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        if (json.type === 'message_start' && json.message?.usage) {
          inputTokens = json.message.usage.input_tokens || 0;
          foundUsage = true;
        }
        if (json.type === 'message_delta' && json.usage) {
          outputTokens = json.usage.output_tokens || 0;
          foundUsage = true;
        }
        if (json.usage) {
          if (json.usage.input_tokens) inputTokens = json.usage.input_tokens;
          if (json.usage.output_tokens) outputTokens = json.usage.output_tokens;
          foundUsage = true;
        }
      } catch { /* not JSON, skip */ }
    }
  }

  function getUsage() {
    return foundUsage ? { inputTokens, outputTokens } : null;
  }

  return { processChunk, getUsage };
}

async function handleStreamProxy(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  provider: Provider,
  built: { url: string; headers: Record<string, string>; body: string; usedKey: string },
  anthropicReq: AnthropicRequest,
  requestId: string,
  logEntry: LogEntry,
  logDetail: LogDetail,
  startTime: number,
  timeoutMs: number,
  idleTimeoutMs: number,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<void> {
  const sniffer = createTokenSniffer();

  forwardStream(
    built.url, built.headers, built.body,
    (chunk) => {
      sniffer.processChunk(chunk);
      if (res.headersSent) return res.write(chunk);
      return;
    },
    () => {
      const usage = sniffer.getUsage();
      provider.reportSuccess?.(built.usedKey);
      ctx.rateTracker?.record((usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) || undefined);
      ctx.logManager?.addLog({
        ...logEntry,
        status: 200,
        durationMs: Date.now() - startTime,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      }, logDetail);
      res.end();
    },
    (err) => {
      provider.reportError?.(built.usedKey);
      const errMsg = getErrorMessage(err);
      if (!res.headersSent) {
        ctx.logManager?.addLog({ ...logEntry, status: 502, durationMs: Date.now() - startTime, error: errMsg }, logDetail);
        sendError(res, 502, 'api_error', `Upstream stream error: ${errMsg}`, ctx.config, origin);
      } else {
        ctx.logManager?.addLog({ ...logEntry, status: 502, durationMs: Date.now() - startTime, error: errMsg }, logDetail);
        res.write(`data: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: errMsg } })}\n\n`);
        res.end();
      }
    },
    (statusCode, _headers, rawBody) => {
      if (statusCode !== 200) {
        provider.reportError?.(built.usedKey);
        ctx.logManager?.addLog({ ...logEntry, status: statusCode, durationMs: Date.now() - startTime, error: rawBody?.slice(0, 200) }, logDetail);
        res.writeHead(statusCode, { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...cors });
        res.end(rawBody);
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Request-Id': requestId,
        ...cors,
      });
    },
    timeoutMs,
    idleTimeoutMs,
    res,
  );
}

async function handleNonStreamProxy(
  res: http.ServerResponse,
  ctx: RouteContext,
  provider: Provider,
  built: { url: string; headers: Record<string, string>; body: string; usedKey: string },
  anthropicReq: AnthropicRequest,
  requestId: string,
  logEntry: LogEntry,
  logDetail: LogDetail,
  startTime: number,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<void> {
  let upstream;
  try {
    upstream = await forwardRequest(built.url, built.headers, built.body, ctx.config.streamTimeoutMs ?? 120000, ctx.config.maxResponseBytes);
  } catch (err) {
    provider.reportError?.(built.usedKey);
    const errMsg = getErrorMessage(err);
    ctx.logManager?.addLog({ ...logEntry, status: 502, durationMs: Date.now() - startTime, error: errMsg }, logDetail);
    sendError(res, 502, 'api_error', `Upstream request failed: ${errMsg}`, ctx.config, origin);
    return;
  }

  if (upstream.status !== 200) {
    provider.reportError?.(built.usedKey);
    let errMsg = '';
    try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 200); } catch { errMsg = upstream.body.slice(0, 200); }
    ctx.logManager?.addLog({ ...logEntry, status: upstream.status, durationMs: Date.now() - startTime, error: errMsg }, { ...logDetail, upstreamBody: upstream.body });
    res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...cors });
    res.end(upstream.body);
    return;
  }

  let upstreamJson;
  if (isKiroProvider(provider.config)) {
    upstreamJson = upstream.body;
  } else {
    try { upstreamJson = JSON.parse(upstream.body); } catch {
      ctx.logManager?.addLog({ ...logEntry, status: 502, durationMs: Date.now() - startTime, error: 'Invalid JSON from upstream' }, { ...logDetail, upstreamBody: upstream.body });
      sendError(res, 502, 'api_error', 'Invalid JSON from upstream provider', ctx.config, origin);
      return;
    }
  }

  let anthropicResp;
  try { anthropicResp = provider.parseResponse(upstreamJson, anthropicReq.model); } catch (err) {
    const errMsg = getErrorMessage(err);
    ctx.logManager?.addLog({ ...logEntry, status: 502, durationMs: Date.now() - startTime, error: `Parse error: ${errMsg}` }, logDetail);
    sendError(res, 502, 'api_error', `Response parse error: ${errMsg}`, ctx.config, origin);
    return;
  }

  const usage = anthropicResp.usage || (upstreamJson.usage ? { input_tokens: upstreamJson.usage.prompt_tokens, output_tokens: upstreamJson.usage.completion_tokens } : null);
  provider.reportSuccess?.(built.usedKey);
  ctx.rateTracker?.record((usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0) || undefined);
  ctx.logManager?.addLog({
    ...logEntry,
    status: 200,
    durationMs: Date.now() - startTime,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  }, logDetail);
  sendJson(res, 200, anthropicResp, ctx.config, origin);
}

export async function handleProxyRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
  origin: string | undefined,
  rateLimiter: PerIpRateLimiter | null,
): Promise<boolean> {
  const { config, router, logManager, rateTracker } = ctx;

  if (req.method === 'POST' && pathname === '/v1/messages') {
    if (rateLimiter) {
      const clientIp = config.trustProxy
        ? ((req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown')
        : (req.socket.remoteAddress || 'unknown');
      const rl = rateLimiter.tryConsume(clientIp);
      res.setHeader('X-RateLimit-Remaining', rl.remaining.toString());
      res.setHeader('X-RateLimit-Limit', rateLimiter.rpm.toString());
      if (!rl.allowed) {
        res.setHeader('Retry-After', rl.retryAfter.toString());
        sendError(res, 429, 'rate_limit_error', 'Too many requests. Please slow down.', config, origin);
        return true;
      }
    }

    const startTime = Date.now();
    const requestId = `req_${crypto.randomUUID()}`;
    let bodyStr: string;
    try { bodyStr = await readBody(req); } catch (err) {
      sendError(res, 400, 'invalid_request_error', getErrorMessage(err), config, origin); return true;
    }
    let anthropicReq: AnthropicRequest;
    try { anthropicReq = JSON.parse(bodyStr) as AnthropicRequest; } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
    if (!anthropicReq.model) {
      sendError(res, 400, 'invalid_request_error', 'Missing required field: model', config, origin); return true;
    }

    const rawModel = anthropicReq.model;
    const lcModel = rawModel.toLowerCase();
    const claudeModel = lcModel.includes('haiku') ? 'Haiku'
      : lcModel.includes('sonnet') ? 'Sonnet'
      : lcModel.includes('opus') ? 'Opus'
      : rawModel;

    const tierKey = claudeModel.toLowerCase();
    const tierTimeout = config.tierTimeouts?.[tierKey];
    const reqTimeoutMs = tierTimeout?.timeoutMs ?? config.streamTimeoutMs ?? 300000;
    const reqStreamTimeoutMs = tierTimeout?.streamTimeoutMs ?? config.streamTimeoutMs ?? 120000;
    const reqStreamIdleMs = tierTimeout?.streamIdleTimeoutMs ?? config.streamIdleTimeoutMs ?? 120000;

    let routeResult;
    try { routeResult = router.route(anthropicReq.model); } catch (err) {
      logManager.addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel: '', provider: '', protocol: '', targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: getErrorMessage(err) });
      sendError(res, 500, 'api_error', getErrorMessage(err), config, origin); return true;
    }

    const { provider, resolvedModel } = routeResult;
    anthropicReq.model = resolvedModel;

    // Strip unsupported fields for providers that don't fully support Anthropic API
    const sanitize = provider.config.sanitize;
    if (Array.isArray(sanitize)) {
      for (const field of sanitize) {
        if (field === 'cache_control') {
          stripCacheControl(anthropicReq);
        } else {
          delete (anthropicReq as unknown as Record<string, unknown>)[field];
        }
      }
    }

    const protocol = provider.config.passthrough ? 'Anthropic' : 'OpenAI';
    let built: { url: string; headers: Record<string, string>; body: string; usedKey: string };
    try { built = provider.buildRequest(anthropicReq); } catch (err) {
      logManager.addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel, provider: provider.name, protocol, targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: `Build error: ${getErrorMessage(err)}` });
      sendError(res, 500, 'api_error', `Provider build error: ${getErrorMessage(err)}`, config, origin); return true;
    }

    if (provider.config.passthrough) {
      const skipHeaders = new Set([
        'host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding',
        'x-api-key', 'authorization',
      ]);
      for (const [h, v] of Object.entries(req.headers)) {
        if (!skipHeaders.has(h) && typeof v === 'string') {
          built.headers[h] = v;
          if (h === 'anthropic-beta') captureBetaHeader(v);
        }
      }
      built.url = withBetaQueryParam(built.url, true);
    }

    res.setHeader('X-Request-Id', requestId);
    const maskedHeaders = { ...built.headers };
    if (maskedHeaders['x-api-key']) maskedHeaders['x-api-key'] = maskKey(maskedHeaders['x-api-key']);
    if (maskedHeaders['Authorization']) maskedHeaders['Authorization'] = 'Bearer ***';
    const logEntry: LogEntry = {
      time: new Date().toISOString(), requestId, claudeModel, resolvedModel,
      provider: provider.config.key || provider.name, protocol, targetUrl: built.url, stream: !!anthropicReq.stream,
      status: 0, durationMs: 0,
    };
    const logDetail: LogDetail = { originalBody: bodyStr, requestBody: built.body, forwardedHeaders: maskedHeaders };

    if (anthropicReq.stream) {
      await handleStreamProxy(
        req, res, ctx, provider, built, anthropicReq,
        requestId, logEntry, logDetail, startTime,
        reqStreamTimeoutMs, reqStreamIdleMs, cors, origin,
      );
      return true;
    }

    await handleNonStreamProxy(
      res, ctx, provider, built, anthropicReq,
      requestId, logEntry, logDetail, startTime, cors, origin,
    );
    return true;
  }

  return false;
}
