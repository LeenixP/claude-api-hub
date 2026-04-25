import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KiroProvider } from '../src/providers/kiro.js';
import type { ProviderConfig, AnthropicRequest } from '../src/providers/types.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import * as fs from 'fs';

function createValidKiroConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    name: 'test-kiro',
    baseUrl: 'https://q.us-east-1.amazonaws.com',
    apiKey: '',
    models: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
    prefix: 'claude-',
    options: { kiroRegion: 'us-east-1' },
    ...overrides,
  };
}

function createValidCredentials() {
  return {
    accessToken: 'kiro-token-123',
    refreshToken: 'kiro-refresh-456',
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    authMethod: 'social' as const,
    region: 'us-east-1',
  };
}

describe('KiroProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('constructs with valid credentials', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const config = createValidKiroConfig();
      const provider = new KiroProvider(config);
      expect(provider.name).toBe('test-kiro');
      expect(provider.config).toBe(config);
    });

    it('throws when credentials are missing', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });
      const config = createValidKiroConfig();
      expect(() => new KiroProvider(config)).toThrow('Kiro initialization failed');
    });
  });

  describe('matchModel', () => {
    it('matches configured models', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      expect(provider.matchModel('claude-sonnet-4-6')).toBe(true);
      expect(provider.matchModel('claude-haiku-4-5')).toBe(true);
    });

    it('matches model prefixes', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      expect(provider.matchModel('claude-sonnet-4-6-20241022')).toBe(true);
    });

    it('does not match unrelated models', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      expect(provider.matchModel('gpt-4')).toBe(false);
      expect(provider.matchModel('llama-3')).toBe(false);
    });

    it('falls back to claude- prefix when no models configured', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig({ models: [] }));
      expect(provider.matchModel('claude-opus-4-7')).toBe(true);
      expect(provider.matchModel('gpt-4')).toBe(false);
    });
  });

  describe('resolveModel', () => {
    it('returns model as-is', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      expect(provider.resolveModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    });
  });

  describe('buildRequest', () => {
    it('returns proper structure with authorization header', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      const req: AnthropicRequest = {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
      };

      const built = provider.buildRequest(req);
      expect(built.url).toBe('https://q.us-east-1.amazonaws.com/generateAssistantResponse');
      expect(built.headers['Authorization']).toContain('Bearer');
      expect(built.headers['Content-Type']).toBe('application/json');
      expect(built.headers['x-amzn-kiro-agent-mode']).toBe('vibe');
      expect(built.body).toBeDefined();

      const body = JSON.parse(built.body);
      expect(body.conversationState).toBeDefined();
    });

    it('includes profileArn when available', () => {
      const creds = { ...createValidCredentials(), profileArn: 'arn:aws:iam::123:profile' };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      const provider = new KiroProvider(createValidKiroConfig());
      const req: AnthropicRequest = {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
      };

      const built = provider.buildRequest(req);
      const body = JSON.parse(built.body);
      expect(body.profileArn).toBe('arn:aws:iam::123:profile');
    });

    it('throws when no valid access token', () => {
      const creds = { ...createValidCredentials(), accessToken: '' };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      const provider = new KiroProvider(createValidKiroConfig());
      const req: AnthropicRequest = {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
      };

      expect(() => provider.buildRequest(req)).toThrow('no valid access token');
    });

    it('includes user-agent headers', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      const req: AnthropicRequest = {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 1024,
      };

      const built = provider.buildRequest(req);
      expect(built.headers['user-agent']).toContain('aws-sdk-js');
      expect(built.headers['x-amz-user-agent']).toContain('KiroIDE');
    });
  });

  describe('createStreamContext', () => {
    it('creates valid stream context', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      const ctx = provider.createStreamContext('claude-sonnet-4-6');
      expect(ctx.initialized).toBe(true);
      expect(ctx.originalModel).toBe('claude-sonnet-4-6');
    });
  });

  describe('parseResponse', () => {
    it('parses Kiro response format', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      const raw = {
        response: {
          content: 'Hello, world!',
          stopReason: 'end_turn',
        },
      };
      const result = provider.parseResponse(raw as any, 'claude-sonnet-4-6');
      expect(result.type).toBe('message');
      expect(result.role).toBe('assistant');
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello, world!' });
    });
  });

  describe('parseStreamChunk', () => {
    it('parses Kiro stream chunk', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(createValidCredentials()));
      const provider = new KiroProvider(createValidKiroConfig());
      const ctx = provider.createStreamContext('claude-sonnet-4-6');
      const chunk = {
        response: {
          content: 'Hello',
          stopReason: null,
        },
      };
      const events = provider.parseStreamChunk(chunk as any, 'claude-sonnet-4-6', ctx);
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('ensureReady', () => {
    it('refreshes token when called', async () => {
      const creds = createValidCredentials();
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      const provider = new KiroProvider(createValidKiroConfig());

      // ensureReady should not throw with valid token
      await expect(provider.ensureReady()).resolves.not.toThrow();
    });
  });
});
