import { useMemo } from 'preact/hooks';
import type { TokenStats } from '../../types.js';
import { useLocale } from '../../lib/i18n.js';

interface TokenHeatmapProps {
  tokenStats: TokenStats | null;
}

const LEVELS = [
  { min: 0, max: 0, color: 'var(--color-surface-hover)' },
  { min: 1, max: 1000, color: 'var(--color-primary)' },
  { min: 1001, max: 10000, color: 'var(--color-primary)' },
  { min: 10001, max: 50000, color: 'var(--color-primary)' },
  { min: 50001, max: Infinity, color: 'var(--color-primary)' },
];

function getOpacity(tokens: number): number {
  if (tokens === 0) return 0.15;
  if (tokens <= 1000) return 0.4;
  if (tokens <= 10000) return 0.6;
  if (tokens <= 50000) return 0.85;
  return 1;
}

export function TokenHeatmap({ tokenStats }: TokenHeatmapProps) {
  const { t } = useLocale();

  const { weeks, maxTokens } = useMemo(() => {
    const daily = tokenStats?.daily || [];
    const map = new Map(daily.map(d => [d.date, d.totalTokens]));
    const today = new Date();
    const days: Array<{ date: string; tokens: number; weekday: number }> = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ date: dateStr, tokens: map.get(dateStr) || 0, weekday: d.getDay() });
    }
    const maxT = Math.max(1, ...days.map(d => d.tokens));
    const wks: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) {
      wks.push(days.slice(i, i + 7));
    }
    return { weeks: wks, maxTokens: maxT };
  }, [tokenStats]);

  if (!tokenStats || tokenStats.daily.length === 0) {
    return (
      <div class="card" style="padding:20px">
        <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
          {t('token.heatmap')}
        </div>
        <div style="font-size:12px;color:var(--color-text-muted)">{t('token.noData')}</div>
      </div>
    );
  }

  return (
    <div class="card" style="padding:20px;display:flex;flex-direction:column;height:100%">
      <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:16px;display:flex;align-items:center;gap:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
        {t('token.heatmap')}
      </div>
      <div style="display:flex;justify-content:center;width:100%;flex:1;align-items:center">
        <div style="display:flex;gap:4px;width:100%;max-width:640px">
          {weeks.map((wk, wi) => (
            <div key={wi} style="display:flex;flex-direction:column;gap:4px;flex:1">
              {wk.map((d, di) => (
                <div
                  key={di}
                  title={`${d.date}: ${d.tokens.toLocaleString()} tokens`}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 4,
                    background: LEVELS[0].color,
                    opacity: getOpacity(d.tokens),
                    cursor: 'default',
                    minWidth: 8,
                    border: '1px solid var(--color-border-strong)',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;font-size:11px;color:var(--color-text-muted)">
        <span>{t('token.less')}</span>
        <div style="display:flex;gap:3px">
          {LEVELS.map((l, i) => (
            <div key={i} style={{ width: 16, height: 16, borderRadius: 3, background: l.color, opacity: getOpacity(l.min) }} />
          ))}
        </div>
        <span>{maxTokens.toLocaleString()}</span>
      </div>
    </div>
  );
}
