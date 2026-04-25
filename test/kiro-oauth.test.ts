import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  getDefaultCredsPath,
  saveCredentials,
  loadCredentials,
  getCredentialStatus,
  refreshSocialToken,
  refreshBuilderIdToken,
  refreshCredentials,
  importAwsCredentials,
  cancelOAuth,
  clearLastOAuthResult,
  getLastOAuthResult,
  cleanup,
} from '../src/providers/kiro-oauth.js';
import type { KiroCredentials } from '../src/providers/kiro-oauth.js';

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:https', () => ({
  default: {
    request: vi.fn(),
  },
  request: vi.fn(),
}));

import fs from 'node:fs';
import https from 'node:https';

function mockHttpsResponse(statusCode: number, data: unknown, delay = 0) {
  const mockRes = {
    statusCode,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (event === 'data') {
        if (delay > 0) {
          setTimeout(() => handler(Buffer.from(JSON.stringify(data))), delay);
        } else {
          handler(Buffer.from(JSON.stringify(data)));
        }
      }
      if (event === 'end') {
        if (delay > 0) {
          setTimeout(() => handler(), delay + 1);
        } else {
          handler();
        }
      }
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
  return { mockReq, mockRes };
}

describe('KiroOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearLastOAuthResult();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDefaultCredsPath', () => {
    it('returns path in home directory', () => {
      const path = getDefaultCredsPath();
      expect(path).toContain('.kiro');
      expect(path).toContain('oauth_creds.json');
    });
  });

  describe('saveCredentials', () => {
    it('saves credentials to default path', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date().toISOString(),
        authMethod: 'social',
      };
      const path = saveCredentials(creds);
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(path).toContain('oauth_creds.json');
    });

    it('creates directory if missing', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date().toISOString(),
        authMethod: 'social',
      };
      saveCredentials(creds, '/custom/path/creds.json');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/path', { recursive: true });
    });
  });

  describe('loadCredentials', () => {
    it('loads credentials from file', () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date().toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const result = loadCredentials('/custom/path.json');
      expect(result).not.toBeNull();
      expect(result?.accessToken).toBe('token');
    });

    it('returns null when file is missing', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });
      const result = loadCredentials();
      expect(result).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue('not-json');
      const result = loadCredentials();
      expect(result).toBeNull();
    });
  });

  describe('getCredentialStatus', () => {
    it('returns valid for non-expired credentials', () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = getCredentialStatus();
      expect(status.valid).toBe(true);
      expect(status.canRefresh).toBe(true);
      expect(status.authMethod).toBe('social');
    });

    it('returns invalid for expired credentials', () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = getCredentialStatus();
      expect(status.valid).toBe(false);
      expect(status.canRefresh).toBe(true);
    });

    it('returns canRefresh false for missing refresh token', () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: '',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = getCredentialStatus();
      expect(status.canRefresh).toBe(false);
    });

    it('returns canRefresh true for builder-id with client credentials', () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        authMethod: 'builder-id',
        clientId: 'client',
        clientSecret: 'secret',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = getCredentialStatus();
      expect(status.canRefresh).toBe(true);
    });

    it('returns canRefresh false for builder-id without client credentials', () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        authMethod: 'builder-id',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));

      const status = getCredentialStatus();
      expect(status.canRefresh).toBe(false);
    });

    it('returns invalid when no credentials exist', () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });
      const status = getCredentialStatus();
      expect(status.valid).toBe(false);
      expect(status.canRefresh).toBe(false);
    });
  });

  describe('refreshSocialToken', () => {
    it('refreshes social token successfully', async () => {
      mockHttpsResponse(200, {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const result = await refreshSocialToken('refresh123', 'us-east-1');
      expect(result.accessToken).toBe('new-token');
      expect(result.authMethod).toBe('social');
      expect(result.region).toBe('us-east-1');
    });

    it('throws on failed refresh', async () => {
      mockHttpsResponse(401, { error: 'invalid_token' });
      await expect(refreshSocialToken('bad-refresh', 'us-east-1')).rejects.toThrow('Social token refresh failed');
    });

    it('throws when response missing accessToken', async () => {
      mockHttpsResponse(200, { expiresIn: 3600 });
      await expect(refreshSocialToken('refresh123', 'us-east-1')).rejects.toThrow('missing accessToken');
    });
  });

  describe('refreshBuilderIdToken', () => {
    it('refreshes builder-id token successfully', async () => {
      mockHttpsResponse(200, {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const result = await refreshBuilderIdToken('refresh123', 'client-id', 'client-secret', 'us-east-1');
      expect(result.accessToken).toBe('new-token');
      expect(result.authMethod).toBe('builder-id');
      expect(result.clientId).toBe('client-id');
      expect(result.clientSecret).toBe('client-secret');
    });

    it('throws on failed refresh', async () => {
      mockHttpsResponse(401, { error: 'invalid_client' });
      await expect(refreshBuilderIdToken('refresh', 'id', 'secret', 'us-east-1')).rejects.toThrow('Builder ID token refresh failed');
    });

    it('throws when response missing accessToken', async () => {
      mockHttpsResponse(200, { expiresIn: 3600 });
      await expect(refreshBuilderIdToken('refresh', 'id', 'secret', 'us-east-1')).rejects.toThrow('missing accessToken');
    });
  });

  describe('refreshCredentials', () => {
    it('refreshes social credentials', async () => {
      const creds: KiroCredentials = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        expiresAt: new Date().toISOString(),
        authMethod: 'social',
        region: 'us-east-1',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      mockHttpsResponse(200, {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const result = await refreshCredentials();
      expect(result.accessToken).toBe('new-token');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('refreshes builder-id credentials', async () => {
      const creds: KiroCredentials = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        expiresAt: new Date().toISOString(),
        authMethod: 'builder-id',
        clientId: 'client',
        clientSecret: 'secret',
        idcRegion: 'us-west-2',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      mockHttpsResponse(200, {
        accessToken: 'new-token',
        expiresIn: 3600,
      });

      const result = await refreshCredentials();
      expect(result.accessToken).toBe('new-token');
    });

    it('throws when no credentials found', async () => {
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(() => { throw new Error('ENOENT'); });
      await expect(refreshCredentials()).rejects.toThrow('No credentials found');
    });

    it('throws when no refresh token available', async () => {
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: '',
        expiresAt: new Date().toISOString(),
        authMethod: 'social',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await expect(refreshCredentials()).rejects.toThrow('No refresh token available');
    });

    it('throws when builder-id missing client credentials', async () => {
      const creds: KiroCredentials = {
        accessToken: 'old-token',
        refreshToken: 'refresh123',
        expiresAt: new Date().toISOString(),
        authMethod: 'builder-id',
      };
      (fs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(JSON.stringify(creds));
      await expect(refreshCredentials()).rejects.toThrow('clientId and clientSecret');
    });
  });

  describe('importAwsCredentials', () => {
    it('imports valid AWS credentials', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      mockHttpsResponse(200, {
        accessToken: 'new-token',
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      });

      const result = await importAwsCredentials({
        clientId: 'client',
        clientSecret: 'secret',
        accessToken: 'token',
        refreshToken: 'refresh',
        region: 'us-east-1',
      });
      expect(result.success).toBe(true);
      expect(result.credsPath).toBeDefined();
    });

    it('returns error for missing fields', async () => {
      const result = await importAwsCredentials({
        clientId: '',
        clientSecret: 'secret',
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('clientId');
    });

    it('saves even when refresh validation fails', async () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      mockHttpsResponse(401, { error: 'invalid' });

      const result = await importAwsCredentials({
        clientId: 'client',
        clientSecret: 'secret',
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('cancelOAuth', () => {
    it('cleans up and sets cancelled result', () => {
      cancelOAuth();
      const result = getLastOAuthResult();
      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toBe('Cancelled by user');
    });

    it('does not overwrite successful result', () => {
      (fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const creds: KiroCredentials = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: new Date().toISOString(),
        authMethod: 'social',
      };
      expect(() => cancelOAuth()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('runs without error when nothing active', async () => {
      await expect(cleanup()).resolves.not.toThrow();
    });
  });
});
