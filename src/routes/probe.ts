import http from 'http';
import { sendJson, sendError, readBody } from '../utils/http.js';
import { createProvider } from '../providers/factory.js';
import { forwardRequest } from '../services/forwarder.js';
import { logger } from '../logger.js';
import type { Provider } from '../providers/types.js';
import type { RouteContext } from './types.js';
import { buildTestRequest, buildSimpleTestRequest, getCodingAgentHeaders, withBetaQueryParam } from './test-request.js';

const CODING_PLAN_RE = /coding\s*(plan|agent)/i;

function extractError(body: string): string {
  try {
    const j = JSON.parse(body);
    if (typeof j.error === 'string') return j.error;
    if (j.error?.message) return j.error.message;
    if (j.error?.type) return j.error.type;
    return ''; // valid JSON without error field = success
  } catch {
    return ''; // non-JSON (e.g. Kiro event stream) = success
  }
}

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
    let testProvider: Provider | null;
    try {
      testProvider = await createProvider(pc);
    } catch (err) {
      sendError(res, 500, 'api_error', `Provider init failed: ${(err as Error).message}`, config, origin);
      return true;
    }
    if (!testProvider) {
      sendError(res, 500, 'api_error', `Provider "${providerKey}" failed to initialize`, config, origin);
      return true;
    }
    const model = pc.defaultModel || pc.models[0];
    if (!model) {
      sendError(res, 400, 'invalid_request_error', 'No model configured for this provider', config, origin);
      return true;
    }
    const providerLabel = pc.name || providerKey;

    // Build the test request and send it
    const testReq = buildTestRequest(model);
    let built: { url: string; headers: Record<string, string>; body: string };
    try {
      built = testProvider.buildRequest(testReq);
      // Add coding agent headers for passthrough providers
      Object.assign(built.headers, getCodingAgentHeaders(!!pc.passthrough, config));
      if (pc.passthrough) built.url = withBetaQueryParam(built.url, true);
    } catch (err) {
      sendError(res, 500, 'api_error', `Build error: ${(err as Error).message}`, config, origin);
      return true;
    }

    const startTime = Date.now();
    try {
      const upstream = await forwardRequest(built.url, built.headers, built.body, 30000, config.maxResponseBytes);
      const latency = Date.now() - startTime;
      const errMsg = extractError(upstream.body);

      // If we get ANY response (even error), the provider is reachable.
      // Coding Plan errors are special: the endpoint only works with real Claude Code sessions.
      if (CODING_PLAN_RE.test(errMsg)) {
        logger.info(`Probe for ${providerKey}: coding plan endpoint confirmed reachable (${latency}ms)`);
        sendJson(res, 200, {
          success: true,
          latencyMs: latency,
          model,
          provider: providerLabel,
          note: 'Coding Plan endpoint — verified reachable. Only accessible from real Claude Code sessions.',
        }, config, origin);
        return true;
      }

      if (upstream.status === 200 && !errMsg) {
        sendJson(res, 200, { success: true, latencyMs: latency, model, provider: providerLabel }, config, origin);
      } else {
        sendJson(res, 200, { success: false, latencyMs: latency, status: upstream.status, error: errMsg, model, provider: providerLabel }, config, origin);
      }
    } catch (err) {
      sendJson(res, 200, { success: false, latencyMs: Date.now() - startTime, error: (err as Error).message, model, provider: providerLabel }, config, origin);
    }
    return true;
  }

  return false;
}
