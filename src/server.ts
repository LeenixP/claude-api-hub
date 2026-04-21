import http from 'http';
import https from 'https';
import { URL } from 'url';
import { ModelRouter } from './router.js';
import { AnthropicRequest } from './providers/types.js';
import { dashboardHtml } from './dashboard.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

export function createServer(router: ModelRouter): http.Server {
  return http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const pathname = req.url?.split('?')[0] ?? '/';

    // Dashboard
    if (req.method === 'GET' && pathname === '/') {
      const providers = router.getProviders().filter(p => p.config.enabled);
      const html = dashboardHtml(providers, req.headers.host ?? 'localhost:9800');
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

    // Messages endpoint
    if (req.method === 'POST' && pathname === '/v1/messages') {
      let bodyStr: string;
      try {
        bodyStr = await readBody(req);
      } catch {
        sendError(res, 400, 'invalid_request_error', 'Failed to read request body');
        return;
      }

      let anthropicReq: AnthropicRequest;
      try {
        anthropicReq = JSON.parse(bodyStr) as AnthropicRequest;
      } catch {
        sendError(res, 400, 'invalid_request_error', 'Invalid JSON body');
        return;
      }

      if (!anthropicReq.model) {
        sendError(res, 400, 'invalid_request_error', 'Missing required field: model');
        return;
      }

      let routeResult;
      try {
        routeResult = router.route(anthropicReq.model);
      } catch (err) {
        sendError(res, 500, 'api_error', (err as Error).message);
        return;
      }

      const { provider } = routeResult;
      let built: { url: string; headers: Record<string, string>; body: string };
      try {
        built = provider.buildRequest(anthropicReq);
      } catch (err) {
        sendError(res, 500, 'api_error', `Provider build error: ${(err as Error).message}`);
        return;
      }

      // Streaming
      if (anthropicReq.stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        });

        forwardStream(
          built.url,
          built.headers,
          built.body,
          (chunk) => res.write(chunk),
          () => res.end(),
          (err) => {
            res.write(`data: ${JSON.stringify({ type: 'error', error: { type: 'api_error', message: err.message } })}\n\n`);
            res.end();
          },
        );
        return;
      }

      // Non-streaming
      let upstream;
      try {
        upstream = await forwardRequest(built.url, built.headers, built.body);
      } catch (err) {
        sendError(res, 502, 'api_error', `Upstream request failed: ${(err as Error).message}`);
        return;
      }

      if (upstream.status !== 200) {
        res.writeHead(upstream.status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
        res.end(upstream.body);
        return;
      }

      let upstreamJson;
      try {
        upstreamJson = JSON.parse(upstream.body);
      } catch {
        sendError(res, 502, 'api_error', 'Invalid JSON from upstream provider');
        return;
      }

      let anthropicResp;
      try {
        anthropicResp = provider.parseResponse(upstreamJson, anthropicReq.model);
      } catch (err) {
        sendError(res, 502, 'api_error', `Response parse error: ${(err as Error).message}`);
        return;
      }

      sendJson(res, 200, anthropicResp);
      return;
    }

    sendError(res, 404, 'not_found_error', `Unknown endpoint: ${req.method} ${pathname}`);
  });
}
