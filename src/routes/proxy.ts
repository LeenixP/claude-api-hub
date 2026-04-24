import http from 'http';
import crypto from 'crypto';
import { sendJson, sendError, readBody, maskKey } from '../utils/http.js';
import { forwardRequest, forwardStream } from '../services/forwarder.js';
import { logger } from '../logger.js';
import { isKiroProvider } from '../providers/factory.js';
import type { AnthropicRequest } from '../providers/types.js';
import type { LogEntry, LogDetail } from '../services/log-manager.js';
import type { RouteContext } from './types.js';
import type { PerIpRateLimiter } from '../middleware/auth.js';

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
      sendError(res, 400, 'invalid_request_error', (err as Error).message, config, origin); return true;
    }
    let anthropicReq: AnthropicRequest;
    try { anthropicReq = JSON.parse(bodyStr) as AnthropicRequest; } catch {
      sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return true;
    }
    if (!anthropicReq.model) {
      sendError(res, 400, 'invalid_request_error', 'Missing required field: model', config, origin); return true;
    }

    const rawModel = anthropicReq.model;
    const claudeModel = rawModel.toLowerCase().includes('haiku') ? 'Haiku'
      : rawModel.toLowerCase().includes('sonnet') ? 'Sonnet'
      : rawModel.toLowerCase().includes('opus') ? 'Opus'
      : rawModel;

    const tierKey = claudeModel.toLowerCase();
    const tierTimeout = config.tierTimeouts?.[tierKey];
    const reqTimeoutMs = tierTimeout?.timeoutMs ?? config.streamTimeoutMs ?? 300000;
    const reqStreamTimeoutMs = tierTimeout?.streamTimeoutMs ?? config.streamTimeoutMs ?? 120000;
    const reqStreamIdleMs = tierTimeout?.streamIdleTimeoutMs ?? config.streamIdleTimeoutMs ?? 120000;

    let routeResult;
    try { routeResult = router.route(anthropicReq.model); } catch (err) {
      logManager.addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel: '', provider: '', protocol: '', targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: (err as Error).message });
      sendError(res, 500, 'api_error', (err as Error).message, config, origin); return true;
    }

    const { provider, resolvedModel } = routeResult;
    const poolable = provider as { reportSuccess?(): void; reportError?(): void };
    anthropicReq.model = resolvedModel;
    const protocol = provider.config.passthrough ? 'Anthropic' : 'OpenAI';
    let built: { url: string; headers: Record<string, string>; body: string };
    try { built = provider.buildRequest(anthropicReq); } catch (err) {
      logManager.addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel, provider: provider.name, protocol, targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: `Build error: ${(err as Error).message}` });
      sendError(res, 500, 'api_error', `Provider build error: ${(err as Error).message}`, config, origin); return true;
    }

    if (provider.config.passthrough) {
      for (const h of ['anthropic-version', 'anthropic-beta', 'anthropic-dangerous-direct-browser-access']) {
        if (req.headers[h]) built.headers[h] = req.headers[h] as string;
      }
    }

    res.setHeader('X-Request-Id', requestId);
    const maskedHeaders = { ...built.headers };
    if (maskedHeaders['x-api-key']) maskedHeaders['x-api-key'] = maskKey(maskedHeaders['x-api-key']);
    if (maskedHeaders['Authorization']) maskedHeaders['Authorization'] = 'Bearer ***';
    const logBase: LogEntry = {
      time: new Date().toISOString(), requestId, claudeModel, resolvedModel,
      provider: provider.name, protocol, targetUrl: built.url, stream: !!anthropicReq.stream,
      status: 0, durationMs: 0,
    };
    const logDetail: LogDetail = { originalBody: bodyStr, requestBody: built.body, forwardedHeaders: maskedHeaders };

    if (anthropicReq.stream) {
      let headersSent = false;
      let streamInputTokens = 0;
      let streamOutputTokens = 0;
      let chunkBuf = '';

      function sniffTokens(raw: string): void {
        chunkBuf += raw;
        const lines = chunkBuf.split('\n');
        chunkBuf = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const json = trimmed.slice(5).trim();
          if (json === '[DONE]') continue;
          if (!json.includes('usage') && !json.includes('message_start')) continue;
          try {
            const parsed = JSON.parse(json);
            if (parsed.type === 'message_start' && parsed.message?.usage) {
              streamInputTokens = parsed.message.usage.input_tokens || 0;
            }
            if (parsed.type === 'message_delta' && parsed.usage) {
              streamOutputTokens = parsed.usage.output_tokens || 0;
            }
            if (parsed.usage) {
              if (parsed.usage.prompt_tokens) streamInputTokens = parsed.usage.prompt_tokens;
              if (parsed.usage.completion_tokens) streamOutputTokens = parsed.usage.completion_tokens;
            }
          } catch { /* skip malformed SSE data lines */ }
        }
      }

      forwardStream(
        built.url, built.headers, built.body,
        (chunk) => {
          sniffTokens(chunk);
          if (headersSent) res.write(chunk);
        },
        () => {
          poolable.reportSuccess?.();
          rateTracker?.record(streamInputTokens + streamOutputTokens || undefined);
          logManager.addLog({
            ...logBase, status: 200, durationMs: Date.now() - startTime,
            inputTokens: streamInputTokens, outputTokens: streamOutputTokens,
          }, logDetail);
          res.end();
        },
        (err) => {
          poolable.reportError?.();
          if (!headersSent) {
            logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: err.message }, logDetail);
            sendError(res, 502, 'api_error', `Upstream stream error: ${err.message}`, config, origin);
          } else {
            logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: err.message }, logDetail);
            res.write(`data: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: err.message } })}\n\n`);
            res.end();
          }
        },
        (statusCode, _headers, rawBody) => {
          if (statusCode !== 200) {
            logManager.addLog({ ...logBase, status: statusCode, durationMs: Date.now() - startTime, error: rawBody?.slice(0, 200) }, logDetail);
            res.writeHead(statusCode, { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...cors });
            res.end(rawBody);
            return;
          }
          headersSent = true;
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Request-Id': requestId,
            ...cors,
          });
        },
        reqStreamTimeoutMs,
        reqStreamIdleMs,
      );
      return true;
    }

    let upstream;
    try { upstream = await forwardRequest(built.url, built.headers, built.body, reqTimeoutMs, config.maxResponseBytes); } catch (err) {
      poolable.reportError?.();
      logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: (err as Error).message }, logDetail);
      sendError(res, 502, 'api_error', `Upstream request failed: ${(err as Error).message}`, config, origin); return true;
    }

    if (upstream.status !== 200) {
      poolable.reportError?.();
      let errMsg = '';
      try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 200); } catch { errMsg = upstream.body.slice(0, 200); }
      logManager.addLog({ ...logBase, status: upstream.status, durationMs: Date.now() - startTime, error: errMsg }, { ...logDetail, upstreamBody: upstream.body });
      res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...cors });
      res.end(upstream.body);
      return true;
    }

    let upstreamJson;
    if (isKiroProvider(provider.config)) {
      upstreamJson = upstream.body;
    } else {
      try { upstreamJson = JSON.parse(upstream.body); } catch {
        logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: 'Invalid JSON from upstream' }, { ...logDetail, upstreamBody: upstream.body });
        sendError(res, 502, 'api_error', 'Invalid JSON from upstream provider', config, origin); return true;
      }
    }

    let anthropicResp;
    try { anthropicResp = provider.parseResponse(upstreamJson, anthropicReq.model); } catch (err) {
      logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: `Parse error: ${(err as Error).message}` }, logDetail);
      sendError(res, 502, 'api_error', `Response parse error: ${(err as Error).message}`, config, origin); return true;
    }

    const usage = anthropicResp.usage || (upstreamJson.usage ? { input_tokens: upstreamJson.usage.prompt_tokens, output_tokens: upstreamJson.usage.completion_tokens } : null);
    poolable.reportSuccess?.();
    rateTracker?.record((usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0) || undefined);
    logManager.addLog({
      ...logBase, status: 200, durationMs: Date.now() - startTime,
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
    }, logDetail);
    sendJson(res, 200, anthropicResp, config, origin);
    return true;
  }

  return false;
}
