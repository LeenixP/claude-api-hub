import { useState, useMemo, useCallback } from 'preact/hooks';
import type { LogEntry as LogEntryType } from '../../types.js';
import { LogEntryRow } from './LogEntry.js';
import { apiFetch } from '../../hooks/useApi.js';
import { showToast } from '../common/Toast.js';

interface LogPanelProps {
  logs: LogEntryType[];
  connected: boolean;
  onClear?: () => void;
}

type FilterType = 'all' | 'ok' | 'errors';

export function LogPanel({ logs, connected, onClear }: LogPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [clearing, setClearing] = useState(false);

  const filtered = useMemo(() => {
    let result = logs;
    if (filter === 'ok') result = result.filter(l => l.status >= 200 && l.status < 300);
    if (filter === 'errors') result = result.filter(l => l.status >= 400 || l.status < 200);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.claudeModel.toLowerCase().includes(q) ||
        l.resolvedModel.toLowerCase().includes(q) ||
        l.provider.toLowerCase().includes(q) ||
        l.requestId.toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, filter, search]);

  const handleClearLogs = useCallback(async () => {
    setClearing(true);
    try {
      const res = await apiFetch('/api/logs/clear', { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      showToast('Logs cleared', 'success');
      onClear?.();
    } catch (err) {
      showToast((err as Error).message, 'error');
    } finally { setClearing(false); }
  }, []);

  return (
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <h2 class="section-title">Request Logs</h2>
          <span style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-text-muted)">
            <span style={`width:7px;height:7px;border-radius:50%;background:${connected ? 'var(--color-success)' : 'var(--color-danger)'}`} />
            {filtered.length} entries
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div class="filter-group">
            {(['all', 'ok', 'errors'] as FilterType[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} class={`filter-btn capitalize ${filter === f ? 'filter-btn-active' : ''}`}>{f}</button>
            ))}
          </div>
          <input type="text" placeholder="Search..."
            onInput={e => setSearch((e.target as HTMLInputElement).value)}
            style={`width:180px;padding:8px 12px;border-radius:6px;font-size:13px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);outline:none`}
          />
          <button onClick={handleClearLogs} disabled={clearing} class="btn btn-ghost" style="height:32px;font-size:12px">
            {clearing ? 'Clearing...' : 'Clear All'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style="text-align:center;padding:48px 24px;color:var(--color-text-muted)">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 12px;opacity:0.3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style="font-size:14px;font-weight:500;margin-bottom:4px">{search ? 'No matching logs' : 'No requests yet'}</div>
          <div style="font-size:12px">Requests will appear here in real time</div>
        </div>
      ) : (
        <div class="log-scroll" style="overflow-y:auto">
          {filtered.map(entry => (
            <LogEntryRow key={entry.requestId} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
