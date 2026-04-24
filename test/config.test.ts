import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getConfigPath } from '../src/config.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP = join(tmpdir(), 'api-hub-test-config-' + Date.now());

function writeTestConfig(config: Record<string, unknown>, filename = 'providers.json'): string {
  const filepath = join(TMP, filename);
  writeFileSync(filepath, JSON.stringify(config), 'utf-8');
  return filepath;
}

const validConfig = {
  port: 9800,
  host: '127.0.0.1',
  logLevel: 'info',
  defaultProvider: 'test',
  providers: {
    test: {
      name: 'Test',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      models: ['model-1'],
      defaultModel: 'model-1',
      enabled: true,
    },
  },
};

describe('config', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  it('loads valid config from explicit path', () => {
    const path = writeTestConfig(validConfig);
    const config = loadConfig(path);
    expect(config.port).toBe(9800);
    expect(config.host).toBe('127.0.0.1');
    expect(config.providers.test.name).toBe('Test');
  });

  it('interpolates environment variables', () => {
    process.env.ANTHROPIC_TEST_KEY = 'secret-key-123';
    const cfg = { ...validConfig, providers: { test: { ...validConfig.providers.test, apiKey: '${ANTHROPIC_TEST_KEY}' } } };
    const path = writeTestConfig(cfg);
    const config = loadConfig(path);
    expect(config.providers.test.apiKey).toBe('secret-key-123');
    delete process.env.ANTHROPIC_TEST_KEY;
  });

  it('replaces missing env vars with empty string', () => {
    delete process.env.ANTHROPIC_NONEXISTENT_VAR;
    const cfg = { ...validConfig, providers: { test: { ...validConfig.providers.test, apiKey: '${ANTHROPIC_NONEXISTENT_VAR}' } } };
    const path = writeTestConfig(cfg);
    const config = loadConfig(path);
    expect(config.providers.test.apiKey).toBe('');
  });

  it('blocks non-whitelisted env var interpolation', () => {
    process.env.__BLOCKED_VAR = 'should-not-appear';
    const cfg = { ...validConfig, providers: { test: { ...validConfig.providers.test, apiKey: '${__BLOCKED_VAR}' } } };
    const path = writeTestConfig(cfg);
    const config = loadConfig(path);
    expect(config.providers.test.apiKey).toBe('');
    delete process.env.__BLOCKED_VAR;
  });

  it('throws on missing config file', () => {
    expect(() => loadConfig('/nonexistent/path/config.json')).toThrow('Config not found');
  });

  it('throws on invalid JSON', () => {
    const path = join(TMP, 'bad.json');
    writeFileSync(path, '{invalid json}', 'utf-8');
    expect(() => loadConfig(path)).toThrow();
  });

  it('throws on missing port', () => {
    const cfg = { ...validConfig, port: undefined };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('port');
  });

  it('throws on port out of range', () => {
    const cfg = { ...validConfig, port: 99999 };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('port');
  });

  it('throws on missing host', () => {
    const cfg = { ...validConfig, host: '' };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('host');
  });

  it('throws on missing defaultProvider', () => {
    const cfg = { ...validConfig, defaultProvider: '' };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('defaultProvider');
  });

  it('throws when defaultProvider not in providers', () => {
    const cfg = { ...validConfig, defaultProvider: 'nonexistent' };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('not found in providers');
  });

  it('throws on provider with invalid baseUrl', () => {
    const cfg = { ...validConfig, providers: { test: { ...validConfig.providers.test, baseUrl: 'not-a-url' } } };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('invalid "baseUrl"');
  });

  it('throws on provider with empty models', () => {
    const cfg = { ...validConfig, providers: { test: { ...validConfig.providers.test, models: [] } } };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('missing "models"');
  });

  it('throws on invalid logLevel', () => {
    const cfg = { ...validConfig, logLevel: 'verbose' };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('logLevel');
  });

  it('getConfigPath returns path after load', () => {
    const path = writeTestConfig(validConfig);
    loadConfig(path);
    expect(getConfigPath()).toBe(path);
  });

  it('throws when no providers are enabled', () => {
    const cfg = {
      ...validConfig,
      providers: {
        test: { ...validConfig.providers.test, enabled: false },
      },
    };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('at least one provider must be enabled');
  });

  it('throws on negative rateLimitRpm', () => {
    const cfg = { ...validConfig, rateLimitRpm: -1 };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('rateLimitRpm');
  });

  it('throws on streamTimeoutMs below minimum', () => {
    const cfg = { ...validConfig, streamTimeoutMs: 500 };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('streamTimeoutMs');
  });

  it('throws on invalid CORS origin', () => {
    const cfg = { ...validConfig, corsOrigins: ['not a valid url'] };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('CORS origin');
  });

  it('accepts wildcard CORS origin', () => {
    const cfg = { ...validConfig, corsOrigins: ['*'] };
    const path = writeTestConfig(cfg);
    const config = loadConfig(path);
    expect(config.corsOrigins).toEqual(['*']);
  });

  it('throws on invalid tier timeout', () => {
    const cfg = { ...validConfig, tierTimeouts: { haiku: { timeoutMs: 'not-a-number' as unknown as number } } };
    const path = writeTestConfig(cfg);
    expect(() => loadConfig(path)).toThrow('timeoutMs');
  });
});
