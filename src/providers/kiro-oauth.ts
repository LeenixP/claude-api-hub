import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { URL } from 'node:url';
import { logger } from '../logger.js';

// ── Config ──

const KIRO_OAUTH_CONFIG = {
  authServiceEndpoint: 'https://prod.us-east-1.auth.desktop.kiro.dev',
  ssoOIDCEndpoint: 'https://oidc.{{region}}.amazonaws.com',
  builderIDStartURL: 'https://view.awsapps.com/start',
  callbackPortStart: 19876,
  callbackPortEnd: 19880,
  authTimeout: 10 * 60 * 1000,
  scopes: [
    'codewhisperer:completions',
    'codewhisperer:analysis',
    'codewhisperer:conversations',
  ],
  defaultCredsDir: '.kiro',
  defaultCredsFile: 'oauth_creds.json',
};

// ── Types ──

export interface KiroOAuthResult {
  authUrl: string;
  authInfo: KiroAuthInfo;
}

export interface KiroAuthInfo {
  method: 'social' | 'builder-id';
  socialProvider?: string;
  port?: number;
  deviceCode?: string;
  userCode?: string;
  verificationUriComplete?: string;
  region?: string;
}

export interface KiroCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  authMethod: 'social' | 'builder-id';
  region?: string;
  idcRegion?: string;
  profileArn?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface KiroCredentialStatus {
  valid: boolean;
  expiresAt?: string;
  authMethod?: string;
  canRefresh: boolean;
}

// ── State ──

const activeServers = new Map<string, { server: http.Server; port: number }>();
const activePollingTasks = new Map<string, { shouldStop: boolean }>();

// ── PKCE ──

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64url');
}

// ── HTTP helpers (zero external deps) ──

function httpsPost(url: string, body: Record<string, unknown>, timeout = 30000): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'ClaudeAPIHub/1.0',
      },
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        let parsed: unknown;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0, data: parsed });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.write(payload);
    req.end();
  });
}

function httpsGet(url: string, headers: Record<string, string> = {}, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
      timeout,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => { resolve(data); });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

// ── Response Page ──

function generateResponsePage(isSuccess: boolean, message: string): string {
  const title = isSuccess ? 'Authorization Successful' : 'Authorization Failed';
  const countdown = isSuccess ? `
    <p>This window will close in <span id="cd" style="font-weight:bold;color:#3b82f6">10</span> seconds.</p>
    <script>let c=10;setInterval(()=>{c--;const e=document.getElementById('cd');if(e)e.textContent=c;if(c<=0){clearInterval(this);window.close()}},1000)</script>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5}
.c{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.1);max-width:400px;width:90%}
h1{color:${isSuccess ? '#22c55e' : '#ef4444'};margin-top:0;font-size:1.5rem}p{color:#666;line-height:1.6}</style></head>
<body><div class="c"><h1>${isSuccess ? '&#10003;' : '&#10007;'} ${title}</h1><p>${message}</p>${countdown}</div></body></html>`;
}

// ── Credential Storage ──

export function getDefaultCredsPath(): string {
  return path.join(os.homedir(), KIRO_OAUTH_CONFIG.defaultCredsDir, KIRO_OAUTH_CONFIG.defaultCredsFile);
}

export function saveCredentials(creds: KiroCredentials, credsPath?: string): string {
  const filePath = credsPath || getDefaultCredsPath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(creds, null, 2), 'utf-8');
  return filePath;
}

export function loadCredentials(credsPath?: string): KiroCredentials | null {
  const filePath = credsPath || getDefaultCredsPath();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as KiroCredentials;
  } catch {
    return null;
  }
}

export function getCredentialStatus(credsPath?: string): KiroCredentialStatus {
  const creds = loadCredentials(credsPath);
  if (!creds) return { valid: false, canRefresh: false };
  const expired = creds.expiresAt ? Date.now() > new Date(creds.expiresAt).getTime() - 5 * 60 * 1000 : true;
  const canRefresh = !!creds.refreshToken && (
    creds.authMethod === 'social' || (!!creds.clientId && !!creds.clientSecret)
  );
  return { valid: !expired, expiresAt: creds.expiresAt, authMethod: creds.authMethod, canRefresh };
}

// ── Social Auth (Google/GitHub) ──

