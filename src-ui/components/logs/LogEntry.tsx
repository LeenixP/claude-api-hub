import { useState, useCallback } from 'preact/hooks';
import type { LogEntry as LogEntryType } from '../../types.js';
import { statusLabel, formatDuration, getTierFromModel } from '../../lib/utils.js';

interface LogEntryProps {
  entry: LogEntryType;
}

function statusColor(code: number): string {
  if (code >= 200 && code < 300) return 'var(--color-success)';
  if (code === 429) return 'var(--color-warning)';
  if (code >= 400) return 'var(--color-danger)';
  return 'var(--color-text-muted)';
}

function statusBg(code: number): string {
  if (code >= 200 && code < 300) return 'rgba(48,164,108,0.12)';
  if (code === 429) return 'rgba(245,124,0,0.12)';
  if (code >= 400) return 'rgba(255,82,82,0.12)';
  return 'rgba(95,99,104,0.12)';
}

export function LogEntryRow({ entry }: LogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(v => !v), []);
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  }, [toggle]);

  const isAliased = entry.claudeModel !== entry.resolvedModel;

  return (
    <div class="log-row">
      <div role="button" tabindex="0" onClick={toggle} onKeyDown={onKeyDown}
        style="display:flex;align-items:center;gap:16px;padding:16px 20px;cursor:pointer"
        aria-expanded={expanded}>
        <span style={`display:inline-flex;align-items:center;padding:5px 12px;border-radius:8px;font-size:13px;font-weight:700;color:${statusColor(entry.status)};background:${statusBg(entry.status)}`}>
          {entry.status}
        </span>
        <span style="font-size:13px;font-weight:500;color:var(--color-text-dim)">
          {statusLabel(entry.status)}
        </span>
        <span class="truncate" style="flex:1;min-width:0;font-size:15px;font-weight:600;color:var(--color-text)">
          {entry.claudeModel}
          {isAliased && (
            <span style="display:inline-flex;align-items:center;margin:0 6px;color:var(--color-text-muted)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          )}
          {isAliased && <span style="color:var(--color-primary)">{entry.resolvedModel}</span>}
        </span>
        <span class="hidden sm:inline" style="font-size:13px;color:var(--color-text-muted)">{entry.provider}</span>
        <span style="font-size:13px;font-family:monospace;color:var(--color-text-dim)">{formatDuration(entry.durationMs)}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style={`color:var(--color-text-muted);transition:transform 0.2s;transform:rotate(${expanded ? 180 : 0}deg);flex-shrink:0`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div style="padding:16px 24px;border-top:1px solid var(--color-border);background:var(--color-bg)">
          <div class="grid grid-cols-2 md:grid-cols-3" style="gap:16px;font-size:13px">
            <div>
              <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Request ID</span>
              <span style="font-family:monospace;color:var(--color-text-dim)">{entry.requestId}</span>
            </div>
            <div>
              <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Time</span>
              <span style="color:var(--color-text-dim)">{new Date(entry.time).toLocaleString()}</span>
            </div>
            <div>
              <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Target URL</span>
              <span class="truncate" style="display:block;color:var(--color-text-dim)">{entry.targetUrl || '—'}</span>
            </div>
            <div>
              <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Provider</span>
              <span style="color:var(--color-text-dim)">{entry.provider} ({entry.protocol})</span>
            </div>
            <div>
              <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Model</span>
              <span style="color:var(--color-text-dim)">{entry.resolvedModel}</span>
            </div>
            <div>
              <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Stream</span>
              <span style="color:var(--color-text-dim)">{entry.stream ? 'Yes' : 'No'}</span>
            </div>
            {entry.inputTokens !== undefined && (
              <div>
                <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Tokens</span>
                <span style="color:var(--color-text-dim)">In: {entry.inputTokens} / Out: {entry.outputTokens || 0}</span>
              </div>
            )}
            {entry.logFile && (
              <div>
                <span style="display:block;color:var(--color-text-muted);margin-bottom:2px">Log File</span>
                <span class="truncate" style="display:block;font-family:monospace;color:var(--color-text-dim)">{entry.logFile}</span>
              </div>
            )}
          </div>
          {entry.error && (
            <div style="margin-top:12px;padding:12px 16px;border-radius:10px;background:rgba(255,82,82,0.08);border:1px solid rgba(255,82,82,0.2)">
              <span style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:var(--color-danger)">Error</span>
              <span style="font-family:monospace;font-size:13px;color:var(--color-danger)">{entry.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
