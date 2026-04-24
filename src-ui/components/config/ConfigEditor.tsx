import { useState, useEffect, useCallback } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { showToast } from '../common/Toast.js';
import { apiFetch } from '../../hooks/useApi.js';
import { Select } from '../common/Select.js';

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
  const [port, setPort] = useState(config?.port ?? 3456);
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

  // JSON state
  const [jsonText, setJsonText] = useState('');
  const [jsonValid, setJsonValid] = useState(true);

  useEffect(() => {
    if (config) {
      setPort(config.port ?? 3456);
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
    try {
      JSON.parse(v);
      setJsonValid(true);
    } catch {
      setJsonValid(false);
    }
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob([jsonText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'claude-api-hub-config.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [jsonText]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        JSON.parse(text); // validate
        setJsonText(text);
        setJsonValid(true);
        setHasChanges(true);
        setMode('json');
        showToast('Config imported', 'success');
      } catch {
        showToast('Invalid JSON file', 'error');
      }
    };
    input.click();
  }, []);

  const handleReset = useCallback(() => {
    if (config) {
      setJsonText(JSON.stringify(config, null, 2));
      setJsonValid(true);
      setHasChanges(false);
    }
  }, [config]);

  const inputClass = "form-input";
  const inputStyle = "";
  const labelClass = "form-label";
  const labelStyle = "";

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="section-title">Configuration</h2>
          <p class="section-subtitle">
            {hasChanges ? 'Unsaved changes' : 'All changes saved'}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <div class="filter-group">
            <button
              onClick={() => setMode('ui')}
              class={`filter-btn ${mode === 'ui' ? 'filter-btn-active' : ''}`}
            >
              UI Mode
            </button>
            <button
              onClick={() => setMode('json')}
              class={`filter-btn ${mode === 'json' ? 'filter-btn-active' : ''}`}
            >
              JSON Editor
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || (mode === 'json' && !jsonValid)}
            class="btn btn-primary"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {mode === 'ui' ? (
        <div class="space-y-4">
          {/* General */}
          <div class="card">
            <h3 class="text-sm font-semibold mb-3" style="color:var(--color-text)">General</h3>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label class={labelClass} style={labelStyle}>Port</label>
                <input
                  type="number"
                  value={port}
                  onInput={e => { setPort(parseInt((e.target as HTMLInputElement).value) || 3456); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label class={labelClass} style={labelStyle}>Host</label>
                <input
                  type="text"
                  value={host}
                  onInput={e => { setHost((e.target as HTMLInputElement).value); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label class={labelClass} style={labelStyle}>Log Level</label>
                <Select
                  value={logLevel}
                  onChange={v => { setLogLevel(v); markChanged(); }}
                  options={[
                    { value: 'debug', label: 'Debug' },
                    { value: 'info', label: 'Info' },
                    { value: 'warn', label: 'Warn' },
                    { value: 'error', label: 'Error' },
                  ]}
                />
              </div>
            </div>
          </div>

          {/* Security */}
          <div class="card">
            <h3 class="text-sm font-semibold mb-3" style="color:var(--color-text)">Security</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class={labelClass} style={labelStyle}>Admin Password</label>
                <input
                  type="password"
                  value={password}
                  onInput={e => { setPassword((e.target as HTMLInputElement).value); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                  placeholder="Leave empty to disable"
                />
              </div>
              <div>
                <label class={labelClass} style={labelStyle}>Rate Limit (RPM)</label>
                <input
                  type="number"
                  value={rateLimit}
                  onInput={e => { setRateLimit(parseInt((e.target as HTMLInputElement).value) || 0); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                  placeholder="0 = unlimited"
                />
              </div>
            </div>
          </div>

          {/* OAuth Refresh */}
          <div class="card">
            <h3 class="text-sm font-semibold mb-3" style="color:var(--color-text)">OAuth Refresh</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class={labelClass} style={labelStyle}>Token Refresh (minutes)</label>
                <input
                  type="number"
                  value={tokenRefresh}
                  onInput={e => { setTokenRefresh(parseInt((e.target as HTMLInputElement).value) || 30); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Stream & Timeouts */}
          <div class="card">
            <h3 class="text-sm font-semibold mb-3" style="color:var(--color-text)">Stream & Timeouts</h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label class={labelClass} style={labelStyle}>Stream Timeout (ms)</label>
                <input
                  type="number"
                  value={streamTimeout}
                  onInput={e => { setStreamTimeout(parseInt((e.target as HTMLInputElement).value) || 120000); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label class={labelClass} style={labelStyle}>Idle Timeout (ms)</label>
                <input
                  type="number"
                  value={streamIdleTimeout}
                  onInput={e => { setStreamIdleTimeout(parseInt((e.target as HTMLInputElement).value) || 30000); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                />
              </div>
              <div>
                <label class={labelClass} style={labelStyle}>Max Response Bytes</label>
                <input
                  type="number"
                  value={maxResponseBytes}
                  onInput={e => { setMaxResponseBytes(parseInt((e.target as HTMLInputElement).value) || 0); markChanged(); }}
                  class={inputClass}
                  style={inputStyle}
                  placeholder="0 = unlimited"
                />
              </div>
              <div class="flex items-end">
                <label class="flex items-center gap-2 text-sm cursor-pointer" style="color:var(--color-text)">
                  <input
                    type="checkbox"
                    checked={trustProxy}
                    onChange={e => { setTrustProxy((e.target as HTMLInputElement).checked); markChanged(); }}
                    class="w-4 h-4 rounded"
                  />
                  Trust Proxy
                </label>
              </div>
            </div>
          </div>

          {/* CORS */}
          <div class="card">
            <h3 class="text-sm font-semibold mb-3" style="color:var(--color-text)">CORS Origins</h3>
            <textarea
              value={corsOrigins}
              onInput={e => { setCorsOrigins((e.target as HTMLTextAreaElement).value); markChanged(); }}
              rows={4}
              class={`${inputClass} font-mono`}
              style={inputStyle}
              placeholder="*&#10;https://example.com"
            />
            <p class="text-xs mt-1" style="color:var(--color-text-muted)">One origin per line. Use * for all.</p>
          </div>
        </div>
      ) : (
        <div>
          <div class="flex items-center gap-2 mb-3">
            <button
              onClick={handleImport}
              class="px-3 py-1.5 rounded-lg text-xs font-medium"
              style="color:var(--color-text);background:var(--color-bg);border:1px solid var(--color-border)"
            >
              Import
            </button>
            <button
              onClick={handleExport}
              class="px-3 py-1.5 rounded-lg text-xs font-medium"
              style="color:var(--color-text);background:var(--color-bg);border:1px solid var(--color-border)"
            >
              Export
            </button>
            <button
              onClick={handleReset}
              class="px-3 py-1.5 rounded-lg text-xs font-medium"
              style="color:var(--color-text);background:var(--color-bg);border:1px solid var(--color-border)"
            >
              Reset
            </button>
            <span class="text-xs ml-auto" style={jsonValid ? 'color:var(--color-success)' : 'color:var(--color-danger)'}>
              {jsonValid ? 'Valid JSON' : 'Invalid JSON'}
            </span>
          </div>
          <textarea
            value={jsonText}
            onInput={e => handleJsonChange((e.target as HTMLTextAreaElement).value)}
            rows={30}
            class="w-full px-3 py-2 rounded-lg text-sm border font-mono transition-colors"
            style={`background:var(--color-bg);color:var(--color-text);border-color:${jsonValid ? 'var(--color-border)' : 'var(--color-danger)'}`}
            spellcheck={false}
          />
        </div>
      )}
    </div>
  );
}
