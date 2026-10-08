import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import { http } from '@/services/http';
import type { AuthResponse, AuthUser } from '../types/auth.types';

const skipAuthRefresh = { skipAuthRefresh: true } as AxiosRequestConfig & { skipAuthRefresh: boolean };

export function loginRequest(email: string, password: string): Promise<AxiosResponse<AuthResponse>> {
  return http.post<AuthResponse>('/auth/login', { email, password });
}

export function refreshRequest(refreshToken: string): Promise<AxiosResponse<AuthResponse>> {
  return http.post<AuthResponse>('/auth/refresh', { refreshToken }, skipAuthRefresh);
}

export function logoutRequest(refreshToken: string): Promise<AxiosResponse<{ success: boolean }>> {
  return http.post<{ success: boolean }>('/auth/logout', { refreshToken }, skipAuthRefresh);
}

export function meRequest(): Promise<AxiosResponse<AuthUser>> {
  return http.get<AuthUser>('/auth/me');
}

export function requestPasswordReset(email: string) {
  return http.post<{ accepted: true }>('/auth/forgot-password', { email }, skipAuthRefresh);
}

export function activateAccount(input: { token: string; password: string; passwordConfirmation: string }) {
  return http.post<{ success: true }>('/auth/activate-account', input, skipAuthRefresh);
}

export function completePasswordReset(input: { token: string; password: string; passwordConfirmation: string }) {
  return http.post<{ success: true }>('/auth/reset-password', input, skipAuthRefresh);
}
