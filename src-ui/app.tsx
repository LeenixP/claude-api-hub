import { useState, useCallback, useEffect } from 'preact/hooks';
import type { GatewayConfig, Theme, Page } from './types.js';
import { StatsGrid } from './components/dashboard/StatsGrid.js';
import { TrendChart } from './components/dashboard/TrendChart.js';
import { TokenChart } from './components/dashboard/TokenChart.js';
import { QuickStart } from './components/dashboard/QuickStart.js';
import { ProviderList } from './components/providers/ProviderList.js';
import { ProviderModal } from './components/providers/ProviderModal.js';
import { AliasMapping } from './components/aliases/AliasMapping.js';
import { LogPanel } from './components/logs/LogPanel.js';
import { ConfigEditor } from './components/config/ConfigEditor.js';
import { ToastContainer } from './components/common/Toast.js';
import { useSSE } from './hooks/useSSE.js';
import { useApi } from './hooks/useApi.js';
import { testProvider, deleteProvider, getConfig } from './lib/api.js';
import type { Stats, ProviderConfig } from './types.js';

const NAV: ReadonlyArray<readonly [string, string, string]> = [
  ['dashboard', 'Dashboard', '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'],
  ['providers', 'Providers', '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'],
  ['aliases', 'Aliases', '<path d="M16 3h5v5"/><line x1="21" y1="3" x2="14" y2="10"/><path d="M8 21H3v-5"/><line x1="3" y1="21" x2="10" y2="14"/>'],
  ['logs', 'Logs', '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'],
  ['config', 'Config', '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'],
];

