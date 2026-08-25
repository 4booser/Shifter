'use client';

import { create } from 'zustand';

/**
 * A small global toast stack for moments that happen outside any one page:
 * a badge unlocking, a live shift landing on the calendar. Errors stay in
 * the Alert components next to what failed; this is for good news.
 */

export interface Toast {
  id: number;
  icon: string;
  title: string;
  text?: string;
  leaving?: boolean;
}

interface ToastState {
  toasts: Toast[];
}

export const useToasts = create<ToastState>(() => ({ toasts: [] }));

let nextId = 1;

export function pushToast(toast: Omit<Toast, 'id'>): void {
  const id = nextId;

  nextId += 1;
  useToasts.setState((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));

  // Mark it leaving first so the exit animation plays, then drop it.
  setTimeout(() => {
    useToasts.setState((state) => ({
      toasts: state.toasts.map((item) => (item.id === id ? { ...item, leaving: true } : item)),
    }));
  }, 5200);
  setTimeout(() => {
    useToasts.setState((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  }, 5600);
}

export function Toasts() {
  const toasts = useToasts((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" role="status">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" data-leaving={toast.leaving === true}>
          <span className="text-[1.4rem] leading-none">{toast.icon}</span>
          <span className="min-w-0">
            <strong className="block text-[0.88rem]">{toast.title}</strong>
            {toast.text !== undefined && <span className="field-hint">{toast.text}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
