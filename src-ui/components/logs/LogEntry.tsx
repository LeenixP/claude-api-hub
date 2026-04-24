import { useState, useCallback } from 'preact/hooks';
import type { LogEntry as LogEntryType } from '../../types.js';
import { formatDuration, formatRelativeTime } from '../../lib/utils.js';

interface LogEntryProps {
  entry: LogEntryType;
}

function statusStyle(code: number): { color: string; bg: string; label: string } {
  if (code >= 200 && code < 300) return { color: 'var(--color-success)', bg: 'rgba(45,164,78,0.10)', label: 'OK' };
  if (code === 429) return { color: 'var(--color-warning)', bg: 'rgba(217,119,6,0.10)', label: 'Rate Limited' };
  if (code >= 400) return { color: 'var(--color-danger)', bg: 'rgba(231,76,60,0.10)', label: 'Error' };
  return { color: 'var(--color-text-muted)', bg: 'rgba(92,99,112,0.10)', label: String(code) };
}

export function LogEntryRow({ entry }: LogEntryProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(v => !v), []);
  const s = statusStyle(entry.status);
  const isAliased = entry.claudeModel !== entry.resolvedModel;

  return (
    <div class="log-row">
      <div onClick={toggle}
        style="display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;user-select:none"
        title="Click to expand">
        {/* Status badge */}
        <span style={`display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:24px;padding:0 8px;border-radius:5px;font-size:12px;font-weight:700;color:${s.color};background:${s.bg}`}>
          {entry.status}
        </span>

        {/* Model */}
        <span style="flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--color-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          {entry.claudeModel}
          {isAliased && <span style="color:var(--color-primary);margin-left:4px">→ {entry.resolvedModel}</span>}
        </span>

        {/* Provider */}
        <span style="font-size:12px;color:var(--color-text-muted);white-space:nowrap">{entry.provider}</span>

        {/* Duration */}
        <span style="font-size:12px;font-family:monospace;color:var(--color-text-dim);white-space:nowrap;min-width:52px;text-align:right">
          {formatDuration(entry.durationMs)}
        </span>

        {/* Time */}
        <span style="font-size:12px;color:var(--color-text-muted);white-space:nowrap;min-width:72px;text-align:right">
          {formatRelativeTime(entry.time)}
        </span>

        {/* Expand arrow */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" stroke-width="2" stroke-linecap="round"
          style={`transition:transform 0.15s;flex-shrink:0;transform:rotate(${expanded ? 180 : 0}deg)`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div style="padding:14px 20px;border-top:1px solid var(--color-border);background:var(--color-bg);font-size:13px">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px 24px">
            <div>
              <div style="color:var(--color-text-muted);margin-bottom:1px">Request ID</div>
              <div style="font-family:monospace;color:var(--color-text-dim);font-size:12px">{entry.requestId}</div>
            </div>
            <div>
              <div style="color:var(--color-text-muted);margin-bottom:1px">Full Time</div>
              <div style="color:var(--color-text-dim)">{new Date(entry.time).toLocaleString()}</div>
            </div>
            <div>
              <div style="color:var(--color-text-muted);margin-bottom:1px">Protocol</div>
              <div style="color:var(--color-text-dim)">{entry.protocol}{entry.stream ? ' · streaming' : ''}</div>
            </div>
            {entry.targetUrl && (
              <div>
                <div style="color:var(--color-text-muted);margin-bottom:1px">Target URL</div>
                <div style="color:var(--color-text-dim);font-size:12px;word-break:break-all">{entry.targetUrl}</div>
              </div>
            )}
            {entry.inputTokens !== undefined && (
              <div>
                <div style="color:var(--color-text-muted);margin-bottom:1px">Tokens</div>
                <div style="color:var(--color-text-dim)">{entry.inputTokens} in / {entry.outputTokens || 0} out</div>
              </div>
            )}
          </div>
          {entry.error && (
            <div style="margin-top:10px;padding:10px 14px;border-radius:6px;background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.15)">
              <div style="font-size:12px;font-weight:600;color:var(--color-danger);margin-bottom:2px">Error</div>
              <div style="font-family:monospace;font-size:12px;color:var(--color-danger);word-break:break-all">{entry.error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
