import http from 'http';
import { sendJson, sendError, maskKey } from '../utils/http.js';
import { httpGet } from '../services/forwarder.js';
import { logger } from '../logger.js';
import type { GatewayConfig } from '../providers/types.js';
import type { RouteContext } from './types.js';

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
    sendJson(res, 200, { qps: rateTracker.getQPS(), rpm: rateTracker.getRPM(), tps: rateTracker.getTPS() }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/logs') {
    sendJson(res, 200, logManager.getLogs(), config, origin);
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
        } catch (err) {
          logger.warn(`Failed to parse models response for ${p.name || key}`, { error: (err as Error).message });
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
    return true;
  }

  return false;
}
