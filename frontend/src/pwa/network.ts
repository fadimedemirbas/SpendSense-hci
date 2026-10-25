let pending = 0;
const listeners = new Set<() => void>();
let reconnectRequired = typeof navigator !== "undefined" && navigator.onLine === false;
if (typeof window !== "undefined") {
  window.addEventListener("offline", () => {
    reconnectRequired = true;
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) reconnectRequired = true;
  });
}
export const subscribeNetwork = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const pendingNetwork = () => pending;
const notify = () => listeners.forEach((listener) => listener());

export async function onlineOperation<T>(operation: () => PromiseLike<T>): Promise<T> {
  if (reconnectRequired || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    throw new Error("You are offline. Reconnect and reload before saving or signing in.");
  }
  pending++;
  notify();
  try {
    return await operation();
  } finally {
    pending--;
    notify();
  }
}
