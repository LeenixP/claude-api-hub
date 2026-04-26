import { useMemo } from 'preact/hooks';
import type { TokenStats, GatewayConfig } from '../../types.js';
import { formatTokens } from '../../lib/utils.js';
import { useLocale } from '../../lib/i18n.js';

interface ProviderTokenBarsProps {
  tokenStats: TokenStats | null;
  config?: GatewayConfig | null;
}

const MAX_SHOWN = 5;

interface RowData {
  provider: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  pct: number;
  promptPct: number;
  isEmpty: boolean;
  isOther?: boolean;
}

export function ProviderTokenBars({ tokenStats, config }: ProviderTokenBarsProps) {
  const { t } = useLocale();

  const rows = useMemo(() => {
    const byProvider = tokenStats?.byProvider || [];
    const total = byProvider.reduce((s, p) => s + p.totalTokens, 0) || 1;

    const tokenMap = new Map(byProvider.map(p => [p.provider, p]));

    const configuredProviders = config?.providers
      ? Object.entries(config.providers)
          .filter(([, p]) => p.enabled !== false)
          .map(([, p]) => p.name || '')
          .filter(Boolean)
      : [];

    const allProviderNames = Array.from(new Set([
      ...configuredProviders,
      ...byProvider.map(p => p.provider),
    ]));

    const allRows: RowData[] = allProviderNames.map(name => {
      const data = tokenMap.get(name);
      if (data) {
        const promptPct = data.totalTokens > 0 ? Math.round((data.promptTokens / data.totalTokens) * 100) : 0;
        return {
          provider: name,
          totalTokens: data.totalTokens,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          pct: Math.round((data.totalTokens / total) * 100),
          promptPct,
          isEmpty: false,
        };
      }
      return {
        provider: name,
        totalTokens: 0,
        promptTokens: 0,
        completionTokens: 0,
        pct: 0,
        promptPct: 0,
        isEmpty: true,
      };
    });

    allRows.sort((a, b) => b.totalTokens - a.totalTokens);

    if (allRows.length <= MAX_SHOWN) return allRows;

    const top = allRows.slice(0, MAX_SHOWN);
    const other = allRows.slice(MAX_SHOWN);
    const otherTotal = other.reduce((s, r) => s + r.totalTokens, 0);
    const otherPrompt = other.reduce((s, r) => s + r.promptTokens, 0);
    const otherCompletion = other.reduce((s, r) => s + r.completionTokens, 0);
    const otherPct = Math.round((otherTotal / total) * 100);

    top.push({
      provider: `${t('modelDetail.other')} (${other.length})`,
      totalTokens: otherTotal,
      promptTokens: otherPrompt,
      completionTokens: otherCompletion,
      pct: otherPct,
      promptPct: otherTotal > 0 ? Math.round((otherPrompt / otherTotal) * 100) : 0,
      isEmpty: false,
      isOther: true,
    });

    return top;
  }, [tokenStats, config]);

  if (!tokenStats || rows.every(r => r.isEmpty)) {
    return (
      <div class="card" style="padding:20px">
        <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
          {t('token.byProvider')}
        </div>
        <div style="font-size:12px;color:var(--color-text-muted)">{t('token.noData')}</div>
      </div>
    );
  }

  return (
    <div class="card" style="padding:20px;display:flex;flex-direction:column">
      <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
        {t('token.byProvider')}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        {rows.filter(r => r.provider).map((r, i) => (
          <div key={i}>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style={`font-size:12px;color:var(--color-text);font-weight:${r.isOther ? '400' : '500'}`}>{r.provider}</span>
              {!r.isEmpty && (
                <span style="font-size:11px;color:var(--color-text-muted)">{formatTokens(r.totalTokens)} ({r.pct}%)</span>
              )}
            </div>
            <div style="height:8px;border-radius:4px;background:var(--color-bg);overflow:hidden;display:flex">
              {!r.isEmpty ? (
                <>
                  <div style={`height:100%;background:var(${r.isOther ? '--color-text-muted' : '--color-primary'});border-radius:4px 0 0 4px;width:${r.promptPct}%`} />
                  <div style={`height:100%;background:var(--color-success);border-radius:0 4px 4px 0;width:${100 - r.promptPct}%`} />
                </>
              ) : (
                <div style="height:100%;width:100%;background:var(--color-surface-hover);border-radius:4px" />
              )}
            </div>
            {!r.isEmpty && (
              <div style="display:flex;gap:8px;margin-top:2px;font-size:10px;color:var(--color-text-muted)">
                <span>{t('stats.promptTokens')}: {formatTokens(r.promptTokens)}</span>
                <span>{t('stats.completionTokens')}: {formatTokens(r.completionTokens)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
