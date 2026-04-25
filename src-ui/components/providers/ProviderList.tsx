import type { GatewayConfig, LogEntry, TokenStats } from '../../types.js';
import { ProviderCard } from './ProviderCard.js';
import { relativeTime } from '../../lib/utils.js';
import { useMemo } from 'preact/hooks';
import { useLocale } from '../../lib/i18n.js';

interface ProviderListProps {
  config: GatewayConfig | null;
  fetchedModels: Record<string, string[]>;
  testAllResults: Record<string, { success: boolean; error?: string }>;
  testingAll: boolean;
  logs: LogEntry[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<{ success: boolean; error?: string }>;
  onAdd: () => void;
  onTestAll: () => void;
  tokenStats?: TokenStats | null;
}

export function ProviderList({ config, fetchedModels, testAllResults, testingAll, logs, onEdit, onDelete, onTest, onAdd, onTestAll, tokenStats }: ProviderListProps) {
  const { t } = useLocale();
  const providers = config ? Object.entries(config.providers) : [];

  const lastUsedMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const log of logs) {
      const rel = relativeTime(log.time);
      if (rel && (!map[log.provider])) {
        map[log.provider] = rel;
      }
    }
    return map;
  }, [logs]);

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="section-title">{t('provider.title')}</h2>
          <p class="section-subtitle">
            {t('provider.configured', { count: String(providers.length) })}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            onClick={onTestAll}
            disabled={testingAll}
            class="btn btn-ghost"
          >
            {testingAll ? (
              <svg class="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            )}
            {testingAll ? t('provider.testingAll') : t('provider.testAll')}
          </button>
          <button
            onClick={onAdd}
            class="btn btn-primary"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('provider.addProvider')}
          </button>
        </div>
      </div>

      {providers.length === 0 ? (
        <div class="rounded-lg p-8 text-center" style="background:var(--color-surface);border:1px solid var(--color-border)"
        >
          <div class="empty-state-icon" style="background:var(--color-bg)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h3 class="text-sm font-medium mb-1" style="color:var(--color-text-dim)">{t('provider.noProviders')}</h3>
          <p class="text-xs mb-4" style="color:var(--color-text-muted)">{t('provider.noProvidersDesc')}</p>
          <button
            onClick={onAdd}
            class="px-4 py-2 rounded-lg text-xs font-medium text-white"
            style="background:var(--color-primary)"
          >
            {t('provider.addProvider')}
          </button>
        </div>
      ) : (
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {providers.map(([id, cfg]) => {
            const stats = tokenStats?.byProvider?.find(s => s.provider === id || s.provider === cfg.name) || null;
            return (
              <ProviderCard
                key={id}
                id={id}
                config={cfg}
                fetchedModels={fetchedModels[id] || []}
                externalTestResult={testAllResults[id] || null}
                testDisabled={testingAll}
                onEdit={onEdit}
                onDelete={onDelete}
                onTest={onTest}
                lastUsedTime={lastUsedMap[id]}
                usageStats={stats}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
