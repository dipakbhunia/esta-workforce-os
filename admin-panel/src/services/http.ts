import axios, { type AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';

export interface AuthAxiosRequestConfig<D = unknown> extends AxiosRequestConfig<D> {
  skipAuthRefresh?: boolean;
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api',
  timeout: 15000,
});

interface AuthAwareRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
}

interface HttpAuthHandlers {
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onSessionExpired: () => void;
}

let authHandlers: HttpAuthHandlers | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function configureHttpAuth(handlers: HttpAuthHandlers) {
  authHandlers = handlers;
}

http.interceptors.request.use((config) => {
  const token = authHandlers?.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AuthAwareRequestConfig | undefined;

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.skipAuthRefresh ||
      !authHandlers
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      refreshPromise ??= authHandlers.refreshAccessToken().finally(() => {
        refreshPromise = null;
      });

      const token = await refreshPromise;

      if (!token) {
        authHandlers.onSessionExpired();
        return Promise.reject(error);
      }

      originalRequest.headers.Authorization = `Bearer ${token}`;
      return http(originalRequest);
    } catch (refreshError) {
      authHandlers.onSessionExpired();
      return Promise.reject(refreshError);
    }
  },
);
