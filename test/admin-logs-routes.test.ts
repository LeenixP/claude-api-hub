import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { RateTracker } from '../src/services/rate-tracker.js';
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

function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    providers: { test: testProviderConfig },
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

describe('admin logs routes', () => {
  let server: http.Server;
  let logManager: LogManager;
  let rateTracker: RateTracker;

  beforeAll(async () => {
    const config = makeConfig({ adminToken: 'admin-secret' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
    logManager = new LogManager(200, 100, ':memory:');
    rateTracker = new RateTracker();
    server = createServer(router, config, logManager, undefined, rateTracker);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

    // Seed some logs
    for (let i = 0; i < 10; i++) {
      logManager.addLog({
        time: new Date().toISOString(),
        requestId: `req_${i}`,
        claudeModel: i % 2 === 0 ? 'claude-sonnet' : 'claude-haiku',
        resolvedModel: 'test-model',
        provider: i % 3 === 0 ? 'test-provider' : 'other-provider',
        protocol: 'OpenAI',
        targetUrl: 'https://api.example.com/chat/completions',
        stream: false,
        status: i % 4 === 0 ? 200 : 500,
        durationMs: 100 + i * 10,
        inputTokens: 10,
        outputTokens: 5,
      });
    }
  });

  afterAll(async () => {
    rateTracker.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const authHeaders = { 'x-admin-token': 'admin-secret' };

  it('GET /api/logs returns paginated response with total and logs', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json.total).toBe('number');
    expect(json.total).toBeGreaterThan(0);
    expect(Array.isArray(json.logs)).toBe(true);
    expect(json.logs.length).toBeGreaterThan(0);
  });

  it('GET /api/logs?limit=5&offset=0 respects pagination params', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs?limit=5&offset=0', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.logs.length).toBeLessThanOrEqual(5);
    expect(json.total).toBeGreaterThanOrEqual(json.logs.length);
  });

  it('GET /api/logs?limit=5&offset=5 returns different page', async () => {
    const page1 = await request(server, { method: 'GET', path: '/api/logs?limit=5&offset=0', headers: authHeaders });
    const json1 = JSON.parse(page1.body);

    const page2 = await request(server, { method: 'GET', path: '/api/logs?limit=5&offset=5', headers: authHeaders });
    const json2 = JSON.parse(page2.body);

    expect(json2.logs.length).toBeLessThanOrEqual(5);
    if (json1.logs.length > 0 && json2.logs.length > 0) {
      expect(json1.logs[0].requestId).not.toBe(json2.logs[0].requestId);
    }
  });

  it('GET /api/logs?provider=test-provider filters by provider', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs?provider=test-provider', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.total).toBeGreaterThan(0);
    for (const log of json.logs) {
      expect(log.provider).toBe('test-provider');
    }
  });

  it('GET /api/logs?status=200 filters by status', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs?status=200', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    for (const log of json.logs) {
      expect(log.status).toBe(200);
    }
  });

  it('GET /api/token-stats returns token statistics structure', async () => {
    const res = await request(server, { method: 'GET', path: '/api/token-stats', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json).toHaveProperty('summary');
    expect(json).toHaveProperty('byProvider');
    expect(json).toHaveProperty('byModel');
    expect(json).toHaveProperty('daily');
    expect(typeof json.summary.totalTokens).toBe('number');
    expect(typeof json.summary.promptTokens).toBe('number');
    expect(typeof json.summary.completionTokens).toBe('number');
    expect(typeof json.summary.requestCount).toBe('number');
    expect(json.summary.requestCount).toBeGreaterThan(0);
    expect(Array.isArray(json.byProvider)).toBe(true);
    expect(Array.isArray(json.byModel)).toBe(true);
    expect(Array.isArray(json.daily)).toBe(true);
  });

  it('GET /api/stats returns qps/rpm/tps', async () => {
    rateTracker.record(100);
    rateTracker.record(200);

    const res = await request(server, { method: 'GET', path: '/api/stats', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json.qps).toBe('number');
    expect(typeof json.rpm).toBe('number');
    expect(typeof json.tps).toBe('number');
  });

  it('POST /api/logs/clear clears logs', async () => {
    // First verify logs exist
    const before = await request(server, { method: 'GET', path: '/api/logs', headers: authHeaders });
    const beforeJson = JSON.parse(before.body);
    expect(beforeJson.total).toBeGreaterThan(0);

    // Clear logs
    const clearRes = await request(server, { method: 'POST', path: '/api/logs/clear', headers: authHeaders });
    expect(clearRes.status).toBe(200);
    const clearJson = JSON.parse(clearRes.body);
    expect(clearJson.cleared).toBe(true);

    // Verify logs are cleared
    const after = await request(server, { method: 'GET', path: '/api/logs', headers: authHeaders });
    const afterJson = JSON.parse(after.body);
    expect(afterJson.total).toBe(0);
    expect(afterJson.logs).toEqual([]);
  });

  it('GET /api/logs/file-status returns file logging status', async () => {
    const res = await request(server, { method: 'GET', path: '/api/logs/file-status', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json.enabled).toBe('boolean');
    expect(typeof json.fileCount).toBe('number');
    expect(typeof json.maxFiles).toBe('number');
    expect(typeof json.logDir).toBe('string');
  });

  it('PUT /api/logs/file-toggle toggles file logging', async () => {
    const before = await request(server, { method: 'GET', path: '/api/logs/file-status', headers: authHeaders });
    const beforeJson = JSON.parse(before.body);
    const initialState = beforeJson.enabled;

    const toggleRes = await request(server, { method: 'PUT', path: '/api/logs/file-toggle', headers: authHeaders });
    expect(toggleRes.status).toBe(200);
    const toggleJson = JSON.parse(toggleRes.body);
    expect(toggleJson.enabled).toBe(!initialState);

    // Toggle back
    const toggleBack = await request(server, { method: 'PUT', path: '/api/logs/file-toggle', headers: authHeaders });
    const toggleBackJson = JSON.parse(toggleBack.body);
    expect(toggleBackJson.enabled).toBe(initialState);
  });

  it('GET /api/health/providers returns provider status map', async () => {
    const res = await request(server, { method: 'GET', path: '/api/health/providers', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(typeof json).toBe('object');
    // Check at least one provider key exists
    const keys = Object.keys(json);
    expect(keys.length).toBeGreaterThan(0);
    // Each provider entry should have status and latencyMs
    for (const key of keys) {
      expect(json[key]).toHaveProperty('status');
      expect(typeof json[key].latencyMs).toBe('number');
    }
  });

  it('admin logs endpoints require auth', async () => {
    const endpoints = [
      { method: 'GET', path: '/api/logs' },
      { method: 'GET', path: '/api/stats' },
      { method: 'GET', path: '/api/token-stats' },
      { method: 'POST', path: '/api/logs/clear' },
      { method: 'GET', path: '/api/logs/file-status' },
      { method: 'PUT', path: '/api/logs/file-toggle' },
      { method: 'GET', path: '/api/health/providers' },
    ];

    for (const endpoint of endpoints) {
      const res = await request(server, {
        method: endpoint.method as string,
        path: endpoint.path,
      });
      expect(res.status).toBe(401);
    }
  });
});
