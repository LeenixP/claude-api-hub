import { useState } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { CopyButton } from '../common/CopyButton.js';

interface QuickStartProps {
  config: GatewayConfig | null;
}

export function QuickStart({ config }: QuickStartProps) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('quickstartDismissed') === 'true';
  });

  if (dismissed || !config) return null;

  const gatewayUrl = `${window.location.protocol}//${window.location.host}`;
  const providerCount = Object.keys(config.providers || {}).length;
  const activeProviders = Object.values(config.providers || {}).filter(p => p.enabled).length;

  const handleDismiss = () => {
    localStorage.setItem('quickstartDismissed', 'true');
    setDismissed(true);
  };

  return (
    <div class="welcome-banner" style="margin-bottom:24px">
      <div class="flex items-start justify-between gap-4">
        <div class="flex-1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:#fff">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--color-text)">Welcome to API Hub</div>
              <div style="font-size:12px;color:var(--color-text-dim)">
                {activeProviders} of {providerCount} providers active · Gateway running at <code style="font-size:11px;padding:1px 6px;border-radius:4px;background:var(--color-bg);color:var(--color-primary)">{gatewayUrl}</code>
              </div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--color-bg);font-size:12px;color:var(--color-text-dim)">
              <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:10px;font-weight:700">1</span>
              Configure providers
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--color-bg);font-size:12px;color:var(--color-text-dim)">
              <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:10px;font-weight:700">2</span>
              Set up aliases
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--color-bg);font-size:12px;color:var(--color-text-dim)">
              <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:10px;font-weight:700">3</span>
              Point Claude Code at {gatewayUrl}
              <CopyButton text={gatewayUrl} />
            </div>
          </div>
        </div>
        <button onClick={handleDismiss} style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:4px;flex-shrink:0" title="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  );
}
