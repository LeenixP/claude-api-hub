import http from 'http';
import type { GatewayConfig } from '../providers/types.js';

export function getCorsHeaders(config: GatewayConfig, reqOrigin?: string): Record<string, string> {
  const origins = config.corsOrigins;
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, x-admin-token, anthropic-version, anthropic-beta',
    'Vary': 'Origin',
  };
  if (origins && origins.length > 0) {
    if (reqOrigin && origins.includes(reqOrigin)) {
      headers['Access-Control-Allow-Origin'] = reqOrigin;
    } else {
      headers['Access-Control-Allow-Origin'] = origins[0];
    }
  } else {
    const defaultOrigin = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
    if (!reqOrigin || reqOrigin === defaultOrigin) {
      headers['Access-Control-Allow-Origin'] = defaultOrigin;
    }
  }
  return headers;
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown, config?: GatewayConfig, origin?: string): void {
  const payload = JSON.stringify(body);
  const cors = config ? getCorsHeaders(config, origin) : { 'Access-Control-Allow-Origin': '*' };
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(payload);
}

export function sendError(res: http.ServerResponse, status: number, type: string, message: string, config?: GatewayConfig, origin?: string): void {
  sendJson(res, status, { type: 'error', error: { type, message } }, config, origin);
}

export function readBody(req: http.IncomingMessage, maxBytes = 10 * 1024 * 1024): Promise<string> {
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

export function maskKey(key: string): string {
  if (!key) return '***';
  if (key.length <= 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}
