import { useEffect, useRef } from 'preact/hooks';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => cancelRef.current?.focus(), 10);
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      class="fixed inset-0 z-[100] flex items-center justify-center"
      style="background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        class="w-full rounded-xl overflow-hidden"
        style="max-width:400px;background:var(--color-surface);border:1px solid var(--color-border);box-shadow:0 20px 60px rgba(0,0,0,0.5);animation:slideUp 0.15s ease-out"
      >
        <div class="px-5 pt-5 pb-3">
          <h3 id="confirm-title" class="text-base font-semibold mb-2" style="color:var(--color-text)">{title}</h3>
          <p class="text-sm" style="color:var(--color-text-dim)">{message}</p>
        </div>
        <div class="flex items-center justify-end gap-2 px-5 py-4" style="border-top:1px solid var(--color-border)">
          <button
            ref={cancelRef}
            onClick={onCancel}
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style="color:var(--color-text);background:var(--color-bg)"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
            style={danger ? 'background:var(--color-danger)' : 'background:var(--color-primary)'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
