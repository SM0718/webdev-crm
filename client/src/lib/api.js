import axios from "axios";

export const TOKEN_KEY = "webdev-crm.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Handlers registered by AuthContext so a 401 can clear the session globally. */
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const isAuthRoute = error.config?.url?.includes("/auth/login");

    if (status === 401 && !isAuthRoute) {
      clearToken();
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** Turns any axios/zod failure into a single readable sentence. */
export function toMessage(error, fallback = "Something went wrong.") {
  return (
    error?.response?.data?.message ??
    error?.response?.data?.error ??
    (error?.code === "ECONNABORTED"
      ? "The server took too long to respond."
      : null) ??
    (error?.message === "Network Error"
      ? "Cannot reach the API. Either it is down, or this site's URL is not in the server's CORS allow-list (CLIENT_URL). Check the browser console for a CORS error."
      : null) ??
    error?.message ??
    fallback
  );
}

/**
 * Downloads a binary response (the lead PDF) as a file. A plain `window.open`
 * cannot be used here because the token lives in localStorage, not a cookie.
 */
export async function downloadFile(path, fallbackName = "download") {
  const response = await api.get(path, {
    responseType: "blob",
    timeout: 60000,
  });

  const disposition = response.headers?.["content-disposition"] ?? "";
  const fromHeader = /filename="?([^";]+)"?/i.exec(disposition)?.[1];

  const blobUrl = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fromHeader || fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a beat to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

export default api;
