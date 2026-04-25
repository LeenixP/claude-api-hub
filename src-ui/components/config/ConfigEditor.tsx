import { useState, useEffect, useCallback, useMemo, useRef } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { showToast } from '../common/Toast.js';
import { apiFetch } from '../../hooks/useApi.js';
import { Select } from '../common/Select.js';
import { getKiroAuthStatus } from '../../lib/api.js';
import { useLocale } from '../../lib/i18n.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';

interface ConfigEditorProps {
  config: GatewayConfig | null;
  onSaved: () => void;
}

type Section = 'server' | 'security' | 'timeouts' | 'kiro' | 'cors' | 'advanced';

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>
  </svg>
);

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      class="relative inline-flex items-center"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style="color:var(--color-text-dim);cursor:help"><InfoIcon /></span>
      {show && (
        <span
          class="absolute z-50 px-3 py-2 rounded-lg text-xs font-medium"
          style="left:20px;top:50%;transform:translateY(-50%);width:240px;background:var(--color-surface);border:1px solid var(--color-border);color:var(--color-text);box-shadow:0 4px 16px rgba(0,0,0,0.3)"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function SettingRow({ label, tooltip, unit, children }: { label: string; tooltip?: string; unit?: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-1.5">
        <label class="form-label" style="margin:0">{label}</label>
        {tooltip && <Tooltip text={tooltip} />}
      </div>
      <div class="flex items-center gap-2">
        {children}
        {unit && <span class="text-xs whitespace-nowrap" style="color:var(--color-text-dim)">{unit}</span>}
      </div>
    </div>
  );
}

export function ConfigEditor({ config, onSaved }: ConfigEditorProps) {
  const { t } = useLocale();
  const [activeSection, setActiveSection] = useState<Section>('server');
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [pendingSection, setPendingSection] = useState<Section | null>(null);

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
  const [oauthStatuses, setOauthStatuses] = useState<Record<string, { valid: boolean; expiresAt?: string; authMethod?: string }>>({});
  const [refreshingOAuth, setRefreshingOAuth] = useState<string | null>(null);

  const [jsonText, setJsonText] = useState('');
  const [jsonValid, setJsonValid] = useState(true);

  const configJsonRef = useRef('');

  useEffect(() => {
    if (config) {
      const json = JSON.stringify(config);
      if (configJsonRef.current !== json) {
        configJsonRef.current = json;
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
    }
  }, [config]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasChanges]);

  const markChanged = useCallback(() => setHasChanges(true), []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      let body: GatewayConfig;
      if (activeSection === 'advanced') {
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
      showToast(t('config.saved'), 'success');
      setHasChanges(false);
      onSaved();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }, [activeSection, config, port, host, logLevel, password, rateLimit, tokenRefresh, streamTimeout, streamIdleTimeout, maxResponseBytes, corsOrigins, trustProxy, jsonText, onSaved]);

  const handleJsonChange = useCallback((v: string) => {
    setJsonText(v);
    setHasChanges(true);
    try { JSON.parse(v); setJsonValid(true); } catch { setJsonValid(false); }
  }, []);

  const handleFormat = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(jsonText), null, 2);
      setJsonText(formatted);
      setJsonValid(true);
      setHasChanges(true);
    } catch {
      showToast(t('config.invalidJson'), 'error');
    }
  }, [jsonText]);

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
        setJsonText(text); setJsonValid(true); setHasChanges(true); setActiveSection('advanced');
        showToast(t('config.imported'), 'success');
      } catch { showToast(t('config.invalidFile'), 'error'); }
    };
    input.click();
  }, []);

  const handleReset = useCallback(() => {
    if (config) { setJsonText(JSON.stringify(config, null, 2)); setJsonValid(true); setHasChanges(false); }
  }, [config]);

  const kiroProviders = useMemo(() => {
    if (!config) return [];
    return Object.entries(config.providers)
      .filter(([_, p]) => p.providerType === 'kiro')
      .map(([id, p]) => ({ id, name: p.name || id, config: p }));
  }, [config]);

  useEffect(() => {
    if (!kiroProviders.length) return;
    kiroProviders.forEach(async (kp) => {
      try {
        const status = await getKiroAuthStatus(kp.config.options?.credsPath as string);
        setOauthStatuses(prev => ({ ...prev, [kp.id]: status }));
      } catch {
        setOauthStatuses(prev => ({ ...prev, [kp.id]: { valid: false } }));
      }
    });
  }, [kiroProviders]);

  const handleRefreshProviderOAuth = useCallback(async (providerId: string) => {
    setRefreshingOAuth(providerId);
    try {
      const kp = kiroProviders.find(p => p.id === providerId);
      const res = await apiFetch('/api/oauth/kiro/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId, credsPath: kp?.config.options?.credsPath }),
      });
      if (res.ok) {
        showToast('Token refreshed', 'success');
        const status = await getKiroAuthStatus(kp?.config.options?.credsPath as string);
        setOauthStatuses(prev => ({ ...prev, [providerId]: status }));
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error?.message || 'Refresh failed', 'error');
      }
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally {
      setRefreshingOAuth(null);
    }
  }, [kiroProviders]);

  const sections: { key: Section; label: string }[] = [
    { key: 'server', label: t('config.serverSection') },
    { key: 'security', label: t('config.securitySection') },
    { key: 'timeouts', label: t('config.timeoutsSection') },
    { key: 'kiro', label: t('config.kiroSection') },
    { key: 'cors', label: t('config.corsSection') },
    { key: 'advanced', label: t('config.advancedSection') },
  ];

  const searchLower = search.toLowerCase().trim();

  const serverMatch = !searchLower || ['port', 'host', 'log level', '服务器', '端口', '主机', '日志'].some(w => w.includes(searchLower) || searchLower.includes(w));
  const securityMatch = !searchLower || ['password', 'rate limit', 'trust proxy', '安全', '密码', '速率', '代理'].some(w => w.includes(searchLower) || searchLower.includes(w));
  const timeoutsMatch = !searchLower || ['stream timeout', 'idle timeout', 'max response', 'token refresh', '超时', '流', '空闲', '响应', '刷新'].some(w => w.includes(searchLower) || searchLower.includes(w));
  const kiroMatch = !searchLower || ['kiro', 'oauth', 'aws', 'codewhisperer'].some(w => w.includes(searchLower) || searchLower.includes(w));
  const corsMatch = !searchLower || ['cors', 'origin', 'cross', '跨域', '来源'].some(w => w.includes(searchLower) || searchLower.includes(w));

  function highlight(text: string) {
    if (!searchLower) return <span>{text}</span>;
    const idx = text.toLowerCase().indexOf(searchLower);
    if (idx === -1) return <span>{text}</span>;
    return (
      <span>
        {text.slice(0, idx)}
        <mark style="background:var(--color-warning);color:#000;border-radius:2px;padding:0 2px">{text.slice(idx, idx + searchLower.length)}</mark>
        {text.slice(idx + searchLower.length)}
      </span>
    );
  }

  function switchSection(sec: Section) {
    if (hasChanges) {
      setPendingSection(sec);
      setShowUnsaved(true);
      return;
    }
    setActiveSection(sec);
  }

  function confirmLeave() {
    setHasChanges(false);
    setShowUnsaved(false);
    if (pendingSection) {
      setActiveSection(pendingSection);
      setPendingSection(null);
    }
  }

  const ServerCard = () => (
    <div class="card" style="padding:28px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">{highlight(t('config.server'))}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">{t('config.serverDesc')}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SettingRow label={t('config.port')} tooltip="HTTP server listening port." unit="">
          <input id="cfg-port" type="number" value={port} class="form-input" placeholder="9800"
            onInput={e => { setPort(parseInt((e.target as HTMLInputElement).value) || 9800); markChanged(); }} />
        </SettingRow>
        <SettingRow label={t('config.host')} tooltip="Bind address. Use 0.0.0.0 for all interfaces." unit="">
          <input id="cfg-host" type="text" value={host} class="form-input" placeholder="0.0.0.0"
            onInput={e => { setHost((e.target as HTMLInputElement).value); markChanged(); }} />
        </SettingRow>
        <SettingRow label={t('config.logLevel')} tooltip="Minimum log level to output." unit="">
          <Select value={logLevel} onChange={v => { setLogLevel(v); markChanged(); }}
            options={[
              { value: 'debug', label: t('config.debug') }, { value: 'info', label: t('config.info') },
              { value: 'warn', label: t('config.warn') }, { value: 'error', label: t('config.error') },
            ]} />
        </SettingRow>
      </div>
    </div>
  );

  const SecurityCard = () => (
    <div class="card" style="padding:28px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">{highlight(t('config.security'))}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">{t('config.securityDesc')}</p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SettingRow label={t('config.adminPassword')} tooltip="Password for dashboard login. Leave empty to disable auth." unit="">
          <input id="cfg-password" type="password" value={password} class="form-input" placeholder={t('config.emptyNoAuth')}
            onInput={e => { setPassword((e.target as HTMLInputElement).value); markChanged(); }} />
        </SettingRow>
        <SettingRow label={t('config.rateLimit')} tooltip="Max requests per minute per IP. 0 = unlimited." unit="RPM">
          <input id="cfg-ratelimit" type="number" value={rateLimit} class="form-input" placeholder={t('config.unlimited')}
            onInput={e => { setRateLimit(parseInt((e.target as HTMLInputElement).value) || 0); markChanged(); }} />
        </SettingRow>
        <div class="flex items-end" style="padding-bottom:4px">
          <label class="flex items-center gap-2 text-sm cursor-pointer" style="color:var(--color-text)">
            <input type="checkbox" checked={trustProxy} class="checkbox-custom"
              onChange={e => { setTrustProxy((e.target as HTMLInputElement).checked); markChanged(); }} />
            {t('config.trustProxy')}
          </label>
        </div>
      </div>
    </div>
  );

  const TimeoutsCard = () => (
    <div class="card" style="padding:28px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">{highlight(t('config.timeouts'))}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">{t('config.timeoutsDesc')}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <SettingRow label={t('config.streamTimeout')} tooltip="Maximum duration for a streaming response." unit="ms">
          <input id="cfg-streamto" type="number" value={streamTimeout} class="form-input" placeholder="120000"
            onInput={e => { setStreamTimeout(parseInt((e.target as HTMLInputElement).value) || 120000); markChanged(); }} />
        </SettingRow>
        <SettingRow label={t('config.idleTimeout')} tooltip="Timeout when no data is received during streaming." unit="ms">
          <input id="cfg-idleto" type="number" value={streamIdleTimeout} class="form-input" placeholder="30000"
            onInput={e => { setStreamIdleTimeout(parseInt((e.target as HTMLInputElement).value) || 30000); markChanged(); }} />
        </SettingRow>
        <SettingRow label={t('config.maxResponse')} tooltip="Maximum response body size. 0 = unlimited." unit="bytes">
          <input id="cfg-maxresp" type="number" value={maxResponseBytes} class="form-input" placeholder={t('config.unlimited')}
            onInput={e => { setMaxResponseBytes(parseInt((e.target as HTMLInputElement).value) || 0); markChanged(); }} />
        </SettingRow>
      </div>
    </div>
  );

  const KiroCard = () => (
    <div class="card" style="padding:28px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">{highlight(t('config.kiroOAuth'))}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">{t('config.kiroDesc')}</p>
      {kiroProviders.length === 0 ? (
        <p style="font-size:14px;color:var(--color-text-dim)">No Kiro OAuth providers configured</p>
      ) : (
        kiroProviders.map(kp => {
          const status = oauthStatuses[kp.id];
          return (
            <div
              key={kp.id}
              style="padding:20px;border-radius:12px;background:var(--color-bg);border:1px solid var(--color-border);margin-bottom:12px"
            >
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <span style="font-size:14px;font-weight:600;color:var(--color-text)">{kp.name}</span>
                <div style="display:flex;align-items:center;gap:8px">
                  <span style={`display:inline-block;width:10px;height:10px;border-radius:50%;background:${status?.valid ? 'var(--color-success)' : status ? 'var(--color-danger)' : 'var(--color-text-muted)'}`} />
                  <span style="font-size:13px;color:var(--color-text)">
                    {status ? (status.valid ? t('config.valid') : t('config.expired')) : t('config.notChecked')}
                  </span>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px">
                {status?.authMethod && <span style="font-size:13px;color:var(--color-text-dim)">Method: {status.authMethod}</span>}
                {status?.expiresAt && <span style="font-size:13px;color:var(--color-text-dim)">Expires: {new Date(status.expiresAt).toLocaleString()}</span>}
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:13px;color:var(--color-text-dim)">Token Refresh:</span>
                  <input
                    id={`cfg-refresh-${kp.id}`}
                    type="number"
                    value={tokenRefresh}
                    class="form-input"
                    placeholder="30"
                    style="width:80px"
                    onInput={e => { setTokenRefresh(parseInt((e.target as HTMLInputElement).value) || 30); markChanged(); }}
                  />
                  <span style="font-size:13px;color:var(--color-text-dim)">min</span>
                </div>
                <div style="display:flex;gap:8px">
                  <button
                    onClick={async () => {
                      try {
                        const s = await getKiroAuthStatus(kp.config.options?.credsPath as string);
                        setOauthStatuses(prev => ({ ...prev, [kp.id]: s }));
                      } catch {
                        setOauthStatuses(prev => ({ ...prev, [kp.id]: { valid: false } }));
                      }
                    }}
                    class="btn btn-ghost"
                  >
                    {t('config.check')}
                  </button>
                  <button
                    onClick={() => handleRefreshProviderOAuth(kp.id)}
                    disabled={refreshingOAuth === kp.id}
                    class="btn btn-primary"
                  >
                    {refreshingOAuth === kp.id ? t('config.refreshing') : t('config.refreshToken')}
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  const CorsCard = () => (
    <div class="card" style="padding:28px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">{highlight(t('config.corsOrigins'))}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">{t('config.corsDesc')}</p>
      <textarea value={corsOrigins} rows={4} class="form-input font-mono" style="resize:vertical"
        onInput={e => { setCorsOrigins((e.target as HTMLTextAreaElement).value); markChanged(); }}
        placeholder="*&#10;https://example.com" />
    </div>
  );

  const AdvancedCard = () => (
    <div class="card" style="padding:28px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:6px">{highlight(t('config.advancedSection'))}</h3>
      <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:18px">{t('config.jsonDesc')}</p>
      <div class="flex items-center gap-2 mb-3">
        <button onClick={handleImport} class="btn btn-ghost" style="height:32px;font-size:13px">{t('config.importFile')}</button>
        <button onClick={handleExport} class="btn btn-ghost" style="height:32px;font-size:13px">{t('config.export')}</button>
        <button onClick={handleReset} class="btn btn-ghost" style="height:32px;font-size:13px">{t('config.reset')}</button>
        <button onClick={handleFormat} class="btn btn-ghost" style="height:32px;font-size:13px">{t('config.format')}</button>
        <span class="text-xs ml-auto font-medium" style={jsonValid ? 'color:var(--color-success)' : 'color:var(--color-danger)'}>
          {jsonValid ? t('config.validJson') : t('config.invalidJson')}
        </span>
      </div>
      <textarea
        value={jsonText}
        class="form-input font-mono"
        style="resize:vertical;line-height:1.6;tab-size:2;overflow:auto;min-height:400px;padding:16px;font-size:13px;width:100%;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border)"
        onInput={e => handleJsonChange((e.target as HTMLTextAreaElement).value)}
        spellcheck={false}
      />
    </div>
  );

  const visibleCards = useMemo(() => {
    const cards: { key: Section; el: preact.VNode }[] = [];
    if (serverMatch) cards.push({ key: 'server', el: <ServerCard /> });
    if (securityMatch) cards.push({ key: 'security', el: <SecurityCard /> });
    if (timeoutsMatch) cards.push({ key: 'timeouts', el: <TimeoutsCard /> });
    if (kiroMatch) cards.push({ key: 'kiro', el: <KiroCard /> });
    if (corsMatch) cards.push({ key: 'cors', el: <CorsCard /> });
    cards.push({ key: 'advanced', el: <AdvancedCard /> });
    return cards;
  }, [searchLower, port, host, logLevel, password, rateLimit, trustProxy, streamTimeout, streamIdleTimeout, maxResponseBytes, tokenRefresh, corsOrigins, jsonText, jsonValid, oauthStatuses, refreshingOAuth, kiroProviders]);

  return (
    <div style="display:flex;gap:40px;align-items:flex-start">
      <ConfirmDialog
        open={showUnsaved}
        title={t('config.unsavedTitle')}
        message={t('config.unsavedDesc')}
        onConfirm={confirmLeave}
        onCancel={() => { setShowUnsaved(false); setPendingSection(null); }}
      />

      {/* Sidebar */}
      <div
        class="hidden sm:flex flex-col"
        style="width:220px;flex-shrink:0;position:sticky;top:0;align-self:flex-start;padding:16px;border-radius:var(--radius-lg);background:var(--color-surface);border:1px solid var(--color-border);box-shadow:var(--shadow-card)"
      >
        <div style="margin-bottom:12px">
          <input
            type="text"
            value={search}
            onInput={e => setSearch((e.target as HTMLInputElement).value)}
            placeholder={t('config.search')}
            class="form-input"
            style="font-size:13px;padding:6px 10px;height:34px"
          />
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          {sections.map(sec => (
            <button
              key={sec.key}
              onClick={() => switchSection(sec.key)}
              class={`nav-item text-sm !py-2.5 ${activeSection === sec.key ? 'nav-item-active' : ''}`}
              style="width:100%;border:none;border-radius:10px;margin-bottom:4px;border-right:none"
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style="flex:1;min-width:0">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h2 class="section-title">{t('config.title')}</h2>
            <p class="section-subtitle">
              {activeSection === 'advanced' ? t('config.jsonDesc') : t('config.formDesc')}
              {hasChanges && <span style="margin-left:8px;color:var(--color-warning);font-weight:600">{t('config.unsaved')}</span>}
            </p>
          </div>
          <button onClick={handleSave} disabled={saving || !hasChanges || (activeSection === 'advanced' && !jsonValid)} class="btn btn-primary">
            {saving ? t('config.saving') : t('config.save')}
          </button>
        </div>

        {/* Mobile search */}
        <div class="sm:hidden mb-4">
          <input
            type="text"
            value={search}
            onInput={e => setSearch((e.target as HTMLInputElement).value)}
            placeholder={t('config.search')}
            class="form-input"
            style="font-size:13px;padding:6px 10px;height:34px"
          />
        </div>

        {/* Mobile section tabs */}
        <div class="sm:hidden flex gap-1 mb-4 overflow-x-auto pb-1">
          {sections.map(sec => (
            <button
              key={sec.key}
              onClick={() => switchSection(sec.key)}
              class="text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-colors"
              style={activeSection === sec.key
                ? 'background:var(--color-primary);color:#fff'
                : 'color:var(--color-text);background:var(--color-bg);border:1px solid var(--color-border)'
              }
            >
              {sec.label}
            </button>
          ))}
        </div>

        {searchLower ? (
          <div style="display:flex;flex-direction:column;gap:32px">
            {visibleCards.map(c => c.el)}
          </div>
        ) : (
          <div style="display:flex;flex-direction:column;gap:32px">
            {activeSection === 'server' && <ServerCard />}
            {activeSection === 'security' && <SecurityCard />}
            {activeSection === 'timeouts' && <TimeoutsCard />}
            {activeSection === 'kiro' && <KiroCard />}
            {activeSection === 'cors' && <CorsCard />}
            {activeSection === 'advanced' && <AdvancedCard />}
          </div>
        )}
      </div>
    </div>
  );
}
