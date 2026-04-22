import http from 'http';
import https from 'https';
import { writeFileSync } from 'fs';
import { URL } from 'url';
import { ModelRouter } from './router.js';
import { AnthropicRequest, GatewayConfig, ProviderConfig } from './providers/types.js';
import { dashboardHtml } from './dashboard.js';
import { getConfigPath, loadConfig } from './config.js';

interface LogEntry {
  time: string;
  originalModel: string;
  resolvedModel: string;
  provider: string;
  protocol: string;
  targetUrl: string;
  stream: boolean;
  status: number;
  durationMs: number;
  error?: string;
}

const requestLogs: LogEntry[] = [];
const MAX_LOGS = 200;

function addLog(entry: LogEntry): void {
  requestLogs.push(entry);
  if (requestLogs.length > MAX_LOGS) requestLogs.shift();
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, type: string, message: string): void {
  sendJson(res, status, { type: 'error', error: { type, message } });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function maskKey(key: string): string {
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

function saveConfig(config: GatewayConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

function forwardRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(
  url: string,
  headers: Record<string, string>,
  timeoutMs = 5000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      timeout: timeoutMs,
    };
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

function forwardStream(
  url: string,
  headers: Record<string, string>,
  body: string,
  onChunk: (chunk: string) => void,
  onEnd: () => void,
  onError: (err: Error) => void,
): void {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options: http.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'POST',
    headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
  };

  const req = lib.request(options, (res) => {
    res.on('data', (chunk: Buffer) => onChunk(chunk.toString('utf-8')));
    res.on('end', onEnd);
    res.on('error', onError);
  });

  req.on('error', onError);
  req.write(body);
  req.end();
}

export function createServer(router: ModelRouter, config: GatewayConfig): http.Server {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const pathname = req.url?.split('?')[0] ?? '/';

    // Dashboard
    if (req.method === 'GET' && pathname === '/') {
      const html = dashboardHtml();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS });
      res.end(html);
      return;
    }

    // Health check
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // List models
    if (req.method === 'GET' && pathname === '/v1/models') {
      const models: Array<{ id: string; object: string; owned_by: string }> = [];
      for (const provider of router.getProviders()) {
        if (!provider.config.enabled) continue;
        for (const model of provider.config.models) {
          models.push({ id: model, object: 'model', owned_by: provider.name });
        }
      }
      sendJson(res, 200, { object: 'list', data: models });
      return;
    }

    // GET /api/config
    if (req.method === 'GET' && pathname === '/api/config') {
      const masked: GatewayConfig = {
        ...config,
        providers: Object.fromEntries(
          Object.entries(config.providers).map(([key, p]) => [
            key,
            { ...p, apiKey: maskKey(p.apiKey) },
          ]),
        ),
      };
      sendJson(res, 200, masked);
      return;
    }

    // GET /api/fetch-models — fetch real model lists from provider APIs
    if (req.method === 'GET' && pathname === '/api/fetch-models') {
      const results: Record<string, string[]> = {};
      const tasks = Object.entries(config.providers).map(async ([key, p]) => {
        if (!p.enabled || !p.apiKey) {
          results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
          return;
        }
        try {
          let url: string;
          let headers: Record<string, string>;
          if (p.passthrough || key === 'claude') {
            url = `${p.baseUrl}/v1/models`;
            headers = { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' };
          } else {
            url = `${p.baseUrl}/models`;
            headers = { 'Authorization': `Bearer ${p.apiKey}` };
          }
          const body = await httpGet(url, headers);
          const json = JSON.parse(body);
          const fetched = (json.data || []).map((m: { id?: string }) => m.id).filter(Boolean) as string[];
          results[p.name || key] = [...new Set([...fetched, ...(p.models || []), p.defaultModel].filter(Boolean))];
        } catch {
          results[p.name || key] = [...new Set([...(p.models || []), p.defaultModel].filter(Boolean))];
        }
      });
      await Promise.all(tasks);
      sendJson(res, 200, results);
      return;
    }

    // POST /api/config/providers
    if (req.method === 'POST' && pathname === '/api/config/providers') {
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body'); return;
      }
      let body: Partial<ProviderConfig> & { name?: string };
      try { body = JSON.parse(bodyStr); } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body'); return;
      }
      const { name, baseUrl, apiKey, models, defaultModel, enabled } = body;
      if (!name || !baseUrl || !apiKey || !models || !defaultModel) {
        sendError(res, 400, 'invalid_request_error', 'Missing required fields: name, baseUrl, apiKey, models, defaultModel'); return;
      }
      if (config.providers[name]) {
        sendError(res, 409, 'conflict_error', `Provider "${name}" already exists`); return;
      }
      const newProvider: ProviderConfig = { name, baseUrl, apiKey, models, defaultModel, enabled: enabled ?? true };
      config.providers[name] = newProvider;
      saveConfig(config);
      sendJson(res, 201, { ...newProvider, apiKey: maskKey(newProvider.apiKey) });
      return;
    }

    // PUT /api/config/providers/:name
    const putMatch = pathname.match(/^\/api\/config\/providers\/([^/]+)$/);
    if (req.method === 'PUT' && putMatch) {
      const providerName = decodeURIComponent(putMatch[1]);
      if (!config.providers[providerName]) {
        sendError(res, 404, 'not_found_error', `Provider "${providerName}" not found`); return;
      }
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body'); return;
      }
      let updates: Partial<ProviderConfig>;
      try { updates = JSON.parse(bodyStr); } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body'); return;
      }
      config.providers[providerName] = { ...config.providers[providerName], ...updates };
      saveConfig(config);
      const updated = config.providers[providerName];
      sendJson(res, 200, { ...updated, apiKey: maskKey(updated.apiKey) });
      return;
    }

    // DELETE /api/config/providers/:name
    const deleteMatch = pathname.match(/^\/api\/config\/providers\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const providerName = decodeURIComponent(deleteMatch[1]);
      if (!config.providers[providerName]) {
        sendError(res, 404, 'not_found_error', `Provider "${providerName}" not found`); return;
      }
      delete config.providers[providerName];
      saveConfig(config);
      sendJson(res, 200, { deleted: providerName });
      return;
    }

    // GET /api/logs
    if (req.method === 'GET' && pathname === '/api/logs') {
      sendJson(res, 200, requestLogs.slice().reverse());
      return;
    }

    // GET /api/aliases
    if (req.method === 'GET' && pathname === '/api/aliases') {
      sendJson(res, 200, config.aliases ?? {});
      return;
    }

    // PUT /api/aliases
    if (req.method === 'PUT' && pathname === '/api/aliases') {
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body'); return;
      }
      let newAliases: Record<string, string>;
      try { newAliases = JSON.parse(bodyStr); } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body'); return;
      }
      const validTiers = ['haiku', 'sonnet', 'opus'];
      const invalidKeys = Object.keys(newAliases).filter(k => !validTiers.includes(k));
      if (invalidKeys.length > 0) {
        sendError(res, 400, 'invalid_request_error', `Invalid alias keys: ${invalidKeys.join(', ')}. Only haiku, sonnet, opus are allowed.`); return;
      }
      config.aliases = newAliases;
      saveConfig(config);
      sendJson(res, 200, config.aliases);
      return;
    }

    // POST /api/config/reload
    if (req.method === 'POST' && pathname === '/api/config/reload') {
      try {
        const fresh = loadConfig(getConfigPath());
        Object.assign(config, fresh);
        const masked: GatewayConfig = {
          ...config,
          providers: Object.fromEntries(
            Object.entries(config.providers).map(([key, p]) => [key, { ...p, apiKey: maskKey(p.apiKey) }]),
          ),
        };
        sendJson(res, 200, { reloaded: true, config: masked });
      } catch (err) {
        sendError(res, 500, 'api_error', `Reload failed: ${(err as Error).message}`);
      }
      return;
    }

    // Messages endpoint
    if (req.method === 'POST' && pathname === '/v1/messages') {
      const startTime = Date.now();
      let bodyStr: string;
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body'); return;
      }
      let anthropicReq: AnthropicRequest;
      try { anthropicReq = JSON.parse(bodyStr) as AnthropicRequest; } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body'); return;
      }
      if (!anthropicReq.model) {
        sendError(res, 400, 'invalid_request_error', 'Missing required field: model'); return;
      }

      let routeResult;
      try { routeResult = router.route(anthropicReq.model); } catch (err) {
        addLog({ time: new Date().toISOString(), originalModel: anthropicReq.model, resolvedModel: '', provider: '', protocol: '', targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: (err as Error).message });
        sendError(res, 500, 'api_error', (err as Error).message); return;
      }

      const { provider, resolvedModel, originalModel } = routeResult;
      const protocol = provider.config.passthrough ? 'Anthropic' : 'OpenAI';
      let built: { url: string; headers: Record<string, string>; body: string };
      try { built = provider.buildRequest(anthropicReq); } catch (err) {
        addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: `Build error: ${(err as Error).message}` });
        sendError(res, 500, 'api_error', `Provider build error: ${(err as Error).message}`); return;
      }

      if (anthropicReq.stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        });
        forwardStream(
          built.url, built.headers, built.body,
          (chunk) => res.write(chunk),
          () => {
            addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: true, status: 200, durationMs: Date.now() - startTime });
            res.end();
          },
          (err) => {
            addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: true, status: 502, durationMs: Date.now() - startTime, error: err.message });
            res.write(`data: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: err.message } })}\n\n`);
            res.end();
          },
        );
        return;
      }

      let upstream;
      try { upstream = await forwardRequest(built.url, built.headers, built.body); } catch (err) {
        addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: false, status: 502, durationMs: Date.now() - startTime, error: (err as Error).message });
        sendError(res, 502, 'api_error', `Upstream request failed: ${(err as Error).message}`); return;
      }

      if (upstream.status !== 200) {
        let errMsg = '';
        try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 200); } catch { errMsg = upstream.body.slice(0, 200); }
        addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: false, status: upstream.status, durationMs: Date.now() - startTime, error: errMsg });
        res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(upstream.body);
        return;
      }

      let upstreamJson;
      try { upstreamJson = JSON.parse(upstream.body); } catch {
        addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: false, status: 502, durationMs: Date.now() - startTime, error: 'Invalid JSON from upstream' });
        sendError(res, 502, 'api_error', 'Invalid JSON from upstream provider'); return;
      }

      let anthropicResp;
      try { anthropicResp = provider.parseResponse(upstreamJson, anthropicReq.model); } catch (err) {
        addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: false, status: 502, durationMs: Date.now() - startTime, error: `Parse error: ${(err as Error).message}` });
        sendError(res, 502, 'api_error', `Response parse error: ${(err as Error).message}`); return;
      }

      addLog({ time: new Date().toISOString(), originalModel, resolvedModel, provider: provider.name, protocol, targetUrl: built.url, stream: false, status: 200, durationMs: Date.now() - startTime });
      sendJson(res, 200, anthropicResp);
      return;
    }

    sendError(res, 404, 'not_found_error', `Unknown endpoint: ${req.method} ${pathname}`);
  });
}
