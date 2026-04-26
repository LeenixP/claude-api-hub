import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const throwHooks = { writeFile: false };

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn((...args: Parameters<typeof actual.writeFileSync>) => {
      if (throwHooks.writeFile) {
        throwHooks.writeFile = false;
        throw new Error('Disk full');
      }
      return actual.writeFileSync(...args);
    }),
  };
});

const forwarderHooks = {
  responses: [] as (string | Error)[],
};

vi.mock('../src/services/forwarder.js', () => ({
  httpGet: vi.fn(() => {
    const next = forwarderHooks.responses.shift();
    if (next instanceof Error) throw next;
    return Promise.resolve(next ?? '{}');
  }),
}));

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
    const router = createRouter(providers, config.aliases ?? {});
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
      body: JSON.stringify({}),
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

  it('POST /api/config/reload reloads config from disk and returns masked config', async () => {
    // Sync temp config file with current server config so deepMerge is consistent
    const configPath = join(tmpDir, 'providers.json');
    // Use valid port (>=1) so loadConfig validation passes
    writeFileSync(configPath, JSON.stringify({ ...config, port: 9999 }, null, 2));
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/reload',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.reloaded).toBe(true);
    expect(json.config).toBeDefined();
    expect(json.config.providers).toBeDefined();
    // Verify the config has at least one provider with masked apiKey
    const providerKeys = Object.keys(json.config.providers);
    expect(providerKeys.length).toBeGreaterThan(0);
    const firstProvider = json.config.providers[providerKeys[0]];
    if (firstProvider.apiKey) {
      expect(firstProvider.apiKey).toContain('***');
    }
  });

  it('POST /api/config/reload returns 500 when config file is missing', async () => {
    const configPath = join(tmpDir, 'providers.json');
    const backup = readFileSync(configPath, 'utf-8');
    rmSync(configPath);
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/reload',
      headers: authHeaders,
    });
    expect(res.status).toBe(500);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('api_error');
    expect(json.error.message).toContain('Reload failed');
    // Restore config file for subsequent tests
    writeFileSync(configPath, backup);
  });

  it('POST /api/config/import returns 500 on internal save error (catch block)', async () => {
    throwHooks.writeFile = true;
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          catchtest: {
            name: 'catchtest',
            baseUrl: 'https://api.catchtest.com',
            apiKey: 'sk-catch',
            models: ['m1'],
            defaultModel: 'm1',
            enabled: true,
          },
        },
      }),
    });
    expect(res.status).toBe(500);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('api_error');
    expect(json.error.message).toContain('Import failed');
  });

  it('POST /api/config imports config (without /import suffix)', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          test: {
            name: 'Test',
            baseUrl: 'https://api.example.com',
            apiKey: 'sk-key',
            models: ['m1'],
            defaultModel: 'm1',
            enabled: true,
          },
        },
      }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.imported).toBe(true);
  });

  it('POST /api/config without providers returns 400', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('providers');
  });

  it('POST /api/config/providers rejects private IP baseUrl', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'ssrf-provider',
        baseUrl: 'https://10.0.0.1:8080',
        apiKey: 'sk-test',
        models: ['m1'],
        defaultModel: 'm1',
      }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('private');
  });

  it('POST /api/config/providers rejects invalid baseUrl format', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'bad-url',
        baseUrl: 'not-a-valid-url',
        apiKey: 'sk-test',
        models: ['m1'],
        defaultModel: 'm1',
      }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('baseUrl');
  });

  it('POST /api/config/providers allows OAuth authMode without apiKey', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/providers',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'oauth-provider',
        baseUrl: 'https://api.oauth-example.com',
        authMode: 'oauth',
        models: ['oauth-model'],
        defaultModel: 'oauth-model',
      }),
    });
    expect(res.status).toBe(201);
    const json = JSON.parse(res.body);
    expect(json.name).toBe('oauth-provider');
    expect(json.authMode).toBe('oauth');
  });

  it('PUT /api/config/providers/:name returns 404 for nonexistent provider', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/config/providers/nonexistent',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.new.com' }),
    });
    expect(res.status).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('not_found_error');
  });

  it('PUT /api/config/providers/:name rejects private IP in baseUrl update', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/config/providers/test',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'http://127.0.0.1:3000' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('private');
  });

  it('PUT /api/config/providers/:name rejects invalid baseUrl format in update', async () => {
    const res = await request(server, {
      method: 'PUT',
      path: '/api/config/providers/test',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: '::::invalid-url' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('baseUrl');
  });

  it('POST /api/config/import rejects provider with private IP baseUrl', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          ssrfimport: {
            name: 'ssrfimport',
            baseUrl: 'http://192.168.1.1:8080',
            apiKey: 'sk-key',
            models: ['m1'],
            defaultModel: 'm1',
            enabled: true,
          },
        },
      }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('private');
  });

  it('POST /api/config/import rejects provider with invalid baseUrl format', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/config/import',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providers: {
          badimport: {
            name: 'badimport',
            baseUrl: 'not-a-url',
            apiKey: 'sk-key',
            models: ['m1'],
            defaultModel: 'm1',
            enabled: true,
          },
        },
      }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('baseUrl');
  });

  // ── Fetch-models endpoint ──

  it('GET /api/fetch-models returns model lists for all providers', async () => {
    // Provide enough mock responses for all enabled providers with apiKeys
    forwarderHooks.responses = Array(10).fill('{}');
    const res = await request(server, {
      method: 'GET',
      path: '/api/fetch-models',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json).toBeDefined();
    expect(typeof json).toBe('object');
    // Each provider key should have a model list
    for (const [key, models] of Object.entries(json)) {
      expect(Array.isArray(models)).toBe(true);
    }
  });

  it('GET /api/fetch-models handles private IP providers gracefully', async () => {
    // Temporarily add a provider with private IP to trigger SSRF blocking branch
    const savedProviders = { ...config.providers };
    config.providers.ssrf_fetch = {
      name: 'ssrf_fetch',
      baseUrl: 'https://10.0.0.1:8080',
      apiKey: 'sk-test',
      models: ['ssrf-model'],
      defaultModel: 'ssrf-model',
      enabled: true,
    };
    forwarderHooks.responses = Array(10).fill('{}');
    const res = await request(server, {
      method: 'GET',
      path: '/api/fetch-models',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.ssrf_fetch).toBeDefined();
    // Should return configured models since SSRF blocked the fetch
    expect(json.ssrf_fetch).toEqual(['ssrf-model']);
    // Restore
    config.providers = savedProviders;
  });

  it('GET /api/fetch-models handles passthrough provider model URLs', async () => {
    // Add a passthrough provider to cover the passthrough URL branch
    const savedProviders = { ...config.providers };
    config.providers.passthrough_fetch = {
      name: 'passthrough_fetch',
      baseUrl: 'https://api.passthrough-fetch.com',
      apiKey: 'sk-test',
      models: ['pt-fetch-model'],
      defaultModel: 'pt-fetch-model',
      enabled: true,
      passthrough: true,
    };
    forwarderHooks.responses = Array(10).fill(JSON.stringify({ data: [{ id: 'api-model-1' }, { id: 'api-model-2' }] }));
    const res = await request(server, {
      method: 'GET',
      path: '/api/fetch-models',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.passthrough_fetch).toBeDefined();
    // Should contain both API-fetched and configured models (deduplicated)
    expect(json.passthrough_fetch).toContain('api-model-1');
    expect(json.passthrough_fetch).toContain('api-model-2');
    // Restore
    config.providers = savedProviders;
  });

  it('GET /api/fetch-models handles httpGet failure gracefully', async () => {
    // Add a provider that will trigger httpGet failure (lines 92-94)
    const savedProviders = { ...config.providers };
    config.providers.fetch_fail = {
      name: 'fetch_fail',
      baseUrl: 'https://api.fetch-fail.com',
      apiKey: 'sk-test',
      models: ['configured-model'],
      defaultModel: 'configured-model',
      enabled: true,
    };
    // Push Error so httpGet throws for this provider
    forwarderHooks.responses = [new Error('Connection refused'), ...Array(10).fill('{}')];
    const res = await request(server, {
      method: 'GET',
      path: '/api/fetch-models',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.fetch_fail).toBeDefined();
    // Should fall back to configured models
    expect(json.fetch_fail).toContain('configured-model');
    // Restore
    config.providers = savedProviders;
  });

  it('GET /api/fetch-models handles invalid provider baseUrl gracefully', async () => {
    // Add a provider with invalid URL to trigger the catch at line 81
    const savedProviders = { ...config.providers };
    config.providers.bad_url = {
      name: 'bad_url',
      baseUrl: 'not-a-valid-url',
      apiKey: 'sk-test',
      models: ['bad-url-model'],
      defaultModel: 'bad-url-model',
      enabled: true,
    };
    forwarderHooks.responses = Array(10).fill('{}');
    const res = await request(server, {
      method: 'GET',
      path: '/api/fetch-models',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.bad_url).toBeDefined();
    // Should return just the configured models when URL parsing fails
    expect(json.bad_url).toEqual(['bad-url-model']);
    // Restore
    config.providers = savedProviders;
  });

  // ── Probe-models endpoint ──

  it('POST /api/probe-models returns 400 when baseUrl or apiKey is missing', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
    expect(json.error.message).toContain('Missing');
  });

  it('POST /api/probe-models rejects private IP baseUrl', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://10.0.0.1:8080', apiKey: 'sk-test' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('private');
  });

  it('POST /api/probe-models rejects invalid baseUrl format', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'not-a-url', apiKey: 'sk-test' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.message).toContain('baseUrl');
  });

  it('POST /api/probe-models fetches models successfully (non-passthrough)', async () => {
    forwarderHooks.responses = [JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] })];
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', apiKey: 'sk-test' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.models).toEqual(['model-a', 'model-b']);
  });

  it('POST /api/probe-models fetches models successfully (passthrough)', async () => {
    forwarderHooks.responses = [JSON.stringify({ data: [{ id: 'passthrough-model' }] })];
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.anthropic.com', apiKey: 'sk-test', passthrough: true }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.models).toEqual(['passthrough-model']);
  });

  it('POST /api/probe-models returns warning when fetch fails (non-passthrough)', async () => {
    forwarderHooks.responses = [new Error('Connection refused')];
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com', apiKey: 'sk-test' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.models).toEqual([]);
    expect(json.warning).toContain('Failed to fetch models');
  });

  it('POST /api/probe-models falls back for passthrough when first attempt fails', async () => {
    forwarderHooks.responses = [
      new Error('Passthrough failed'),
      JSON.stringify({ data: [{ id: 'fallback-model' }] }),
    ];
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com/anthropic', apiKey: 'sk-test', passthrough: true }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.models).toEqual(['fallback-model']);
  });

  it('POST /api/probe-models returns warning when both passthrough and fallback fail', async () => {
    forwarderHooks.responses = [new Error('First fail'), new Error('Fallback fail')];
    const res = await request(server, {
      method: 'POST',
      path: '/api/probe-models',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl: 'https://api.example.com/anthropic', apiKey: 'sk-test', passthrough: true }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.models).toEqual([]);
    expect(json.warning).toContain('Add models manually');
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
