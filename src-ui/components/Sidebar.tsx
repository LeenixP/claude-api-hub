import type { Page } from '../types.js';
import { ThemeToggle } from './common/ThemeToggle.js';
import { LanguageToggle } from './common/LanguageToggle.js';
import { NAV_ITEMS } from '../lib/nav.js';
import { useLocale } from '../lib/i18n.js';

interface SidebarProps {
  page: Page;
  navigate: (p: Page) => void;
  version?: string;
}

export function Sidebar({ page, navigate, version }: SidebarProps) {
  const { t } = useLocale();
  return (
    <nav class="hidden lg:flex flex-col fixed h-screen" style="width:var(--sidebar-width);background:var(--color-surface);border-right:1px solid var(--color-border);z-index:50">
      <div style="padding:20px 24px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:14px">
        <img src="/icon.png" alt="API Hub" style="width:44px;height:44px;border-radius:12px;flex-shrink:0" />
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--color-text);line-height:1.3">API Hub</div>
          <div style="font-size:12px;color:var(--color-text-muted);display:flex;align-items:center;gap:4px">
            v{version || '...'}
            <a href="https://github.com/LeenixP/claude-api-hub/releases" target="_blank" rel="noopener noreferrer" style="color:var(--color-text-muted);display:inline-flex;align-items:center" title="View changelog" aria-label="View changelog">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </div>
        </div>
      </div>
      <div style="flex:1;padding:12px">
        {NAV_ITEMS.map(({ id, label, labelKey, icon }) => (
          <button key={id} onClick={() => navigate(id)}
            class={`nav-item ${page === id ? 'nav-item-active' : ''}`}
            style="width:100%;border:none;border-radius:10px;margin-bottom:4px;border-right:none"
            aria-current={page === id ? 'page' : undefined}>
            {icon(22)}
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>
      <div style="padding:16px 20px;border-top:1px solid var(--color-border);display:flex;align-items:center;justify-content:center;gap:16px">
        <ThemeToggle />
        <div style="width:1px;height:20px;background:var(--color-border)" />
        <LanguageToggle />
      </div>
    </nav>
  );
}