export function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'system';
  });
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#', '');
    return (['dashboard', 'providers', 'aliases', 'logs', 'config'] as Page[]).includes(hash as Page)
      ? (hash as Page) : 'dashboard';
  });
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderConfig, setEditProviderConfig] = useState<ProviderConfig | null>(null);
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
  const { logs, connected, clearLogs } = useSSE();
  const { data: stats } = useApi<Stats>('/api/stats', { immediate: true });

  useEffect(() => {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.setAttribute('data-theme', resolved);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace('#', '');
      if ((['dashboard', 'providers', 'aliases', 'logs', 'config'] as Page[]).includes(hash as Page)) {
        setPage(hash as Page);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    const titles: Record<Page, string> = {
      dashboard: 'Dashboard',
      providers: 'Providers',
      aliases: 'Aliases',
      logs: 'Logs',
      config: 'Config',
    };
    document.title = `${titles[page]} — API Hub`;
  }, [page]);

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoadError(null);
        const res = await fetch('/api/auth/check');
        const data = await res.json();
        if (data.required && !adminToken) { setAuthRequired(true); return; }
        const cfgRes = await fetch('/api/config', {
          headers: adminToken ? { 'x-admin-token': adminToken } : {},
        });
        if (cfgRes.ok) { setConfig(await cfgRes.json()); setLoadError(null); }
        else if (cfgRes.status === 401) setAuthRequired(true);
        else setLoadError(`Config fetch failed: ${cfgRes.status}`);
      } catch (e) {
        setLoadError(`Network error: ${(e as Error).message || 'Cannot reach server'}`);
        setTimeout(() => setLoadError(l => l ? 'Retrying...' : null), 2000);
      }
    })();
  }, [adminToken]);

  useEffect(() => {
    const handler = () => { setAuthRequired(true); setConfig(null); };
    window.addEventListener('api:unauthorized', handler);
    return () => window.removeEventListener('api:unauthorized', handler);
  }, []);

  const navigate = useCallback((p: Page) => { setPage(p); window.location.hash = p; }, []);
  const cycleTheme = useCallback(() => {
    setTheme(t => t === 'system' ? 'dark' : t === 'dark' ? 'light' : 'system');
  }, []);
  const refreshConfig = useCallback(async () => {
    try { setConfig(await getConfig()); } catch { /* ignore */ }
  }, []);
  const handleAddProvider = useCallback(() => {
    setEditProviderId(null); setEditProviderConfig(null); setProviderModalOpen(true);
  }, []);
  const handleEditProvider = useCallback((id: string) => {
    if (!config) return;
    setEditProviderId(id); setEditProviderConfig(config.providers[id]); setProviderModalOpen(true);
  }, [config]);
  const handleDeleteProvider = useCallback(async (id: string) => {
    try { await deleteProvider(id); await refreshConfig(); } catch { /* ignore */ }
  }, [refreshConfig]);
  const [testAllResults, setTestAllResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [testingAll, setTestingAll] = useState(false);
  const handleTestProvider = useCallback(async (id: string) => {
    const res = await testProvider(id);
    setTestAllResults(prev => ({ ...prev, [id]: res }));
    return res;
  }, []);
  const handleTestAll = useCallback(async () => {
    if (!config || testingAll) return;
    setTestingAll(true);
    setTestAllResults({});
    let ok = 0; let fail = 0;
    for (const [id] of Object.entries(config.providers)) {
      try {
        const res = await testProvider(id);
        setTestAllResults(prev => ({ ...prev, [id]: res }));
        if (res.success) ok++; else fail++;
      } catch { fail++; }
    }
    setTestingAll(false);
    const { showToast } = await import('./components/common/Toast.js');
    showToast(`Test complete: ${ok} healthy, ${fail} failed`, fail > 0 ? 'error' : 'success');
  }, [config, testingAll]);

  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const handleLogin = useCallback(async (e: Event) => {
    e.preventDefault(); setLoginLoading(true); setLoginError('');
    try {
      const data = await (await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      })).json();
      if (data.success && data.token) {
        localStorage.setItem('adminToken', data.token);
        setAdminToken(data.token);
        setAuthRequired(false);
        const cfgRes = await fetch('/api/config', { headers: { 'x-admin-token': data.token } });
        if (cfgRes.ok) setConfig(await cfgRes.json());
      } else setLoginError(data.message || 'Login failed');
    } catch { setLoginError('Connection failed'); }
    finally { setLoginLoading(false); }
  }, [loginPassword]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal(v => !v);
      } else if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setProviderModalOpen(false);
      } else if (!isInput && e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key) - 1;
        const pages: Page[] = ['dashboard', 'providers', 'aliases', 'logs', 'config'];
        if (idx < pages.length) navigate(pages[idx]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

  if (authRequired && !config) {
    return (
      <div class="flex items-center justify-center min-h-screen" style="background:var(--color-bg)">
        <form onSubmit={handleLogin} style="width:400px;padding:40px;border-radius:16px;background:#ffffff;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
          <div style="display:flex;justify-content:center;margin-bottom:28px">
            <div style="width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:#fff">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
          </div>
          <h1 style="font-size:24px;font-weight:700;text-align:center;color:#1a1d23;margin-bottom:6px">API Hub</h1>
          <p style="font-size:14px;text-align:center;color:#6b7280;margin-bottom:28px">Enter password to continue</p>
          {loginError && (
            <div style="margin-bottom:16px;padding:12px 16px;border-radius:10px;font-size:13px;background:rgba(255,50,50,0.1);color:var(--color-danger);border:1px solid rgba(255,50,50,0.2)">
              {loginError}
            </div>
          )}
          <div style="position:relative;margin-bottom:20px">
            <input type={showLoginPassword ? 'text' : 'password'} value={loginPassword} autofocus
              onInput={(e: Event) => setLoginPassword((e.target as HTMLInputElement).value)}
              placeholder="Password" class="form-input" style="padding-right:40px;background:#f3f4f6;color:#1a1d23;border-color:#d1d5db" />
            <button type="button" onClick={() => setShowLoginPassword(v => !v)}
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9ca3af;padding:4px;display:flex;align-items:center"
              title={showLoginPassword ? 'Hide password' : 'Show password'}>
              {showLoginPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
          <button type="submit" disabled={loginLoading || !loginPassword}
            class="btn btn-primary"
            style={`width:100%;height:44px;font-size:15px;opacity:${loginLoading || !loginPassword ? '0.5' : '1'}`}>
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  if (!config) {
    return (
      <div class="flex items-center justify-center min-h-screen" style="background:var(--color-bg);padding:32px">
        <div style="width:100%;max-width:1200px">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px">
            <div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:#fff">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div>
              <div style="font-size:26px;font-weight:700;color:var(--color-text)">API Hub</div>
              <div style="font-size:14px;color:var(--color-text-dim)">{loadError || 'Loading...'}</div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;margin-bottom:32px">
            {[1,2,3,4].map(i => (
              <div key={i} class="skeleton-pulse" style="height:120px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;padding:24px">
                <div style="height:14px;width:60%;background:var(--color-surface-hover);border-radius:6px;margin-bottom:12px" />
                <div style="height:28px;width:40%;background:var(--color-surface-hover);border-radius:6px" />
              </div>
            ))}
          </div>
          {loadError && loadError !== 'Retrying...' && (
            <div style="margin-bottom:24px;padding:20px;border-radius:12px;background:rgba(255,82,82,0.1);border:1px solid rgba(255,82,82,0.25);color:var(--color-danger);font-size:14px">
              <div style="font-weight:600;margin-bottom:8px">Connection Error</div>
              <div style="margin-bottom:12px;color:var(--color-text-dim)">{loadError}</div>
              <button onClick={() => { setLoadError(null); setAdminToken(t => t); }} class="btn btn-primary" style="height:32px;font-size:13px">Retry</button>
            </div>
          )}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
            <div class="skeleton-pulse" style="height:300px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px" />
            <div class="skeleton-pulse" style="height:300px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div class="flex min-h-screen">
      <nav class="hidden lg:flex flex-col fixed h-screen" style="width:var(--sidebar-width);background:var(--color-surface);border-right:1px solid var(--color-border);z-index:50">
        <div style="padding:20px 24px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:14px">
          <div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:#fff;flex-shrink:0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </div>
          <div>
            <div style="font-size:16px;font-weight:700;color:var(--color-text);line-height:1.3">API Hub</div>
            <div style="font-size:12px;color:var(--color-text-muted);display:flex;align-items:center;gap:4px">
              v{config?.version || '...'}
              <a href="https://github.com/LeenixP/claude-api-hub/releases" target="_blank" rel="noopener noreferrer" style="color:var(--color-text-muted);display:inline-flex;align-items:center" title="View changelog">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            </div>
          </div>
        </div>
        <div style="flex:1;padding:12px">
          {NAV.map(([id, label, iconPath]) => (
            <button key={id} onClick={() => navigate(id)}
              class={`nav-item ${page === id ? 'nav-item-active' : ''}`}
              style="width:100%;border:none;border-radius:10px;margin-bottom:4px;border-right:none">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: iconPath }} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div style="padding:16px 20px;border-top:1px solid var(--color-border);display:flex;align-items:center;gap:8px">
          <button onClick={cycleTheme} class="btn btn-ghost" style="flex:1;justify-content:center">
            {theme === 'system' ? 'System Theme' : theme === 'dark' ? 'Dark Theme' : 'Light Theme'}
          </button>
          <button onClick={() => setShowShortcutsModal(true)}
            class="btn btn-ghost" style="width:36px;height:36px;padding:0;justify-content:center;flex-shrink:0"
            title="Keyboard Shortcuts">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
        </div>
      </nav>

      <nav class="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center" style="padding:10px 8px;background:var(--color-surface);border-top:1px solid var(--color-border)">
        {NAV.map(([id, label, iconPath]) => (
          <button key={id} onClick={() => navigate(id)}
            style={`display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 8px;font-size:11px;font-weight:500;background:none;border:none;cursor:pointer;color:${page === id ? 'var(--color-primary)' : 'var(--color-text-muted)'}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: iconPath }} />
            <span>{label}</span>
          </button>
        ))}
        <button onClick={() => setShowShortcutsModal(true)}
          style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 8px;font-size:10px;font-weight:500;background:none;border:none;cursor:pointer;color:var(--color-text-muted)"
          title="Keyboard Shortcuts">
          <span style="font-size:13px;font-weight:700">?</span>
          <span>Help</span>
        </button>
      </nav>

      <main class="flex-1 pb-24 lg:pb-8 main-content" style="padding:32px">
        {page === 'dashboard' && (
          <div>
            <h1 class="section-title" style="margin-bottom:28px">Dashboard</h1>
            <QuickStart config={config} />
            <StatsGrid logs={logs} stats={stats} />
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" style="margin-top:24px">
              <TrendChart logs={logs} rangeHours={6} />
              <TokenChart logs={logs} rangeHours={6} />
            </div>
          </div>
        )}
        {page === 'providers' && (
          <div>
            <ProviderList config={config} fetchedModels={fetchedModels} testAllResults={testAllResults} testingAll={testingAll}
              logs={logs}
              onEdit={handleEditProvider} onDelete={handleDeleteProvider}
              onTest={handleTestProvider} onAdd={handleAddProvider} onTestAll={handleTestAll} />
            <ProviderModal open={providerModalOpen} onClose={() => setProviderModalOpen(false)}
              onSaved={refreshConfig} editId={editProviderId} editConfig={editProviderConfig} />
          </div>
        )}
        {page === 'aliases' && (
          <div>
            <h1 class="section-title" style="margin-bottom:28px">Alias Mapping</h1>
            <AliasMapping config={config} onSaved={refreshConfig} />
          </div>
        )}
        {page === 'logs' && <LogPanel logs={logs} connected={connected} onClear={clearLogs} />}
        {page === 'config' && (
          <div>
            <ConfigEditor config={config} onSaved={refreshConfig} />
          </div>
        )}
      </main>

      {showScrollTop && (
        <button onClick={scrollToTop} class="scroll-top-btn" title="Scroll to top">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}

      {showShortcutsModal && (
        <div style="position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5)" onClick={() => setShowShortcutsModal(false)}>
          <div style="background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:var(--shadow-card-hover)" onClick={e => e.stopPropagation()}>
            <div class="flex items-center justify-between mb-6">
              <h2 style="font-size:18px;font-weight:700;color:var(--color-text)">Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcutsModal(false)} style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:4px">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:12px">
              {[
                ['?', 'Toggle this dialog'],
                ['1', 'Dashboard'],
                ['2', 'Providers'],
                ['3', 'Aliases'],
                ['4', 'Logs'],
                ['5', 'Config'],
                ['Esc', 'Close modals'],
              ].map(([key, desc]) => (
                <div key={key} style="display:flex;align-items:center;justify-content:space-between">
                  <kbd style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:28px;padding:0 8px;border-radius:6px;font-size:13px;font-weight:600;font-family:monospace;background:var(--color-bg);border:1px solid var(--color-border-strong);color:var(--color-text)">{key}</kbd>
                  <span style="font-size:14px;color:var(--color-text-dim)">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </div>
  );
}
