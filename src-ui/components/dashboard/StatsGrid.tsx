import { useMemo } from 'preact/hooks';
import type { LogEntry, Stats } from '../../types.js';
import { formatTokens, formatDuration } from '../../lib/utils.js';
import { useLocale } from '../../lib/i18n.js';

interface StatsGridProps {
  logs: LogEntry[];
  stats: Stats | null;
}

const ICONS: Record<string, JSX.Element> = {
  pulse: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  check: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  x: <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></>,
  layers: <><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
};

export function StatsGrid({ logs, stats }: StatsGridProps) {
  const { t } = useLocale();

  const computed = useMemo(() => {
    const total = logs.length;
    const ok = logs.filter(l => l.status >= 200 && l.status < 300).length;
    const errors = total - ok;
    const successRate = total > 0 ? Math.round((ok / total) * 100) : 100;
    const avgLatency = total > 0
      ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / total)
      : 0;
    const totalTokens = logs.reduce((s, l) => s + (l.inputTokens || 0) + (l.outputTokens || 0), 0);
    const promptTokens = logs.reduce((s, l) => s + (l.inputTokens || 0), 0);
    const outputTokens = logs.reduce((s, l) => s + (l.outputTokens || 0), 0);
    const qps = stats?.qps ?? 0;
    const maxQps = stats?.maxQps ?? 0;
    const totalRequests = stats?.totalRequests ?? 0;
    const totalTokensAll = stats?.totalTokens ?? 0;
    return { total, successRate, avgLatency, errors, totalTokens, promptTokens, outputTokens, qps, maxQps, totalRequests, totalTokensAll };
  }, [logs, stats]);

  const accent = 'var(--color-primary)';
  const cards = [
    { icon: ICONS.pulse, label: t('stats.requests'), value: computed.total, sub: `${computed.totalRequests > 0 ? t('stats.totalRequests') + ': ' + formatTokens(computed.totalRequests) : ''}` },
    { icon: ICONS.check, label: t('stats.success'), value: `${computed.successRate}%`, sub: '' },
    { icon: ICONS.clock, label: t('stats.latency'), value: formatDuration(computed.avgLatency), sub: '' },
    { icon: ICONS.x, label: t('stats.errors'), value: computed.errors, sub: '' },
    { icon: ICONS.layers, label: t('stats.tokens'), value: formatTokens(computed.totalTokens), sub: `${t('stats.promptTokens')}: ${formatTokens(computed.promptTokens)}\n${t('stats.completionTokens')}: ${formatTokens(computed.outputTokens)}` },
    { icon: ICONS.zap, label: t('stats.qps'), value: computed.qps.toFixed(1), sub: `${t('stats.maxQps')}: ${computed.maxQps.toFixed(1)}` },
  ];

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" style="margin-bottom:24px">
      {cards.map(card => (
        <div key={card.label} class="stat-card">
          <div class="stat-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              {card.icon}
            </svg>
          </div>
          <div class="stat-card-value">{card.value}</div>
          <div class="stat-card-label">{card.label}</div>
          {card.sub && (
            <div style="font-size:10px;color:var(--color-text-muted);margin-top:2px;white-space:pre-line;line-height:1.5">{card.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
