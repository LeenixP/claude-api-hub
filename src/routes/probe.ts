import http from 'http';
import { sendJson, sendError, readBody } from '../utils/http.js';
import { createProvider } from '../providers/factory.js';
import { forwardRequest } from '../services/forwarder.js';
import { logger } from '../logger.js';
import type { AnthropicRequest, Provider } from '../providers/types.js';
import type { RouteContext } from './types.js';

export async function handleProbeRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<boolean> {
  const { config } = ctx;

  const testMatch = pathname.match(/^\/api\/test-provider\/([^/]+)$/);
  if (req.method === 'POST' && testMatch) {
    const providerKey = decodeURIComponent(testMatch[1]);
    const pc = config.providers[providerKey];
    if (!pc) {
      sendError(res, 404, 'not_found_error', `Provider "${providerKey}" not found`, config, origin);
      return true;
    }
    let testProvider: Provider;
    try {
      testProvider = createProvider(pc);
    } catch (err) {
      sendError(res, 500, 'api_error', `Provider init failed: ${(err as Error).message}`, config, origin);
      return true;
    }
    const model = pc.defaultModel || pc.models[0];
    if (!model) {
      sendError(res, 400, 'invalid_request_error', 'No model configured for this provider', config, origin);
      return true;
    }
    const testReq: AnthropicRequest = {
      model,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
      stream: false,
    };
    let built: { url: string; headers: Record<string, string>; body: string };
    try {
      built = testProvider.buildRequest(testReq);
    } catch (err) {
      sendError(res, 500, 'api_error', `Build error: ${(err as Error).message}`, config, origin);
      return true;
    }
    const startTime = Date.now();
    try {
      const upstream = await forwardRequest(built.url, built.headers, built.body, 30000, config.maxResponseBytes);
      const latency = Date.now() - startTime;
      if (upstream.status === 200) {
        let hasError = false;
        let errMsg = '';
        try {
          const j = JSON.parse(upstream.body);
          if (j.error) {
            hasError = true;
            errMsg = j.error.message || j.error.type || JSON.stringify(j.error).slice(0, 300);
          }
        } catch { /* non-JSON 200 is still considered success */ }
        if (hasError) {
          sendJson(res, 200, { success: false, latencyMs: latency, status: upstream.status, error: errMsg, model, provider: pc.name || providerKey }, config, origin);
        } else {
          sendJson(res, 200, { success: true, latencyMs: latency, model, provider: pc.name || providerKey }, config, origin);
        }
      } else {
        let errMsg = '';
        try { const j = JSON.parse(upstream.body); errMsg = j.error?.message || j.message || upstream.body.slice(0, 300); } catch { errMsg = upstream.body.slice(0, 300); }
        sendJson(res, 200, { success: false, latencyMs: latency, status: upstream.status, error: errMsg, model, provider: pc.name || providerKey }, config, origin);
      }
    } catch (err) {
      sendJson(res, 200, { success: false, latencyMs: Date.now() - startTime, error: (err as Error).message, model, provider: pc.name || providerKey }, config, origin);
    }
    return true;
  }

  return false;
}
