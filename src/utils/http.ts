import http from 'http';
import zlib from 'zlib';
import type { GatewayConfig } from '../providers/types.js';
import { MAX_BODY_SIZE } from '../constants.js';

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

/**
 * Compress a string body if the client accepts gzip or deflate encoding.
 * Returns the compressed buffer and the content-encoding value, or the original
 * buffer plus undefined if compression is skipped (body too small, SSE, etc.).
 */
export function compressBody(
  body: string,
  acceptEncoding: string,
  contentType: string,
): { buffer: Buffer; encoding?: string } {
  // Skip for SSE streams
  if (contentType.startsWith('text/event-stream')) {
    return { buffer: Buffer.from(body) };
  }
  // Skip for bodies under 1KB
  if (Buffer.byteLength(body) < 1024) {
    return { buffer: Buffer.from(body) };
  }
  // Check accepted encodings (prefer gzip over deflate)
  const encodings = acceptEncoding.split(',').map(s => s.trim().toLowerCase());
  if (encodings.includes('gzip') || encodings.includes('*')) {
    return { buffer: zlib.gzipSync(body), encoding: 'gzip' };
  }
  if (encodings.includes('deflate')) {
    return { buffer: zlib.deflateSync(body), encoding: 'deflate' };
  }
  return { buffer: Buffer.from(body) };
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown, config?: GatewayConfig, origin?: string): void {
  const payload = JSON.stringify(body);
  const cors = config ? getCorsHeaders(config, origin) : { 'Access-Control-Allow-Origin': '*' };
  const acceptEncoding = (res.req?.headers['accept-encoding'] as string) || '';
  const compressed = compressBody(payload, acceptEncoding, 'application/json');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...cors };
  if (compressed.encoding) {
    headers['Content-Encoding'] = compressed.encoding;
  }
  res.writeHead(status, headers);
  res.end(compressed.buffer);
}

export function sendError(res: http.ServerResponse, status: number, type: string, message: string, config?: GatewayConfig, origin?: string): void {
  sendJson(res, status, { type: 'error', error: { type, message } }, config, origin);
}

export function readBody(req: http.IncomingMessage, maxBytes = MAX_BODY_SIZE): Promise<string> {
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
