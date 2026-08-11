import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { uuid } from '@/lib/uuid';

type ToastKind = 'error' | 'success';

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = uuid();
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    // Errors linger; successes fade.
    const ttl = t.kind === 'error' ? 9000 : 4000;
    window.setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** In-app replacements for window.alert — never blocks the page. */
export const toast = {
  error: (title: string, detail?: string) =>
    useToastStore.getState().push({ kind: 'error', title, detail }),
  success: (title: string, detail?: string) =>
    useToastStore.getState().push({ kind: 'success', title, detail }),
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={
            'pointer-events-auto flex items-start gap-2 rounded-lg border-2 bg-white p-3 shadow-lg ' +
            (t.kind === 'error' ? 'border-red-500' : 'border-green-600')
          }
        >
          {t.kind === 'error' ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-heading text-sm font-bold uppercase tracking-wide">{t.title}</div>
            {t.detail && (
              <div className="mt-0.5 break-words text-xs leading-relaxed text-brand-steel">
                {t.detail}
              </div>
            )}
          </div>
          <button
            className="shrink-0 text-brand-steel hover:text-brand-black"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
