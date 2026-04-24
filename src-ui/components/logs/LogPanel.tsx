import { useState, useMemo, useRef, useEffect, useCallback } from 'preact/hooks';
import type { LogEntry as LogEntryType } from '../../types.js';
import { LogEntryRow } from './LogEntry.js';
import { debounce } from '../../lib/utils.js';

interface LogPanelProps {
  logs: LogEntryType[];
  connected: boolean;
}

type FilterType = 'all' | 'ok' | 'errors';

export function LogPanel({ logs, connected }: LogPanelProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showFileLog, setShowFileLog] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    if (showFileLog) {
      result = result.filter(l => l.logFile);
    }
    return result;
  }, [logs, filter, search, showFileLog]);

  // Auto-scroll to top when new logs arrive
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [logs.length, autoScroll]);

  const debouncedSearch = useMemo(() => debounce((v: string) => setSearch(v), 300), []);

  const handleSearchInput = useCallback((e: Event) => {
    const val = (e.target as HTMLInputElement).value;
    debouncedSearch(val);
  }, [debouncedSearch]);

  const handleClear = useCallback(() => {
    if (searchRef.current) searchRef.current.value = '';
    setSearch('');
  }, []);

  // Date separators
  const entriesWithDates = useMemo(() => {
    const out: Array<{ type: 'date'; date: string } | { type: 'log'; entry: LogEntryType }> = [];
    let lastDate = '';
    filtered.forEach(entry => {
      const d = new Date(entry.time).toLocaleDateString();
      if (d !== lastDate) {
        out.push({ type: 'date', date: d });
        lastDate = d;
      }
      out.push({ type: 'log', entry });
    });
    return out;
  }, [filtered]);

  return (
    <div>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 class="section-title">Request Logs</h2>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs" style="color:var(--color-text-muted)">
              {filtered.length} entries
            </span>
            <span
              class="inline-block w-2 h-2 rounded-full"
              style={`background:${connected ? 'var(--color-success)' : 'var(--color-danger)'}`}
              title={connected ? 'Connected' : 'Disconnected'}
            />
          </div>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <div class="filter-group">
            {(['all', 'ok', 'errors'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                class={`filter-btn capitalize ${filter === f ? 'filter-btn-active' : ''}`}
              >
                {f}
              </button>
            ))}
          </div>

          <div class="relative">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search..."
              onInput={handleSearchInput}
              class="pl-9 pr-8 py-2 rounded-lg text-sm border transition-colors w-44 sm:w-56"
              style="background:var(--color-bg);color:var(--color-text);border-color:var(--color-border)"
            />
            <svg
              class="absolute left-2.5 top-1/2 -translate-y-1/2"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {search && (
              <button
                onClick={handleClear}
                class="absolute right-2 top-1/2 -translate-y-1/2"
                style="color:var(--color-text-muted)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={handleClear}
            class="btn btn-ghost"
          >
            Clear
          </button>

          <label class="flex items-center gap-2 text-sm cursor-pointer" style="color:var(--color-text-dim)">
            <input
              type="checkbox"
              checked={showFileLog}
              onChange={e => setShowFileLog((e.target as HTMLInputElement).checked)}
              class="w-4 h-4 rounded"
            />
            File Log
          </label>

          <label class="flex items-center gap-2 text-sm cursor-pointer" style="color:var(--color-text-dim)">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={e => setAutoScroll((e.target as HTMLInputElement).checked)}
              class="w-4 h-4 rounded"
            />
            Auto-scroll
          </label>
        </div>
      </div>

      <div
        ref={listRef}
        class="log-scroll overflow-y-auto pr-1"
        aria-live="polite"
        aria-atomic="false"
      >
        {entriesWithDates.length === 0 ? (
          <div class="text-center py-12">
            <svg
              class="mx-auto mb-3"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-text-muted)"
              stroke-width="1.5"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <p class="text-sm" style="color:var(--color-text-dim)">No logs yet</p>
            <p class="text-xs mt-1" style="color:var(--color-text-muted)">Logs will appear here when requests are made.</p>
          </div>
        ) : (
          entriesWithDates.map((item, i) => {
            if (item.type === 'date') {
              return (
                <div
                  key={`date-${item.date}-${i}`}
                  class="flex items-center gap-3 my-3"
                >
                  <div class="flex-1 h-px" style="background:var(--color-border)" />
                  <span class="text-xs font-medium" style="color:var(--color-text-muted)">{item.date}</span>
                  <div class="flex-1 h-px" style="background:var(--color-border)" />
                </div>
              );
            }
            return <LogEntryRow key={`${item.entry.requestId}-${i}`} entry={item.entry} />;
          })
        )}
      </div>
    </div>
  );
}
