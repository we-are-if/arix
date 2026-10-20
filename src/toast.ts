export type ToastTone = "success" | "error" | "warning" | "info";
export type ToastOptions = { tone?: ToastTone; title?: string; duration?: number };
export type ToastRequest = ToastOptions & { message: string };

export const TOAST_EVENT_NAME = "arix:toast";

export const showToast = (message: string, options: ToastOptions = {}) => {
  window.dispatchEvent(new CustomEvent<ToastRequest>(TOAST_EVENT_NAME, { detail: { message, ...options } }));
};
