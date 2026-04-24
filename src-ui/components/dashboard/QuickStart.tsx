import { useState } from 'preact/hooks';
import type { GatewayConfig } from '../../types.js';
import { CopyButton } from '../common/CopyButton.js';

interface QuickStartProps {
  config: GatewayConfig | null;
}

export function QuickStart({ config }: QuickStartProps) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('quickStartDismissed') === 'true';
  });

  if (dismissed) return null;
  if (!config) return null;
  const providerCount = Object.keys(config.providers || {}).length;
  if (providerCount > 0) return null;

  const gatewayUrl = `${window.location.protocol}//${window.location.host}`;
  const claudeConfig = JSON.stringify({
    apiUrl: `${gatewayUrl}/v1`,
    apiKey: config.adminToken || 'your-token',
  }, null, 2);

  const handleDismiss = () => {
    localStorage.setItem('quickStartDismissed', 'true');
    setDismissed(true);
  };

  return (
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:rgba(42,162,193,0.15)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div>
            <h3 class="text-sm font-semibold" style="color:var(--color-text)">Quick Start</h3>
            <p class="text-xs" style="color:var(--color-text-muted)">Get up and running in 3 steps</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          class="p-1 rounded transition-colors hover:opacity-80"
          style="color:var(--color-text-muted)"
          aria-label="Dismiss quick start"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div class="space-y-4">
        <div class="flex gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style="background:var(--color-primary);color:#fff">1</div>
          <div class="flex-1">
            <div class="text-sm font-medium mb-1" style="color:var(--color-text)">Gateway URL</div>
            <div class="flex items-center gap-2">
              <code class="flex-1 px-3 py-1.5 rounded text-xs font-mono" style="background:var(--color-bg);color:var(--color-text-dim)">{gatewayUrl}</code>
              <CopyButton text={gatewayUrl} />
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style="background:var(--color-primary);color:#fff">2</div>
          <div class="flex-1">
            <div class="text-sm font-medium mb-1" style="color:var(--color-text)">Configure Claude Code</div>
            <div class="flex items-start gap-2">
              <pre class="flex-1 px-3 py-2 rounded text-xs font-mono overflow-x-auto" style="background:var(--color-bg);color:var(--color-text-dim)">{claudeConfig}</pre>
              <CopyButton text={claudeConfig} />
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <div class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style="background:var(--color-primary);color:#fff">3</div>
          <div class="flex-1">
            <div class="text-sm font-medium mb-1" style="color:var(--color-text)">Restart Claude Code</div>
            <p class="text-xs" style="color:var(--color-text-muted)">Restart Claude Code to pick up the new configuration. Then add a provider below.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
