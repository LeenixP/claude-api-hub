import http from 'http';
import { sendJson, compressBody } from '../utils/http.js';
import { dashboardHtml, dashboardETag } from '../dashboard.js';
import { DASHBOARD_CACHE_MAX_AGE } from '../constants.js';
import type { RouteContext } from './types.js';

export async function handlePublicRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<boolean> {
  const { config, router, eventBus } = ctx;

  if (req.method === 'GET' && pathname === '/') {
    // ETag support
    const etag = dashboardETag();
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.writeHead(304, {
        'Cache-Control': `public, max-age=${DASHBOARD_CACHE_MAX_AGE}`,
        'ETag': etag,
        ...cors,
      });
      res.end();
      return true;
    }

    const html = dashboardHtml(config.version || '');
    const acceptEncoding = (req.headers['accept-encoding'] as string) || '';
    const compressed = compressBody(html, acceptEncoding, 'text/html; charset=utf-8');
    const headers: Record<string, string> = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': `public, max-age=${DASHBOARD_CACHE_MAX_AGE}`,
      'ETag': etag,
      ...cors,
    };
    if (compressed.encoding) {
      headers['Content-Encoding'] = compressed.encoding;
    }
    res.writeHead(200, headers);
    res.end(compressed.buffer);
    return true;
  }

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/auth/check') {
    const password = config.password;
    sendJson(res, 200, { required: !!password }, config, origin);
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    // handled inline in server.ts because it needs createSessionToken
    return false;
  }

  if (req.method === 'GET' && pathname === '/api/events' && eventBus) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...cors,
    });
    res.write(':\n\n');
    const onEvent = (event: { type: string; data: unknown; id: number }) => {
      res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    eventBus.subscribe(onEvent);
    req.on('close', () => eventBus.unsubscribe(onEvent));
    return true;
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
    return true;
  }

  return false;
}
