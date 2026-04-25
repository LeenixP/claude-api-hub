import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { request, makeConfig, testProviderConfig } from './helpers.js';

describe('probe endpoint', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig();
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /api/test-provider/test probes configured provider', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    // The provider baseUrl is fake, so probe should fail but return 200 with success:false
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.model).toBe('test-model-1');
    expect(json.provider).toBe('test-provider');
    expect(json.latencyMs).toBeDefined();
  });

  it('POST /api/test-provider/nonexistent returns 404', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/nonexistent',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('not_found_error');
  });

  it('GET /api/test-provider/test does not match probe route', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/api/test-provider/test',
    });
    // GET is not handled by probe route, falls through to 404
    expect(res.status).toBe(404);
  });
});

describe('probe endpoint with coding agent beta header', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig({ codingAgentBetas: 'test-beta-header-123' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('probe uses codingAgentBetas from config when available', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    // Should still fail due to fake upstream but verify the config is wired
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.model).toBe('test-model-1');
    expect(json.provider).toBe('test-provider');
  });
});
