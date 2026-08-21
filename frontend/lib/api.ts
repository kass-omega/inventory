import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000",
  headers: {
    "Content-Type": "application/json",
    // Custom header required by the backend CSRF protection; cross-origin
    // requests can only set it through a CORS preflight the API allows.
    "X-Requested-With": "XMLHttpRequest",
  },
  timeout: 30000,
  // The JWT lives in an HttpOnly cookie set by the backend; send it on
  // every request instead of reading a token from localStorage.
  withCredentials: true,
});

// Global in-flight request tracking (LoadingBar).
let pendingCount = 0;
const pendingListeners = new Set<(count: number) => void>();

function updatePending(delta: number) {
  pendingCount = Math.max(0, pendingCount + delta);
  pendingListeners.forEach((cb) => cb(pendingCount));
}

// Subscribe to in-flight request count changes.
// Returns an unsubscribe fn.
export function onApiPendingChange(cb: (count: number) => void) {
  pendingListeners.add(cb);
  cb(pendingCount);
  return () => {
    pendingListeners.delete(cb);
  };
}

api.interceptors.request.use((config) => {
  updatePending(1);
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    updatePending(-1);
    return res;
  },
  (err) => {
    updatePending(-1);
    if (typeof window !== "undefined") {
      const status = err?.response?.status;
      const url = err?.config?.url || "";
      if (status === 401 && !url.includes("/auth/login")) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user");
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }
    // Surface API errors in the UI unless the caller already handled them
    // (pages that show their own toast call markHandled(err) in catch). A 401
    // from the background /auth/me session check is expected when logged out.
    const isSessionCheck =
      err?.config?.method?.toLowerCase() === "get" &&
      String(err?.config?.url ?? "").includes("/auth/me");
    if (!err?.handled && !isSessionCheck) {
      setTimeout(() => {
        if (!err?.handled) emitApiError(err);
      }, 0);
    }
    return Promise.reject(err);
  },
);

// ---------------------------------------------------------------------------
// Global API error reporting
// ---------------------------------------------------------------------------

// Extract a human-friendly message from an API error.
export function getApiErrorMessage(err: any): string {
  const status = err?.response?.status;
  const data = err?.response?.data;
  let message = data?.message;
  if (Array.isArray(message)) message = message.join(", ");
  if (typeof message === "string" && message.trim()) {
    // Replace the generic Nest 403/401 messages with clearer guidance, but keep
    // specific backend messages (e.g. "Only the dispatching store can...").
    if (status === 403 && (message === "Forbidden resource" || message === "Forbidden")) {
      return "You don't have permission to perform this action.";
    }
    if (status === 401 && message === "Unauthorized") {
      return "Your session has expired. Please log in again.";
    }
    return message;
  }
  if (status === 403)
    return "You don't have permission to perform this action.";
  if (status === 401)
    return "Your session has expired. Please log in again.";
  if (err?.code === "ECONNABORTED")
    return "The request timed out. Please try again.";
  if (!err?.response) return err?.message || "Network error. Please try again.";
  return `Request failed (${status}). Please try again.`;
}

// Mark an error as already handled so the global handler doesn't toast twice.
export function markHandled(err: any) {
  if (err && typeof err === "object") err.handled = true;
}

type ApiErrorListener = (message: string, err: any) => void;
const errorListeners = new Set<ApiErrorListener>();

export function onApiError(listener: ApiErrorListener) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function emitApiError(err: any) {
  const message = getApiErrorMessage(err);
  errorListeners.forEach((listener) => listener(message, err));
}

export default api;
