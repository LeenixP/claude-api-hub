import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('../src/utils/ssrf.js', () => ({
  isSSRFSafe: vi.fn().mockResolvedValue(true),
}));
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { request, makeConfig, testProviderConfig } from './helpers.js';

// Clean up any existing creds file before tests
const defaultCredsPath = path.join(os.homedir(), '.kiro', 'oauth_creds.json');

describe('oauth routes', () => {
  let server: http.Server;

  beforeAll(async () => {
    // Clean up any leftover creds
    try { fs.unlinkSync(defaultCredsPath); } catch { /* ignore */ }

    const config = makeConfig();
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    // Clean up creds file
    try { fs.unlinkSync(defaultCredsPath); } catch { /* ignore */ }
  });

  it('POST /api/oauth/kiro/auth-url with builder-id method returns auth URL', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/oauth/kiro/auth-url',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'builder-id', region: 'us-east-1' }),
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.authUrl).toBeDefined();
    expect(json.authInfo).toBeDefined();
    expect(json.authInfo.method).toBe('builder-id');
  });

  it('GET /api/oauth/kiro/models returns model list', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/api/oauth/kiro/models',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(Array.isArray(json.models)).toBe(true);
    expect(json.models.length).toBeGreaterThan(0);
    expect(json.models).toContain('claude-sonnet-4-6');
  });

  it('POST /api/oauth/kiro/import with missing fields returns error', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/oauth/kiro/import',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'test' }),
    });
    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error).toBeDefined();
  });

  it('POST /api/oauth/kiro/import with all fields succeeds', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/oauth/kiro/import',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        region: 'us-east-1',
      }),
    });
    // Import succeeds even if refresh fails (credentials are saved)
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.credsPath).toBeDefined();
  });

  it('GET /api/oauth/kiro/status returns credential status after import', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/api/oauth/kiro/status',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    // After import, credentials exist and are valid (expires in 1 hour)
    expect(json.valid).toBe(true);
    expect(json.canRefresh).toBe(true);
    expect(json.authMethod).toBe('builder-id');
  });

  it('POST /api/oauth/kiro/cancel returns cancelled', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/oauth/kiro/cancel',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.cancelled).toBe(true);
  });

  it('GET /api/oauth/kiro/result returns no pending result initially', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/api/oauth/kiro/result',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
  });
});
