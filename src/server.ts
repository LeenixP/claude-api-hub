import http from 'http';
import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { ModelRouter } from './router.js';
import { AnthropicRequest, GatewayConfig, ProviderConfig } from './providers/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { GenericOpenAIProvider } from './providers/generic.js';
import { dashboardHtml } from './dashboard.js';
import { getConfigPath, loadConfig } from './config.js';
import { logger } from './logger.js';
import { getCorsHeaders, sendJson, sendError, readBody, maskKey } from './utils/http.js';
import { PerIpRateLimiter, requireAdmin, setSecurityHeaders } from './middleware/auth.js';
import { LogManager } from './services/log-manager.js';
import type { LogEntry, LogDetail } from './services/log-manager.js';
import { forwardRequest, forwardStream, httpGet } from './services/forwarder.js';

const logManager = new LogManager();

function saveConfig(config: GatewayConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function rebuildProviders(router: ModelRouter, config: GatewayConfig): void {
  const providers: import('./providers/types.js').Provider[] = [];
  for (const [, pc] of Object.entries(config.providers)) {
    if (!pc.enabled) continue;
    providers.push(pc.passthrough ? new ClaudeProvider(pc) : new GenericOpenAIProvider(pc));
  }
  router.replaceAll(providers);
}

export function createServer(router: ModelRouter, config: GatewayConfig): http.Server {
  let rateLimiter: PerIpRateLimiter | null = null;
  if (config.rateLimitRpm && config.rateLimitRpm > 0) {
    rateLimiter = new PerIpRateLimiter(config.rateLimitRpm);
  }
  if (!config.adminToken && !process.env.ADMIN_TOKEN) {
    logger.warn('No adminToken configured — management API is unprotected. Set adminToken in config or ADMIN_TOKEN env var.');
  }

  return http.createServer(async (req, res) => {
    const origin = req.headers['origin'] as string | undefined;
    const cors = getCorsHeaders(config, origin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    const pathname = req.url?.split('?')[0] ?? '/';
    setSecurityHeaders(res);

    // ─── Public Routes ───

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors });
      res.end(dashboardHtml(config.version || ''));
      return;
    }

    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() }, config, origin);
      return;
    }

    if (req.method === 'GET' && pathname === '/v1/models') {
      const models: Array<{ id: string; object: string; owned_by: string }> = [];
      for (const provider of router.getProviders()) {
        if (!provider.config.enabled) continue;
        for (const model of provider.config.models) {
          models.push({ id: model, object: 'model', owned_by: provider.name });
        }
      }
      sendJson(res, 200, { object: 'list', data: models }, config, origin);
      return;
    }

    // ─── Admin Auth Gate ───

    const isAdminEndpoint = pathname.startsWith('/api/') && pathname !== '/api/logs';
    const isAdminMutation = pathname.startsWith('/api/') && (
      req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE'
    );
    if (isAdminEndpoint || isAdminMutation) {
      if (!requireAdmin(req, res, config)) return;
    }

    // ─── Admin API Routes ───

    if (req.method === 'GET' && pathname === '/api/config') {
      const masked: GatewayConfig = {
        ...config,
        providers: Object.fromEntries(
          Object.entries(config.providers).map(([key, p]) => [key, { ...p, apiKey: maskKey(p.apiKey) }]),
        ),
      };
      sendJson(res, 200, masked, config, origin);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/fetch-models') {
      const results: Record<string, string[]> = {};
      const tasks = Object.entries(config.providers).map(async ([key, p]) => {
        if (!p.enabled || !p.apiKey) {
          results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
          return;
        }
        try {
          const url = p.passthrough ? `${p.baseUrl}/v1/models` : `${p.baseUrl}/models`;
          const hdrs: Record<string, string> = p.passthrough
            ? { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
            : { 'Authorization': `Bearer ${p.apiKey}` };
          const body = await httpGet(url, hdrs);
          const json = JSON.parse(body);
          const fetched = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
          results[p.name || key] = [...new Set([...fetched, ...(p.models || []), p.defaultModel].filter(Boolean))];
        } catch {
          results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
        }
      });
      await Promise.all(tasks);
      sendJson(res, 200, results, config, origin);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/config/providers') {
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return;
      }
      let body: Partial<ProviderConfig> & { name?: string };
      try { body = JSON.parse(bodyStr); } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return;
      }
      const { name, baseUrl, apiKey, models, defaultModel, enabled } = body;
      if (!name || !baseUrl || !apiKey || !models || !defaultModel) {
        sendError(res, 400, 'invalid_request_error', 'Missing required fields: name, baseUrl, apiKey, models, defaultModel', config, origin); return;
      }
      if (config.providers[name]) {
        sendError(res, 409, 'conflict_error', `Provider "${name}" already exists`, config, origin); return;
      }
      const allowedFields = ['name', 'baseUrl', 'apiKey', 'models', 'defaultModel', 'enabled', 'prefix', 'passthrough'];
      const newProvider: ProviderConfig = { name, baseUrl, apiKey, models, defaultModel, enabled: enabled ?? true };
      for (const [k, v] of Object.entries(body)) {
        if (allowedFields.includes(k) && !(k in newProvider)) {
          (newProvider as unknown as Record<string, unknown>)[k] = v;
        }
      }
      config.providers[name] = newProvider;
      saveConfig(config);
      rebuildProviders(router, config);
      sendJson(res, 201, { ...newProvider, apiKey: maskKey(newProvider.apiKey) }, config, origin);
      return;
    }

    const providerMatch = pathname.match(/^\/api\/config\/providers\/([^/]+)$/);
    if (providerMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      const providerName = decodeURIComponent(providerMatch[1]);
      if (!config.providers[providerName]) {
        sendError(res, 404, 'not_found_error', `Provider "${providerName}" not found`, config, origin); return;
      }
      if (req.method === 'DELETE') {
        delete config.providers[providerName];
        saveConfig(config);
        rebuildProviders(router, config);
        sendJson(res, 200, { deleted: providerName }, config, origin);
        return;
      }
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {   sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return;
      }
      let updates: Partial<ProviderConfig>;
      try { updates = JSON.parse(bodyStr); } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return;
      }
      const allowedUpdateFields = ['name', 'baseUrl', 'apiKey', 'models', 'defaultModel', 'enabled', 'prefix', 'passthrough'];
      const filtered: Partial<ProviderConfig> = {};
      for (const [k, v] of Object.entries(updates)) {
        if (allowedUpdateFields.includes(k)) {
          (filtered as unknown as Record<string, unknown>)[k] = v;
        }
      }
      config.providers[providerName] = { ...config.providers[providerName], ...filtered };
      saveConfig(config);
      rebuildProviders(router, config);
      const updated = config.providers[providerName];
      sendJson(res, 200, { ...updated, apiKey: maskKey(updated.apiKey) }, config, origin);
      return;
    }

    // ─── Log Routes ───

    if (req.method === 'GET' && pathname === '/api/logs') {
      sendJson(res, 200, logManager.getLogs(), config, origin);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/logs/clear') {
      logManager.clearLogs();
      sendJson(res, 200, { cleared: true }, config, origin);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/logs/file-status') {
      sendJson(res, 200, {
        enabled: logManager.isFileLogging(),
        fileCount: logManager.getFileCount(),
        maxFiles: logManager.maxFiles,
        logDir: logManager.logDir,
      }, config, origin);
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/logs/file-toggle') {
      sendJson(res, 200, { enabled: logManager.toggleFileLogging() }, config, origin);
      return;
    }

    // ─── Health Providers ───

    if (req.method === 'GET' && pathname === '/api/health/providers') {
      const results: Record<string, { status: string; latencyMs: number; error?: string; modelCount?: number }> = {};
      const tasks = Object.entries(config.providers).map(async ([key, p]) => {
        if (!p.enabled) { results[p.name || key] = { status: 'disabled', latencyMs: 0 }; return; }
        if (!p.apiKey) { results[p.name || key] = { status: 'no_key', latencyMs: 0 }; return; }
        const start = Date.now();
        try {
          const url = p.passthrough ? `${p.baseUrl}/v1/models` : `${p.baseUrl}/models`;
          const hdrs: Record<string, string> = p.passthrough
            ? { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' }
            : { 'Authorization': `Bearer ${p.apiKey}` };

          const body = await httpGet(url, hdrs, 8000);
          const latency = Date.now() - start;
          try {
            const json = JSON.parse(body);
            results[p.name || key] = { status: 'ok', latencyMs: latency, modelCount: (json.data || []).length };
          } catch {
            results[p.name || key] = { status: 'ok', latencyMs: latency };
          }
        } catch (err) {
          const latency = Date.now() - start;
          const msg = (err as Error).message;
          results[p.name || key] = { status: msg.includes('timeout') ? 'timeout' : 'error', latencyMs: latency, error: msg };
        }
      });
      await Promise.all(tasks);
      sendJson(res, 200, results, config, origin);
      return;
    }

    // ─── Aliases ───

    if (req.method === 'GET' && pathname === '/api/aliases') {
      sendJson(res, 200, config.aliases ?? {}, config, origin);
      return;
    }

    if (req.method === 'PUT' && pathname === '/api/aliases') {
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return;
      }
      let newAliases: Record<string, string>;
      try { newAliases = JSON.parse(bodyStr); } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return;
      }
      const validTiers = ['haiku', 'sonnet', 'opus'];
      const invalidKeys = Object.keys(newAliases).filter(k => !validTiers.includes(k));
      if (invalidKeys.length > 0) {
        sendError(res, 400, 'invalid_request_error', `Invalid alias keys: ${invalidKeys.join(', ')}. Only haiku, sonnet, opus are allowed.`, config, origin); return;
      }
      config.aliases = newAliases;
      router.setAliases(newAliases);
      saveConfig(config);
      sendJson(res, 200, config.aliases, config, origin);
      return;
    }

    // ─── Config Reload ───

    if (req.method === 'POST' && pathname === '/api/config/reload') {
      try {
        const fresh = loadConfig(getConfigPath());
        Object.assign(config, fresh);
        router.setAliases(config.aliases ?? {});
        rebuildProviders(router, config);
        const masked: GatewayConfig = {
          ...config,
          providers: Object.fromEntries(
            Object.entries(config.providers).map(([key, p]) => [key, { ...p, apiKey: maskKey(p.apiKey) }]),
          ),
        };
        sendJson(res, 200, { reloaded: true, config: masked }, config, origin);
      } catch (err) {
        sendError(res, 500, 'api_error', `Reload failed: ${(err as Error).message}`, config, origin);
      }
      return;
    }

    // ─── Proxy: /v1/messages ───

    if (req.method === 'POST' && pathname === '/v1/messages') {
      if (rateLimiter) {
        const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
          || req.socket.remoteAddress || 'unknown';
        const rl = rateLimiter.tryConsume(clientIp);
        res.setHeader('X-RateLimit-Remaining', rl.remaining.toString());
        if (!rl.allowed) {
          res.setHeader('Retry-After', rl.retryAfter.toString());
          sendError(res, 429, 'rate_limit_error', 'Too many requests. Please slow down.', config, origin);
          return;
        }
      }

      const startTime = Date.now();
      const requestId = `req_${crypto.randomUUID()}`;
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch (err) {
        sendError(res, 400, 'invalid_request_error', (err as Error).message, config, origin); return;
      }
      let anthropicReq: AnthropicRequest;
      try { anthropicReq = JSON.parse(bodyStr) as AnthropicRequest; } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return;
      }
      if (!anthropicReq.model) {
        sendError(res, 400, 'invalid_request_error', 'Missing required field: model', config, origin); return;
      }

      const rawModel = anthropicReq.model;
      const claudeModel = rawModel.toLowerCase().includes('haiku') ? 'Haiku'
        : rawModel.toLowerCase().includes('sonnet') ? 'Sonnet'
        : rawModel.toLowerCase().includes('opus') ? 'Opus'
        : rawModel;

      let routeResult;
      try { routeResult = router.route(anthropicReq.model); } catch (err) {
        logManager.addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel: '', provider: '', protocol: '', targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: (err as Error).message });
        sendError(res, 500, 'api_error', (err as Error).message, config, origin); return;
      }

      const { provider, resolvedModel } = routeResult;
      anthropicReq.model = resolvedModel;
      const protocol = provider.config.passthrough ? 'Anthropic' : 'OpenAI';
      let built: { url: string; headers: Record<string, string>; body: string };
      try { built = provider.buildRequest(anthropicReq); } catch (err) {
        logManager.addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel, provider: provider.name, protocol, targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: `Build error: ${(err as Error).message}` });
        sendError(res, 500, 'api_error', `Provider build error: ${(err as Error).message}`, config, origin); return;
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
        forwardStream(
          built.url, built.headers, built.body,
          (chunk) => { if (headersSent) res.write(chunk); },
          () => {
            logManager.addLog({ ...logBase, status: 200, durationMs: Date.now() - startTime }, logDetail);
            res.end();
          },
          (err) => {
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
          config.streamTimeoutMs ?? 30000,
          config.streamIdleTimeoutMs ?? 60000,
        );
        return;
      }

      let upstream;
      try { upstream = await forwardRequest(built.url, built.headers, built.body, undefined, config.maxResponseBytes); } catch (err) {
        logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: (err as Error).message }, logDetail);
        sendError(res, 502, 'api_error', `Upstream request failed: ${(err as Error).message}`, config, origin); return;
      }

      if (upstream.status !== 200) {
        let errMsg = '';
        try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 200); } catch { errMsg = upstream.body.slice(0, 200); }
        logManager.addLog({ ...logBase, status: upstream.status, durationMs: Date.now() - startTime, error: errMsg }, { ...logDetail, upstreamBody: upstream.body });
        res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...cors });
        res.end(upstream.body);
        return;
      }

      let upstreamJson;
      try { upstreamJson = JSON.parse(upstream.body); } catch {
        logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: 'Invalid JSON from upstream' }, { ...logDetail, upstreamBody: upstream.body });
        sendError(res, 502, 'api_error', 'Invalid JSON from upstream provider', config, origin); return;
      }

      let anthropicResp;
      try { anthropicResp = provider.parseResponse(upstreamJson, anthropicReq.model); } catch (err) {
        logManager.addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: `Parse error: ${(err as Error).message}` }, logDetail);
        sendError(res, 502, 'api_error', `Response parse error: ${(err as Error).message}`, config, origin); return;
      }

      logManager.addLog({ ...logBase, status: 200, durationMs: Date.now() - startTime }, logDetail);
      sendJson(res, 200, anthropicResp, config, origin);
      return;
    }

    sendError(res, 404, 'not_found_error', `Unknown endpoint: ${req.method} ${pathname}`, config, origin);
  });
}
