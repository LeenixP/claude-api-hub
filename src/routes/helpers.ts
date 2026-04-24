import http from 'http';
import { readBody } from '../utils/http.js';
import { sendError } from '../utils/http.js';
import type { GatewayConfig } from '../providers/types.js';

export async function readJson<T>(req: http.IncomingMessage, res: http.ServerResponse, config: GatewayConfig): Promise<T | null> {
  let bodyStr: string;
  try { bodyStr = await readBody(req); } catch {
    sendError(res, 400, 'invalid_request_error', 'Failed to read request body', config);
    return null;
  }
  try { return JSON.parse(bodyStr) as T; } catch {
    sendError(res, 400, 'invalid_request_error', 'Invalid JSON body', config);
    return null;
  }
}
