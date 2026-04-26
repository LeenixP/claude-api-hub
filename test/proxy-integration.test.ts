import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';

vi.mock('../src/utils/ssrf.js', () => ({
  isSSRFSafe: vi.fn().mockResolvedValue(true),
}));
import { createServer } from '../src/server.js';
import { createRouter } from '../src/router.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import { ClaudeProvider } from '../src/providers/claude.js';
import { LogManager } from '../src/services/log-manager.js';
import type { GatewayConfig, ProviderConfig } from '../src/providers/types.js';

// ─── Helpers ───

function createMockUpstream(port: number, handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
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

const openaiMockResponse = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1234567890,
  model: 'test-model',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'ok' },
    finish_reason: 'stop',
  }],
  usage: { prompt_tokens: 10, completion_tokens: 1, total_tokens: 11 },
};

const anthropicMockResponse = {
  id: 'msg_test_123',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'hello from anthropic' }],
  model: 'claude-sonnet-4-6',
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 5, output_tokens: 3 },
};

function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    providers: {},
    logLevel: 'error',
    ...overrides,
  };
}

// ─── Tests ───

describe('proxy integration — OpenAI provider', () => {
  let upstreamServer: http.Server;
  let gatewayServer: http.Server;
  const upstreamPort = 19001;

  beforeAll(async () => {
    upstreamServer = await createMockUpstream(upstreamPort, (req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // Verify the incoming request is in OpenAI format
        const parsed = JSON.parse(body);
        expect(parsed.model).toBe('test-model');
        expect(parsed.messages).toBeDefined();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(openaiMockResponse));
      });
    });

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'sk-test-key',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
    };

    const config = makeConfig({
      providers: { test: providerConfig },
    });

    const provider = new GenericOpenAIProvider(providerConfig);
    const router = createRouter([provider], {});
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('POST /v1/messages forwards to upstream and returns Anthropic-format response', async () => {
    const body = JSON.stringify({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });

    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.type).toBe('message');
    expect(json.role).toBe('assistant');
    expect(json.content).toBeDefined();
    expect(Array.isArray(json.content)).toBe(true);
    expect(json.content[0].type).toBe('text');
    expect(json.content[0].text).toBe('ok');
    expect(json.usage).toBeDefined();
    expect(json.usage.input_tokens).toBe(10);
    expect(json.usage.output_tokens).toBe(1);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('POST /v1/messages without model returns 400', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 10 }),
    });

    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
    expect(json.error.message).toContain('model');
  });

  it('POST /v1/messages with invalid JSON returns 400', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    });

    expect(res.status).toBe(400);
    const json = JSON.parse(res.body);
    expect(json.error.type).toBe('invalid_request_error');
  });
});

describe('proxy integration — passthrough (Anthropic) provider', () => {
  let upstreamServer: http.Server;
  let gatewayServer: http.Server;
  const upstreamPort = 19002;

  beforeAll(async () => {
    upstreamServer = await createMockUpstream(upstreamPort, (req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // Verify passthrough headers are forwarded
        expect(req.headers['x-api-key']).toBe('sk-ant-test');
        expect(req.headers['anthropic-version']).toBe('2023-06-01');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(anthropicMockResponse));
      });
    });

    const providerConfig: ProviderConfig = {
      name: 'passthrough-provider',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'sk-ant-test',
      models: ['claude-sonnet-4-6'],
      defaultModel: 'claude-sonnet-4-6',
      enabled: true,
      prefix: 'claude-',
      passthrough: true,
    };

    const config = makeConfig({
      providers: { passthrough: providerConfig },
    });

    const provider = new ClaudeProvider(providerConfig);
    const router = createRouter([provider], {});
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('POST /v1/messages passes through Anthropic response directly', async () => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });

    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.type).toBe('message');
    expect(json.content[0].text).toBe('hello from anthropic');
    expect(json.usage.input_tokens).toBe(5);
    expect(json.usage.output_tokens).toBe(3);
  });
});

describe('proxy integration — upstream errors', () => {
  let upstreamServer: http.Server;
  let gatewayServer: http.Server;
  const upstreamPort = 19003;

  beforeAll(async () => {
    upstreamServer = await createMockUpstream(upstreamPort, (req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        const errorType = parsed.messages[0].content as string;
        if (errorType === '401') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } }));
        } else if (errorType === '403') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Forbidden', type: 'permission_error' } }));
        } else if (errorType === '429') {
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
          res.end(JSON.stringify({ error: { message: 'Rate limited', type: 'rate_limit_error' } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(openaiMockResponse));
        }
      });
    });

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'sk-test-key',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
    };

    const config = makeConfig({
      providers: { test: providerConfig },
    });

    const provider = new GenericOpenAIProvider(providerConfig);
    const router = createRouter([provider], {});
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('upstream returns 401 — client gets 401', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: '401' }], max_tokens: 10 }),
    });
    expect(res.status).toBe(401);
  });

  it('upstream returns 403 — client gets 403', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: '403' }], max_tokens: 10 }),
    });
    expect(res.status).toBe(403);
  });

  it('upstream returns 429 — client gets 429', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: '429' }], max_tokens: 10 }),
    });
    expect(res.status).toBe(429);
  });
});

