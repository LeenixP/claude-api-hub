import { useState, useCallback, useEffect, useRef } from 'preact/hooks';
import { useApi } from '../../hooks/useApi.js';
import { performUpdate, restartServer } from '../../lib/api.js';
import { useLocale } from '../../lib/i18n.js';

interface SystemInfoData {
  localVersion: string;
  uptime: number;
  nodeVersion: string;
  platform: string;
  memoryUsage: { rss: number; heapTotal: number; heapUsed: number };
  cpuUsage: { user: number; system: number };
  processPid: number;
  serverTime: string;
  installMethod: string;
}

interface UpdateInfo {
  localVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  error?: string;
}

type UpdateState = 'idle' | 'checking' | 'available' | 'updating' | 'updateDone' | 'restarting' | 'error';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)}MB`;
}

function formatCpuPercent(user: number, system: number): string {
  const totalMicros = user + system;
  const totalSeconds = totalMicros / 1e6;
  const pct = Math.min(totalSeconds / 10, 100);
  return `${pct.toFixed(1)}%`;
}

const ICONS: Record<string, JSX.Element> = {
  tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>,
  cpu: <><rect x="4" y="4" width="16" height="16" rx="2" ry="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" /></>,
  clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  monitor: <><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>,
  barChart: <><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  timer: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
};

export function SystemInfo() {
  const { t } = useLocale();
  const { data: sysInfo } = useApi<SystemInfoData>('/api/system-info', { immediate: true, pollIntervalMs: 30000 });
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollForRestart = useCallback(() => {
    let attempts = 0;
    const maxAttempts = 30;
    const poll = () => {
      if (attempts >= maxAttempts) {
        setUpdateState('error');
        setErrorMsg(t('sysinfo.restartFailed'));
        return;
      }
      attempts++;
      pollTimerRef.current = setTimeout(async () => {
        try {
          const token = localStorage.getItem('adminToken') || '';
          const res = await fetch('/api/system-info', {
            headers: token ? { 'x-admin-token': token } : {},
          });
          if (res.ok) {
            // Service is back — reload page to get fresh version
            window.location.reload();
            return;
          }
        } catch { /* not back yet */ }
        poll();
      }, 2000);
    };
    poll();
  }, []);

  useEffect(() => {
    return () => clearPollTimer();
  }, [clearPollTimer]);

  const handleCheckUpdate = useCallback(async () => {
    setUpdateState('checking');
    try {
      const token = localStorage.getItem('adminToken') || '';
      const res = await fetch('/api/check-update', {
        headers: token ? { 'x-admin-token': token } : {},
      });
      if (res.ok) {
        const info = await res.json() as UpdateInfo;
        setUpdateInfo(info);
        setUpdateState(info.hasUpdate ? 'available' : 'idle');
        if (!info.hasUpdate && !info.error) {
          // Briefly show "up to date" then reset
          setTimeout(() => setUpdateInfo(null), 2000);
        }
      } else {
        setUpdateState('idle');
      }
    } catch {
      setUpdateState('idle');
    }
  }, []);

  const handleUpdate = useCallback(async () => {
    setUpdateState('updating');
    try {
      const result = await performUpdate();
      if (result.success) {
        setNewVersion(result.newVersion);
        setUpdateState('updateDone');
        // Auto-restart after 2s
        setTimeout(async () => {
          setUpdateState('restarting');
          try {
            await restartServer();
          } catch { /* server might close connection before responding */ }
          // Start polling for service recovery
          pollForRestart();
        }, 2000);
      } else {
        setUpdateState('error');
        setErrorMsg(result.error || t('sysinfo.updateFailed'));
      }
    } catch (err) {
      setUpdateState('error');
      setErrorMsg((err as Error).message);
    }
  }, [pollForRestart]);

  const muted = 'var(--color-text-muted)';

  const items = sysInfo ? [
    {
      icon: ICONS.tag,
      label: t('sysinfo.version'),
      value: sysInfo.localVersion,
      extra: updateInfo?.hasUpdate && updateState === 'available' ? (
        <span style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;color:var(--color-warning)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
          v{updateInfo.latestVersion} {t('sysinfo.updateAvailable', { version: '' }).trim()}
        </span>
      ) : null,
    },
    { icon: ICONS.cpu, label: t('sysinfo.nodeVersion'), value: sysInfo.nodeVersion },
    {
      icon: ICONS.clock,
      label: t('sysinfo.serverTime'),
      value: new Date(sysInfo.serverTime).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }),
    },
    { icon: ICONS.monitor, label: t('sysinfo.platform'), value: sysInfo.platform },
    {
      icon: ICONS.barChart,
      label: t('sysinfo.memoryUsage'),
      value: `${formatBytes(sysInfo.memoryUsage.heapUsed)} / ${formatBytes(sysInfo.memoryUsage.rss)}`,
    },
    {
      icon: ICONS.zap,
      label: t('sysinfo.cpuUsage'),
      value: formatCpuPercent(sysInfo.cpuUsage.user, sysInfo.cpuUsage.system),
    },
    { icon: ICONS.settings, label: t('sysinfo.processPid'), value: String(sysInfo.processPid) },
    { icon: ICONS.timer, label: t('sysinfo.uptime'), value: formatUptime(sysInfo.uptime) },
  ] : [];

  const btnBase = "padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;border:none;";

  function renderUpdateButton() {
    switch (updateState) {
      case 'checking':
        return (
          <button disabled style={`${btnBase}border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text)`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {t('sysinfo.checking')}
          </button>
        );
      case 'available':
        return (
          <button onClick={handleUpdate} style={`${btnBase}background:var(--color-primary);color:#fff`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {t('sysinfo.updateTo', { version: `v${updateInfo?.latestVersion}` })}
          </button>
        );
      case 'updating':
        return (
          <button disabled style={`${btnBase}background:var(--color-warning);color:#fff`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {t('sysinfo.updating')}
          </button>
        );
      case 'updateDone':
        return (
          <button disabled style={`${btnBase}background:var(--color-success);color:#fff`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {t('sysinfo.updateDone', { version: newVersion })}
          </button>
        );
      case 'restarting':
        return (
          <button disabled style={`${btnBase}background:var(--color-primary);color:#fff`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            {t('sysinfo.restarting')}
          </button>
        );
      case 'error':
        return (
          <div style="display:flex;gap:8px;align-items:center">
            <span style="font-size:12px;color:var(--color-danger)">{errorMsg}</span>
            <button onClick={handleUpdate} style={`${btnBase}background:var(--color-primary);color:#fff`}>{t('sysinfo.retry')}</button>
          </div>
        );
      default:
        return (
          <button onClick={handleCheckUpdate} style={`${btnBase}border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text)`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            {t('sysinfo.checkUpdate')}
          </button>
        );
    }
  }

  return (
    <div style="padding:24px;border-radius:12px;background:var(--color-surface);border:1px solid var(--color-border);margin-bottom:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:15px;font-weight:600;color:var(--color-text)">
          {t('sysinfo.title')}
        </div>
        <div style="display:flex;gap:8px">
          {renderUpdateButton()}
        </div>
      </div>

      {sysInfo ? (
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px">
          {items.map((item, i) => (
            <div key={i} style="display:flex;flex-direction:column;gap:4px">
              <div style="display:flex;align-items:center;gap:6px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  {item.icon}
                </svg>
                <span style="font-size:11px;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px">{item.label}</span>
              </div>
              <div style="font-size:13px;color:var(--color-text);font-weight:500;display:flex;align-items:center">
                {item.value}
                {item.extra || null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style="font-size:12px;color:var(--color-text-muted)">{t('app.loading')}</div>
      )}

      {updateInfo?.error && updateState !== 'error' && (
        <div style="margin-top:12px;padding:8px 12px;border-radius:6px;background:var(--color-error-bg, rgba(239,68,68,0.1));color:var(--color-danger);font-size:12px">
          {t('sysinfo.checkFailed')}: {updateInfo.error}
        </div>
      )}
    </div>
  );
}
