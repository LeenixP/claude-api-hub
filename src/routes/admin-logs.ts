import http from 'http';
import { sendJson, sendJsonAsync, sendError, maskKey } from '../utils/http.js';
import { forwardRequest } from '../services/forwarder.js';
import { createProvider } from '../providers/factory.js';
import { logger } from '../logger.js';
import type { GatewayConfig } from '../providers/types.js';
import type { RouteContext } from './types.js';
import { buildTestRequest, getCodingAgentHeaders } from './test-request.js';

export async function handleAdminLogsRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<boolean> {
  const { config, logManager, rateTracker } = ctx;

  if (req.method === 'GET' && pathname === '/api/stats' && rateTracker) {
    sendJson(res, 200, rateTracker.getStats(), config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/token-stats') {
    await sendJsonAsync(res, 200, logManager.getTokenStats(), config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/logs') {
    const allLogs = logManager.getLogs();
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const providerFilter = url.searchParams.get('provider');
    const statusFilter = url.searchParams.get('status');
    let filtered = allLogs;
    if (providerFilter) filtered = filtered.filter(l => l.provider === providerFilter);
    if (statusFilter) filtered = filtered.filter(l => String(l.status) === statusFilter);
    await sendJsonAsync(res, 200, { total: filtered.length, logs: filtered.slice(offset, offset + limit) }, config, origin);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/logs/clear') {
    logManager.clearLogs();
    sendJson(res, 200, { cleared: true }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/logs/file-status') {
    sendJson(res, 200, {
      enabled: logManager.isFileLogging(),
      fileCount: logManager.getFileCount(),
      maxFiles: logManager.maxFiles,
      logDir: logManager.logDir,
    }, config, origin);
    return true;
  }

  if (req.method === 'PUT' && pathname === '/api/logs/file-toggle') {
    sendJson(res, 200, { enabled: logManager.toggleFileLogging() }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/health/providers') {
    const results: Record<string, { status: string; latencyMs: number; error?: string }> = {};
    const tasks = Object.entries(config.providers).map(async ([key, p]) => {
      if (!p.enabled) { results[p.name || key] = { status: 'disabled', latencyMs: 0 }; return; }
      if (!p.apiKey) { results[p.name || key] = { status: 'no_key', latencyMs: 0 }; return; }
      const start = Date.now();
      try {
        const provider = createProvider(p);
        if (!provider) { results[p.name || key] = { status: 'init_failed', latencyMs: 0 }; return; }
        const model = p.defaultModel || p.models[0];
        if (!model) { results[p.name || key] = { status: 'no_model', latencyMs: 0 }; return; }
        const testReq = buildTestRequest(model);
        const built = provider.buildRequest(testReq);
        Object.assign(built.headers, getCodingAgentHeaders(!!p.passthrough));
        const upstream = await forwardRequest(built.url, built.headers, built.body, 15000, config.maxResponseBytes);
        const latency = Date.now() - start;
        if (upstream.status === 200) {
          let errMsg = '';
          try { const j = JSON.parse(upstream.body); if (j.error) errMsg = j.error.message || JSON.stringify(j.error).slice(0, 200); } catch { /* ignore */ }
          if (errMsg) {
            results[p.name || key] = { status: 'error', latencyMs: latency, error: errMsg };
          } else {
            results[p.name || key] = { status: 'ok', latencyMs: latency };
          }
        } else {
          let errMsg = '';
          try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 200); } catch { errMsg = upstream.body.slice(0, 200); }
          results[p.name || key] = { status: 'error', latencyMs: latency, error: errMsg };
        }
      } catch (err) {
        const latency = Date.now() - start;
        const msg = (err as Error).message;
        results[p.name || key] = { status: msg.includes('timeout') ? 'timeout' : 'error', latencyMs: latency, error: msg };
      }
    });
    await Promise.all(tasks);
    sendJson(res, 200, results, config, origin);
    return true;
  }

  return false;
}
