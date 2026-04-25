import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { request, makeConfig, testProviderConfig } from './helpers.js';

describe('metrics endpoint', () => {
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

  it('GET /metrics returns Prometheus format text', async () => {
    const res = await request(server, { method: 'GET', path: '/metrics' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).toContain('# HELP');
    expect(res.body).toContain('# TYPE');
  });

  it('metrics contains process_resident_memory_bytes', async () => {
    const res = await request(server, { method: 'GET', path: '/metrics' });
    expect(res.status).toBe(200);
    expect(res.body).toContain('process_resident_memory_bytes');
  });

  it('metrics contains process_uptime_seconds', async () => {
    const res = await request(server, { method: 'GET', path: '/metrics' });
    expect(res.status).toBe(200);
    expect(res.body).toContain('process_uptime_seconds');
  });

  it('metrics contains provider health metrics', async () => {
    const res = await request(server, { method: 'GET', path: '/metrics' });
    expect(res.status).toBe(200);
    expect(res.body).toContain('api_hub_provider_up');
  });

  it('non-GET method does not match /metrics', async () => {
    const res = await request(server, { method: 'POST', path: '/metrics' });
    // POST to /metrics should not be handled by metrics endpoint
    expect(res.status).toBe(404);
  });
});

describe('metrics endpoint with admin auth', () => {
  let server: http.Server;

  beforeAll(async () => {
    const config = makeConfig({ adminToken: 'metrics-secret' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, 'test', {});
    server = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /metrics without token returns 401 when admin auth is enabled', async () => {
    const res = await request(server, { method: 'GET', path: '/metrics' });
    expect(res.status).toBe(401);
  });

  it('GET /metrics with valid token returns 200', async () => {
    const res = await request(server, {
      method: 'GET',
      path: '/metrics',
      headers: { 'x-admin-token': 'metrics-secret' },
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain('process_resident_memory_bytes');
  });
});
