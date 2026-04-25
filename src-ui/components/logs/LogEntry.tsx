import { useState, useCallback } from 'preact/hooks';
import type { LogEntry as LogEntryType } from '../../types.js';
import { formatDuration, formatRelativeTime } from '../../lib/utils.js';
import { useLocale } from '../../lib/i18n.js';

interface LogEntryProps {
  entry: LogEntryType;
}

function statusStyle(code: number, t: (key: string) => string): { color: string; bg: string; label: string } {
  if (code >= 200 && code < 300) return { color: 'var(--color-success)', bg: 'rgba(45,164,78,0.10)', label: t('logs.ok') };
  if (code === 429) return { color: 'var(--color-warning)', bg: 'rgba(217,119,6,0.10)', label: t('logs.rateLimited') };
  if (code >= 400) return { color: 'var(--color-danger)', bg: 'rgba(231,76,60,0.10)', label: t('logs.error') };
  return { color: 'var(--color-text-muted)', bg: 'rgba(92,99,112,0.10)', label: String(code) };
}

function latencyColor(ms: number): string {
  if (ms < 500) return 'var(--color-success)';
  if (ms < 2000) return 'var(--color-warning)';
  return 'var(--color-danger)';
}

function latencyBg(ms: number): string {
  if (ms < 500) return 'rgba(45,164,78,0.10)';
  if (ms < 2000) return 'rgba(217,119,6,0.10)';
  return 'rgba(231,76,60,0.10)';
}

function formatBytes(n: number | undefined): string {
  if (n === undefined || n === null) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

function tryFormatJson(err: string): string | null {
  try {
    const parsed = JSON.parse(err);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return null;
  }
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  // Fallback for non-HTTPS environments
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  return Promise.resolve();
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = useCallback(() => {
    copyText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  const { t } = useLocale();
  return (
    <button onClick={handle} style="margin-left:6px;padding:2px 6px;font-size:10px;border-radius:4px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text-muted);cursor:pointer;line-height:1;white-space:nowrap"
      title={t('common.copy')}
    >
      {copied ? t('logs.copied') : t('common.copy')}
    </button>
  );
}

export function LogEntryRow({ entry }: LogEntryProps) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(v => !v), []);
  const s = statusStyle(entry.status, t);
  const isAliased = entry.claudeModel !== entry.resolvedModel;
  const totalTokens = (entry.inputTokens || 0) + (entry.outputTokens || 0);
  const inputPct = totalTokens > 0 ? Math.round(((entry.inputTokens || 0) / totalTokens) * 100) : 0;
  const outputPct = totalTokens > 0 ? Math.round(((entry.outputTokens || 0) / totalTokens) * 100) : 0;
  const formattedError = entry.error ? tryFormatJson(entry.error) : null;

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

        {/* Token bar */}
        {totalTokens > 0 && (
          <span style="display:flex;align-items:center;gap:4px;min-width:80px;max-width:120px">
            <span style="display:flex;height:6px;border-radius:3px;overflow:hidden;flex:1;background:var(--color-border)">
              <span style={`width:${inputPct}%;background:var(--color-primary);display:block`} />
              <span style={`width:${outputPct}%;background:var(--color-success);display:block`} />
            </span>
            <span style="font-size:10px;color:var(--color-text-muted);white-space:nowrap;font-family:monospace">{totalTokens}</span>
          </span>
        )}

        {/* Protocol */}
        <span style="font-size:11px;color:var(--color-text-muted);white-space:nowrap;background:var(--color-bg-elevated);padding:2px 6px;border-radius:4px;border:1px solid var(--color-border)">
          {entry.protocol}
        </span>

        {/* Latency with color */}
        <span style={`font-size:12px;font-family:monospace;white-space:nowrap;min-width:52px;text-align:right;padding:2px 6px;border-radius:4px;background:${latencyBg(entry.durationMs)};color:${latencyColor(entry.durationMs)}`}>
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

      <div
        style={{
          maxHeight: expanded ? '600px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease, opacity 0.2s ease',
          opacity: expanded ? 1 : 0,
        }}
      >
        <div style="padding:14px 20px;border-top:1px solid var(--color-border);background:var(--color-bg);font-size:13px">
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px 24px">
            <div>
              <div style="color:var(--color-text-muted);margin-bottom:1px">{t('logs.requestId')}</div>
              <div style="font-family:monospace;color:var(--color-text-dim);font-size:12px;display:flex;align-items:center">
                {entry.requestId}
                <CopyBtn text={entry.requestId} />
              </div>
            </div>
            <div>
              <div style="color:var(--color-text-muted);margin-bottom:1px">{t('logs.fullTime')}</div>
              <div style="color:var(--color-text-dim)">{new Date(entry.time).toLocaleString()}</div>
            </div>
            <div>
              <div style="color:var(--color-text-muted);margin-bottom:1px">{t('logs.protocol')}</div>
              <div style="color:var(--color-text-dim)">{entry.protocol}{entry.stream ? ` · ${t('logs.streaming')}` : ''}</div>
            </div>
            {entry.targetUrl && (
              <div>
                <div style="color:var(--color-text-muted);margin-bottom:1px">{t('logs.targetUrl')}</div>
                <div style="color:var(--color-text-dim);font-size:12px;word-break:break-all;display:flex;align-items:flex-start">
                  {entry.targetUrl}
                  <CopyBtn text={entry.targetUrl} />
                </div>
              </div>
            )}
            {entry.responseSize !== undefined && (
              <div>
                <div style="color:var(--color-text-muted);margin-bottom:1px">{t('logs.responseSize')}</div>
                <div style="color:var(--color-text-dim)">{formatBytes(entry.responseSize)}</div>
              </div>
            )}
            {totalTokens > 0 && (
              <div>
                <div style="color:var(--color-text-muted);margin-bottom:1px">{t('logs.tokensDetail')}</div>
                <div style="color:var(--color-text-dim);font-size:12px">
                  <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
                    <span style="width:8px;height:8px;border-radius:2px;background:var(--color-primary);display:inline-block" />
                    {t('logs.inputTokens')}: {entry.inputTokens || 0}
                  </span>
                  <span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
                    <span style="width:8px;height:8px;border-radius:2px;background:var(--color-success);display:inline-block" />
                    {t('logs.outputTokens')}: {entry.outputTokens || 0}
                  </span>
                  <span style="color:var(--color-text-muted)">= {totalTokens}</span>
                </div>
              </div>
            )}
          </div>
          {entry.error && (
            <div style="margin-top:10px;padding:10px 14px;border-radius:6px;background:rgba(231,76,60,0.08);border:1px solid rgba(231,76,60,0.15)">
              <div style="font-size:12px;font-weight:600;color:var(--color-danger);margin-bottom:4px">{t('logs.error')}</div>
              {formattedError ? (
                <pre style="font-family:monospace;font-size:12px;color:var(--color-danger);white-space:pre-wrap;word-break:break-all;margin:0;line-height:1.5">{formattedError}</pre>
              ) : (
                <div style="font-family:monospace;font-size:12px;color:var(--color-danger);word-break:break-all">{entry.error}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
