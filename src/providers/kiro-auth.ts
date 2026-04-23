import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface KiroCredentials {
  accessToken?: string;
  refreshToken?: string;
  profileArn?: string;
  expiresAt?: string;
  authMethod?: 'social' | 'builder-id';
  region?: string;
  idcRegion?: string;
  clientId?: string;
  clientSecret?: string;
}

export class KiroAuth {
  private creds: KiroCredentials = {};
  private region: string;
  private credsPath: string;

  constructor(region?: string, credsPath?: string) {
    this.region = region || 'us-east-1';
    this.credsPath = credsPath || path.join(os.homedir(), '.kiro', 'oauth_creds.json');
  }

  async loadCredentials(): Promise<void> {
    const envB64 = process.env.KIRO_OAUTH_CREDS_BASE64;
    if (envB64) {
      this.creds = JSON.parse(Buffer.from(envB64, 'base64').toString('utf-8'));
      return;
    }
    try {
      const raw = fs.readFileSync(this.credsPath, 'utf-8');
      this.creds = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to load Kiro credentials from ${this.credsPath}`);
    }
    if (!this.creds.region) this.creds.region = this.region;
    this.region = this.creds.region || this.region;
  }

  /** Synchronous credential loading for buildRequest (called once at startup). */
  loadCredentialsSync(): void {
    const envB64 = process.env.KIRO_OAUTH_CREDS_BASE64;
    if (envB64) {
      this.creds = JSON.parse(Buffer.from(envB64, 'base64').toString('utf-8'));
    } else {
      try {
        const raw = fs.readFileSync(this.credsPath, 'utf-8');
        this.creds = JSON.parse(raw);
      } catch {
        throw new Error(`Failed to load Kiro credentials from ${this.credsPath}`);
      }
    }
    if (!this.creds.region) this.creds.region = this.region;
    this.region = this.creds.region || this.region;
  }

  /** Get access token synchronously (must call loadCredentialsSync first). */
  getAccessTokenSync(): string | undefined {
    return this.creds.accessToken;
  }

  /** Get profileArn synchronously. */
  getProfileArn(): string | undefined {
    return this.creds.profileArn;
  }

  async getAccessToken(): Promise<string> {
    if (!this.creds.accessToken && !this.creds.refreshToken) {
      await this.loadCredentials();
    }
    if (this.creds.accessToken && !this.isExpired()) {
      return this.creds.accessToken;
    }
    if (!this.creds.refreshToken) {
      throw new Error('No refresh token available');
    }
    await this.refreshToken();
    return this.creds.accessToken!;
  }

  get profileArn(): string | undefined {
    return this.creds.profileArn;
  }

  private isExpired(): boolean {
    if (!this.creds.expiresAt) return true;
    const expiresMs = new Date(this.creds.expiresAt).getTime();
    return Date.now() > expiresMs - 5 * 60 * 1000;
  }

  async refreshToken(): Promise<void> {
    const isSocial = this.creds.authMethod === 'social' ||
      (!this.creds.authMethod && !this.creds.clientId);

    let url: string;
    let body: Record<string, string>;

    if (isSocial) {
      const r = this.creds.region || this.region;
      url = `https://prod.${r}.auth.desktop.kiro.dev/refreshToken`;
      body = { refreshToken: this.creds.refreshToken! };
    } else {
      const r = this.creds.idcRegion || this.creds.region || this.region;
      url = `https://oidc.${r}.amazonaws.com/token`;
      if (!this.creds.clientId || !this.creds.clientSecret) {
        throw new Error('Builder ID refresh requires clientId and clientSecret');
      }
      body = {
        refreshToken: this.creds.refreshToken!,
        clientId: this.creds.clientId,
        clientSecret: this.creds.clientSecret,
        grantType: 'refresh_token',
      };
    }

    const data = await this.httpsPost(url, body);
    if (!data.accessToken) {
      throw new Error('Refresh response missing accessToken');
    }

    this.creds.accessToken = data.accessToken as string;
    this.creds.refreshToken = (data.refreshToken as string) || this.creds.refreshToken;
    if (data.profileArn) this.creds.profileArn = data.profileArn as string;
    const expiresIn = Number(data.expiresIn) || 3600;
    this.creds.expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await this.saveCredentials();
  }

  async saveCredentials(): Promise<void> {
    try {
      const dir = path.dirname(this.credsPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(fs.readFileSync(this.credsPath, 'utf-8'));
      } catch { /* new file */ }
      const merged = { ...existing, ...this.creds };
      fs.writeFileSync(this.credsPath, JSON.stringify(merged, null, 2), 'utf-8');
    } catch { /* best effort */ }
  }

  private httpsPost(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const parsed = new URL(url);
      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
  return reject(new Error(`Token refresh failed: HTTP ${res.statusCode} - ${data}`));
          }
          try { resolve(JSON.parse(data) as Record<string, unknown>); }
          catch { reject(new Error(`Invalid JSON in refresh response: ${data}`)); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Token refresh timed out')); });
      req.write(payload);
      req.end();
    });
  }
}
