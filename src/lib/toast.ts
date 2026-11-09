/** Tiny pub/sub toast bus — no context plumbing required. */

export interface ToastItem {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

type Listener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function publish(): void {
  const snapshot = [...toasts];
  for (const fn of listeners) fn(snapshot);
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  fn([...toasts]);
  return () => listeners.delete(fn);
}

export function toast(message: string, opts: { actionLabel?: string; onAction?: () => void; ttl?: number } = {}): void {
  const id = nextId++;
  const item: ToastItem = { id, message, actionLabel: opts.actionLabel, onAction: opts.onAction };
  toasts = [...toasts.slice(-2), item]; // keep at most 3
  publish();
  const ttl = opts.ttl ?? 4200;
  if (ttl > 0) window.setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  publish();
}
