import type { Page } from '../types.js';
import { NAV_ITEMS } from '../lib/nav.js';
import { useLocale } from '../lib/i18n.js';

interface MobileNavProps {
  page: Page;
  navigate: (p: Page) => void;
}

export function MobileNav({ page, navigate }: MobileNavProps) {
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
    </nav>
  );
}
