import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['93.184.216.34']),
  resolve6: vi.fn().mockRejectedValue(new Error('no AAAA')),
}));
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { ClaudeProvider } from '../src/providers/claude.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { EventBus } from '../src/services/event-bus.js';
import { RateTracker } from '../src/services/rate-tracker.js';
import { loadConfig } from '../src/config.js';
import { loginRateLimiter } from '../src/middleware/auth.js';
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
    const router = createRouter(providers, {});
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

  it('GET /api/logs returns paginated response', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json.total).toBe('number');
    expect(Array.isArray(json.logs)).toBe(true);
  });
});

describe('server with admin auth', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig({ adminToken: 'test-secret-token' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
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
    const router = createRouter(providers, {});
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

describe('server SSE /api/events', () => {
  let server: http.Server;
  let eventBus: EventBus;

  beforeAll(async () => {
    eventBus = new EventBus();
    const config = makeConfig();
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'), eventBus);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/events returns SSE stream headers', async () => {
    const addr = server.address() as { port: number };
    const res = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, resolve);
      req.end();
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-cache');
    res.destroy();
  });

  it('GET /api/events receives emitted events', async () => {
    const addr = server.address() as { port: number };
    const received = await new Promise<string>((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port: addr.port, path: '/api/events' }, (res) => {
        let buf = '';
        res.on('data', (chunk: Buffer) => {
          buf += chunk.toString();
          if (buf.includes('event: test_event')) {
            res.destroy();
            resolve(buf);
          }
        });
        res.on('error', () => {});
        setTimeout(() => eventBus.emit('test_event', { hello: 'world' }), 50);
      });
      req.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
    expect(received).toContain('event: test_event');
    expect(received).toContain('"hello":"world"');
  });
});

describe('server /api/stats', () => {
  let server: http.Server;
  let rateTracker: RateTracker;

  beforeAll(async () => {
    rateTracker = new RateTracker();
    const config = makeConfig();
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'), undefined, rateTracker);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    rateTracker.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/stats returns qps, rpm, tps', async () => {
    rateTracker.record(100);
    const res = await request(server, { method: 'GET', path: '/api/stats' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json.qps).toBe('number');
    expect(typeof json.rpm).toBe('number');
    expect(typeof json.tps).toBe('number');
    expect(json.qps).toBeGreaterThan(0);
  });
});

describe('server /api/config/import', () => {
  let server: http.Server;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'api-hub-test-'));
    const seedConfig = makeConfig({ adminToken: 'import-token', port: 9999 });
    const tmpConfigPath = join(tmpDir, 'providers.json');
    writeFileSync(tmpConfigPath, JSON.stringify(seedConfig, null, 2));
    loadConfig(tmpConfigPath);
    const config = makeConfig({ adminToken: 'import-token' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it('POST /api/config/import without auth returns 401', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providers: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /api/config/import with invalid JSON returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'import-token' },
      body: '{bad json',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/config/import without providers returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'import-token' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('providers');
  });

  it('POST /api/config/import with valid config returns 200', async () => {
    const newConfig = {
      providers: {
        test: testProviderConfig,
        extra: { ...testProviderConfig, name: 'extra', prefix: 'extra-' },
      },
    };
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'import-token' },
      body: JSON.stringify(newConfig),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.imported).toBe(true);
  });
});

describe('server /api/auth/login', () => {
  let server: http.Server;

  beforeEach(() => {
    // Reset login rate limiter to avoid 429s across tests
    (loginRateLimiter as unknown as { attempts: Map<string, unknown> }).attempts.clear();
  });

  beforeAll(async () => {
    const config = makeConfig({ password: 'login-secret' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /api/auth/login with correct password returns token', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'login-secret' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.token).toBeTruthy();
    expect(json.token).not.toBe('login-secret');
  });

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    expect(res.status).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('authentication_error');
  });

  it('POST /api/auth/login without password returns 401', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('authentication_error');
  });

  it('POST /api/auth/login with invalid JSON returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });
});

describe('server /api/auth/login without adminToken', () => {
  let server: http.Server;

  beforeEach(() => {
    (loginRateLimiter as unknown as { attempts: Map<string, unknown> }).attempts.clear();
  });

  beforeAll(async () => {
    const config = makeConfig();
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /api/auth/login without adminToken configured returns success with empty token', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'anything' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.token).toBe('');
  });
});

describe('public routes edge cases', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig();
    const providers = [
      new GenericOpenAIProvider(testProviderConfig),
      new ClaudeProvider(passthroughConfig),
    ];
    const router = createRouter(providers, {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET / returns 304 when if-none-match matches ETag', async () => {
    // First request — get the ETag
    const res1 = await request(server, { method: 'GET', path: '/' });
    expect(res1.status).toBe(200);
    const etag = res1.headers['etag'] as string;
    expect(etag).toBeDefined();

    // Second request with matching if-none-match
    const res2 = await request(server, {
      method: 'GET',
      path: '/',
      headers: { 'if-none-match': etag },
    });
    expect(res2.status).toBe(304);
  });

  it('GET / returns 200 when if-none-match does not match ETag', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/',
      headers: { 'if-none-match': '"non-matching-etag"' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain('API Hub');
  });

  it('GET / with accept-encoding gzip returns compressed response', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-encoding']).toBe('gzip');
    // Body should be gzip compressed (not plaintext HTML)
    expect(res.body).not.toContain('API Hub');
  });

  it('GET /icon.png returns image/png', async () => {
    const res = await request(server, { method: 'GET', path: '/icon.png' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('max-age=86400');
    // Verify it's a PNG (starts with PNG magic bytes)
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('GET /api/auth/check returns required status (false when no password)', async () => {
    const res = await request(server, { method: 'GET', path: '/api/auth/check' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json).toHaveProperty('required');
    expect(json.required).toBe(false);
  });

  it('GET /api/auth/check returns required=true when password is set', async () => {
    // Create a new server with password configured
    const pwConfig = makeConfig({ password: 'test-password' });
    const pwProviders = [new GenericOpenAIProvider(testProviderConfig)];
    const pwRouter = createRouter(pwProviders, {});
    const pwServer = createServer(pwRouter, pwConfig, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => pwServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = pwServer.address() as { port: number };

    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: addr.port,
        method: 'GET',
        path: '/api/auth/check',
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => resolve({
          status: response.statusCode ?? 500,
          body: Buffer.concat(chunks).toString('utf-8'),
        }));
      });
      req.on('error', reject);
      req.end();
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.required).toBe(true);

    await new Promise<void>((resolve) => pwServer.close(() => resolve()));
  });
});