export async function handleSocialAuth(
  provider: 'Google' | 'Github',
  options: { region?: string; credsPath?: string } = {},
): Promise<KiroOAuthResult> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(16).toString('base64url');

  // Close any existing server
  await closeCallbackServer('kiro-social');

  const port = await findAvailablePort(
    KIRO_OAUTH_CONFIG.callbackPortStart,
    KIRO_OAUTH_CONFIG.callbackPortEnd,
  );
  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

  const authUrl = `${KIRO_OAUTH_CONFIG.authServiceEndpoint}/login?` +
    `idp=${provider}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256&` +
    `state=${state}&` +
    `prompt=select_account`;

  // Start callback server
  const server = await createCallbackServer(port, codeVerifier, state, redirectUri, options);
  activeServers.set('kiro-social', { server, port });

  logger.info(`[Kiro OAuth] Social auth (${provider}) callback server started on port ${port}`);

  return {
    authUrl,
    authInfo: {
      method: 'social',
      socialProvider: provider,
      port,
      region: options.region || 'us-east-1',
    },
  };
}

function createCallbackServer(
  port: number,
  codeVerifier: string,
  expectedState: string,
  redirectUri: string,
  options: { region?: string; credsPath?: string },
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);

        if (url.pathname === '/oauth/callback') {
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const errorParam = url.searchParams.get('error');

          if (errorParam) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateResponsePage(false, `Authorization failed: ${errorParam}`));
            return;
          }

          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateResponsePage(false, 'State verification failed'));
            return;
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateResponsePage(false, 'Missing authorization code'));
            return;
          }

          // Exchange code for token
          const tokenResult = await httpsPost(
            `${KIRO_OAUTH_CONFIG.authServiceEndpoint}/oauth/token`,
            { code, code_verifier: codeVerifier, redirect_uri: redirectUri },
          );

          if (!tokenResult.ok) {
            const errMsg = typeof tokenResult.data === 'string' ? tokenResult.data : JSON.stringify(tokenResult.data);
            logger.error(`[Kiro OAuth] Token exchange failed: ${errMsg}`);
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(generateResponsePage(false, `Token exchange failed: ${tokenResult.status}`));
            return;
          }

          const tokenData = tokenResult.data as Record<string, unknown>;
          const region = options.region || 'us-east-1';
          const creds: KiroCredentials = {
            accessToken: tokenData.accessToken as string,
            refreshToken: tokenData.refreshToken as string,
            profileArn: tokenData.profileArn as string | undefined,
            expiresAt: new Date(Date.now() + ((tokenData.expiresIn as number) || 3600) * 1000).toISOString(),
            authMethod: 'social',
            region,
          };

          const credsPath = saveCredentials(creds, options.credsPath);
          logger.info(`[Kiro OAuth] Social auth credentials saved: ${credsPath}`);

          // Store for retrieval by status endpoint
          lastOAuthResult = { success: true, credsPath, creds };

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(generateResponsePage(true, 'Authorization successful! You can close this window.'));

          // Close server after response
          setTimeout(() => {
            server.close();
            activeServers.delete('kiro-social');
          }, 1000);
        } else {
          res.writeHead(204);
          res.end();
        }
      } catch (error) {
        logger.error(`[Kiro OAuth] Callback error: ${(error as Error).message}`);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(generateResponsePage(false, `Server error: ${(error as Error).message}`));
      }
    });

    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));

    // Auto-close after timeout
    setTimeout(() => {
      if (server.listening) {
        server.close();
        activeServers.delete('kiro-social');
      }
    }, KIRO_OAUTH_CONFIG.authTimeout);
  });
}

// ── Builder ID (Device Code Flow) ──

export async function handleBuilderIDAuth(
  options: { region?: string; credsPath?: string; startUrl?: string } = {},
): Promise<KiroOAuthResult> {
  // Stop existing polling tasks
  for (const [taskId] of activePollingTasks.entries()) {
    if (taskId.startsWith('kiro-')) stopPollingTask(taskId);
  }

  const region = options.region || 'us-east-1';
  const ssoOIDCEndpoint = KIRO_OAUTH_CONFIG.ssoOIDCEndpoint.replace('{{region}}', region);

  // 1. Register OIDC client
  const regResult = await httpsPost(`${ssoOIDCEndpoint}/client/register`, {
    clientName: 'Kiro IDE',
    clientType: 'public',
    scopes: KIRO_OAUTH_CONFIG.scopes,
  }, 30000);

  if (!regResult.ok) {
    throw new Error(`OIDC client registration failed: ${regResult.status} ${JSON.stringify(regResult.data)}`);
  }

  const regData = regResult.data as Record<string, string>;

  // 2. Start device authorization
  const authResult = await httpsPost(`${ssoOIDCEndpoint}/device_authorization`, {
    clientId: regData.clientId,
    clientSecret: regData.clientSecret,
    startUrl: options.startUrl || KIRO_OAUTH_CONFIG.builderIDStartURL,
  }, 30000);

  if (!authResult.ok) {
    throw new Error(`Device authorization failed: ${authResult.status}`);
  }

  const deviceAuth = authResult.data as Record<string, unknown>;
  const taskId = `kiro-${(deviceAuth.deviceCode as string).substring(0, 8)}-${Date.now()}`;

  // 3. Start background polling
  pollBuilderIDToken(
    regData.clientId,
    regData.clientSecret,
    deviceAuth.deviceCode as string,
    (deviceAuth.interval as number) || 5,
    (deviceAuth.expiresIn as number) || 300,
    taskId,
    { ...options, region },
  ).catch(error => {
    logger.error(`[Kiro OAuth] Builder ID polling failed: ${error.message}`);
    lastOAuthResult = { success: false, error: error.message };
  });

  return {
    authUrl: deviceAuth.verificationUriComplete as string,
    authInfo: {
      method: 'builder-id',
      deviceCode: deviceAuth.deviceCode as string,
      userCode: deviceAuth.userCode as string,
      verificationUriComplete: deviceAuth.verificationUriComplete as string,
      region,
    },
  };
}

