import { useMemo } from 'preact/hooks';
import type { TokenStats, GatewayConfig } from '../../types.js';
import { formatTokens } from '../../lib/utils.js';
import { useLocale } from '../../lib/i18n.js';

interface TopModelsProps {
  tokenStats: TokenStats | null;
  config?: GatewayConfig | null;
}

const MAX_SHOWN = 5;

interface ModelRow {
  provider: string;
  model: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
  isOther?: boolean;
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

  const rows = useMemo(() => {
    const byModel = tokenStats?.byModel || [];
    if (!byModel.length) return [];

    const sorted = [...byModel].sort((a, b) => b.totalTokens - a.totalTokens);

    if (sorted.length <= MAX_SHOWN) {
      return sorted.map(m => ({ ...m, isOther: false }));
    }

    const top = sorted.slice(0, MAX_SHOWN).map(m => ({ ...m, isOther: false }));
    const other = sorted.slice(MAX_SHOWN);
    const otherTotal = other.reduce((s, m) => s + m.totalTokens, 0);
    const otherPrompt = other.reduce((s, m) => s + m.promptTokens, 0);
    const otherCompletion = other.reduce((s, m) => s + m.completionTokens, 0);
    const otherReqCount = other.reduce((s, m) => s + m.requestCount, 0);

    top.push({
      provider: '',
      model: `${t('modelDetail.other')} (${other.length})`,
      totalTokens: otherTotal,
      promptTokens: otherPrompt,
      completionTokens: otherCompletion,
      requestCount: otherReqCount,
      isOther: true,
    });

    return top;
  }, [tokenStats]);

  const maxTokens = useMemo(() => {
    if (!rows.length) return 0;
    return Math.max(...rows.map(m => m.totalTokens), 1);
  }, [rows]);

  if (!rows.length) {
    return (
      <div class="card" style="padding:20px">
        <h3 style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
          </svg>
          {t('token.topModels')}
        </h3>
        <div style="font-size:12px;color:var(--color-text-muted)">{t('token.noData')}</div>
      </div>
    );
  }

  return (
    <div class="card" style="padding:20px;display:flex;flex-direction:column">
      <h3 style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
        {t('token.topModels')}
      </h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        {rows.map((model, i) => {
          const pv = model.provider || modelToProvider.get(model.model);
          const label = pv ? `${pv}/${model.model}` : model.model;
          return (
            <div key={model.isOther ? `other-${i}` : `${model.provider}-${model.model}`}>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style={`font-size:12px;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:65%;font-weight:${model.isOther ? '400' : '600'}`} title={label}>
                  {model.isOther ? model.model : <>{pv ? <span style="color:var(--color-text-muted);font-weight:500">{pv}/</span> : null}{model.model}</>}
                </span>
                <span style="font-size:11px;font-family:monospace;color:var(--color-text-muted)">
                  {formatTokens(model.totalTokens)}
                </span>
              </div>
              <div style="height:6px;border-radius:3px;background:var(--color-bg);overflow:hidden">
                <div
                  style={`height:100%;border-radius:3px;background:${model.isOther ? 'var(--color-text-muted)' : 'linear-gradient(90deg, var(--color-primary), color-mix(in srgb, var(--color-primary), white 30%))'};width:${Math.max((model.totalTokens / maxTokens) * 100, 2)}%;transition:width 0.6s ease`}
                />
              </div>
              <div style="display:flex;gap:12px;margin-top:2px">
                <span style="font-size:10px;color:var(--color-text-muted)">{t('stats.promptTokens')}: {formatTokens(model.promptTokens)}</span>
                <span style="font-size:10px;color:var(--color-text-muted)">{t('stats.completionTokens')}: {formatTokens(model.completionTokens)}</span>
                <span style="font-size:10px;color:var(--color-text-muted)">{model.requestCount} {t('common.req')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
