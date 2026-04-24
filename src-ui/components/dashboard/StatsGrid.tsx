import { useMemo } from 'preact/hooks';
import type { LogEntry, Stats } from '../../types.js';
import { formatTokens, formatDuration } from '../../lib/utils.js';

interface StatsGridProps {
  logs: LogEntry[];
  stats: Stats | null;
}

const ICONS = {
  pulse: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  x: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};

export function StatsGrid({ logs, stats }: StatsGridProps) {
  const computed = useMemo(() => {
    const total = logs.length;
    const ok = logs.filter(l => l.status >= 200 && l.status < 300).length;
    const errors = total - ok;
    const successRate = total > 0 ? Math.round((ok / total) * 100) : 100;
    const avgLatency = total > 0
      ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / total)
      : 0;
    const totalTokens = logs.reduce((s, l) => s + (l.inputTokens || 0) + (l.outputTokens || 0), 0);
    const qps = stats?.qps ?? 0;
    return { total, successRate, avgLatency, errors, totalTokens, qps };
  }, [logs, stats]);

  const accent = 'var(--color-primary)';
  const cards = [
    { icon: ICONS.pulse, label: 'Requests', value: computed.total },
    { icon: ICONS.check, label: 'Success', value: `${computed.successRate}%` },
    { icon: ICONS.clock, label: 'Latency', value: formatDuration(computed.avgLatency) },
    { icon: ICONS.x, label: 'Errors', value: computed.errors },
    { icon: ICONS.layers, label: 'Tokens', value: formatTokens(computed.totalTokens) },
    { icon: ICONS.zap, label: 'QPS', value: computed.qps.toFixed(1) },
  ];

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3" style="margin-bottom:24px">
      {cards.map(card => (
        <div key={card.label} class="stat-card">
          <div class="stat-card-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML={{ __html: card.icon }} />
          </div>
          <div class="stat-card-value">{card.value}</div>
          <div class="stat-card-label">{card.label}</div>
        </div>
      ))}
    </div>
  );
}
