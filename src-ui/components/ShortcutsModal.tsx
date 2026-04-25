import { useLocale } from '../lib/i18n.js';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  const { t } = useLocale();
  if (!open) return null;

  const shortcuts = [
    ['?', t('shortcuts.toggleDialog')],
    ['1', t('app.dashboard')],
    ['2', t('app.providers')],
    ['3', t('app.aliases')],
    ['4', t('app.logs')],
    ['5', t('app.config')],
    ['6', 'Guide'],
    ['Esc', t('shortcuts.closeModals')],
  ];

  return (
    <div
      style="position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcuts.title')}
    >
      <div
        style="background:var(--color-surface);border:1px solid var(--color-border-strong);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:var(--shadow-card-hover)"
        onClick={e => e.stopPropagation()}
        onKeyDown={(e: any) => {
          if (e.key === 'Escape') { onClose(); return; }
          if (e.key !== 'Tab') return;
          const dialog = e.currentTarget as HTMLElement;
          const focusable = dialog.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}
      >
        <div class="flex items-center justify-between mb-6">
          <h2 style="font-size:18px;font-weight:700;color:var(--color-text)">{t('shortcuts.title')}</h2>
          <button
            onClick={onClose}
            style="background:none;border:none;cursor:pointer;color:var(--color-text-muted);padding:4px"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          {shortcuts.map(([key, desc]) => (
            <div key={key} style="display:flex;align-items:center;justify-content:space-between">
              <kbd style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:28px;padding:0 8px;border-radius:6px;font-size:13px;font-weight:600;font-family:monospace;background:var(--color-bg);border:1px solid var(--color-border-strong);color:var(--color-text)">{key}</kbd>
              <span style="font-size:14px;color:var(--color-text-dim)">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
