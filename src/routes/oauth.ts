import http from 'http';
import { sendJson, sendError } from '../utils/http.js';
import {
  handleSocialAuth, handleBuilderIDAuth, refreshCredentials,
  importAwsCredentials, getCredentialStatus, getLastOAuthResult, clearLastOAuthResult, cancelOAuth,
} from '../providers/kiro-oauth.js';
import { logger } from '../logger.js';
import type { RouteContext } from './types.js';
import { readJson } from './helpers.js';

export async function handleOAuthRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext,
  pathname: string,
  cors: Record<string, string>,
  origin: string | undefined,
): Promise<boolean> {
  const { config } = ctx;

  if (req.method === 'POST' && pathname === '/api/oauth/kiro/auth-url') {
    const body = await readJson<{ method?: string; region?: string; startUrl?: string }>(req, res, config);
    if (!body) return true;
    const method = body.method || 'google';
    const region = body.region || 'us-east-1';
    const startUrl = body.startUrl || undefined;
    try {
      clearLastOAuthResult();
      let result;
      if (method === 'builder-id') {
        result = await handleBuilderIDAuth({ region, startUrl });
      } else {
        const provider = method === 'github' ? 'Github' as const : 'Google' as const;
        result = await handleSocialAuth(provider, { region });
      }
      sendJson(res, 200, { authUrl: result.authUrl, authInfo: result.authInfo }, config, origin);
    } catch (err) {
      sendError(res, 500, 'api_error', `OAuth failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/oauth/kiro/import') {
    const body = await readJson<{ clientId?: string; clientSecret?: string; accessToken?: string; refreshToken?: string; region?: string; authMethod?: string }>(req, res, config);
    if (!body) return true;
    try {
      const result = await importAwsCredentials({
        clientId: body.clientId || '',
        clientSecret: body.clientSecret || '',
        accessToken: body.accessToken || '',
        refreshToken: body.refreshToken || '',
        region: body.region,
        authMethod: body.authMethod,
      });
      if (result.success) {
        sendJson(res, 200, { success: true, credsPath: result.credsPath }, config, origin);
      } else {
        sendError(res, 400, 'invalid_request_error', result.error || 'Import failed', config, origin);
      }
    } catch (err) {
      sendError(res, 500, 'api_error', `Import failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/oauth/kiro/status') {
    const urlObj = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
    const credsPath = urlObj.searchParams.get('credsPath') || undefined;
    try {
      const status = getCredentialStatus(credsPath);
      sendJson(res, 200, status, config, origin);
    } catch (err) {
      sendError(res, 500, 'api_error', `Status check failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/oauth/kiro/refresh') {
    const body = await readJson<{ credsPath?: string }>(req, res, config);
    if (!body) return true;
    try {
      const refreshed = await refreshCredentials(body.credsPath);
      sendJson(res, 200, { success: true, expiresAt: refreshed.expiresAt }, config, origin);
    } catch (err) {
      sendError(res, 500, 'api_error', `Refresh failed: ${(err as Error).message}`, config, origin);
    }
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/oauth/kiro/result') {
    const result = getLastOAuthResult();
    sendJson(res, 200, result || { success: false, error: 'No pending OAuth result' }, config, origin);
    if (result) clearLastOAuthResult();
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/oauth/kiro/cancel') {
    cancelOAuth();
    sendJson(res, 200, { cancelled: true }, config, origin);
    return true;
  }

  if (req.method === 'GET' && pathname === '/api/oauth/kiro/models') {
    sendJson(res, 200, {
      models: [
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
        'claude-opus-4-6',
        'claude-opus-4-7',
        'claude-opus-4-5',
        'claude-sonnet-4-5',
        'claude-sonnet-4-20250514',
        'claude-3-7-sonnet-20250219',
      ],
    }, config, origin);
    return true;
  }

  return false;
}
