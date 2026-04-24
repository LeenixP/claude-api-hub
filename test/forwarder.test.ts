import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { forwardRequest, forwardStream, httpGet, destroyAgents } from '../src/services/forwarder.js';

describe('forwardRequest', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (req.url === '/ok') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: body, path: req.url }));
        } else if (req.url === '/error') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'internal error' }));
        } else if (req.url === '/slow') {
          setTimeout(() => {
            res.writeHead(200);
            res.end('too late');
          }, 500);
        } else if (req.url === '/large') {
          res.writeHead(200);
          res.end('x'.repeat(200));
        } else {
          res.writeHead(404);
          res.end('not found');
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    destroyAgents();
  });

  it('returns 200 response with body', async () => {
    const result = await forwardRequest(
      `http://127.0.0.1:${port}/ok`,
      { 'Content-Type': 'application/json' },
      JSON.stringify({ hello: 'world' }),
      5000,
      1024 * 1024,
    );
    expect(result.status).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.received).toContain('hello');
  });

  it('returns non-200 response correctly', async () => {
    const result = await forwardRequest(
      `http://127.0.0.1:${port}/error`,
      {},
      '',
      5000,
      1024 * 1024,
    );
    expect(result.status).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('internal error');
  });

  it('rejects on timeout', async () => {
    await expect(
      forwardRequest(
        `http://127.0.0.1:${port}/slow`,
        {},
        '',
        50,
        1024 * 1024,
      ),
    ).rejects.toThrow('timeout');
  });

  it('rejects when response exceeds max bytes', async () => {
    await expect(
      forwardRequest(
        `http://127.0.0.1:${port}/large`,
        {},
        '',
        5000,
        10,
      ),
    ).rejects.toThrow('exceeds');
  });
});

describe('forwardStream', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/stream') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('chunk1');
        res.write('chunk2');
        res.end('chunk3');
      } else if (req.url === '/stream-error') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad gateway' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    destroyAgents();
  });

  it('receives data chunks via onChunk', async () => {
    const chunks: string[] = [];
    let ended = false;
    let error: Error | null = null;

    await new Promise<void>((resolve) => {
      forwardStream(
        `http://127.0.0.1:${port}/stream`,
        {},
        '',
        (chunk) => { chunks.push(chunk); },
        () => { ended = true; resolve(); },
        (err) => { error = err; resolve(); },
      );
    });

    expect(error).toBeNull();
    expect(ended).toBe(true);
    expect(chunks.join('')).toBe('chunk1chunk2chunk3');
  });

  it('calls onUpstreamResponse for non-200 status', async () => {
    let statusCode = 0;
    let rawBody = '';

    await new Promise<void>((resolve) => {
      forwardStream(
        `http://127.0.0.1:${port}/stream-error`,
        {},
        '',
        () => {},
        () => resolve(),
        () => resolve(),
        (status, _headers, body) => { statusCode = status; rawBody = body || ''; resolve(); },
      );
    });

    expect(statusCode).toBe(502);
    expect(JSON.parse(rawBody).error).toBe('bad gateway');
  });
});

describe('httpGet', () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/get') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hello get');
      } else if (req.url === '/get-large') {
        res.writeHead(200);
        res.end('y'.repeat(200));
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    destroyAgents();
  });

  it('returns response body as string', async () => {
    const result = await httpGet(`http://127.0.0.1:${port}/get`, {}, 5000, 1024 * 1024);
    expect(result).toBe('hello get');
  });

  it('rejects when response exceeds max bytes', async () => {
    await expect(
      httpGet(`http://127.0.0.1:${port}/get-large`, {}, 5000, 10),
    ).rejects.toThrow('exceeds');
  });
});
