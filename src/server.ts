import http from 'http';
import https from 'https';
import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { URL } from 'url';

// ─── Connection Pool ───

const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
});
import { ModelRouter } from './router.js';
import { AnthropicRequest, GatewayConfig, ProviderConfig } from './providers/types.js';
import { ClaudeProvider } from './providers/claude.js';
import { GenericOpenAIProvider } from './providers/generic.js';
import { dashboardHtml } from './dashboard.js';
import { getConfigPath, loadConfig } from './config.js';
import { mkdirSync, appendFileSync, readdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface LogEntry {
  time: string;
  requestId: string;
  claudeModel: string;
  resolvedModel: string;
  provider: string;
  protocol: string;
  targetUrl: string;
  stream: boolean;
  status: number;
  durationMs: number;
  error?: string;
  logFile?: string;
}

interface LogDetail {
  originalBody?: string;
  requestBody?: string;
  upstreamBody?: string;
  forwardedHeaders?: Record<string, string>;
}

const requestLogs: LogEntry[] = [];
const MAX_LOGS = 200;
const LOG_DIR = join(homedir(), '.claude-api-hub', 'logs');
const MAX_LOG_FILES = 4096;
let logToFile = false;

try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function cleanLogDir(): void {
  try {
    const files = readdirSync(LOG_DIR).filter(f => f.endsWith('.json'));
    if (files.length >= MAX_LOG_FILES) {
      for (const f of files) {
        try { unlinkSync(join(LOG_DIR, f)); } catch {}
      }
    }
  } catch {}
}

function addLog(entry: LogEntry, detail?: LogDetail): void {
  if (logToFile && detail) {
    cleanLogDir();
    const filename = entry.requestId + '.json';
    const filepath = join(LOG_DIR, filename);
    try {
      appendFileSync(filepath, JSON.stringify({ ...entry, ...detail }, null, 2), 'utf-8');
      entry.logFile = filepath;
    } catch {}
  }
  requestLogs.push(entry);
  if (requestLogs.length > MAX_LOGS) requestLogs.shift();
}



// ─── Rate Limiter ───

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(private maxTokens: number, private refillPerMinute: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  tryConsume(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 60000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillPerMinute);
    this.lastRefill = now;
    if (this.tokens >= 1) { this.tokens--; return true; }
    return false;
  }
}

let rateLimiter: RateLimiter | null = null;

// ─── CORS ───

function getCorsHeaders(config: GatewayConfig, reqOrigin?: string): Record<string, string> {
  const origins = config.corsOrigins;
  let origin = '*';
  if (origins && origins.length > 0) {
    origin = (reqOrigin && origins.includes(reqOrigin)) ? reqOrigin : origins[0];
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-admin-token, anthropic-version, anthropic-beta',
    ...(origins && origins.length > 0 ? { 'Vary': 'Origin' } : {}),
  };
}

// ─── Admin Auth ───

function requireAdmin(req: http.IncomingMessage, res: http.ServerResponse, config: GatewayConfig): boolean {
  const adminToken = config.adminToken || process.env.ADMIN_TOKEN;
  if (!adminToken) return true;
  const token = req.headers['authorization']?.replace('Bearer ', '')
    || req.headers['x-admin-token'] as string;
  if (token === adminToken) return true;
  sendError(res, 401, 'authentication_error', 'Invalid or missing admin token', config, req.headers['origin'] as string);
  return false;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown, config?: GatewayConfig, origin?: string): void {
  const payload = JSON.stringify(body);
  const cors = config ? getCorsHeaders(config, origin) : { 'Access-Control-Allow-Origin': '*' };
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(payload);
}

function sendError(res: http.ServerResponse, status: number, type: string, message: string, config?: GatewayConfig, origin?: string): void {
  sendJson(res, status, { type: 'error', error: { type, message } }, config, origin);
}

function readBody(req: http.IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(new Error('Request body too large')); return; }
      chunks.push(chunk);
    });
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

function rebuildProviders(router: ModelRouter, config: GatewayConfig): void {
  const providers: import('./providers/types.js').Provider[] = [];
  for (const [, providerConfig] of Object.entries(config.providers)) {
    if (!providerConfig.enabled) continue;
    if (providerConfig.passthrough) {
      providers.push(new ClaudeProvider(providerConfig));
    } else {
      providers.push(new GenericOpenAIProvider(providerConfig));
    }
  }
  router.replaceAll(providers);
}

