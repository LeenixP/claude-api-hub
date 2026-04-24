import { useMemo } from 'preact/hooks';
import type { LogEntry, Stats } from '../../types.js';
import { StatCard } from './StatCard.js';
import { formatTokens, formatDuration } from '../../lib/utils.js';

interface StatsGridProps {
  logs: LogEntry[];
  stats: Stats | null;
}

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

  const cards = [
    { icon: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>', label: 'Total Requests', value: computed.total, accent: 'var(--color-primary)' },
    { icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', label: 'Success Rate', value: `${computed.successRate}%`, accent: 'var(--color-success)' },
    { icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', label: 'Avg Latency', value: formatDuration(computed.avgLatency), accent: 'var(--color-warning)' },
    { icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>', label: 'Errors', value: computed.errors, accent: 'var(--color-danger)' },
    { icon: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>', label: 'Total Tokens', value: formatTokens(computed.totalTokens), accent: '#8B5CF6' },
    { icon: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>', label: 'QPS', value: computed.qps.toFixed(1), accent: '#F59E0B' },
  ];

  return (
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map(card => (
        <StatCard
          key={card.label}
          icon={card.icon}
          label={card.label}
          value={card.value}
          accent={card.accent}
        />
      ))}
    </div>
  );
}
