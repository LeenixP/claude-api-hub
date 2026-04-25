import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';
import {
  readBody,
  maskKey,
  getCorsHeaders,
  sendJson,
  sendError,
  compressBody,
} from '../src/utils/http.js';
import { MAX_BODY_SIZE } from '../src/constants.js';

describe('HttpUtils', () => {
  describe('readBody', () => {
    it('reads valid body', async () => {
      const req = new http.IncomingMessage(null as any);
      const promise = readBody(req, 1024);
      req.emit('data', Buffer.from('hello'));
      req.emit('end');
      const result = await promise;
      expect(result).toBe('hello');
    });

    it('rejects when body exceeds max size', async () => {
      const req = new http.IncomingMessage(null as any);
      const promise = readBody(req, 5);
      req.emit('data', Buffer.from('hello world'));
      await expect(promise).rejects.toThrow('Request body too large');
    });

    it('reads empty body', async () => {
      const req = new http.IncomingMessage(null as any);
      const promise = readBody(req, 1024);
      req.emit('end');
      const result = await promise;
      expect(result).toBe('');
    });

    it('uses default max size when not specified', async () => {
      const req = new http.IncomingMessage(null as any);
      const promise = readBody(req);
      req.emit('data', Buffer.from('test'));
      req.emit('end');
      const result = await promise;
      expect(result).toBe('test');
    });

    it('rejects on request error', async () => {
      const req = new http.IncomingMessage(null as any);
      const promise = readBody(req, 1024);
      req.emit('error', new Error('read error'));
      await expect(promise).rejects.toThrow('read error');
    });
  });

  describe('maskKey', () => {
    it('masks short key (<=8 chars) as ***', () => {
      expect(maskKey('abc')).toBe('***');
      expect(maskKey('abcdefgh')).toBe('***');
    });

    it('masks medium key with first 4 and last 4', () => {
      expect(maskKey('sk-test12345')).toBe('sk-t***2345');
    });

    it('masks full length key', () => {
      expect(maskKey('sk-ant-api03-test1234567890')).toBe('sk-a***7890');
    });

    it('returns *** for empty string', () => {
      expect(maskKey('')).toBe('***');
    });
  });

  describe('getCorsHeaders', () => {
    const baseConfig = {
      port: 3000,
      host: '127.0.0.1',
      providers: {},
      defaultProvider: 'test',
      logLevel: 'error' as const,
    };

    it('returns headers with matching origin', () => {
      const config = { ...baseConfig, corsOrigins: ['http://localhost:3000', 'http://example.com'] };
      const headers = getCorsHeaders(config, 'http://example.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://example.com');
      expect(headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(headers['Vary']).toBe('Origin');
    });

    it('returns first origin when no match', () => {
      const config = { ...baseConfig, corsOrigins: ['http://localhost:3000', 'http://example.com'] };
      const headers = getCorsHeaders(config, 'http://unknown.com');
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });

    it('uses wildcard behavior with no config', () => {
      const headers = getCorsHeaders(baseConfig, undefined);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://127.0.0.1:3000');
    });

    it('returns default origin for matching localhost when host is 0.0.0.0', () => {
      const config = { ...baseConfig, host: '0.0.0.0' };
      const headers = getCorsHeaders(config, undefined);
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
    });

    it('does not set origin for non-matching req when no corsOrigins', () => {
      const config = { ...baseConfig, host: '192.168.1.1' };
      const headers = getCorsHeaders(config, 'http://other.com');
      expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });

  describe('sendJson', () => {
    let res: http.ServerResponse;
    let writeHeadSpy: ReturnType<typeof vi.fn>;
    let endSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeHeadSpy = vi.fn();
      endSpy = vi.fn();
      res = {
        writeHead: writeHeadSpy,
        end: endSpy,
        req: { headers: {} },
      } as unknown as http.ServerResponse;
    });

    it('sends JSON with correct content type', () => {
      sendJson(res, 200, { status: 'ok' });
      expect(writeHeadSpy).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }),
      );
      expect(endSpy).toHaveBeenCalled();
    });

    it('sends JSON with CORS config', () => {
      const config = {
        port: 3000,
        host: '127.0.0.1',
        providers: {},
        defaultProvider: 'test',
        logLevel: 'error' as const,
        corsOrigins: ['http://example.com'],
      };
      sendJson(res, 200, { status: 'ok' }, config, 'http://example.com');
      expect(writeHeadSpy).toHaveBeenCalledWith(
        200,
        expect.objectContaining({
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': 'http://example.com',
        }),
      );
    });

    it('compresses large JSON with gzip', () => {
      res.req = { headers: { 'accept-encoding': 'gzip' } } as any;
      const largeBody = 'x'.repeat(2000);
      sendJson(res, 200, { data: largeBody });
      const headers = writeHeadSpy.mock.calls[0][1] as Record<string, string>;
      expect(headers['Content-Encoding']).toBe('gzip');
      expect(endSpy).toHaveBeenCalled();
    });
  });

  describe('sendError', () => {
    let res: http.ServerResponse;
    let writeHeadSpy: ReturnType<typeof vi.fn>;
    let endSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeHeadSpy = vi.fn();
      endSpy = vi.fn();
      res = {
        writeHead: writeHeadSpy,
        end: endSpy,
        req: { headers: {} },
      } as unknown as http.ServerResponse;
    });

    it('sends error with correct format', () => {
      sendError(res, 400, 'invalid_request_error', 'Bad request');
      expect(writeHeadSpy).toHaveBeenCalledWith(
        400,
        expect.objectContaining({ 'Content-Type': 'application/json' }),
      );
      const buffer = endSpy.mock.calls[0][0] as Buffer;
      const body = JSON.parse(buffer.toString());
      expect(body.type).toBe('error');
      expect(body.error.type).toBe('invalid_request_error');
      expect(body.error.message).toBe('Bad request');
    });
  });

  describe('compressBody', () => {
    it('skips compression for SSE content type', () => {
      const result = compressBody('data: hello\n\n', 'gzip', 'text/event-stream');
      expect(result.encoding).toBeUndefined();
      expect(result.buffer.toString()).toBe('data: hello\n\n');
    });

    it('skips compression for small bodies', () => {
      const result = compressBody('small', 'gzip', 'application/json');
      expect(result.encoding).toBeUndefined();
    });

    it('compresses with gzip when accepted', () => {
      const body = 'x'.repeat(2000);
      const result = compressBody(body, 'gzip', 'application/json');
      expect(result.encoding).toBe('gzip');
      expect(result.buffer.length).toBeLessThan(Buffer.byteLength(body));
    });

    it('compresses with deflate when accepted', () => {
      const body = 'x'.repeat(2000);
      const result = compressBody(body, 'deflate', 'application/json');
      expect(result.encoding).toBe('deflate');
      expect(result.buffer.length).toBeLessThan(Buffer.byteLength(body));
    });

    it('compresses with gzip for wildcard accept', () => {
      const body = 'x'.repeat(2000);
      const result = compressBody(body, '*', 'application/json');
      expect(result.encoding).toBe('gzip');
    });

    it('skips compression for unsupported encoding', () => {
      const body = 'x'.repeat(2000);
      const result = compressBody(body, 'br', 'application/json');
      expect(result.encoding).toBeUndefined();
    });
  });
});
