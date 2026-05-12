import { useEffect } from 'react';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  /** Auto-dismiss after this many ms (default 2400; longer when an action is present). */
  durationMs?: number;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function Toasts({ toasts, onDismiss }: Props) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => {
      const ms = t.durationMs ?? (t.action ? 6000 : 2400);
      return setTimeout(() => onDismiss(t.id), ms);
    });
    return () => { timers.forEach(clearTimeout); };
  }, [toasts, onDismiss]);

  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-msg">{t.message}</span>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => { t.action!.run(); onDismiss(t.id); }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