function forwardRequest(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs = 120000,
  maxResponseBytes = 50 * 1024 * 1024,
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
      timeout: timeoutMs,
      agent: isHttps ? httpsAgent : httpAgent,
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxResponseBytes) {
          res.destroy();
          reject(new Error(`Upstream response exceeds ${maxResponseBytes} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 500,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error(`Upstream timeout after ${timeoutMs}ms`)); });
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
      agent: isHttps ? httpsAgent : httpAgent,
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
  onUpstreamResponse?: (statusCode: number, headers: http.IncomingHttpHeaders, rawBody?: string) => void,
  connectTimeoutMs = 30000,
  idleTimeoutMs = 60000,
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
    timeout: connectTimeoutMs,
    agent: isHttps ? httpsAgent : httpAgent,
  };

  const req = lib.request(options, (upstreamRes) => {
    const statusCode = upstreamRes.statusCode ?? 502;

    if (statusCode !== 200) {
      const chunks: Buffer[] = [];
      upstreamRes.on('data', (c: Buffer) => chunks.push(c));
      upstreamRes.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf-8');
        if (onUpstreamResponse) onUpstreamResponse(statusCode, upstreamRes.headers, rawBody);
      });
      upstreamRes.on('error', onError);
      return;
    }

    if (onUpstreamResponse) onUpstreamResponse(200, upstreamRes.headers);

    let lastActivity = Date.now();
    const idleCheck = setInterval(() => {
      if (Date.now() - lastActivity > idleTimeoutMs) {
        clearInterval(idleCheck);
        upstreamRes.destroy(new Error(`Stream idle timeout: no data for ${idleTimeoutMs}ms`));
      }
    }, 10000);

    upstreamRes.on('data', (chunk: Buffer) => {
      lastActivity = Date.now();
      onChunk(chunk.toString('utf-8'));
    });
    upstreamRes.on('end', () => { clearInterval(idleCheck); onEnd(); });
    upstreamRes.on('error', (err) => { clearInterval(idleCheck); onError(err); });
  });

  req.on('timeout', () => {
    req.destroy();
    onError(new Error(`Stream connection timeout after ${connectTimeoutMs}ms`));
  });
  req.on('error', onError);
  req.write(body);
  req.end();
}

export function createServer(router: ModelRouter, config: GatewayConfig): http.Server {
  if (config.rateLimitRpm && config.rateLimitRpm > 0) {
    rateLimiter = new RateLimiter(config.rateLimitRpm, config.rateLimitRpm);
  }
  if (!config.adminToken && !process.env.ADMIN_TOKEN) {
    console.warn('[warn] No adminToken configured — management API is unprotected. Set adminToken in config or ADMIN_TOKEN env var.');
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

    // Dashboard
    if (req.method === 'GET' && pathname === '/') {
      const html = dashboardHtml(config.version || '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...cors });
      res.end(html);
      return;
    }

    // Health check
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() }, config, origin);
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
      sendJson(res, 200, { object: 'list', data: models }, config, origin);
      return;
    }

    // ─── Admin API (requires authentication) ───

    if (pathname.startsWith('/api/')) {
      if (!requireAdmin(req, res, config)) return;
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
      sendJson(res, 200, masked, config, origin);
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
          if (p.passthrough) {
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
      sendJson(res, 200, results, config, origin);
      return;
    }

    // POST /api/config/providers
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

    // PUT/DELETE /api/config/providers/:name
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
      try { bodyStr = await readBody(req); } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return;
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

    // GET /api/logs

    if (req.method === 'GET' && pathname === '/api/logs') {
      sendJson(res, 200, requestLogs.slice().reverse(), config, origin);
      return;
    }

    // POST /api/logs/clear
    if (req.method === 'POST' && pathname === '/api/logs/clear') {
      requestLogs.length = 0;
      sendJson(res, 200, { cleared: true }, config, origin);
      return;
    }

    // GET /api/logs/file-status
    if (req.method === 'GET' && pathname === '/api/logs/file-status') {
      let fileCount = 0;
      try { fileCount = readdirSync(LOG_DIR).filter(f => f.endsWith('.json')).length; } catch {}
      sendJson(res, 200, { enabled: logToFile, fileCount, maxFiles: MAX_LOG_FILES, logDir: LOG_DIR }, config, origin);
      return;
    }

    // PUT /api/logs/file-toggle
    if (req.method === 'PUT' && pathname === '/api/logs/file-toggle') {
      logToFile = !logToFile;
      sendJson(res, 200, { enabled: logToFile }, config, origin);
      return;
    }



    // GET /api/health/providers — test connectivity to each provider
    if (req.method === 'GET' && pathname === '/api/health/providers') {
      const results: Record<string, { status: string; latencyMs: number; error?: string; modelCount?: number }> = {};
      const tasks = Object.entries(config.providers).map(async ([key, p]) => {
        if (!p.enabled) { results[p.name || key] = { status: 'disabled', latencyMs: 0 }; return; }
        if (!p.apiKey) { results[p.name || key] = { status: 'no_key', latencyMs: 0 }; return; }
        const start = Date.now();
        try {
          let url: string;
          let headers: Record<string, string>;
          if (p.passthrough) {
            url = `${p.baseUrl}/v1/models`;
            headers = { 'x-api-key': p.apiKey, 'anthropic-version': '2023-06-01' };
          } else {
            url = `${p.baseUrl}/models`;
            headers = { 'Authorization': `Bearer ${p.apiKey}` };
          }
          const body = await httpGet(url, headers, 8000);
          const latency = Date.now() - start;
          try {
            const json = JSON.parse(body);
            const count = (json.data || []).length;
            results[p.name || key] = { status: 'ok', latencyMs: latency, modelCount: count };
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

    // GET /api/aliases
    if (req.method === 'GET' && pathname === '/api/aliases') {
      sendJson(res, 200, config.aliases ?? {}, config, origin);
      return;
    }

    // PUT /api/aliases
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

    // POST /api/config/reload
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

    // Messages endpoint
    if (req.method === 'POST' && pathname === '/v1/messages') {
      if (rateLimiter && !rateLimiter.tryConsume()) {
        sendError(res, 429, 'rate_limit_error', 'Too many requests. Please slow down.', config, origin);
        return;
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
        addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel: '', provider: '', protocol: '', targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: (err as Error).message });
        sendError(res, 500, 'api_error', (err as Error).message, config, origin); return;
      }

      const { provider, resolvedModel } = routeResult;
      anthropicReq.model = resolvedModel;
      const protocol = provider.config.passthrough ? 'Anthropic' : 'OpenAI';
      let built: { url: string; headers: Record<string, string>; body: string };
      try { built = provider.buildRequest(anthropicReq); } catch (err) {
        addLog({ time: new Date().toISOString(), requestId, claudeModel, resolvedModel, provider: provider.name, protocol, targetUrl: '', stream: !!anthropicReq.stream, status: 500, durationMs: Date.now() - startTime, error: `Build error: ${(err as Error).message}` });
        sendError(res, 500, 'api_error', `Provider build error: ${(err as Error).message}`, config, origin); return;
      }

      // For passthrough providers, forward original Anthropic headers from Claude Code
      if (provider.config.passthrough) {
        const fwd = ['anthropic-version', 'anthropic-beta', 'anthropic-dangerous-direct-browser-access'];
        for (const h of fwd) {
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
      const logDetail: LogDetail = {
        originalBody: bodyStr,
        requestBody: built.body,
        forwardedHeaders: maskedHeaders,
      };



      if (anthropicReq.stream) {
        let headersSent = false;
        forwardStream(
          built.url, built.headers, built.body,
          (chunk) => {
            if (!headersSent) return;
            res.write(chunk);
          },
          () => {
            addLog({ ...logBase, status: 200, durationMs: Date.now() - startTime }, logDetail);
            res.end();
          },
          (err) => {
            if (!headersSent) {
              addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: err.message }, logDetail);
              sendError(res, 502, 'api_error', `Upstream stream error: ${err.message}`, config, origin);
            } else {
              addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: err.message }, logDetail);
              res.write(`data: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: err.message } })}\n\n`);
              res.end();
            }
          },
          (statusCode, _headers, rawBody) => {
            if (statusCode !== 200) {
              addLog({ ...logBase, status: statusCode, durationMs: Date.now() - startTime, error: rawBody?.slice(0, 200) }, logDetail);
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
        addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: (err as Error).message }, logDetail);
        sendError(res, 502, 'api_error', `Upstream request failed: ${(err as Error).message}`, config, origin); return;
      }

      if (upstream.status !== 200) {
        let errMsg = '';
        try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 200); } catch { errMsg = upstream.body.slice(0, 200); }
        addLog({ ...logBase, status: upstream.status, durationMs: Date.now() - startTime, error: errMsg }, { ...logDetail, upstreamBody: upstream.body });
        res.writeHead(upstream.status, { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...cors });
        res.end(upstream.body);
        return;
      }

      let upstreamJson;
      try { upstreamJson = JSON.parse(upstream.body); } catch {
        addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: 'Invalid JSON from upstream' }, { ...logDetail, upstreamBody: upstream.body });
        sendError(res, 502, 'api_error', 'Invalid JSON from upstream provider', config, origin); return;
      }

      let anthropicResp;
      try { anthropicResp = provider.parseResponse(upstreamJson, anthropicReq.model); } catch (err) {
        addLog({ ...logBase, status: 502, durationMs: Date.now() - startTime, error: `Parse error: ${(err as Error).message}` }, logDetail);
        sendError(res, 502, 'api_error', `Response parse error: ${(err as Error).message}`, config, origin); return;
      }

      addLog({ ...logBase, status: 200, durationMs: Date.now() - startTime }, logDetail);
      sendJson(res, 200, anthropicResp, config, origin);
      return;

    }


    sendError(res, 404, 'not_found_error', `Unknown endpoint: ${req.method} ${pathname}`, config, origin);
  });
}