async function pollBuilderIDToken(
  clientId: string,
  clientSecret: string,
  deviceCode: string,
  interval: number,
  expiresIn: number,
  taskId: string,
  options: { region?: string; credsPath?: string },
): Promise<void> {
  const maxAttempts = Math.floor(expiresIn / interval);
  let attempts = 0;
  const taskControl = { shouldStop: false };
  activePollingTasks.set(taskId, taskControl);

  const poll = async (): Promise<void> => {
    if (taskControl.shouldStop) throw new Error('Polling cancelled');
    if (attempts >= maxAttempts) { activePollingTasks.delete(taskId); throw new Error('Authorization timed out'); }
    attempts++;

    const region = options.region || 'us-east-1';
    const ssoOIDCEndpoint = KIRO_OAUTH_CONFIG.ssoOIDCEndpoint.replace('{{region}}', region);

    const result = await httpsPost(`${ssoOIDCEndpoint}/token`, {
      clientId, clientSecret, deviceCode,
      grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    }, 30000);

    const data = result.data as Record<string, unknown>;

    if (result.ok && data.accessToken) {
      const creds: KiroCredentials = {
        accessToken: data.accessToken as string,
        refreshToken: data.refreshToken as string,
        expiresAt: new Date(Date.now() + ((data.expiresIn as number) || 3600) * 1000).toISOString(),
        authMethod: 'builder-id',
        clientId, clientSecret,
        idcRegion: region,
      };

      const credsPath = saveCredentials(creds, options.credsPath);
      activePollingTasks.delete(taskId);

      lastOAuthResult = { success: true, credsPath, creds };
      logger.info(`[Kiro OAuth] Builder ID credentials saved: ${credsPath}`);
      return;
    }

    const error = data.error as string;
    if (error === 'authorization_pending') {
      if (attempts % 10 === 1 || attempts === maxAttempts) {
        logger.info(`[Kiro OAuth] Waiting for user authorization... (${attempts}/${maxAttempts})`);
      }
      await new Promise(r => setTimeout(r, interval * 1000));
      return poll();
    }
    if (error === 'slow_down') {
      await new Promise(r => setTimeout(r, (interval + 5) * 1000));
      return poll();
    }

    activePollingTasks.delete(taskId);
    throw new Error(`Authorization failed: ${error || 'unknown error'}`);
  };

  return poll();
}

function stopPollingTask(taskId: string): void {
  const task = activePollingTasks.get(taskId);
  if (task) { task.shouldStop = true; activePollingTasks.delete(taskId); }
}

export function cancelOAuth(): void {
  // Stop all active servers and polling tasks
  for (const [taskId] of activePollingTasks.entries()) {
    stopPollingTask(taskId);
  }
  for (const [key] of activeServers.entries()) {
    closeCallbackServer(key);
  }
  // Don't overwrite a successful result
  if (!lastOAuthResult || !lastOAuthResult.success) {
    lastOAuthResult = { success: false, error: 'Cancelled by user' };
  }
  logger.info('[Kiro OAuth] Authorization cancelled');
}

// ── Token Refresh ──

export async function refreshSocialToken(refreshToken: string, region = 'us-east-1'): Promise<KiroCredentials> {
  const url = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;
  const result = await httpsPost(url, { refreshToken }, 30000);

  if (!result.ok) {
    throw new Error(`Social token refresh failed: ${result.status} ${JSON.stringify(result.data)}`);
  }

  const data = result.data as Record<string, unknown>;
  if (!data.accessToken) throw new Error('Refresh response missing accessToken');

  return {
    accessToken: data.accessToken as string,
    refreshToken: (data.refreshToken as string) || refreshToken,
    profileArn: data.profileArn as string | undefined,
    expiresAt: new Date(Date.now() + ((data.expiresIn as number) || 3600) * 1000).toISOString(),
    authMethod: 'social',
    region,
  };
}

