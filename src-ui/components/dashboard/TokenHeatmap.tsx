import { useMemo } from 'preact/hooks';
import type { TokenStats } from '../../types.js';
import { useLocale } from '../../lib/i18n.js';

interface TokenHeatmapProps {
  tokenStats: TokenStats | null;
}

function getColor(tokens: number, maxTokens: number): string {
  if (tokens === 0) return 'var(--color-surface-hover)';
  const ratio = tokens / Math.max(maxTokens, 1);
  if (ratio <= 0.05) return 'color-mix(in srgb, var(--color-primary) 25%, transparent)';
  if (ratio <= 0.15) return 'color-mix(in srgb, var(--color-primary) 45%, transparent)';
  if (ratio <= 0.35) return 'color-mix(in srgb, var(--color-primary) 65%, transparent)';
  if (ratio <= 0.65) return 'color-mix(in srgb, var(--color-primary) 80%, transparent)';
  return 'var(--color-primary)';
}

const LEGEND_LEVELS = [0, 0.05, 0.15, 0.35, 0.65];

export function TokenHeatmap({ tokenStats }: TokenHeatmapProps) {
  const { t } = useLocale();

  const { weeks, maxTokens, stats } = useMemo(() => {
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
    const activeDays = days.filter(d => d.tokens > 0).length;
    const totalTokens = days.reduce((s, d) => s + d.tokens, 0);
    const avgDaily = activeDays > 0 ? Math.round(totalTokens / activeDays) : 0;
    const peakDay = days.reduce((best, d) => d.tokens > best.tokens ? d : best, days[0]);
    return { weeks: wks, maxTokens: maxT, stats: { activeDays, totalTokens, avgDaily, peakDate: peakDay?.date || '', peakTokens: peakDay?.tokens || 0 } };
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
    <div class="card" style="padding:20px;display:flex;flex-direction:column">
      <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-bottom:12px;display:flex;align-items:center;gap:6px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
        {t('token.heatmap')}
      </div>
      <div style="display:flex;justify-content:center;width:100%">
        <div style="display:flex;gap:3px;width:100%;max-width:640px">
          {weeks.map((wk, wi) => (
            <div key={wi} style="display:flex;flex-direction:column;gap:3px;flex:1">
              {wk.map((d, di) => (
                <div
                  key={di}
                  title={`${d.date}: ${d.tokens.toLocaleString()} tokens`}
                  style={{
                    width: '100%',
                    aspectRatio: '1 / 1',
                    borderRadius: 3,
                    background: getColor(d.tokens, maxTokens),
                    cursor: 'default',
                    minWidth: 6,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:var(--color-text-muted)">
        <span>{t('token.less')}</span>
        <div style="display:flex;gap:2px">
          {LEGEND_LEVELS.map((level, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: getColor(level * maxTokens || 0, maxTokens) }} />
          ))}
        </div>
        <span>{maxTokens.toLocaleString()}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px 16px;margin-top:14px;padding-top:12px;border-top:1px solid var(--color-border)">
        <div>
          <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px">{t('token.totalUsed')}</div>
          <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-top:2px">{stats.totalTokens.toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px">{t('token.dailyAvg')}</div>
          <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-top:2px">{stats.avgDaily.toLocaleString()}</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px">{t('token.activeDays')}</div>
          <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-top:2px">{stats.activeDays} / 90</div>
        </div>
        <div>
          <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px">{t('token.peakDay')}</div>
          <div style="font-size:13px;font-weight:600;color:var(--color-text);margin-top:2px">{stats.peakDate ? stats.peakDate.slice(5) : '-'} <span style="font-weight:400;color:var(--color-text-muted)">{stats.peakTokens.toLocaleString()}</span></div>
        </div>
      </div>
    </div>
  );
}
