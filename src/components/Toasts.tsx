import { useEffect, useState } from 'react';
import { subscribeToasts, dismissToast, type ToastItem } from '../lib/toast';

export default function Toasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
          <span className="toast-msg">{t.message}</span>
          {t.actionLabel && t.onAction && (
            <button className="toast-action" onClick={() => { t.onAction?.(); dismissToast(t.id); }}>
              {t.actionLabel}
            </button>
          )}
          <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
