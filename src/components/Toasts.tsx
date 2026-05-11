import { useEffect } from 'react';

export interface Toast {
  id: number;
  message: string;
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function Toasts({ toasts, onDismiss }: Props) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => onDismiss(t.id), 2400));
    return () => { timers.forEach(clearTimeout); };
  }, [toasts, onDismiss]);

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">{t.message}</div>
      ))}
    </div>
  );
}