export async function refreshBuilderIdToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  region = 'us-east-1',
): Promise<KiroCredentials> {
  const url = `https://oidc.${region}.amazonaws.com/token`;
  const result = await httpsPost(url, {
    grantType: 'refresh_token',
    refreshToken, clientId, clientSecret,
  }, 30000);

  if (!result.ok) {
    throw new Error(`Builder ID token refresh failed: ${result.status}`);
  }

  const data = result.data as Record<string, unknown>;
  if (!data.accessToken) throw new Error('Refresh response missing accessToken');

  return {
    accessToken: data.accessToken as string,
    refreshToken: (data.refreshToken as string) || refreshToken,
    expiresAt: new Date(Date.now() + ((data.expiresIn as number) || 3600) * 1000).toISOString(),
    authMethod: 'builder-id',
    clientId, clientSecret,
    idcRegion: region,
  };
}

export async function refreshCredentials(credsPath?: string): Promise<KiroCredentials> {
  const creds = loadCredentials(credsPath);
  if (!creds) throw new Error('No credentials found');
  if (!creds.refreshToken) throw new Error('No refresh token available');

  let refreshed: KiroCredentials;
  if (creds.authMethod === 'social' || (!creds.authMethod && !creds.clientId)) {
    refreshed = await refreshSocialToken(creds.refreshToken, creds.region || 'us-east-1');
  } else {
    if (!creds.clientId || !creds.clientSecret) throw new Error('Builder ID refresh requires clientId and clientSecret');
    refreshed = await refreshBuilderIdToken(creds.refreshToken, creds.clientId, creds.clientSecret, creds.idcRegion || creds.region || 'us-east-1');
  }

  saveCredentials(refreshed, credsPath);
  return refreshed;
}

// ── Import AWS Credentials ──

export async function importAwsCredentials(
  input: { clientId: string; clientSecret: string; accessToken: string; refreshToken: string; region?: string; authMethod?: string },
  credsPath?: string,
): Promise<{ success: boolean; credsPath?: string; error?: string }> {
  const missing = [];
  if (!input.clientId) missing.push('clientId');
  if (!input.clientSecret) missing.push('clientSecret');
  if (!input.accessToken) missing.push('accessToken');
  if (!input.refreshToken) missing.push('refreshToken');
  if (missing.length > 0) return { success: false, error: `Missing: ${missing.join(', ')}` };

  const region = input.region || 'us-east-1';
  const creds: KiroCredentials = {
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    authMethod: 'builder-id',
    idcRegion: region,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  };

  // Try refresh to validate
  try {
    const refreshed = await refreshBuilderIdToken(input.refreshToken, input.clientId, input.clientSecret, region);
    Object.assign(creds, refreshed);
  } catch (e) {
    logger.warn(`[Kiro OAuth] Import refresh failed, saving original: ${(e as Error).message}`);
  }

  const savedPath = saveCredentials(creds, credsPath);
  logger.info(`[Kiro OAuth] AWS credentials imported: ${savedPath}`);
  return { success: true, credsPath: savedPath };
}

// ── Helpers ──

async function findAvailablePort(start: number, end: number): Promise<number> {
  for (let port = start; port <= end; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const server = http.createServer();
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.close();
          resolve();
        });
      });
      return port;
    } catch { /* port in use — expected, no logging needed */ }
  }
  throw new Error('All callback ports are in use');
}

async function closeCallbackServer(key: string): Promise<void> {
  const existing = activeServers.get(key);
  if (!existing) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 2000);
      existing.server.close(() => { clearTimeout(timeout); resolve(); });
    });
  } catch (err) { logger.warn('Failed to close callback server', { error: (err as Error).message }); }
  activeServers.delete(key);
}

export async function cleanup(): Promise<void> {
  for (const [key] of activeServers) await closeCallbackServer(key);
  for (const [taskId] of activePollingTasks) stopPollingTask(taskId);
}

// ── Last OAuth Result (for SSE polling) ──

let lastOAuthResult: { success: boolean; credsPath?: string; creds?: KiroCredentials; error?: string } | null = null;

export function getLastOAuthResult(): typeof lastOAuthResult {
  return lastOAuthResult;
}

export function clearLastOAuthResult(): void {
  lastOAuthResult = null;
}
