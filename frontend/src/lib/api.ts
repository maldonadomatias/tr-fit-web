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

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const cfg = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (cfg && error.response?.status === 401 && !cfg._retried) {
      cfg._retried = true;
      const ok = await tryRefresh();
      if (ok) return api(cfg);
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
