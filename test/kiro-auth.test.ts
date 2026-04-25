import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KiroAuth } from '../src/providers/kiro-auth.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('https', () => ({
  request: vi.fn(),
}));

import * as fs from 'fs';
import * as https from 'https';

function mockHttpsResponse(statusCode: number, data: unknown) {
  const mockRes = {
    statusCode,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') handler(Buffer.from(JSON.stringify(data)));
      if (event === 'end') handler();
    }),
  };
  const mockReq = {
    on: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  (https.request as ReturnType<typeof vi.fn>).mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
    cb(mockRes);
    return mockReq;
  });
}

describe('KiroAuth', () => {
  const credsPath = '/tmp/test-kiro/oauth_creds.json';
  let auth: KiroAuth;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KIRO_OAUTH_CREDS_BASE64;
    auth = new KiroAuth('us-east-1', credsPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadCredentials', () => {
    it('loads credentials from file', async () => {
      const creds = {
        accessToken: 'token123',
        refreshToken: 'refresh456',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      await auth.loadCredentials();
      expect(fs.readFileSync).toHaveBeenCalledWith(credsPath, 'utf-8');
    });

    it('loads credentials from env var', async () => {
      const creds = {
        accessToken: 'env-token',
        refreshToken: 'env-refresh',
      };
      process.env.KIRO_OAUTH_CREDS_BASE64 = Buffer.from(JSON.stringify(creds)).toString('base64');

      await auth.loadCredentials();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('throws when file is missing', async () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });
      await expect(auth.loadCredentials()).rejects.toThrow('Failed to load Kiro credentials');
    });

    it('sets default region when missing', async () => {
      const creds = {
        accessToken: 'token123',
        refreshToken: 'refresh456',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();
      // Should not throw and region defaults to us-east-1
    });
  });

  describe('loadCredentialsSync', () => {
    it('loads credentials synchronously from file', () => {
      const creds = {
        accessToken: 'sync-token',
        refreshToken: 'sync-refresh',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      auth.loadCredentialsSync();
      expect(auth.getAccessTokenSync()).toBe('sync-token');
    });

    it('throws when file is missing in sync mode', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });
      expect(() => auth.loadCredentialsSync()).toThrow('Failed to load Kiro credentials');
    });
  });

  describe('getAccessToken', () => {
    it('returns cached token when not expired', async () => {
      const creds = {
        accessToken: 'cached-token',
        refreshToken: 'refresh123',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      const token = await auth.getAccessToken();
      expect(token).toBe('cached-token');
    });

    it('refreshes token when expired', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      mockHttpsResponse(200, {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const token = await auth.getAccessToken();
      expect(token).toBe('new-token');
    });

    it('throws when no refresh token available', async () => {
      const creds = {
        accessToken: 'token',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      await expect(auth.getAccessToken()).rejects.toThrow('No refresh token available');
    });
  });

  describe('isExpired', () => {
    it('detects expired token', async () => {
      const creds = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      mockHttpsResponse(200, {
        accessToken: 'new-token',
        expiresIn: 3600,
      });

      await auth.getAccessToken();
    });

    it('treats missing expiresAt as expired', async () => {
      const creds = {
        accessToken: 'token',
        refreshToken: 'refresh',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      mockHttpsResponse(200, {
        accessToken: 'new-token',
        expiresIn: 3600,
      });

      await auth.getAccessToken();
    });
  });

  describe('refreshToken', () => {
    it('refreshes social auth token', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        authMethod: 'social',
        region: 'us-east-1',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      mockHttpsResponse(200, {
        accessToken: 'refreshed-token',
        refreshToken: 'refreshed-refresh',
        expiresIn: 3600,
      });

      await auth.refreshToken();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('refreshes builder-id token with client credentials', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        authMethod: 'builder-id',
        clientId: 'client123',
        clientSecret: 'secret456',
        region: 'us-east-1',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      mockHttpsResponse(200, {
        accessToken: 'refreshed-token',
        expiresIn: 3600,
      });

      await auth.refreshToken();
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('throws when builder-id refresh missing credentials', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        authMethod: 'builder-id',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      await expect(auth.refreshToken()).rejects.toThrow('clientId and clientSecret');
    });

    it('throws when refresh response missing accessToken', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      mockHttpsResponse(200, {});

      await expect(auth.refreshToken()).rejects.toThrow('missing accessToken');
    });

    it('throws on HTTP error during refresh', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();

      const mockRes = {
        statusCode: 401,
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'data') handler(Buffer.from('Unauthorized'));
          if (event === 'end') handler();
        }),
      };
      const mockReq = {
        on: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };
      (https.request as ReturnType<typeof vi.fn>).mockImplementation((_opts: unknown, cb: (res: unknown) => void) => {
        cb(mockRes);
        return mockReq;
      });

      await expect(auth.refreshToken()).rejects.toThrow('Token refresh failed');
    });
  });

  describe('saveCredentials', () => {
    it('saves credentials to file', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      const creds = {
        accessToken: 'token',
        refreshToken: 'refresh',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await auth.loadCredentials();
      await auth.saveCredentials();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        credsPath,
        expect.stringContaining('accessToken'),
        'utf-8',
      );
    });

    it('creates directory if missing', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify({ accessToken: 'token' }));
      await auth.loadCredentials();
      await auth.saveCredentials();

      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/test-kiro', { recursive: true });
    });
  });

  describe('getCredentialStatus', () => {
    it('returns valid for non-expired credentials', () => {
      const creds = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = KiroAuth.getCredentialStatus(credsPath);
      expect(status.valid).toBe(true);
      expect(status.canRefresh).toBe(true);
    });

    it('returns invalid for expired credentials', () => {
      const creds = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = KiroAuth.getCredentialStatus(credsPath);
      expect(status.valid).toBe(false);
      expect(status.canRefresh).toBe(true);
    });

    it('returns canRefresh false when missing refresh token', () => {
      const creds = {
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = KiroAuth.getCredentialStatus(credsPath);
      expect(status.canRefresh).toBe(false);
    });

    it('returns invalid for missing file', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });

      const status = KiroAuth.getCredentialStatus(credsPath);
      expect(status.valid).toBe(false);
      expect(status.canRefresh).toBe(false);
    });
  });

  describe('refreshCredentials static', () => {
    it('refreshes and returns credentials', async () => {
      const creds = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        authMethod: 'social',
        region: 'us-east-1',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      mockHttpsResponse(200, {
        accessToken: 'new-token',
        expiresIn: 3600,
      });

      const result = await KiroAuth.refreshCredentials(credsPath);
      expect(result.accessToken).toBe('new-token');
    });
  });
});
