import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { configureHttpAuth } from '@/services/http';
import { loginRequest, logoutRequest, meRequest, refreshRequest } from '../services/auth-api';
import { tokenStorage } from '../services/token-storage';
import type { AuthUser, LoginCredentials, Permission } from '../types/auth.types';
import { authErrorMessage } from '../utils/errors';
import { permissionsForRoles } from '../utils/permissions';

interface AuthContextValue {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  user: AuthUser | null;
  permissions: Permission[];
  roles: AuthUser['roles'];
  loading: boolean;
  authenticated: boolean;
  error: string | null;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(() => {
    tokenStorage.clearTokens();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) return null;

    const remember = tokenStorage.getRemember();
    const response = await refreshRequest(refreshToken);
    tokenStorage.setTokens(response.data.accessToken, response.data.refreshToken, remember);
    setUser(response.data.user);
    return response.data.accessToken;
  }, []);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password, remember }: LoginCredentials) => {
      const response = await loginRequest(email, password);
      tokenStorage.setTokens(response.data.accessToken, response.data.refreshToken, remember);
      const me = await meRequest();
      return me.data;
    },
    onSuccess: (authenticatedUser) => {
      setError(null);
      setUser(authenticatedUser);
    },
    onError: (mutationError) => {
      setError(authErrorMessage(mutationError));
    },
  });

  const login = useCallback(async (credentials: LoginCredentials) => {
    setError(null);
    await loginMutation.mutateAsync(credentials);
  }, [loginMutation]);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    try {
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    configureHttpAuth({
      getAccessToken: tokenStorage.getAccessToken,
      refreshAccessToken: refresh,
      onSessionExpired: clearSession,
    });
  }, [clearSession, refresh]);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      setRestoring(true);
      try {
        if (!tokenStorage.getRefreshToken()) {
          clearSession();
          return;
        }

        await refresh();
        const me = await meRequest();
        if (mounted) {
          setUser(me.data);
          setError(null);
        }
      } catch (restoreError) {
        if (mounted) {
          setError(authErrorMessage(restoreError));
          clearSession();
        }
      } finally {
        if (mounted) setRestoring(false);
      }
    }

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, [clearSession, refresh]);

  const value = useMemo<AuthContextValue>(() => {
    const roles = user?.roles ?? [];
    const permissions = permissionsForRoles(roles);

    return {
      login,
      logout,
      refresh,
      user,
      permissions,
      roles,
      loading: restoring || loginMutation.isPending,
      authenticated: Boolean(user),
      error,
    };
  }, [error, login, loginMutation.isPending, logout, refresh, restoring, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
