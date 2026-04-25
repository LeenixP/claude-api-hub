import { useState, useCallback } from 'preact/hooks';
import type { ProviderConfig } from '../../types.js';
import { Badge } from '../common/Badge.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';
import { useLocale } from '../../lib/i18n.js';
import { formatTokens } from '../../lib/utils.js';

interface ProviderCardProps {
  id: string;
  config: ProviderConfig;
  fetchedModels: string[];
  externalTestResult: { success: boolean; error?: string } | null;
  testDisabled: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onTest: (id: string) => Promise<{ success: boolean; error?: string }>;
  lastUsedTime?: string;
  usageStats?: { totalTokens: number; promptTokens: number; completionTokens: number; requestCount: number } | null;
}

export function ProviderCard({ id, config, fetchedModels, externalTestResult, testDisabled, onEdit, onDelete, onTest, lastUsedTime, usageStats }: ProviderCardProps) {
  const { t } = useLocale();
  const [testing, setTesting] = useState(false);
  const [localTestResult, setLocalTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [showDelete, setShowDelete] = useState(false);

  const testResult = localTestResult || externalTestResult;

  const handleTest = useCallback(async () => {
    setTesting(true); setLocalTestResult(null);
    try { setLocalTestResult(await onTest(id)); }
    catch { setLocalTestResult({ success: false, error: 'Test failed' }); }
    finally { setTesting(false); }
  }, [id, onTest]);

  const protocol = config.providerType === 'kiro' ? 'oauth'
    : config.authMode === 'openai' ? 'openai'
    : config.passthrough ? 'anthropic'
    : config.authMode || 'anthropic';
  const protocolVariant = protocol === 'openai' ? 'openai' : protocol === 'oauth' ? 'oauth' : 'anthropic';

  return (
    <>
      <div class="card card-interactive">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap">
            <h4 class="truncate" style="font-size:16px;font-weight:700;color:var(--color-text)">{config.name || id}</h4>
            {testResult && (
              <span style={`display:inline-flex;align-items:center;padding:4px 12px;border-radius:9999px;font-size:12px;font-weight:600;flex-shrink:0;${testResult.success
                ? 'color:var(--color-success);background:rgba(48,164,108,0.15);border:1px solid rgba(48,164,108,0.25)'
                : 'color:var(--color-danger);background:rgba(255,82,82,0.12);border:1px solid rgba(255,82,82,0.2)'}`}>
                {testResult.success ? t('provider.healthy') : t('provider.failed')}
              </span>
            )}
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:12px">
            <Badge variant={config.enabled ? 'on' : 'off'}>{config.enabled ? t('provider.on') : t('provider.off')}</Badge>
            <Badge variant={protocolVariant} />
          </div>
        </div>
        {testResult && !testResult.success && testResult.error && (
          <div style="margin-bottom:16px;padding:10px 14px;border-radius:10px;font-size:13px;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.15);color:var(--color-danger);word-break:break-all">
            {testResult.error}
          </div>
        )}

        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--color-text-dim)">
            <svg style="flex-shrink:0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span class="truncate" title={config.baseUrl}>{config.baseUrl}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--color-text-dim)">
            <svg style="flex-shrink:0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span>{t('provider.default', { model: config.defaultModel || '—' })}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--color-text-dim)">
            <svg style="flex-shrink:0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{config.apiKey ? t('provider.apiKeyConfigured') : t('provider.noApiKey')}</span>
          </div>
          {lastUsedTime && (
            <div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--color-text-dim)">
              <svg style="flex-shrink:0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{t('provider.lastUsed', { time: lastUsedTime })}</span>
            </div>
          )}
        </div>

        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
          {(fetchedModels.length > 0 ? fetchedModels : config.models).slice(0, 5).map(m => (
            <span key={m} class="tag">{m}</span>
          ))}
          {config.models.length > 5 && (
            <span class="tag" style="color:var(--color-primary)">+{config.models.length - 5}</span>
          )}
        </div>

        <div style="margin-bottom:16px;padding:12px 14px;border-radius:10px;background:var(--color-bg)">
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px">{t('provider.totalTokens')}</div>
              <div style="font-size:13px;font-weight:700;color:var(--color-text);font-family:monospace">{formatTokens(usageStats?.totalTokens || 0)}</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px">{t('provider.reqCount')}</div>
              <div style="font-size:13px;font-weight:700;color:var(--color-text);font-family:monospace">{formatTokens(usageStats?.requestCount || 0)}</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px">{t('provider.inputTokens')}</div>
              <div style="font-size:13px;font-weight:700;color:var(--color-text);font-family:monospace">{formatTokens(usageStats?.promptTokens || 0)}</div>
            </div>
            <div>
              <div style="font-size:10px;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.5px">{t('provider.outputTokens')}</div>
              <div style="font-size:13px;font-weight:700;color:var(--color-text);font-family:monospace">{formatTokens(usageStats?.completionTokens || 0)}</div>
            </div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:10px;border-top:1px solid var(--color-border);padding-top:16px">
          <button onClick={handleTest} disabled={testing || testDisabled} class="btn btn-ghost"
            aria-label={testing ? t('provider.testing') : t('provider.test')}>
            {testing ? (
              <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
            )}
            {testing ? t('provider.testing') : t('provider.test')}
          </button>
          <button onClick={() => onEdit(id)} class="btn btn-accent"
            aria-label={t('provider.edit')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            {t('provider.edit')}
          </button>
          <button onClick={() => setShowDelete(true)} class="btn btn-danger" style="margin-left:auto"
            aria-label={t('provider.delete')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
            {t('provider.delete')}
          </button>
        </div>
      </div>

      <ConfirmDialog open={showDelete}
        onConfirm={() => { setShowDelete(false); onDelete(id); }}
        onCancel={() => setShowDelete(false)}
        title={t('provider.deleteTitle')}
        message={t('provider.deleteConfirm', { name: config.name || id })}
        danger confirmLabel={t('provider.delete')} />
    </>
  );
}
