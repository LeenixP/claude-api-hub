import { useEffect, useRef, useCallback } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ComponentChildren;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, children, maxWidth = '480px' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);
  const lastFocusableRef = useRef<HTMLElement | null>(null);

  const updateFocusable = useCallback(() => {
    if (!dialogRef.current) return;
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusableRef.current = focusable[0] || null;
    lastFocusableRef.current = focusable[focusable.length - 1] || null;
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus first focusable element after render
    const timer = setTimeout(() => {
      updateFocusable();
      firstFocusableRef.current?.focus();
    }, 10);

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        updateFocusable();
        const first = firstFocusableRef.current;
        const last = lastFocusableRef.current;
        if (!first || !last) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // Prevent body scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose, updateFocusable]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center"
      style="background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        class="w-full rounded-xl"
        style={`max-width:${maxWidth};max-height:90vh;overflow-y:auto;background:var(--color-surface);border:1px solid var(--color-border);box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:slideUp 0.15s ease-out`}
      >
        <div class="flex items-center justify-between" style="padding:20px 24px;border-bottom:1px solid var(--color-border)">
          <h2 id="modal-title" style="font-size:18px;font-weight:700;color:var(--color-text)">{title}</h2>
          <button
            onClick={onClose}
            class="p-1 rounded-md transition-colors hover:opacity-80"
            style="color:var(--color-text-muted)"
            aria-label="Close dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div style="padding:24px">{children}</div>
      </div>
    </div>
  );
}
