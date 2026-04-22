import { describe, it, expect } from 'vitest';
import { createRouter } from '../src/router.js';
import type {
  Provider,
  ProviderConfig,
  AnthropicRequest,
  AnthropicResponse,
  AnthropicStreamEvent,
  OpenAIResponse,
  OpenAIStreamChunk,
} from '../src/providers/types.js';

function makeProvider(name: string, prefix: string, enabled = true): Provider {
  const config: ProviderConfig = {
    name,
    baseUrl: 'http://localhost',
    apiKey: 'test-key',
    models: [`${prefix}model`],
    defaultModel: `${prefix}model`,
    enabled,
  };
  return {
    name,
    config,
    matchModel: (model: string) => model.startsWith(prefix),
    resolveModel: (model: string) => model.slice(prefix.length),
    buildRequest: (_req: AnthropicRequest) => ({ url: '', headers: {}, body: '' }),
    parseResponse: (_raw: OpenAIResponse, _model: string): AnthropicResponse => ({
      id: 'x',
      type: 'message',
      role: 'assistant',
      content: [],
      model: _model,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    }),
    parseStreamChunk: (_chunk: OpenAIStreamChunk, _model: string): AnthropicStreamEvent[] => [],
  };
}

describe('ModelRouter', () => {
  it('routes claude-* to claude provider', () => {
    const claude = makeProvider('claude', 'claude-');
    const router = createRouter([claude], 'claude');
    const result = router.route('claude-3-5-sonnet-20241022');
    expect(result.provider.name).toBe('claude');
  });

  it('routes kimi-* to kimi provider', () => {
    const claude = makeProvider('claude', 'claude-');
    const kimi = makeProvider('kimi', 'kimi-');
    const router = createRouter([claude, kimi], 'claude');
    const result = router.route('kimi-latest');
    expect(result.provider.name).toBe('kimi');
  });

  it('routes minimax-* to minimax provider', () => {
    const claude = makeProvider('claude', 'claude-');
    const minimax = makeProvider('minimax', 'minimax-');
    const router = createRouter([claude, minimax], 'claude');
    const result = router.route('minimax-text-01');
    expect(result.provider.name).toBe('minimax');
  });

  it('routes glm-* to glm provider', () => {
    const claude = makeProvider('claude', 'claude-');
    const glm = makeProvider('glm', 'glm-');
    const router = createRouter([claude, glm], 'claude');
    const result = router.route('glm-4-flash');
    expect(result.provider.name).toBe('glm');
  });

  it('routes MiniMax-* (capital M) to minimax provider via prefix map', () => {
    const claude = makeProvider('claude', 'claude-');
    const minimax = makeProvider('minimax', 'MiniMax-');
    const router = createRouter([claude, minimax], 'claude');
    const result = router.route('MiniMax-Text-01');
    expect(result.provider.name).toBe('minimax');
  });

  it('falls back to default provider for unknown model', () => {
    const claude = makeProvider('claude', 'claude-');
    const router = createRouter([claude], 'claude');
    const result = router.route('unknown-model-xyz');
    expect(result.provider.name).toBe('claude');
  });

  it('skips disabled providers and falls back to default', () => {
    const claude = makeProvider('claude', 'claude-');
    const kimi = makeProvider('kimi', 'kimi-', false);
    const router = createRouter([claude, kimi], 'claude');
    const result = router.route('kimi-latest');
    expect(result.provider.name).toBe('claude');
  });

  it('resolves model name via provider resolveModel', () => {
    const kimi = makeProvider('kimi', 'kimi-');
    const claude = makeProvider('claude', 'claude-');
    const router = createRouter([claude, kimi], 'claude');
    const result = router.route('kimi-latest');
    expect(result.resolvedModel).toBe('latest');
  });

  it('resolves alias: opus → target model and routes to correct provider', () => {
    const claude = makeProvider('claude', 'claude-');
    const kimi = makeProvider('kimi', 'kimi-');
    const router = createRouter([claude, kimi], 'claude', { opus: 'kimi-k2.6' });
    const result = router.route('claude-opus-4-7');
    expect(result.provider.name).toBe('kimi');
    expect(result.resolvedModel).toBe('k2.6');
    expect(result.originalModel).toBe('claude-opus-4-7');
  });

  it('resolves alias: sonnet → target model', () => {
    const claude = makeProvider('claude', 'claude-');
    const glm = makeProvider('glm', 'glm-');
    const router = createRouter([claude, glm], 'claude', { sonnet: 'glm-4-flash' });
    const result = router.route('claude-sonnet-4-6');
    expect(result.provider.name).toBe('glm');
    expect(result.resolvedModel).toBe('4-flash');
  });

  it('resolves alias: haiku → target model', () => {
    const claude = makeProvider('claude', 'claude-');
    const minimax = makeProvider('minimax', 'minimax-');
    const router = createRouter([claude, minimax], 'claude', { haiku: 'minimax-M2.7' });
    const result = router.route('claude-haiku-4-5');
    expect(result.provider.name).toBe('minimax');
  });

  it('setAliases updates alias mapping at runtime', () => {
    const claude = makeProvider('claude', 'claude-');
    const kimi = makeProvider('kimi', 'kimi-');
    const router = createRouter([claude, kimi], 'claude', { opus: 'claude-opus-4-6' });
    let result = router.route('claude-opus-4-7');
    expect(result.provider.name).toBe('claude');

    router.setAliases({ opus: 'kimi-k2.6' });
    result = router.route('claude-opus-4-7');
    expect(result.provider.name).toBe('kimi');
  });

  it('clear removes all providers', () => {
    const claude = makeProvider('claude', 'claude-');
    const kimi = makeProvider('kimi', 'kimi-');
    const router = createRouter([claude, kimi], 'claude');
    expect(router.getProviders()).toHaveLength(2);
    router.clear();
    expect(router.getProviders()).toHaveLength(0);
  });

  it('no alias configured s model passes through unchanged', () => {
    const claude = makeProvider('claude', 'claude-');
    const router = createRouter([claude], 'claude');
    const result = router.route('claude-opus-4-7');
    expect(result.resolvedModel).toBe('opus-4-7');
    expect(result.originalModel).toBe('claude-opus-4-7');
  });
});
