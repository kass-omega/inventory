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
    return Promise.reject(err);
  },
);

export default api;
