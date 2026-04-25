import { useMemo } from 'preact/hooks';
import type { TokenStats, GatewayConfig } from '../../types.js';
import { formatTokens } from '../../lib/utils.js';
import { useLocale } from '../../lib/i18n.js';

interface TopModelsProps {
  tokenStats: TokenStats | null;
  config?: GatewayConfig | null;
}

export function TopModels({ tokenStats, config }: TopModelsProps) {
  const { t } = useLocale();

  const modelToProvider = useMemo(() => {
    const map = new Map<string, string>();
    if (!config) return map;
    for (const [, pc] of Object.entries(config.providers)) {
      const label = pc.name || '';
      for (const m of pc.models || []) {
        map.set(m, label);
      }
    }
    return map;
  }, [config]);

  const topModels = useMemo(() => {
    if (!tokenStats?.byModel?.length) return [];
    return [...tokenStats.byModel]
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 5);
  }, [tokenStats]);

  const maxTokens = useMemo(() => {
    if (!topModels.length) return 0;
    return Math.max(...topModels.map(m => m.totalTokens), 1);
  }, [topModels]);

  if (!topModels.length) {
    return (
      <div class="card" style="padding:24px">
        <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:16px;display:flex;align-items:center;gap:8px">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
          {/* i18n: token.topModels */}
          Top Models
        </h3>
        <div style="text-align:center;padding:20px;color:var(--color-text-muted);font-size:13px">{t('token.noData')}</div>
      </div>
    );
  }

  return (
    <div class="card" style="padding:24px">
      <h3 style="font-size:15px;font-weight:700;color:var(--color-text);margin-bottom:16px;display:flex;align-items:center;gap:8px">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
        {/* i18n: token.topModels */}
        Top Models
      </h3>
      <div style="display:flex;flex-direction:column;gap:14px">
        {topModels.map(model => (
          <div key={model.model}>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <span style="font-size:13px;font-weight:600;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%" title={`${modelToProvider.get(model.model) || ''}/${model.model}`}>
                {(() => { const pv = modelToProvider.get(model.model); return pv ? <span style="color:var(--color-text-muted);font-weight:500">{pv}/</span> : null; })()}{model.model}
              </span>
              <span style="font-size:12px;font-family:monospace;color:var(--color-text-muted)">
                {formatTokens(model.totalTokens)}
              </span>
            </div>
            <div style="height:6px;border-radius:3px;background:var(--color-bg);overflow:hidden">
              <div
                style={`height:100%;border-radius:3px;background:linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary), white 30%));width:${Math.max((model.totalTokens / maxTokens) * 100, 2)}%;transition:width 0.6s ease`}
              />
            </div>
            <div style="display:flex;gap:12px;margin-top:4px">
              <span style="font-size:11px;color:var(--color-text-muted)">{t('stats.promptTokens')}: {formatTokens(model.promptTokens)}</span>
              <span style="font-size:11px;color:var(--color-text-muted)">{t('stats.completionTokens')}: {formatTokens(model.completionTokens)}</span>
              <span style="font-size:11px;color:var(--color-text-muted)">{model.requestCount} req</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
