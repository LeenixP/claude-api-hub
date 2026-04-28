import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TokenRefresher } from '../src/services/token-refresher.js';
import type { ModelRouter } from '../src/router.js';
import type { GatewayConfig, ProviderConfig } from '../src/providers/types.js';

vi.mock('../src/providers/kiro-oauth.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getCredentialStatus: vi.fn(),
    refreshCredentials: vi.fn(),
    getDefaultCredsPath: vi.fn(() => '/default/creds.json'),
  };
});

import { getCredentialStatus, refreshCredentials } from '../src/providers/kiro-oauth.js';

describe('TokenRefresher with OAuth providers', () => {
  let refresher: TokenRefresher;
  const rebuildFn = vi.fn().mockResolvedValue(undefined);

  const oauthProviderConfig: ProviderConfig = {
    name: 'test-oauth',
    baseUrl: 'https://q.us-east-1.amazonaws.com',
    apiKey: '',
    models: ['claude-sonnet-4-6'],
    defaultModel: 'claude-sonnet-4-6',
    enabled: true,
    prefix: 'claude-',
    authMode: 'oauth',
    options: { kiroCredsPath: '/tmp/test-oauth/creds.json' },
  };

  const mockRouter = {} as ModelRouter;

  function makeConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
    return {
      port: 0,
      host: '127.0.0.1',
      providers: { oauth: oauthProviderConfig },
      logLevel: 'error',
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    refresher = new TokenRefresher(mockRouter, makeConfig(), rebuildFn, 1);
  });

  afterEach(() => {
    refresher.stop();
    vi.useRealTimers();
  });

  it('refreshes expired OAuth tokens and calls rebuild', async () => {
    (getCredentialStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      canRefresh: true,
      expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      authMethod: 'social',
    });
    (refreshCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      authMethod: 'social',
    });

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).toHaveBeenCalled();
    expect(rebuildFn).toHaveBeenCalled();
  });

  it('does not rebuild when no tokens need refresh', async () => {
    (getCredentialStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: true,
      canRefresh: true,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      authMethod: 'social',
    });

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).not.toHaveBeenCalled();
    expect(rebuildFn).not.toHaveBeenCalled();
  });

  it('handles refresh failure gracefully', async () => {
    (getCredentialStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      canRefresh: true,
      expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      authMethod: 'social',
    });
    (refreshCredentials as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Refresh failed'));

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).toHaveBeenCalled();
    expect(rebuildFn).not.toHaveBeenCalled();
  });

  it('refreshes token within 10-minute buffer of expiry', async () => {
    (getCredentialStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: true,
      canRefresh: true,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      authMethod: 'social',
    });
    (refreshCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      authMethod: 'social',
    });

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).toHaveBeenCalled();
    expect(rebuildFn).toHaveBeenCalled();
  });

  it('skips disabled providers', async () => {
    const disabledConfig: ProviderConfig = {
      ...oauthProviderConfig,
      enabled: false,
    };
    const config = makeConfig({
      providers: { oauth: disabledConfig },
    });
    refresher = new TokenRefresher(mockRouter, config, rebuildFn, 1);

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getCredentialStatus).not.toHaveBeenCalled();
    expect(rebuildFn).not.toHaveBeenCalled();
  });

  it('skips non-oauth providers', async () => {
    const apiKeyConfig: ProviderConfig = {
      name: 'test-apikey',
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-test',
      models: ['gpt-4'],
      defaultModel: 'gpt-4',
      enabled: true,
      prefix: 'gpt-',
      authMode: 'apikey',
    };
    const config = makeConfig({
      providers: { apikey: apiKeyConfig },
    });
    refresher = new TokenRefresher(mockRouter, config, rebuildFn, 1);

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(getCredentialStatus).not.toHaveBeenCalled();
    expect(rebuildFn).not.toHaveBeenCalled();
  });

  it('handles missing credentials file gracefully', async () => {
    (getCredentialStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      canRefresh: false,
    });

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).not.toHaveBeenCalled();
    expect(rebuildFn).not.toHaveBeenCalled();
  });

  it('handles credentials that cannot refresh', async () => {
    (getCredentialStatus as ReturnType<typeof vi.fn>).mockReturnValue({
      valid: false,
      canRefresh: false,
      expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      authMethod: 'social',
    });

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).not.toHaveBeenCalled();
    expect(rebuildFn).not.toHaveBeenCalled();
  });

  it('refreshes multiple OAuth providers', async () => {
    const provider2: ProviderConfig = {
      ...oauthProviderConfig,
      name: 'test-oauth-2',
      options: { kiroCredsPath: '/tmp/test-oauth/creds2.json' },
    };

    (getCredentialStatus as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce({
        valid: false,
        canRefresh: true,
        expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        authMethod: 'social',
      })
      .mockReturnValueOnce({
        valid: false,
        canRefresh: true,
        expiresAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        authMethod: 'social',
      });
    (refreshCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      authMethod: 'social',
    });

    const config = makeConfig({
      providers: { oauth1: oauthProviderConfig, oauth2: provider2 },
    });
    refresher = new TokenRefresher(mockRouter, config, rebuildFn, 1);

    refresher.start();
    vi.advanceTimersByTime(61 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshCredentials).toHaveBeenCalledTimes(2);
    expect(rebuildFn).toHaveBeenCalled();
  });
});
