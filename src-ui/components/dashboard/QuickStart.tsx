import type { GatewayConfig } from '../../types.js';
import { CopyButton } from '../common/CopyButton.js';
import { useLocale } from '../../lib/i18n.js';

interface QuickStartProps {
  config: GatewayConfig | null;
}

export function QuickStart({ config }: QuickStartProps) {
  const { t } = useLocale();

  if (!config) return null;

  const gatewayUrl = `${window.location.protocol}//${window.location.host}`;
  const providerCount = Object.keys(config.providers || {}).length;
  const activeProviders = Object.values(config.providers || {}).filter(p => p.enabled).length;

  return (
    <div class="welcome-banner" style="margin-bottom:24px">
      <div>
        <div class="flex-1">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--color-primary);color:#fff">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--color-text)">{t('quickstart.welcome')}</div>
              <div style="font-size:12px;color:var(--color-text-dim)">
                {t('quickstart.status', { active: activeProviders, total: providerCount, url: gatewayUrl })}
              </div>
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--color-bg);font-size:12px;color:var(--color-text-dim)">
              <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:10px;font-weight:700">1</span>
              {t('quickstart.configProviders')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--color-bg);font-size:12px;color:var(--color-text-dim)">
              <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:10px;font-weight:700">2</span>
              {t('quickstart.setupAliases')}
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;background:var(--color-bg);font-size:12px;color:var(--color-text-dim)">
              <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--color-primary);color:#fff;font-size:10px;font-weight:700">3</span>
              <span style="display:flex;align-items:center;gap:4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
                <code style="font-family:monospace;font-size:11px;background:var(--color-surface-hover);padding:2px 6px;border-radius:4px;color:var(--color-text)">export ANTHROPIC_BASE_URL="{gatewayUrl}"</code>
              </span>
              <CopyButton text={`export ANTHROPIC_BASE_URL="${gatewayUrl}"`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
