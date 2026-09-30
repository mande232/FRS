import { toast as sonnerToast } from "sonner";

export { sonnerToast as toast };

export function showSuccess(message: string, description?: string) {
  sonnerToast.success(message, description ? { description } : undefined);
}

export function showError(message: string, description?: string) {
  sonnerToast.error(message, description ? { description } : undefined);
}

export function showInfo(message: string, description?: string) {
  sonnerToast.message(message, description ? { description } : undefined);
}

export function showPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: unknown) => string);
  },
) {
  return sonnerToast.promise(promise, messages);
}
