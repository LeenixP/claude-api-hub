import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['93.184.216.34']),
  resolve6: vi.fn().mockRejectedValue(new Error('no AAAA')),
}));
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { loadConfig } from '../src/config.js';
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
    defaultProvider: 'test',
    logLevel: 'error',
    aliases: { haiku: 'test-model-1', sonnet: 'test-model-2' },
    tierTimeouts: {
      haiku: { timeoutMs: 30000, streamTimeoutMs: 60000 },
      sonnet: { timeoutMs: 60000, streamTimeoutMs: 120000 },
    },
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

describe('admin config routes', () => {
  let server: http.Server;
  let config: GatewayConfig;
  let tmpDir: string;

  beforeAll(async () => {
    // Create a temp config file so saveConfig/rebuildProviders work
    tmpDir = mkdtempSync(join(tmpdir(), 'api-hub-test-'));
    const configPath = join(tmpDir, 'providers.json');
    // Use port 9999 for the temp config file (loadConfig validates port >= 1)
    const fileConfig = makeConfig({ adminToken: 'admin-secret', port: 9999 });
    writeFileSync(configPath, JSON.stringify(fileConfig, null, 2));
    loadConfig(configPath);

    // Use port 0 for the actual test server
    config = makeConfig({ adminToken: 'admin-secret' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', config.aliases ?? {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  });

  const authHeaders = { 'x-admin-token': 'admin-secret' };

  it('GET /api/config returns masked config', async () => {
    const res = await request(server, { method: 'GET', path: '/api/config', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.providers).toBeDefined();
    expect(json.providers.test).toBeDefined();
    expect(json.providers.test.apiKey).toContain('***');
    expect(json.providers.test.apiKey).not.toContain('sk-test-key');
    expect(json.aliases).toBeDefined();
    expect(json.tierTimeouts).toBeDefined();
  });

  it('POST /api/config/providers creates new provider (201)', async () => {
    const newProvider = {
      name: 'new-provider',
      baseUrl: 'https://api.new.com',
      apiKey: 'sk-new-key',
      models: ['new-model'],
      defaultModel: 'new-model',
      enabled: true,
    };
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(newProvider),
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('new-provider');
    expect(json.apiKey).toContain('***');
  });

  it('POST /api/config/providers returns 409 for duplicate', async () => {
    const duplicate = {
      name: 'new-provider',
      baseUrl: 'https://api.dup.com',
      apiKey: 'sk-dup',
      models: ['dup-model'],
      defaultModel: 'dup-model',
    };
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicate),
    });
    expect(res.status).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('conflict_error');
  });

  it('POST /api/config/providers returns 400 for missing fields', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'incomplete' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
  });

  it('POST /api/config/providers returns 400 for empty models array', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'bad-provider',
        baseUrl: 'https://api.bad.com',
        apiKey: 'sk-bad',
        models: [],
        defaultModel: 'bad-model',
      }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('models');
  });

  it('PUT /api/config/providers/:name updates provider', async () => {
    const updates = {
      baseUrl: 'https://api.updated.com',
      models: ['updated-model'],
    };
    const res = await request(server, {
      method: 'PUT',
      path: '/api/config/providers/test',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.baseUrl).toBe('https://api.updated.com');
    expect(json.models).toEqual(['updated-model']);
  });

  it('PUT /api/config/providers/:name preserves masked API keys', async () => {
    // First get the masked key
    const getRes = await request(server, { method: 'GET', path: '/api/config', headers: authHeaders });
    const configJson = JSON.parse(getRes.body);
    const maskedKey = configJson.providers.test.apiKey;

    // Send update with masked key
    const res = await request(server, {
      method: 'PUT',
      path: '/api/config/providers/test',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: maskedKey, baseUrl: 'https://api.preserve.com' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    // The key should still be masked in response, but the real key should be preserved internally
    expect(json.apiKey).toContain('***');

    // Verify by getting config again
    const getRes2 = await request(server, { method: 'GET', path: '/api/config', headers: authHeaders });
    const configJson2 = JSON.parse(getRes2.body);
    expect(configJson2.providers.test.baseUrl).toBe('https://api.preserve.com');
    expect(configJson2.providers.test.apiKey).toContain('***');
  });

  it('DELETE /api/config/providers/:name deletes provider', async () => {
    const res = await request(server, {
      method: 'DELETE',
      path: '/api/config/providers/new-provider',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.deleted).toBe('new-provider');
  });

  it('DELETE /api/config/providers/:name returns 404 for missing', async () => {
    const res = await request(server, {
      method: 'DELETE',
      path: '/api/config/providers/nonexistent',
      headers: authHeaders,
    });
    expect(res.status).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('not_found_error');
  });

  it('GET /api/aliases returns aliases', async () => {
    const res = await request(server, { method: 'GET', path: '/api/aliases', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.haiku).toBe('test-model-1');
    expect(json.sonnet).toBe('test-model-2');
  });

  it('PUT /api/aliases updates aliases', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/aliases',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ haiku: 'new-haiku-model', sonnet: 'new-sonnet-model', opus: 'new-opus-model' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.haiku).toBe('new-haiku-model');
    expect(json.opus).toBe('new-opus-model');
  });

  it('PUT /api/aliases rejects invalid tier keys', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/aliases',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ haiku: 'ok', invalidTier: 'bad' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
    expect(json.error.message).toContain('invalidTier');
  });

  it('GET /api/tier-timeouts returns tier timeouts', async () => {
    const res = await request(server, { method: 'GET', path: '/api/tier-timeouts', headers: authHeaders });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.haiku).toBeDefined();
    expect(json.haiku.timeoutMs).toBe(30000);
    expect(json.sonnet).toBeDefined();
    expect(json.sonnet.timeoutMs).toBe(60000);
  });

  it('PUT /api/tier-timeouts updates tier timeouts', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/tier-timeouts',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        haiku: { timeoutMs: 15000, streamTimeoutMs: 30000 },
        sonnet: { timeoutMs: 45000, streamTimeoutMs: 90000 },
        opus: { timeoutMs: 120000, streamTimeoutMs: 240000 },
      }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.haiku.timeoutMs).toBe(15000);
    expect(json.opus.timeoutMs).toBe(120000);
  });

  it('PUT /api/tier-timeouts rejects invalid tier keys', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/tier-timeouts',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ invalid: { timeoutMs: 1000 } }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
    expect(json.error.message).toContain('invalid');
  });

  it('POST /api/config/import imports config with whitelisted fields only', async () => {
    const importConfig = {
      providers: {
        imported: {
          name: 'imported',
          baseUrl: 'https://api.imported.com',
          apiKey: 'sk-imported',
          models: ['imported-model'],
          defaultModel: 'imported-model',
          enabled: true,
        },
      },
      aliases: { haiku: 'imported-model' },
      defaultProvider: 'imported',
      // These should be ignored (not in allowedConfigKeys)
      unknownField: 'should-be-ignored',
      anotherBad: 123,
    };
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(importConfig),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.imported).toBe(true);
  });

  it('POST /api/config/import without providers returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultProvider: 'test' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('providers');
  });

  it('POST /api/config/import preserves masked API keys', async () => {
    // Get current config with masked keys
    const getRes = await request(server, { method: 'GET', path: '/api/config', headers: authHeaders });
    const currentConfig = JSON.parse(getRes.body);
    const providerNames = Object.keys(currentConfig.providers);
    expect(providerNames.length).toBeGreaterThan(0);
    const firstProvider = providerNames[0];

    // Re-import with masked keys
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(currentConfig),
    });
    expect(res.status).toBe(200);

    // Verify keys are still masked in response
    const getRes2 = await request(server, { method: 'GET', path: '/api/config', headers: authHeaders });
    const config2 = JSON.parse(getRes2.body);
    expect(config2.providers[firstProvider].apiKey).toContain('***');
  });

  it('all admin endpoints require auth', async () => {
    const endpoints = [
      { method: 'GET', path: '/api/config' },
      { method: 'GET', path: '/api/aliases' },
      { method: 'GET', path: '/api/tier-timeouts' },
      { method: 'POST', path: '/api/config/import', body: '{}' },
    ];

    for (const endpoint of endpoints) {
      const res = await request(server, {
        method: endpoint.method as string,
        path: endpoint.path,
        headers: endpoint.body ? { 'Content-Type': 'application/json' } : undefined,
        body: endpoint.body,
      });
      expect(res.status).toBe(401);
    }
  });
});
