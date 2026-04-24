import { useState, useEffect } from 'preact/hooks';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
const listeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = ++toastId;
  toasts = [{ id, message, type }, ...toasts].slice(0, 5);
  notify();
  const delay = type === 'error' ? 6000 : 3500;
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, delay);
}

export function ToastContainer() {
  const [, setLocalToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const fn = (t: ToastItem[]) => setLocalToasts(t);
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  return (
    <div style="position:fixed;bottom:24px;right:24px;z-index:200;display:flex;flex-direction:column;gap:12px;max-width:420px"
      aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => {
        const colors = toast.type === 'success'
          ? { bg: 'var(--color-success)', icon: '<polyline points="20 6 9 17 4 12"/>' }
          : toast.type === 'error'
          ? { bg: 'var(--color-danger)', icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' }
          : { bg: 'var(--color-primary)', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' };
        return (
          <div key={toast.id}
            style={`display:flex;align-items:center;gap:12px;padding:16px 20px;border-radius:12px;font-size:14px;font-weight:500;color:#fff;background:${colors.bg};box-shadow:0 8px 24px rgba(0,0,0,0.3);animation:slideUp 0.25s ease-out;min-width:280px`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"
              dangerouslySetInnerHTML={{ __html: colors.icon }} />
            <span style="line-height:1.4">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
