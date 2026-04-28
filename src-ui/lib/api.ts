import type { GatewayConfig, LogEntry, ModelInfo, Stats, ProviderConfig, TokenStats } from '../types.js';

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('adminToken') || '';
  return token ? { 'x-admin-token': token } : {};
}

async function api<T>(url: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...getHeaders(),
        ...(options.headers || {}),
      },
    });
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('api:unauthorized'));
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function getConfig(): Promise<GatewayConfig> {
  return api<GatewayConfig>('/api/config');
}

export async function getLogs(): Promise<LogEntry[]> {
  const data = await api<{ logs?: LogEntry[] } | LogEntry[]>('/api/logs');
  return Array.isArray(data) ? data : (data.logs || []);
}

export function getModels(): Promise<ModelInfo[]> {
  return api<ModelInfo[]>('/v1/models').then((res: Record<string, unknown>) => res.data || res);
}

export function fetchAllModels(): Promise<Record<string, string[]>> {
  return api<Record<string, string[]>>('/api/fetch-models');
}

export function probeModels(baseUrl: string, apiKey: string, passthrough: boolean): Promise<{ models: string[] }> {
  return api<{ models: string[] }>('/api/probe-models', {
    method: 'POST',
    body: JSON.stringify({ baseUrl, apiKey, passthrough }),
  });
}

export function getStats(): Promise<Stats> {
  return api<Stats>('/api/stats');
}

export function fetchTokenStats(): Promise<TokenStats> {
  return api<TokenStats>('/api/token-stats');
}

export function saveAliases(aliases: Record<string, string>): Promise<void> {
  return api<void>('/api/aliases', {
    method: 'PUT',
    body: JSON.stringify(aliases),
  });
}

export function saveTierTimeouts(timeouts: Record<string, { timeoutMs: number; streamTimeoutMs?: number; streamIdleTimeoutMs?: number }>): Promise<void> {
  return api<void>('/api/tier-timeouts', {
    method: 'PUT',
    body: JSON.stringify(timeouts),
  });
}

export function checkUpdate(): Promise<{ localVersion: string; latestVersion: string | null; hasUpdate: boolean }> {
  return api<{ localVersion: string; latestVersion: string | null; hasUpdate: boolean }>('/api/check-update');
}

// Provider CRUD
export function createProvider(key: string, config: ProviderConfig): Promise<void> {
  return api<void>('/api/config/providers', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export function updateProvider(key: string, config: ProviderConfig): Promise<void> {
  return api<void>(`/api/config/providers/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export function deleteProvider(key: string): Promise<void> {
  return api<void>(`/api/config/providers/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}

export function testProvider(key: string): Promise<{ success: boolean; error?: string }> {
  return api<{ success: boolean; error?: string }>(`/api/test-provider/${encodeURIComponent(key)}`, {
    method: 'POST',
  });
}

// Kiro OAuth
export function startKiroAuth(method: string, region: string, startUrl?: string): Promise<{ authUrl: string; authInfo?: unknown }> {
  return api<{ authUrl: string; authInfo?: unknown }>('/api/oauth/kiro/auth-url', {
    method: 'POST',
    body: JSON.stringify({ method, region, startUrl: startUrl || undefined }),
  });
}

export function getKiroAuthResult(): Promise<{ success: boolean; error?: string; credsPath?: string }> {
  return api<{ success: boolean; error?: string; credsPath?: string }>('/api/oauth/kiro/result');
}

export function getKiroAuthStatus(credsPath?: string): Promise<{ valid: boolean; expiresAt?: string; authMethod?: string; canRefresh: boolean }> {
  const qs = credsPath ? `?credsPath=${encodeURIComponent(credsPath)}` : '';
  return api<{ valid: boolean; expiresAt?: string; authMethod?: string; canRefresh: boolean }>(`/api/oauth/kiro/status${qs}`);
}

export function getKiroModels(): Promise<{ models: string[] }> {
  return api<{ models: string[] }>('/api/oauth/kiro/models');
}

export function cancelKiroAuth(): Promise<void> {
  return api<void>('/api/oauth/kiro/cancel', { method: 'POST' });
}

// Update
export function performUpdate(): Promise<{ success: boolean; oldVersion: string; newVersion: string; error?: string; output?: string }> {
  return api<{ success: boolean; oldVersion: string; newVersion: string; error?: string; output?: string }>('/api/update', { method: 'POST' });
}

export function restartServer(): Promise<{ restarting: boolean }> {
  return api<{ restarting: boolean }>('/api/restart', { method: 'POST' });
}

// Auth
export async function login(password: string): Promise<{ token: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => 'Login failed');
    throw new Error(text);
  }
  return res.json();
}

export async function checkAuth(): Promise<{ required: boolean; authenticated?: boolean }> {
  const res = await fetch('/api/auth/check', {
    headers: getHeaders(),
  });
  if (!res.ok) {
    return { required: true, authenticated: false };
  }
  return res.json();
}
