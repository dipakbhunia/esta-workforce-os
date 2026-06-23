import { environment } from '../../config/environment';
import { parseAuthResponse } from '../../types/api';
import { tokenStorage } from '../storage/token-storage';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
    readonly targetUrl?: string,
  ) {
    super(message);
  }
}

class ApiClient {
  private refreshPromise: Promise<boolean> | null = null;

  async request<T>(
    path: string,
    init: RequestInit = {},
    retryAfterRefresh = true,
  ): Promise<T> {
    const targetUrl = this.url(path);
    if (path === '/auth/login') {
      console.info(`[Esta Desktop] Login request URL: ${targetUrl}`);
    }
    const tokens = await tokenStorage.get();
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(tokens?.accessToken
            ? { Authorization: `Bearer ${tokens.accessToken}` }
            : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw this.networkError(targetUrl, error);
    }

    if (
      response.status === 401 &&
      retryAfterRefresh &&
      !path.startsWith('/auth/')
    ) {
      const refreshed = await this.refresh();
      if (refreshed) return this.request<T>(path, init, false);
    }

    const body = await this.parseBody(response);
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'message' in body
          ? String(body.message)
          : `Request failed with status ${response.status}`;
      throw new ApiError(`${message} (${targetUrl})`, response.status, body, targetUrl);
    }
    return body as T;
  }

  private async refresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async performRefresh(): Promise<boolean> {
    const tokens = await tokenStorage.get();
    if (!tokens?.refreshToken) return false;
    const targetUrl = this.url('/auth/refresh');
    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch (error) {
      console.warn(this.networkError(targetUrl, error).message);
      return false;
    }
    if (!response.ok) {
      await tokenStorage.clear();
      return false;
    }
    const refreshed = parseAuthResponse(await response.json());
    await tokenStorage.set({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
    });
    return true;
  }

  private async parseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private url(path: string): string {
    return `${environment.apiBaseUrl}${path}`;
  }

  private networkError(targetUrl: string, error: unknown): ApiError {
    const reason = error instanceof Error ? error.message : String(error);
    return new ApiError(
      `Failed to fetch ${targetUrl}. Check that the backend is running and that CORS allows the Electron/Vite renderer origin. Original error: ${reason}`,
      0,
      error,
      targetUrl,
    );
  }
}

export const apiClient = new ApiClient();
