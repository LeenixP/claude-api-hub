import { useState, useEffect, useCallback } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { showToast } from '../common/Toast.js';
import { apiFetch } from '../../hooks/useApi.js';
import { Select } from '../common/Select.js';
import { getKiroAuthStatus } from '../../lib/api.js';

interface ConfigEditorProps {
  config: GatewayConfig | null;
  onSaved: () => void;
}

type Mode = 'ui' | 'json';

export function ConfigEditor({ config, onSaved }: ConfigEditorProps) {
  const [mode, setMode] = useState<Mode>('ui');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  // UI form state
  const [port, setPort] = useState(config?.port ?? 9800);
  const [host, setHost] = useState(config?.host ?? '0.0.0.0');
  const [logLevel, setLogLevel] = useState(config?.logLevel ?? 'info');
  const [password, setPassword] = useState(config?.password ?? '');
  const [rateLimit, setRateLimit] = useState(config?.rateLimitRpm ?? 0);
  const [tokenRefresh, setTokenRefresh] = useState(config?.tokenRefreshMinutes ?? 30);
  const [streamTimeout, setStreamTimeout] = useState(config?.streamTimeoutMs ?? 120000);
  const [streamIdleTimeout, setStreamIdleTimeout] = useState(config?.streamIdleTimeoutMs ?? 30000);
  const [maxResponseBytes, setMaxResponseBytes] = useState(config?.maxResponseBytes ?? 0);
  const [corsOrigins, setCorsOrigins] = useState(config?.corsOrigins?.join('\n') ?? '*');
  const [trustProxy, setTrustProxy] = useState(config?.trustProxy ?? false);
  const [refreshingOAuth, setRefreshingOAuth] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{ valid: boolean; expiresAt?: string; authMethod?: string } | null>(null);

  // JSON state
  const [jsonText, setJsonText] = useState('');
  const [jsonValid, setJsonValid] = useState(true);

  useEffect(() => {
    if (config) {
      setPort(config.port ?? 9800);
      setHost(config.host ?? '0.0.0.0');
      setLogLevel(config.logLevel ?? 'info');
      setPassword(config.password ?? '');
      setRateLimit(config.rateLimitRpm ?? 0);
      setTokenRefresh(config.tokenRefreshMinutes ?? 30);
      setStreamTimeout(config.streamTimeoutMs ?? 120000);
      setStreamIdleTimeout(config.streamIdleTimeoutMs ?? 30000);
      setMaxResponseBytes(config.maxResponseBytes ?? 0);
      setCorsOrigins(config.corsOrigins?.join('\n') ?? '*');
      setTrustProxy(config.trustProxy ?? false);
      setJsonText(JSON.stringify(config, null, 2));
      setHasChanges(false);
    }
  }, [config]);

  const markChanged = useCallback(() => setHasChanges(true), []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      let body: GatewayConfig;
      if (mode === 'json') {
        body = JSON.parse(jsonText);
      } else {
        body = {
          ...(config || {} as GatewayConfig),
          port,
          host,
          logLevel,
          password: password || undefined,
          rateLimitRpm: rateLimit || undefined,
          tokenRefreshMinutes: tokenRefresh || undefined,
          streamTimeoutMs: streamTimeout || undefined,
          streamIdleTimeoutMs: streamIdleTimeout || undefined,
          maxResponseBytes: maxResponseBytes || undefined,
          corsOrigins: corsOrigins.split('\n').map(s => s.trim()).filter(Boolean),
          trustProxy,
        };
      }
      const res = await apiFetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast('Configuration saved', 'success');
      setHasChanges(false);
      onSaved();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }, [mode, config, port, host, logLevel, password, rateLimit, tokenRefresh, streamTimeout, streamIdleTimeout, maxResponseBytes, corsOrigins, trustProxy, jsonText, onSaved]);

  const handleJsonChange = useCallback((v: string) => {
    setJsonText(v);
    setHasChanges(true);
    try { JSON.parse(v); setJsonValid(true); } catch { setJsonValid(false); }
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'claude-api-hub-config.json'; a.click();
    URL.revokeObjectURL(url);
  }, [jsonText]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        JSON.parse(text);
        setJsonText(text); setJsonValid(true); setHasChanges(true); setMode('json');
        showToast('Config imported to JSON editor', 'success');
      } catch { showToast('Invalid JSON file', 'error'); }
    };
    input.click();
  }, []);

  const handleReset = useCallback(() => {
    if (config) { setJsonText(JSON.stringify(config, null, 2)); setJsonValid(true); setHasChanges(false); }
  }, [config]);

  const handleCheckOAuth = useCallback(async () => {
    try { setOauthStatus(await getKiroAuthStatus()); } catch { setOauthStatus(null); }
  }, []);

  const handleRefreshOAuth = useCallback(async () => {
    setRefreshingOAuth(true);
    try {
      const res = await apiFetch('/api/oauth/kiro/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (res.ok) { showToast('OAuth token refreshed', 'success'); handleCheckOAuth(); }
      else { const data = await res.json().catch(() => ({})); showToast(data.error?.message || 'Refresh failed', 'error'); }
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setRefreshingOAuth(false); }
  }, [handleCheckOAuth]);

  useEffect(() => { handleCheckOAuth(); }, [handleCheckOAuth]);

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="section-title">Configuration</h2>
          <p class="section-subtitle">
            {mode === 'ui' ? 'Form-based editor — change settings below and click Save' : 'Raw JSON editor — edit the full config directly'}
            {hasChanges && <span style="margin-left:8px;color:var(--color-warning);font-weight:600">● Unsaved</span>}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="filter-group">
            <button onClick={() => setMode('ui')} class={`filter-btn ${mode === 'ui' ? 'filter-btn-active' : ''}`}>Form</button>
            <button onClick={() => setMode('json')} class={`filter-btn ${mode === 'json' ? 'filter-btn-active' : ''}`}>JSON</button>
          </div>
          <button onClick={handleSave} disabled={saving || (mode === 'json' && !jsonValid)} class="btn btn-primary">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {mode === 'ui' ? (
        <div style="display:flex;flex-direction:column;gap:28px">
          {/* Server */}
          <div class="card" style="padding:28px">
            <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">Server</h3>
            <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">Network and logging settings for the gateway process.</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="form-label">Port</label>
                <input type="number" value={port} class="form-input"
                  onInput={e => { setPort(parseInt((e.target as HTMLInputElement).value) || 9800); markChanged(); }} />
              </div>
              <div>
                <label class="form-label">Host</label>
                <input type="text" value={host} class="form-input"
                  onInput={e => { setHost((e.target as HTMLInputElement).value); markChanged(); }} />
              </div>
              <div>
                <label class="form-label">Log Level</label>
                <Select value={logLevel} onChange={v => { setLogLevel(v); markChanged(); }}
                  options={[
                    { value: 'debug', label: 'Debug' }, { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' }, { value: 'error', label: 'Error' },
                  ]} />
              </div>
            </div>
          </div>

          {/* Security */}
          <div class="card" style="padding:28px">
            <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">Security</h3>
            <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">Authentication and rate limiting for the dashboard and API.</p>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="form-label">Admin Password</label>
                <input type="password" value={password} class="form-input" placeholder="Empty = no auth"
                  onInput={e => { setPassword((e.target as HTMLInputElement).value); markChanged(); }} />
              </div>
              <div>
                <label class="form-label">Rate Limit (RPM)</label>
                <input type="number" value={rateLimit} class="form-input" placeholder="0 = unlimited"
                  onInput={e => { setRateLimit(parseInt((e.target as HTMLInputElement).value) || 0); markChanged(); }} />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm cursor-pointer" style="color:var(--color-text);padding-bottom:10px">
                  <input type="checkbox" checked={trustProxy} class="checkbox-custom"
                    onChange={e => { setTrustProxy((e.target as HTMLInputElement).checked); markChanged(); }} />
                  Trust X-Forwarded-For header
                </label>
              </div>
            </div>
          </div>

          {/* Timeouts & Limits */}
          <div class="card" style="padding:28px">
            <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">Timeouts & Limits</h3>
            <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">Stream, request, and token refresh timing settings.</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label class="form-label">Stream Timeout (ms)</label>
                <input type="number" value={streamTimeout} class="form-input"
                  onInput={e => { setStreamTimeout(parseInt((e.target as HTMLInputElement).value) || 120000); markChanged(); }} />
              </div>
              <div>
                <label class="form-label">Idle Timeout (ms)</label>
                <input type="number" value={streamIdleTimeout} class="form-input"
                  onInput={e => { setStreamIdleTimeout(parseInt((e.target as HTMLInputElement).value) || 30000); markChanged(); }} />
              </div>
              <div>
                <label class="form-label">Max Response (bytes)</label>
                <input type="number" value={maxResponseBytes} class="form-input" placeholder="0 = unlimited"
                  onInput={e => { setMaxResponseBytes(parseInt((e.target as HTMLInputElement).value) || 0); markChanged(); }} />
              </div>
              <div>
                <label class="form-label">Token Refresh (min)</label>
                <input type="number" value={tokenRefresh} class="form-input"
                  onInput={e => { setTokenRefresh(parseInt((e.target as HTMLInputElement).value) || 30); markChanged(); }} />
              </div>
            </div>
          </div>

          {/* Kiro OAuth */}
          <div class="card" style="padding:28px">
            <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">Kiro OAuth</h3>
            <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">AWS Q / CodeWhisperer OAuth credential status and refresh.</p>
            <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
              <div style="display:flex;align-items:center;gap:8px">
                <span style={`display:inline-block;width:10px;height:10px;border-radius:50%;background:${oauthStatus?.valid ? 'var(--color-success)' : oauthStatus ? 'var(--color-danger)' : 'var(--color-text-muted)'}`} />
                <span style="font-size:14px;color:var(--color-text)">
                  {oauthStatus ? (oauthStatus.valid ? 'Valid' : 'Expired') : 'Not checked'}
                </span>
              </div>
              {oauthStatus?.authMethod && <span style="font-size:13px;color:var(--color-text-dim)">Method: {oauthStatus.authMethod}</span>}
              {oauthStatus?.expiresAt && <span style="font-size:13px;color:var(--color-text-dim)">Expires: {new Date(oauthStatus.expiresAt).toLocaleString()}</span>}
              <div style="margin-left:auto;display:flex;gap:8px">
                <button onClick={handleCheckOAuth} class="btn btn-ghost">Check</button>
                <button onClick={handleRefreshOAuth} disabled={refreshingOAuth} class="btn btn-primary">
                  {refreshingOAuth ? 'Refreshing...' : 'Refresh Token'}
                </button>
              </div>
            </div>
          </div>

          {/* CORS */}
          <div class="card" style="padding:28px">
            <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">CORS Origins</h3>
            <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">Allowed cross-origin request origins. One per line.</p>
            <textarea value={corsOrigins} rows={4} class="form-input font-mono" style="resize:vertical"
              onInput={e => { setCorsOrigins((e.target as HTMLTextAreaElement).value); markChanged(); }}
              placeholder="*&#10;https://example.com" />
          </div>
        </div>
      ) : (
        <div>
          <div class="flex items-center gap-2 mb-3">
            <button onClick={handleImport} class="btn btn-ghost" style="height:32px;font-size:13px">Import File</button>
            <button onClick={handleExport} class="btn btn-ghost" style="height:32px;font-size:13px">Export</button>
            <button onClick={handleReset} class="btn btn-ghost" style="height:32px;font-size:13px">Reset</button>
            <span class="text-xs ml-auto font-medium" style={jsonValid ? 'color:var(--color-success)' : 'color:var(--color-danger)'}>
              {jsonValid ? '✓ Valid JSON' : '✗ Invalid JSON'}
            </span>
          </div>
          <textarea
            value={jsonText}
            onInput={e => handleJsonChange((e.target as HTMLTextAreaElement).value)}
            rows={30}
            spellcheck={false}
            class="form-input font-mono"
            style="resize:vertical;line-height:1.6;tab-size:2"
          />
        </div>
      )}
    </div>
  );
}
