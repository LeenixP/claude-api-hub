import { useState, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry as LogEntryType } from '../../types.js';
import { LogEntryRow } from './LogEntry.js';
import { apiFetch } from '../../hooks/useApi.js';
import { showToast } from '../common/Toast.js';
import { Select } from '../common/Select.js';
import { useLocale } from '../../lib/i18n.js';
import { formatTokens, formatDuration } from '../../lib/utils.js';

interface LogPanelProps {
  logs: LogEntryType[];
  connected: boolean;
  onClear?: () => void;
}

type FilterType = 'all' | 'ok' | 'errors';
type SortType = 'newest' | 'oldest' | 'fastest' | 'slowest';

function getLatencyColor(ms: number): string {
  if (ms < 500) return 'var(--color-success)';
  if (ms < 2000) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function getLatencyBg(ms: number): string {
  if (ms < 500) return 'rgba(45,164,78,0.10)';
  if (ms < 2000) return 'rgba(217,119,6,0.10)';
  return 'rgba(231,76,60,0.10)';
}

export function LogPanel({ logs, connected, onClear }: LogPanelProps) {
  const { t } = useLocale();
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState('');
  const [sort, setSort] = useState<SortType>('newest');
  const [limit, setLimit] = useState(50);
  const [clearing, setClearing] = useState(false);

  const providers = useMemo(() => {
    const set = new Set<string>();
    for (const l of logs) set.add(l.provider);
    return Array.from(set).sort();
  }, [logs]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    let todayCount = 0;
    let successCount = 0;
    let totalLatency = 0;
    let totalTokens = 0;
    const activeSet = new Set<string>();

    for (const l of logs) {
      if (new Date(l.time).toDateString() === today) todayCount++;
      if (l.status >= 200 && l.status < 300) successCount++;
      totalLatency += l.durationMs;
      totalTokens += (l.inputTokens || 0) + (l.outputTokens || 0);
      activeSet.add(l.provider);
    }

    return {
      todayCount,
      successRate: logs.length > 0 ? Math.round((successCount / logs.length) * 100) : 0,
      avgLatency: logs.length > 0 ? Math.round(totalLatency / logs.length) : 0,
      totalTokens,
      activeProviders: activeSet.size,
    };
  }, [logs]);

  const filtered = useMemo(() => {
    let result = [...logs];
    if (filter === 'ok') result = result.filter(l => l.status >= 200 && l.status < 300);
    if (filter === 'errors') result = result.filter(l => l.status >= 400 || l.status < 200);
    if (providerFilter) result = result.filter(l => l.provider === providerFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.claudeModel.toLowerCase().includes(q) ||
        l.resolvedModel.toLowerCase().includes(q) ||
        l.provider.toLowerCase().includes(q) ||
        l.requestId.toLowerCase().includes(q)
      );
    }
    if (sort === 'newest') result.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    if (sort === 'oldest') result.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    if (sort === 'fastest') result.sort((a, b) => a.durationMs - b.durationMs);
    if (sort === 'slowest') result.sort((a, b) => b.durationMs - a.durationMs);
    return result;
  }, [logs, filter, providerFilter, search, sort]);

  const displayed = filtered.slice(0, limit);

  const handleClearLogs = useCallback(async () => {
    setClearing(true);
    try {
      const res = await apiFetch('/api/logs/clear', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      showToast(t('logs.cleared'), 'success');
      onClear?.();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally { setClearing(false); }
  }, [onClear, t]);

  const exportJson = useCallback(() => {
    const data = JSON.stringify(filtered, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('logs.exportJson'), 'success');
  }, [filtered, t]);

  const exportCsv = useCallback(() => {
    const headers = ['time', 'requestId', 'claudeModel', 'resolvedModel', 'provider', 'protocol', 'stream', 'status', 'durationMs', 'inputTokens', 'outputTokens', 'error'];
    const rows = filtered.map(l => [
      l.time, l.requestId, l.claudeModel, l.resolvedModel, l.provider, l.protocol,
      l.stream ? 'true' : 'false', l.status, l.durationMs,
      l.inputTokens ?? '', l.outputTokens ?? '', l.error ?? ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${new Date().toISOString().slice(0, 19)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('logs.exportCsv'), 'success');
  }, [filtered, t]);

  const statusText = connected ? t('logs.connected') : t('logs.disconnected');
  const statusColor = connected ? 'var(--color-success)' : 'var(--color-danger)';

  return (
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <h2 class="section-title">{t('logs.title')}</h2>
          <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-text-muted)">
            <span style={`width:10px;height:10px;border-radius:50%;background:${statusColor};${!connected ? 'animation:pulse 1.5s ease-in-out infinite' : ''}`} />
            <span style={`color:${statusColor};font-weight:500`}>{statusText}</span>
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <div class="filter-group">
            {(['all', 'ok', 'errors'] as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} class={`filter-btn capitalize ${filter === f ? 'filter-btn-active' : ''}`}>{f}</button>
            ))}
          </div>
          <input type="text" placeholder={t('logs.search')}
            onInput={e => setSearch((e.target as HTMLInputElement).value)}
            style={`width:160px;padding:8px 12px;border-radius:6px;font-size:13px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);outline:none`}
          />
          <button onClick={handleClearLogs} disabled={clearing} class="btn btn-ghost" style="height:32px;font-size:12px">
            {clearing ? t('logs.clearing') : t('logs.clearAll')}
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
          <div style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;background:var(--color-bg-elevated);border:1px solid var(--color-border)">
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px">{t('logs.todayRequests')}</div>
            <div style="font-size:18px;font-weight:700;color:var(--color-text)">{stats.todayCount}</div>
          </div>
          <div style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;background:var(--color-bg-elevated);border:1px solid var(--color-border)">
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px">{t('stats.success')}</div>
            <div style={`font-size:18px;font-weight:700;color:${stats.successRate >= 95 ? 'var(--color-success)' : stats.successRate >= 80 ? 'var(--color-warning)' : 'var(--color-danger)'}`}>{stats.successRate}%</div>
          </div>
          <div style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;background:var(--color-bg-elevated);border:1px solid var(--color-border)">
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px">{t('logs.avgLatency')}</div>
            <div style={`font-size:18px;font-weight:700;color:${getLatencyColor(stats.avgLatency)}`}>{formatDuration(stats.avgLatency)}</div>
          </div>
          <div style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;background:var(--color-bg-elevated);border:1px solid var(--color-border)">
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px">{t('logs.totalTokens')}</div>
            <div style="font-size:18px;font-weight:700;color:var(--color-text)">{formatTokens(stats.totalTokens)}</div>
          </div>
          <div style="flex:1;min-width:120px;padding:10px 14px;border-radius:8px;background:var(--color-bg-elevated);border:1px solid var(--color-border)">
            <div style="font-size:11px;color:var(--color-text-muted);margin-bottom:2px">{t('logs.activeProviders')}</div>
            <div style="font-size:18px;font-weight:700;color:var(--color-text)">{stats.activeProviders}</div>
          </div>
        </div>
      )}

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <div style="min-width:180px">
          <Select
            value={providerFilter}
            onChange={setProviderFilter}
            placeholder={t('logs.filterProvider')}
            options={providers.map(p => ({ value: p, label: p }))}
          />
        </div>
        <div class="filter-group">
          {(['newest', 'oldest', 'fastest', 'slowest'] as SortType[]).map(s => (
            <button key={s} onClick={() => setSort(s)} class={`filter-btn ${sort === s ? 'filter-btn-active' : ''}`} style="font-size:12px">
              {t(`logs.sort${s.charAt(0).toUpperCase() + s.slice(1)}` as string)}
            </button>
          ))}
        </div>
        <span style="font-size:12px;color:var(--color-text-muted);margin-left:auto">{t('logs.entries', { count: filtered.length })}</span>
        <button onClick={exportJson} class="btn btn-ghost" style="height:28px;font-size:12px;padding:0 10px">{t('logs.exportJson')}</button>
        <button onClick={exportCsv} class="btn btn-ghost" style="height:28px;font-size:12px;padding:0 10px">{t('logs.exportCsv')}</button>
      </div>

      {filtered.length === 0 ? (
        <div style="text-align:center;padding:56px 24px;color:var(--color-text-muted)">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 16px;opacity:0.25">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style="font-size:15px;font-weight:600;margin-bottom:6px">{search || providerFilter ? t('logs.noMatching') : t('logs.noLogsYet')}</div>
          <div style="font-size:13px;margin-bottom:16px;opacity:0.7">{t('logs.realtime')}</div>
          {!connected && (
            <div style="font-size:13px;color:var(--color-danger);margin-bottom:8px">{t('logs.waiting')}</div>
          )}
          {connected && logs.length === 0 && (
            <div style="font-size:13px;opacity:0.7">{t('logs.waitingForRequests')}</div>
          )}
        </div>
      ) : (
        <div>
          <div class="log-scroll" style="overflow-y:auto">
            {displayed.map(entry => (
              <LogEntryRow key={entry.requestId + entry.time} entry={entry} />
            ))}
          </div>
          {displayed.length < filtered.length && (
            <div style="text-align:center;padding:16px">
              <button onClick={() => setLimit(v => v + 50)} class="btn btn-ghost" style="font-size:13px;padding:8px 20px">
                {t('logs.loadMore')} ({t('logs.entries', { count: filtered.length - displayed.length })})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
