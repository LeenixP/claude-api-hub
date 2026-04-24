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
import { GuidePage } from './components/guide/GuidePage.js';
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
  ['guide', 'Guide', '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>'],
];

export function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'system';
  });
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#', '');
    return (['dashboard', 'providers', 'aliases', 'logs', 'config', 'guide'] as Page[]).includes(hash as Page)
      ? (hash as Page) : 'dashboard';
  });
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderConfig, setEditProviderConfig] = useState<ProviderConfig | null>(null);
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
  const { logs, connected } = useSSE();
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
      if ((['dashboard', 'providers', 'aliases', 'logs', 'config', 'guide'] as Page[]).includes(hash as Page)) {
        setPage(hash as Page);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/check');
        const data = await res.json();
        if (data.required && !adminToken) { setAuthRequired(true); return; }
        const cfgRes = await fetch('/api/config', {
          headers: adminToken ? { 'x-admin-token': adminToken } : {},
        });
        if (cfgRes.ok) setConfig(await cfgRes.json());
        else if (cfgRes.status === 401) setAuthRequired(true);
      } catch { /* will retry */ }
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
  const handleLogin = useCallback(async (e: Event) => {
    e.preventDefault(); setLoginLoading(true); setLoginError('');
    try {
      const data = await (await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      })).json();
      if (data.success && data.token) {
        localStorage.setItem('adminToken', data.token); setAdminToken(data.token); setAuthRequired(false);
      } else setLoginError(data.message || 'Login failed');
    } catch { setLoginError('Connection failed'); }
    finally { setLoginLoading(false); }
  }, [loginPassword]);

  if (authRequired && !config) {
    return (
      <div class="flex items-center justify-center min-h-screen" style="background:linear-gradient(135deg,#0B0E11 0%,#141820 50%,#0B0E11 100%)">
        <form onSubmit={handleLogin} style="width:400px;padding:40px;border-radius:16px;background:var(--color-surface);border:1px solid var(--color-border-strong);box-shadow:var(--shadow-card)">
          <div style="display:flex;justify-content:center;margin-bottom:28px">
            <div style="width:56px;height:56px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:#fff">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
          </div>
          <h1 style="font-size:24px;font-weight:700;text-align:center;color:var(--color-text);margin-bottom:6px">API Hub</h1>
          <p style="font-size:14px;text-align:center;color:var(--color-text-muted);margin-bottom:28px">Enter password to continue</p>
          {loginError && (
            <div style="margin-bottom:16px;padding:12px 16px;border-radius:10px;font-size:13px;background:rgba(255,50,50,0.1);color:var(--color-danger);border:1px solid rgba(255,50,50,0.2)">
              {loginError}
            </div>
          )}
          <input type="password" value={loginPassword} autofocus
            onInput={(e: Event) => setLoginPassword((e.target as HTMLInputElement).value)}
            placeholder="Password" class="form-input" style="margin-bottom:20px" />
          <button type="submit" disabled={loginLoading || !loginPassword}
            class="btn btn-primary"
            style={`width:100%;height:44px;font-size:15px;opacity:${loginLoading || !loginPassword ? '0.5' : '1'}`}>
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
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
            <div style="font-size:12px;color:var(--color-text-muted)">v{config?.version || '...'}</div>
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
        <div style="padding:16px 20px;border-top:1px solid var(--color-border)">
          <button onClick={cycleTheme} class="btn btn-ghost" style="width:100%;justify-content:center">
            {theme === 'system' ? 'System Theme' : theme === 'dark' ? 'Dark Theme' : 'Light Theme'}
          </button>
        </div>
      </nav>

      <nav class="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around" style="padding:10px 0;background:var(--color-surface);border-top:1px solid var(--color-border)">
        {NAV.map(([id, label, iconPath]) => (
          <button key={id} onClick={() => navigate(id)}
            style={`display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 12px;font-size:11px;font-weight:500;background:none;border:none;cursor:pointer;color:${page === id ? 'var(--color-primary)' : 'var(--color-text-muted)'}`}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: iconPath }} />
            <span>{label}</span>
          </button>
        ))}
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
        {page === 'logs' && <LogPanel logs={logs} connected={connected} />}
        {page === 'config' && (
          <div>
            <ConfigEditor config={config} onSaved={refreshConfig} />
          </div>
        )}
        {page === 'guide' && <GuidePage />}
      </main>

      <ToastContainer />
    </div>
  );
}
