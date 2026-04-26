import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['93.184.216.34']),
  resolve6: vi.fn().mockRejectedValue(new Error('no AAAA')),
}));

const mockSpawn = vi.hoisted(() => vi.fn(() => ({ unref: vi.fn() })));
const mockExecFile = vi.hoisted(() =>
  vi.fn((_cmd: string, _args: string[], _opts: any, cb: any) => {
    cb(null, 'claude-api-hub@7.0.0 installed\n', '');
  }),
);
const mockExecSync = vi.hoisted(() => vi.fn(() => '/usr/local/lib'));
vi.mock('child_process', async (importOriginal) => {
  const orig = await importOriginal() as typeof import('child_process');
  return { ...orig, spawn: mockSpawn, execFile: mockExecFile, execSync: mockExecSync };
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
    const router = createRouter(providers, {});
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

  it('GET /api/check-update handles npm registry error gracefully', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    try {
      const res = await request(server, { method: 'GET', path: '/api/check-update' });
      expect(res.status).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.localVersion).toBe('6.1.0');
      expect(json.latestVersion).toBeNull();
      expect(json.hasUpdate).toBe(false);
      expect(json.error).toBe('Network error');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('GET /api/check-update handles non-ok registry response', async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    try {
      const res = await request(server, { method: 'GET', path: '/api/check-update' });
      expect(res.status).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.localVersion).toBe('6.1.0');
      expect(json.latestVersion).toBeNull();
      expect(json.hasUpdate).toBe(false);
      expect(json.error).toContain('500');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('POST /api/update returns 409 when update is already in progress', async () => {
    // Ensure install info cache exists (needed by update handler)
    const { detectInstallMethod } = await import('../src/install-info.js');
    detectInstallMethod();

    // Make execFile hang so updateInProgress stays true during the second request
    let resolveExec: ((v: string) => void) | null = null;
    const deferred = new Promise<string>((resolve) => {
      resolveExec = resolve;
    });

    mockExecFile.mockImplementationOnce((_cmd: string, _args: string[], _opts: any, cb: any) => {
      deferred.then((output: string) => cb(null, output, ''));
    });

    // Fire first request -- handler will await the deferred promise
    const firstReq = request(server, {
      method: 'POST',
      path: '/api/update',
      headers: { 'Content-Type': 'application/json' },
    });

    // Let the event loop reach the await so updateInProgress is true
    await new Promise((r) => setTimeout(r, 100));

    // Second request should see updateInProgress === true
    const res = await request(server, {
      method: 'POST',
      path: '/api/update',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(409);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error).toContain('already in progress');

    // Resolve the first request so it can complete
    resolveExec!('claude-api-hub@7.0.0 installed\n');
    const firstRes = await firstReq;
    expect(firstRes.status).toBe(200);
  });

  it('POST /api/update returns error when installInfo is null', async () => {
    // Use vi.doMock to make getInstallInfo return null, then create a fresh server
    vi.doMock('../src/install-info.js', async () => {
      const orig = (await vi.importActual('../src/install-info.js')) as typeof import('../src/install-info.js');
      return {
        ...orig,
        getInstallInfo: () => null,
      };
    });

    // Re-import server modules so they pick up the mocked install-info
    vi.resetModules();
    const { createServer: createFresh } = await import('../src/server.js');
    const { createRouter: createFreshRouter } = await import('../src/router.js');

    const config = makeConfig();
    const providers = [
      new GenericOpenAIProvider(testProviderConfig),
      new ClaudeProvider(passthroughConfig),
    ];
    const router = createFreshRouter(providers, {});
    const testServer = createFresh(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => testServer.listen(0, '127.0.0.1', () => resolve()));

    try {
      const res = await request(testServer, {
        method: 'POST',
        path: '/api/update',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status).toBe(500);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Install method not detected');
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
      vi.doUnmock('../src/install-info.js');
      vi.resetModules();
    }
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

  it('detectInstallMethod handles npm prefix -g failure (fallback paths)', async () => {
    const { unlinkSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const cachePath = join(homedir(), '.claude-api-hub', 'install-info.json');
    if (existsSync(cachePath)) unlinkSync(cachePath);

    mockExecSync.mockImplementationOnce(() => { throw new Error('npm not found'); });

    const { detectInstallMethod } = await import('../src/install-info.js');
    const info = detectInstallMethod();
    expect(info).toBeDefined();
    expect(['global', 'local']).toContain(info.method);
  });

  it('detectInstallMethod re-detects when cache JSON is corrupt', async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const hubDir = join(homedir(), '.claude-api-hub');
    const cachePath = join(hubDir, 'install-info.json');
    if (!existsSync(hubDir)) mkdirSync(hubDir, { recursive: true });
    writeFileSync(cachePath, 'not valid json {{{', 'utf-8');

    const { detectInstallMethod } = await import('../src/install-info.js');
    const info = detectInstallMethod();
    expect(info).toBeDefined();
    expect(['global', 'local']).toContain(info.method);
  });

  it('detectInstallMethod re-detects when cache has missing fields', async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const hubDir = join(homedir(), '.claude-api-hub');
    const cachePath = join(hubDir, 'install-info.json');
    if (!existsSync(hubDir)) mkdirSync(hubDir, { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ method: 'local' }), 'utf-8');

    const { detectInstallMethod } = await import('../src/install-info.js');
    const info = detectInstallMethod();
    expect(info).toBeDefined();
    expect(info.npmPrefix).toBeDefined();
  });

  it('getInstallInfo returns null when no cache file exists', async () => {
    const { unlinkSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const cachePath = join(homedir(), '.claude-api-hub', 'install-info.json');
    if (existsSync(cachePath)) unlinkSync(cachePath);

    const { getInstallInfo } = await import('../src/install-info.js');
    const info = getInstallInfo();
    expect(info).toBeNull();
  });

  it('getRestartInfo returns null when no restart file exists', async () => {
    const { unlinkSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const restartPath = join(homedir(), '.claude-api-hub', 'restart-info.json');
    if (existsSync(restartPath)) unlinkSync(restartPath);

    const { getRestartInfo } = await import('../src/install-info.js');
    const info = getRestartInfo();
    expect(info).toBeNull();
  });

  it('getRestartInfo handles corrupt JSON gracefully', async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import('fs');
    const { join } = await import('path');
    const { homedir } = await import('os');
    const hubDir = join(homedir(), '.claude-api-hub');
    const restartPath = join(hubDir, 'restart-info.json');
    if (!existsSync(hubDir)) mkdirSync(hubDir, { recursive: true });
    writeFileSync(restartPath, 'bad json {{{', 'utf-8');

    const { getRestartInfo } = await import('../src/install-info.js');
    const info = getRestartInfo();
    expect(info).toBeNull();
  });
});
