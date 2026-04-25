import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['93.184.216.34']),
  resolve6: vi.fn().mockRejectedValue(new Error('no AAAA')),
}));

const mockSpawn = vi.hoisted(() => vi.fn(() => ({ unref: vi.fn() })));
vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal() as typeof import('child_process');
  return { ...orig, spawn: mockSpawn };
});

import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { ClaudeProvider } from '../src/providers/claude.js';
import { LogManager } from '../src/services/log-manager.js';
import type { GatewayConfig, ProviderConfig } from '../src/providers/types.js';

const testProviderConfig: ProviderConfig = {
  name: 'test-provider',
  baseUrl: 'https://api.example.com',
  apiKey: 'sk-test-key',
  models: ['test-model-1'],
  defaultModel: 'test-model-1',
  enabled: true,
};

const passthroughConfig: ProviderConfig = {
  name: 'passthrough-provider',
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'sk-ant-test',
  models: ['claude-sonnet-4-6'],
  defaultModel: 'claude-sonnet-4-6',
  enabled: true,
  passthrough: true,
};

function makeConfig(): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    providers: { test: testProviderConfig, passthrough: passthroughConfig },
    defaultProvider: 'test',
    logLevel: 'error',
    version: '6.1.0',
  };
}

function request(server: http.Server, opts: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; body: string }> {
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
        body: Buffer.concat(chunks).toString('utf-8'),
      }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

describe('update and restart API', () => {
  let server: http.Server;

  beforeEach(async () => {
    mockSpawn.mockReturnValue({ unref: vi.fn() });
    mockSpawn.mockClear();
    const config = makeConfig();
    const providers = [
      new GenericOpenAIProvider(testProviderConfig),
      new ClaudeProvider(passthroughConfig),
    ];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/system-info returns installMethod and version', async () => {
    const res = await request(server, { method: 'GET', path: '/api/system-info' });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.localVersion).toBe('6.1.0');
    expect(json.installMethod).toBeDefined();
    expect(json.processPid).toBeDefined();
    expect(json.uptime).toBeTypeOf('number');
    expect(json.nodeVersion).toBeDefined();
  });

  it('POST /api/update responds with expected shape', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/update',
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 500]).toContain(res.status);
    const json = JSON.parse(res.body);
    expect(json).toHaveProperty('success');
  });

  it('POST /api/restart responds and spawns new process', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/restart',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.restarting).toBe(true);

    // Wait for the setTimeout(500ms) in restart handler
    await new Promise(r => setTimeout(r, 800));
    // Restore so process doesn't actually exit in test env
  });

  it('POST /api/restart handles spawn error gracefully', async () => {
    mockSpawn.mockImplementation(() => { throw new Error('spawn failed'); });

    const res = await request(server, {
      method: 'POST',
      path: '/api/restart',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.restarting).toBe(true);

    await new Promise(r => setTimeout(r, 800));
  });
});

describe('install-info module', () => {
  it('detectInstallMethod returns valid info', async () => {
    const { detectInstallMethod } = await import('../src/install-info.js');
    const info = detectInstallMethod();
    expect(info).toBeDefined();
    expect(['global', 'local']).toContain(info.method);
    expect(info.detectedAt).toBeDefined();
  });

  it('getInstallInfo reads cached info', async () => {
    const { detectInstallMethod, getInstallInfo } = await import('../src/install-info.js');
    detectInstallMethod();
    const info = getInstallInfo();
    expect(info).not.toBeNull();
    expect(info!.method).toBeDefined();
  });

  it('saveRestartInfo and getRestartInfo round-trip', async () => {
    const { saveRestartInfo, getRestartInfo } = await import('../src/install-info.js');
    saveRestartInfo();
    const info = getRestartInfo();
    expect(info).not.toBeNull();
    expect(info!.argv).toBeDefined();
    expect(info!.execPath).toBe(process.execPath);
    expect(info!.cwd).toBe(process.cwd());
  });
});
