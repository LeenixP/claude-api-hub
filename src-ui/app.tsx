import { useState, useCallback, useEffect } from 'preact/hooks';
import type { Page } from './types.js';
import { StatsGrid } from './components/dashboard/StatsGrid.js';
import { TrendChart } from './components/dashboard/TrendChart.js';
import { TokenChart } from './components/dashboard/TokenChart.js';
import { TokenHeatmap } from './components/dashboard/TokenHeatmap.js';
import { ProviderTokenBars } from './components/dashboard/ProviderTokenBars.js';
import { QuickStart } from './components/dashboard/QuickStart.js';
import { SystemInfo } from './components/dashboard/SystemInfo.js';
import { TopModels } from './components/dashboard/TopModels.js';
import { ModelDetailsTable } from './components/dashboard/ModelDetailsTable.js';
import { ProviderList } from './components/providers/ProviderList.js';
import { ProviderModal } from './components/providers/ProviderModal.js';
import { AliasMapping } from './components/aliases/AliasMapping.js';
import { LogPanel } from './components/logs/LogPanel.js';
import { ConfigEditor } from './components/config/ConfigEditor.js';

import { ToastContainer } from './components/common/Toast.js';
import { LoginScreen } from './components/LoginScreen.js';
import { Sidebar } from './components/Sidebar.js';
import { MobileNav } from './components/MobileNav.js';
import { useSSE } from './hooks/useSSE.js';
import { useApi } from './hooks/useApi.js';
import { useAuth } from './hooks/useAuth.js';
import { testProvider, deleteProvider } from './lib/api.js';
import type { Stats, ProviderConfig, TokenStats } from './types.js';
import { LocaleContext, useLocaleProvider, useLocale } from './lib/i18n.js';

export function App() {
  const localeValue = useLocaleProvider();
  return (
    <LocaleContext.Provider value={localeValue}>
      <AppContent />
    </LocaleContext.Provider>
  );
}

function AppContent() {
  const { t } = useLocale();
  const { authRequired, adminToken, config, loadError, refreshConfig, setAdminToken, logout } = useAuth();
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.replace('#', '');
    return (['dashboard', 'providers', 'aliases', 'logs', 'config'] as Page[]).includes(hash as Page)
      ? (hash as Page) : 'dashboard';
  });
  const [providerModalOpen, setProviderModalOpen] = useState(false);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [editProviderConfig, setEditProviderConfig] = useState<ProviderConfig | null>(null);
  const [fetchedModels, setFetchedModels] = useState<Record<string, string[]>>({});
  const [testAllResults, setTestAllResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { logs, connected, clearLogs } = useSSE(adminToken);
  const { data: stats } = useApi<Stats>('/api/stats', { immediate: true, pollIntervalMs: 5000 });
  const { data: tokenStats } = useApi<TokenStats>('/api/token-stats', { immediate: true, pollIntervalMs: 30000 });

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
      dashboard: t('app.dashboard'),
      providers: t('app.providers'),
      aliases: t('app.aliases'),
      logs: t('app.logs'),
      config: t('app.config'),
    };
    document.title = `${titles[page]} — API Hub`;
  }, [page, t]);

  useEffect(() => {
    const handler = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const navigate = useCallback((p: Page) => { setPage(p); window.location.hash = p; }, []);

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

  const handleTestProvider = useCallback(async (id: string) => {
    const res = await testProvider(id);
    setTestAllResults(prev => ({ ...prev, [id]: res }));
    return res;
  }, []);

  const handleTestAll = useCallback(async () => {
    if (!config || testingAll) return;
    setTestingAll(true);
    setTestAllResults({});
    const entries = Object.entries(config.providers);
    const results = await Promise.allSettled(
      entries.map(async ([id]) => {
        const res = await testProvider(id);
        setTestAllResults(prev => ({ ...prev, [id]: res }));
        return res;
      })
    );
    setTestingAll(false);
    const ok = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const fail = entries.length - ok;
    const { showToast } = await import('./components/common/Toast.js');
    showToast(t('app.testComplete', { ok: String(ok), fail: String(fail) }), fail > 0 ? 'error' : 'success');
  }, [config, testingAll]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProviderModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogin = useCallback((token: string, _config: Record<string, unknown> | null) => {
    setAdminToken(token);
    // The useAuth hook will re-run and update config when adminToken changes
  }, [setAdminToken]);

  if (authRequired && !config) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!config) {
    return (
      <div class="flex items-center justify-center min-h-screen" style="background:var(--color-bg);padding:32px">
        <div style="width:100%;max-width:1200px">
          <div style="display:flex;align-items:center;gap:16px;margin-bottom:32px">
            <div style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:var(--color-surface)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div>
              <div style="font-size:26px;font-weight:700;color:var(--color-text)">API Hub</div>
              <div style="font-size:14px;color:var(--color-text-dim)">{loadError || t('app.loading')}</div>
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
              <div style="font-weight:600;margin-bottom:8px">{t('app.connectionError')}</div>
              <div style="margin-bottom:12px;color:var(--color-text-dim)">{loadError}</div>
              <button onClick={() => { setAdminToken(t => t); }} class="btn btn-primary" style="height:32px;font-size:13px">{t('app.retry')}</button>
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
      <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[60] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--color-primary)] focus:text-white focus:font-medium" style="font-size:13px">
        {t('app.skipToContent')}
      </a>
      <Sidebar page={page} navigate={navigate} version={config.version} />
      <MobileNav page={page} navigate={navigate} />

      <main id="main-content" class="flex-1 pb-24 lg:pb-8 main-content" style="padding:32px;animation:fadeIn 0.25s ease">
        <style>{`
          @media (max-width: 1023px) {
            #main-content { padding: 16px !important; }
          }
        `}</style>
        {page === 'dashboard' && (
          <div>
            <h1 class="section-title" style="margin-bottom:28px">{t('app.dashboard')}</h1>
            <QuickStart config={config} />
            <SystemInfo />
            <StatsGrid logs={logs} stats={stats} />
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" style="margin-top:24px">
              <TrendChart logs={logs} rangeHours={6} />
              <TokenChart logs={logs} rangeHours={6} />
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6" style="margin-top:24px">
              <TokenHeatmap tokenStats={tokenStats} />
              <ProviderTokenBars tokenStats={tokenStats} config={config} />
              <TopModels tokenStats={tokenStats} config={config} />
            </div>
            <ModelDetailsTable tokenStats={tokenStats} config={config} />
          </div>
        )}
        {page === 'providers' && (
          <div>
            <ProviderList config={config} fetchedModels={fetchedModels} testAllResults={testAllResults} testingAll={testingAll}
              tokenStats={tokenStats}
              logs={logs}
              onEdit={handleEditProvider} onDelete={handleDeleteProvider}
              onTest={handleTestProvider} onAdd={handleAddProvider} onTestAll={handleTestAll} />
            <ProviderModal open={providerModalOpen} onClose={() => setProviderModalOpen(false)}
              onSaved={refreshConfig} editId={editProviderId} editConfig={editProviderConfig} />
          </div>
        )}
        {page === 'aliases' && (
          <div>
            <h1 class="section-title" style="margin-bottom:28px">{t('nav.aliases')}</h1>
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
        <button onClick={scrollToTop} class="scroll-top-btn" title="Scroll to top" aria-label="Scroll to top">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}

      <ToastContainer />
    </div>
  );
}
