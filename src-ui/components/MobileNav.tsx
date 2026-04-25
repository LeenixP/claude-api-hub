import type { Page } from '../types.js';
import { NAV_ITEMS } from '../lib/nav.js';
import { useLocale } from '../lib/i18n.js';

interface MobileNavProps {
  page: Page;
  navigate: (p: Page) => void;
  onShowShortcuts: () => void;
}

export function MobileNav({ page, navigate, onShowShortcuts }: MobileNavProps) {
  const { t } = useLocale();
  return (
    <nav class="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center" style="padding:10px 8px;background:var(--color-surface);border-top:1px solid var(--color-border)">
      {NAV_ITEMS.map(({ id, label, labelKey, icon }) => (
        <button key={id} onClick={() => navigate(id)}
          aria-label={t(labelKey)}
          aria-current={page === id ? 'page' : undefined}
          style={`position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 8px;font-size:11px;font-weight:500;background:none;border:none;cursor:pointer;color:${page === id ? 'var(--color-primary)' : 'var(--color-text-muted)'}`}>
          {page === id && <div style="position:absolute;top:0;left:25%;right:25%;height:2px;background:var(--color-primary);border-radius:0 0 2px 2px" />}
          {icon(24)}
          <span>{t(labelKey)}</span>
        </button>
      ))}
      <button onClick={onShowShortcuts}
        aria-label={t('shortcuts.title')}
        style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 8px;font-size:10px;font-weight:500;background:none;border:none;cursor:pointer;color:var(--color-text-muted)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>{t('mobile.help')}</span>
      </button>
    </nav>
  );
}
