export type ToastVariant = "success" | "error";

export interface ToastRecord {
  id: string;
  message: string;
  variant: ToastVariant;
  closing: boolean;
}

type Listener = (toasts: ToastRecord[]) => void;

const listeners = new Set<Listener>();
let activeToasts: ToastRecord[] = [];
let nextToastId = 0;

function emit() {
  for (const listener of listeners) {
    listener(activeToasts);
  }
}

function removeToast(id: string) {
  activeToasts = activeToasts.filter((toastItem) => toastItem.id !== id);
  emit();
}

function dismiss(id?: string) {
  if (!id) {
    const ids = activeToasts.map((toastItem) => toastItem.id);
    activeToasts = activeToasts.map((toastItem) => ({ ...toastItem, closing: true }));
    emit();
    ids.forEach((toastId) => {
      setTimeout(() => removeToast(toastId), 220);
    });
    return;
  }

  const toastItem = activeToasts.find((item) => item.id === id);
  if (!toastItem || toastItem.closing) {
    return;
  }

  activeToasts = activeToasts.map((item) => item.id === id ? { ...item, closing: true } : item);
  emit();
  setTimeout(() => removeToast(id), 220);
}

function enqueue(variant: ToastVariant, message: string) {
  const id = `toast-${nextToastId++}`;
  activeToasts = [...activeToasts, { id, message, variant, closing: false }];
  emit();
  setTimeout(() => dismiss(id), 4000);
  return id;
}

export const toast = {
  success(message: string) {
    return enqueue("success", message);
  },
  error(message: string) {
    return enqueue("error", message);
  },
  dismiss,
};

export function subscribeToToasts(listener: Listener) {
  listeners.add(listener);
  listener(activeToasts);

  return () => {
    listeners.delete(listener);
  };
}