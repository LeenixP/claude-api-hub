import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { ClaudeProvider } from '../src/providers/claude.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import type { GatewayConfig, ProviderConfig } from '../src/providers/types.js';

const testProviderConfig: ProviderConfig = {
  name: 'test-provider',
  baseUrl: 'https://api.example.com',
  apiKey: 'sk-test-key',
  models: ['test-model-1', 'test-model-2'],
  defaultModel: 'test-model-1',
  enabled: true,
  prefix: 'test-',
};

const passthroughConfig: ProviderConfig = {
  name: 'passthrough-provider',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test',
  models: ['claude-sonnet-4-6'],
  defaultModel: 'claude-sonnet-4-6',
  enabled: true,
  prefix: 'claude-',
  passthrough: true,
};

function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    providers: { test: testProviderConfig, passthrough: passthroughConfig },
    defaultProvider: 'test',
    logLevel: 'error',
    ...overrides,
  };
}

function request(server: http.Server, opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number } | null;
    if (!addr) return reject(new Error('Server not listening'));
    const req = http.request({
      hostname: '127.0.0.1',
      port: addr.port,
      method: opts.method,
      path: opts.path,
      headers: opts.headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode ?? 500,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf-8'),
      }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

describe('server integration', () => {
  let server: http.Server;
  let config: GatewayConfig;

  beforeAll(async () => {
    config = makeConfig();
    const providers = [
      new GenericOpenAIProvider(testProviderConfig),
      new ClaudeProvider(passthroughConfig),
    ];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET / returns dashboard HTML', async () => {
    const res = await request(server, { method: 'GET', path: '/' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('API Hub');
  });

  it('GET /health returns ok', async () => {
    const res = await request(server, { method: 'GET', path: '/health' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.status).toBe('ok');
    expect(json.timestamp).toBeDefined();
  });

  it('GET /v1/models returns model list', async () => {
    const res = await request(server, { method: 'GET', path: '/v1/models' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.object).toBe('list');
    expect(json.data.length).toBeGreaterThan(0);
    expect(json.data.some((m: { id: string }) => m.id === 'test-model-1')).toBe(true);
  });

  it('OPTIONS returns CORS headers', async () => {
    const res = await request(server, { method: 'OPTIONS', path: '/v1/messages' });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('unknown endpoint returns 404', async () => {
    const res = await request(server, { method: 'GET', path: '/nonexistent' });
    expect(res.status).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('not_found_error');
  });

  it('POST /v1/messages with invalid JSON returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
  });

  it('POST /v1/messages without model returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('model');
  });

  it('security headers are present', async () => {
    const res = await request(server, { method: 'GET', path: '/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('GET /api/logs returns array', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(Array.isArray(json)).toBe(true);
  });
});

describe('server with admin auth', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig({ adminToken: 'test-secret-token' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/config without token returns 401', async () => {
    const res = await request(server, { method: 'GET', path: '/api/config' });
    expect(res.status).toBe(401);
  });

  it('GET /api/config with valid token returns 200', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/api/config',
      headers: { 'x-admin-token': 'test-secret-token' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.providers).toBeDefined();
    expect(json.providers.test.apiKey).toContain('***');
  });

  it('GET /api/config with wrong token returns 401', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/api/config',
      headers: { 'x-admin-token': 'wrong-token' },
    });
    expect(res.status).toBe(401);
  });

  it('GET /api/logs requires auth', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs' });
    expect(res.status).toBe(401);
  });

  it('POST mutation without token returns 401', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/logs/clear',
    });
    expect(res.status).toBe(401);
  });

  it('POST mutation with valid token succeeds', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/logs/clear',
      headers: { 'Authorization': 'Bearer test-secret-token' },
    });
    expect(res.status).toBe(200);
  });

  it('public endpoints do not require auth', async () => {
    const res1 = await request(server, { method: 'GET', path: '/health' });
    expect(res1.status).toBe(200);

    const res2 = await request(server, { method: 'GET', path: '/v1/models' });
    expect(res2.status).toBe(200);

    const res3 = await request(server, { method: 'GET', path: '/' });
    expect(res3.status).toBe(200);
  });
});

describe('server with rate limiting', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig({ rateLimitRpm: 2 });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rate limits after exceeding RPM', async () => {
    const body = JSON.stringify({ model: 'test-model-1', messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 });
    const headers = { 'Content-Type': 'application/json' };

    // First 2 should pass (may fail with 502 since upstream is fake, but not 429)
    const r1 = await request(server, { method: 'POST', path: '/v1/messages', headers, body });
    expect(r1.status).not.toBe(429);

    const r2 = await request(server, { method: 'POST', path: '/v1/messages', headers, body });
    expect(r2.status).not.toBe(429);

    // Third should be rate limited
    const r3 = await request(server, { method: 'POST', path: '/v1/messages', headers, body });
    expect(r3.status).toBe(429);
    expect(r3.headers['retry-after']).toBeDefined();
  });
});