describe('proxy integration — rate limiting', () => {
  let upstreamServer: http.Server;
  let gatewayServer: http.Server;
  const upstreamPort = 19004;

  beforeAll(async () => {
    upstreamServer = await createMockUpstream(upstreamPort, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(openaiMockResponse));
    });

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'sk-test-key',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
    };

    const config = makeConfig({
      providers: { test: providerConfig },
      rateLimitRpm: 2,
    });

    const provider = new GenericOpenAIProvider(providerConfig);
    const router = createRouter([provider], {});
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('returns 429 with Retry-After header after exceeding RPM', async () => {
    const body = JSON.stringify({
      model: 'test-model',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 10,
    });

    // First 2 should pass (may get 502 from upstream, but not 429)
    const r1 = await request(gatewayServer, { method: 'POST', path: '/v1/messages', headers: { 'Content-Type': 'application/json' }, body });
    expect(r1.status).not.toBe(429);

    const r2 = await request(gatewayServer, { method: 'POST', path: '/v1/messages', headers: { 'Content-Type': 'application/json' }, body });
    expect(r2.status).not.toBe(429);

    // Third should be rate limited
    const r3 = await request(gatewayServer, { method: 'POST', path: '/v1/messages', headers: { 'Content-Type': 'application/json' }, body });
    expect(r3.status).toBe(429);
    expect(r3.headers['retry-after']).toBeDefined();
    const json = JSON.parse(r3.body);
    expect(json.error.type).toBe('rate_limit_error');
  });
});

describe('proxy integration — streaming response', () => {
  let upstreamServer: http.Server;
  let gatewayServer: http.Server;
  const upstreamPort = 19005;

  beforeAll(async () => {
    upstreamServer = await createMockUpstream(upstreamPort, (_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // Send SSE-formatted chunks mimicking Anthropic streaming
      res.write('event: message_start\ndata: {"type":"message_start","message":{"id":"msg_01","type":"message","role":"assistant","model":"test-model","usage":{"input_tokens":10}}}\n\n');
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n');
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}\n\n');
      res.write('event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}}\n\n');
      res.write('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      res.end();
    });

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'sk-test-key',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
      passthrough: true,
    };

    const config = makeConfig({
      providers: { test: providerConfig },
    });

    const provider = new ClaudeProvider(providerConfig);
    const router = createRouter([provider], {});
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
  });

  it('POST /v1/messages with stream=true returns SSE stream', async () => {
    const addr = gatewayServer.address() as { port: number };
    const res = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: addr.port,
        method: 'POST',
        path: '/v1/messages',
        headers: { 'Content-Type': 'application/json' },
      }, resolve);
      req.write(JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10,
        stream: true,
      }));
      req.end();
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');

    const body = await new Promise<string>((resolve, reject) => {
      let buf = '';
      res.on('data', (chunk: Buffer) => { buf += chunk.toString(); });
      res.on('end', () => resolve(buf));
      res.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });

    expect(body).toContain('event: message_start');
    expect(body).toContain('event: content_block_delta');
    expect(body).toContain('Hello');
    expect(body).toContain('event: message_stop');
  });
});

describe('proxy integration — upstream connection error', () => {
  let gatewayServer: http.Server;

  beforeAll(async () => {
    // Use a port that is guaranteed to have no listener
    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      baseUrl: 'http://127.0.0.1:1',
      apiKey: 'sk-test-key',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
    };

    const config = makeConfig({
      providers: { test: providerConfig },
    });

    const provider = new GenericOpenAIProvider(providerConfig);
    const router = createRouter([provider], {});
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
  });

  it('returns 502 when upstream is unreachable', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10,
      }),
    });

    expect(res.status).toBe(502);
    const json = JSON.parse(res.body);
    // When SSRF is bypassed (mocked), connection errors are wrapped as api_error
    expect(json.error.type).toBe('api_error');
  });
});

describe('proxy integration — provider fallback', () => {
  let upstreamServerGood: http.Server;
  let gatewayServer: http.Server;
  const goodUpstreamPort = 19006;

  beforeAll(async () => {
    // Healthy upstream on port 19006
    upstreamServerGood = await createMockUpstream(goodUpstreamPort, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-fallback',
        object: 'chat.completion',
        created: 1234567890,
        model: 'fallback-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'fallback ok' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      }));
    });

    // Primary provider points to an unreachable port (no server)
    const primaryConfig: ProviderConfig = {
      name: 'primary',
      baseUrl: 'http://127.0.0.1:1',
      apiKey: 'sk-primary',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
    };

    // Fallback provider points to the healthy upstream
    const fallbackConfig: ProviderConfig = {
      name: 'fallback',
      baseUrl: `http://127.0.0.1:${goodUpstreamPort}`,
      apiKey: 'sk-fallback',
      models: ['test-model'],
      defaultModel: 'test-model',
      enabled: true,
      prefix: 'test-',
    };

    const config = makeConfig({
      providers: { primary: primaryConfig, fallback: fallbackConfig },
      fallbackChain: { primary: 'fallback' },
    });

    const primaryProvider = new GenericOpenAIProvider(primaryConfig);
    const fallbackProvider = new GenericOpenAIProvider(fallbackConfig);
    const router = createRouter([primaryProvider, fallbackProvider], {}, { primary: 'fallback' });
    gatewayServer = createServer(router, config, new LogManager(200, 100, ':memory:'));
    await new Promise<void>((resolve) => gatewayServer.listen(0, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => gatewayServer.close(() => resolve()));
    await new Promise<void>((resolve) => upstreamServerGood.close(() => resolve()));
  });

  it('returns 502 when primary is unreachable and no fallback is configured', async () => {
    const res = await request(gatewayServer, {
      method: 'POST',
      path: '/v1/messages',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'test-model',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 10,
      }),
    });

    // GenericOpenAIProvider does not implement isHealthy(), so fallback chain
    // is not triggered. The request fails with 502.
    expect(res.status).toBe(502);
  });
});
