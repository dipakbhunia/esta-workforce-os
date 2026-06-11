import type { AuthResponse, AuthUser } from '../../types/api';
import { apiClient } from './api-client';
import { tokenStorage } from '../storage/token-storage';

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const response = await apiClient.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await tokenStorage.set({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
    });
    return response.user;
  },

  me(): Promise<AuthUser> {
    return apiClient.request<AuthUser>('/auth/me');
  },

  async logout(): Promise<void> {
    const tokens = await tokenStorage.get();
    try {
      if (tokens?.refreshToken) {
        await apiClient.request('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
      }
    } finally {
      await tokenStorage.clear();
    }
  },
};
