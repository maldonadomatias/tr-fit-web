import axios, { type AxiosRequestConfig, AxiosError } from 'axios';
import {
  getAccessToken,
  getRefreshToken,
  setTokens,
  clearAuth,
} from './auth-storage';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5001/api';

export const api = axios.create({ baseURL: BASE_URL });

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
      setTokens(res.data.accessToken, res.data.refreshToken);
      return true;
    } catch {
      clearAuth();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

api.interceptors.request.use((cfg) => {
  const t = getAccessToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// Auth endpoints own their own 401 semantics: a bad-login 401 is an expected
// form error, and a refresh/logout 401 must not re-enter the refresh flow.
// Treating them as "session expired" would full-page-reload the login screen.
export function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

// Decides whether a failed response is an expired session worth refreshing
// (and, on failure, redirecting to /login).
export function shouldHandleAuthExpiry(
  status: number | undefined,
  url: string | undefined,
  retried: boolean | undefined
): boolean {
  if (status !== 401 || retried) return false;
  return !isAuthEndpoint(url);
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (cfg && shouldHandleAuthExpiry(error.response?.status, cfg.url, cfg._retried)) {
      cfg._retried = true;
      const ok = await tryRefresh();
      if (ok) return api(cfg);
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
