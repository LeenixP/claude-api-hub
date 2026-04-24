import { useState, useEffect, useCallback } from 'preact/hooks';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
  createdAt: number;
}

let toastId = 0;
const listeners: ((toasts: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = ++toastId;
  const duration = type === 'error' ? 6000 : 3500;
  toasts = [{ id, message, type, duration, createdAt: Date.now() }, ...toasts].slice(0, 5);
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, duration);
}

const barColors: Record<ToastType, string> = {
  success: '#30A46C',
  error: '#FF5252',
  info: '#2AA2C1',
};

export function ToastContainer() {
  const [localToasts, setLocalToasts] = useState<ToastItem[]>([]);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  useEffect(() => {
    const fn = (t: ToastItem[]) => setLocalToasts(t);
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, []);

  return (
    <div style="position:fixed;bottom:24px;right:24px;z-index:200;display:flex;flex-direction:column;gap:12px;max-width:420px"
      aria-live="polite" aria-atomic="true">
      <style>{`
        @keyframes toast-slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes toast-progress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
      {localToasts.map((toast) => {
        const iconPaths = toast.type === 'success'
          ? '<polyline points="20 6 9 17 4 12"/>'
          : toast.type === 'error'
          ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
          : '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
        const bgColor = toast.type === 'success'
          ? 'var(--color-success)'
          : toast.type === 'error'
          ? 'var(--color-danger)'
          : 'var(--color-primary)';
        const isHovered = hoveredId === toast.id;
        return (
          <div key={toast.id}
            onClick={() => dismiss(toast.id)}
            onMouseEnter={() => setHoveredId(toast.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={`display:flex;align-items:center;gap:12px;padding:16px 20px 20px 20px;border-radius:12px;font-size:14px;font-weight:500;color:#fff;background:${bgColor};box-shadow:0 8px 24px rgba(0,0,0,0.3);animation:toast-slide-in 0.3s ease-out;min-width:280px;position:relative;overflow:hidden;cursor:pointer;user-select:none`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"
              dangerouslySetInnerHTML={{ __html: iconPaths }} />
            <span style="line-height:1.4;flex:1">{toast.message}</span>
            <div
              style={`position:absolute;bottom:0;left:0;height:3px;border-radius:0 0 0 12px;background:${barColors[toast.type]};animation:toast-progress ${toast.duration}ms linear forwards;animation-play-state:${isHovered ? 'paused' : 'running'}`}
            />
          </div>
        );
      })}
    </div>
  );
}
