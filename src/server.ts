import http from 'http';
import { ModelRouter } from './router.js';
import { GatewayConfig } from './providers/types.js';
import { createProvider } from './providers/factory.js';
import { getConfigPath } from './config.js';
import { logger } from './logger.js';
import { getCorsHeaders, sendError, sendJson, readBody, maskKey } from './utils/http.js';
import { PerIpRateLimiter, requireAdmin, setSecurityHeaders, createSessionToken, verifyPassword, loginRateLimiter, revokeSession } from './middleware/auth.js';
import { LogManager } from './services/log-manager.js';
import type { EventBus } from './services/event-bus.js';
import type { RateTracker } from './services/rate-tracker.js';
import { handlePublicRoutes } from './routes/public.js';
import { handleAdminConfigRoutes, rebuildProviders } from './routes/admin-config.js';
import { handleAdminLogsRoutes } from './routes/admin-logs.js';
import { handleOAuthRoutes } from './routes/oauth.js';
import { handleProxyRoute } from './routes/proxy.js';
import { handleProbeRoute } from './routes/probe.js';
import { handleMetrics } from './routes/metrics.js';
import { handleSystemRoutes } from './routes/system-info.js';

export { rebuildProviders };

export function createServer(router: ModelRouter, config: GatewayConfig, logManager: LogManager, eventBus?: EventBus, rateTracker?: RateTracker): http.Server {
  let rateLimiter: PerIpRateLimiter | null = null;
  if (config.rateLimitRpm && config.rateLimitRpm > 0) {
    rateLimiter = new PerIpRateLimiter(config.rateLimitRpm);
  }
  if (!config.password && !config.adminToken && !process.env.ADMIN_TOKEN) {
    logger.warn('No password configured — management API is unprotected. Set password in config or ADMIN_TOKEN env var.');
  }

  const ctx = { router, config, logManager, eventBus, rateTracker };

  return http.createServer(async (req, res) => {
    try {
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

      if (req.method === 'POST' && pathname === '/api/auth/login') {
        const clientIp = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
        const rateCheck = loginRateLimiter.tryConsume(clientIp);
        if (!rateCheck.allowed) {
          sendJson(res, 429, { error: rateCheck.reason });
          return;
        }
        let bodyStr: string;
        try { bodyStr = await readBody(req); } catch {
          sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config, origin); return;
        }
        let body: { password?: string };
        try { body = JSON.parse(bodyStr); } catch {
          sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config, origin); return;
        }
        const password = config.password;
        if (!password) {
          sendJson(res, 200, { success: true, token: '' }, config, origin);
          return;
        }
        if (!body.password) {
          loginRateLimiter.recordFailure(clientIp);
          sendError(res, 401, 'authentication_error', 'Invalid credentials', config, origin);
          return;
        }
        const match = verifyPassword(body.password, password);
        if (match) {
          const sessionToken = createSessionToken();
          sendJson(res, 200, { success: true, token: sessionToken }, config, origin);
        } else {
          loginRateLimiter.recordFailure(clientIp);
          sendError(res, 401, 'authentication_error', 'Invalid credentials', config, origin);
        }
        return;
      }

      if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-admin-token'] as string;
        if (token) revokeSession(token);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (await handlePublicRoutes(req, res, ctx, pathname, cors, origin)) return;

      // ─── Admin Auth Gate ───

      const isAdminEndpoint = pathname.startsWith('/api/');
      if (isAdminEndpoint) {
        if (!requireAdmin(req, res, config)) return;
      }

      // ─── Admin API Routes ───

      if (await handleAdminConfigRoutes(req, res, ctx, pathname, cors, origin)) return;
      if (await handleSystemRoutes(req, res, ctx, pathname, cors)) return;
      if (await handleAdminLogsRoutes(req, res, ctx, pathname, cors, origin)) return;
      if (await handleOAuthRoutes(req, res, ctx, pathname, cors, origin)) return;
      if (await handleProbeRoute(req, res, ctx, pathname, cors, origin)) return;

      // ─── Proxy: /v1/messages ───

      if (await handleProxyRoute(req, res, ctx, pathname, cors, origin, rateLimiter)) return;
      if (await handleMetrics(req, res, ctx, pathname, cors)) return;

      sendError(res, 404, 'not_found_error', `Unknown endpoint: ${req.method} ${pathname}`, config, origin);
    } catch (err) {
      logger.error(`Unhandled request error: ${(err as Error).message}`);
      if (!res.headersSent) {
        try { sendError(res, 500, 'internal_error', 'Internal server error'); } catch { /* response already sent or closed */ }
      }
    }
  });
}
