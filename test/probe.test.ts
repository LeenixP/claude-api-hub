import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import http from 'http';
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { LogManager } from '../src/services/log-manager.js';
import { request, makeConfig, testProviderConfig } from './helpers.js';

// Mock forwarder at module level so vi.mock hoisting works correctly
const mockForwardRequest = vi.fn();
vi.mock('../src/services/forwarder.js', () => ({
  forwardRequest: (...args: unknown[]) => mockForwardRequest(...args),
}));

describe('probe endpoint', () => {
  let server: http.Server;

  beforeEach(() => {
    mockForwardRequest.mockReset();
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
    expect(res.status).toBe(404);
  });

  it('probe path not matching regex returns 404', async () => {
    const res = await request(server, {
      method: 'POST',
      path: '/api/something-else',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(404);
  });
});

describe('probe endpoint with coding agent beta header', () => {
  let server: http.Server;

  beforeEach(() => {
    mockForwardRequest.mockReset();
  });

  beforeAll(async () => {
    const config = makeConfig({ codingAgentBetas: 'test-beta-header-123' });
    const providers = [new GenericOpenAIProvider(testProviderConfig)];
    const router = createRouter(providers, {});
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
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.model).toBe('test-model-1');
    expect(json.provider).toBe('test-provider');
  });
});

describe('probe with mocked forward request', () => {
  let server: http.Server;

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

  beforeEach(() => {
    mockForwardRequest.mockReset();
  });

  it('returns success when forwardRequest succeeds with 200 and no error', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.model).toBe('test-model-1');
  });

  it('returns success when forwardRequest returns coding plan error', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 403,
      body: JSON.stringify({ error: { message: 'coding plan not accessible' } }),
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.note).toContain('Coding Plan');
  });

  it('returns success:false when forwardRequest throws', async () => {
    mockForwardRequest.mockRejectedValue(new Error('Connection refused'));

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error).toContain('Connection refused');
  });

  it('returns success:false when upstream returns error response', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 500,
      body: JSON.stringify({ error: { message: 'Internal server error' } }),
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.status).toBe(500);
  });

  it('returns success:false when upstream returns error type without message', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 403,
      body: JSON.stringify({ error: { type: 'permission_error' } }),
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error).toBe('permission_error');
  });

  it('returns success:false when upstream returns string error', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 400,
      body: JSON.stringify({ error: 'simple error string' }),
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(false);
    expect(json.error).toBe('simple error string');
  });

  it('returns success when upstream returns non-JSON (event stream)', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 200,
      body: 'data: {"type":"message_start"}\n\ndata: {"type":"content_block_delta"}\n',
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
  });

  it('returns success when coding agent header matches', async () => {
    mockForwardRequest.mockResolvedValue({
      status: 403,
      body: JSON.stringify({ error: 'Coding Agent authentication required' }),
      headers: {},
    });

    const res = await request(server, {
      method: 'POST',
      path: '/api/test-provider/test',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
    expect(json.note).toContain('Coding');
  });
});
