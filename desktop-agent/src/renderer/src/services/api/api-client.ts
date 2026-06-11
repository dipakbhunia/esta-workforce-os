import { environment } from '../../config/environment';
import type { AuthResponse } from '../../types/api';
import { tokenStorage } from '../storage/token-storage';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
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
    const tokens = await tokenStorage.get();
    const response = await fetch(`${environment.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(tokens?.accessToken
          ? { Authorization: `Bearer ${tokens.accessToken}` }
          : {}),
        ...init.headers,
      },
    });

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
      throw new ApiError(message, response.status, body);
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
    const response = await fetch(`${environment.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    if (!response.ok) {
      await tokenStorage.clear();
      return false;
    }
    const refreshed = (await response.json()) as AuthResponse;
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
}

export const apiClient = new ApiClient();
