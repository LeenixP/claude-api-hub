import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/providers/factory.js';
import { ClaudeProvider } from '../src/providers/claude.js';
import { GenericOpenAIProvider } from '../src/providers/generic.js';
import type { ProviderConfig } from '../src/providers/types.js';

describe('ProviderFactory', () => {
  const passthroughConfig: ProviderConfig = {
    name: 'test-passthrough',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test',
    models: ['claude-sonnet-4-6'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
    prefix: 'claude-',
    passthrough: true,
  };

  const standardConfig: ProviderConfig = {
    name: 'test-standard',
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    models: ['gpt-4'],
    defaultModel: 'gpt-4',
    enabled: true,
    prefix: 'gpt-',
  };

  const kiroConfig: ProviderConfig = {
    name: 'test-kiro',
    baseUrl: 'https://q.us-east-1.amazonaws.com',
    apiKey: '',
    models: ['claude-sonnet-4-6'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
    prefix: 'claude-',
    providerType: 'kiro',
    options: { kiroRegion: 'us-east-1' },
  };

  const anthropicAuthConfig: ProviderConfig = {
    name: 'test-anthropic-auth',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test',
    models: ['claude-sonnet-4-6'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
    prefix: 'claude-',
    authMode: 'anthropic',
  };

  it('createProvider with passthrough config returns ClaudeProvider', async () => {
    const provider = await createProvider(passthroughConfig);
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });

  it('createProvider with standard config returns GenericOpenAIProvider', async () => {
    const provider = await createProvider(standardConfig);
    expect(provider).toBeInstanceOf(GenericOpenAIProvider);
  });

  it('createProvider with kiro providerType routes to KiroProvider', () => {
    expect(kiroConfig.providerType).toBe('kiro');
  });

  it('createProvider with unknown providerType falls back to GenericOpenAI', async () => {
    const fallbackConfig = { name: 'fallback', baseUrl: 'https://api.example.com', apiKey: 'sk-test', models: ['gpt-4'], defaultModel: 'gpt-4', enabled: true, providerType: 'nonexistent' } as unknown as ProviderConfig;
    const provider = await createProvider(fallbackConfig);
    expect(provider).toBeInstanceOf(GenericOpenAIProvider);
  });

  it('createProvider with authMode anthropic returns ClaudeProvider', async () => {
    const provider = await createProvider(anthropicAuthConfig);
    expect(provider).toBeInstanceOf(ClaudeProvider);
  });
});
