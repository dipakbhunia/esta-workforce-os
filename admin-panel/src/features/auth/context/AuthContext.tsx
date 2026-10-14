import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { configureHttpAuth, requestAuthRefresh } from '@/services/http';
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
  const sessionGeneration = useRef(0);

  const clearSession = useCallback(() => {
    sessionGeneration.current += 1;
    tokenStorage.clearTokens();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const performRefresh = useCallback(async () => {
    const generation = sessionGeneration.current;
    const refreshToken = tokenStorage.getRefreshToken();
    if (!refreshToken) return null;

    const remember = tokenStorage.getRemember();
    let response;
    try {
      response = await refreshRequest(refreshToken);
    } catch (refreshError) {
      if (sessionGeneration.current !== generation || tokenStorage.getRefreshToken() !== refreshToken) {
        return tokenStorage.getAccessToken();
      }
      throw refreshError;
    }

    if (sessionGeneration.current !== generation || tokenStorage.getRefreshToken() !== refreshToken) {
      return tokenStorage.getAccessToken();
    }

    tokenStorage.setTokens(response.data.accessToken, response.data.refreshToken, remember);
    setUser(response.data.user);
    return response.data.accessToken;
  }, []);

  const refresh = useCallback(() => requestAuthRefresh(), []);

  const loginMutation = useMutation({
    mutationFn: async ({ credentials, generation }: { credentials: LoginCredentials; generation: number }) => {
      const response = await loginRequest(credentials.email, credentials.password);
      if (sessionGeneration.current !== generation) return null;

      tokenStorage.setTokens(response.data.accessToken, response.data.refreshToken, credentials.remember);
      const me = await meRequest();
      if (sessionGeneration.current !== generation) return null;
      return { generation, user: me.data };
    },
    onSuccess: (result) => {
      if (!result || sessionGeneration.current !== result.generation) return;
      setError(null);
      setUser(result.user);
    },
    onError: (mutationError, variables) => {
      if (sessionGeneration.current !== variables.generation) return;
      setError(authErrorMessage(mutationError));
    },
  });

  const login = useCallback(async (credentials: LoginCredentials) => {
    const generation = sessionGeneration.current + 1;
    sessionGeneration.current = generation;
    setError(null);
    await loginMutation.mutateAsync({ credentials, generation });
  }, [loginMutation]);

  const logout = useCallback(async () => {
    const refreshToken = tokenStorage.getRefreshToken();
    clearSession();
    if (refreshToken) {
      await logoutRequest(refreshToken);
    }
  }, [clearSession]);

  useEffect(() => {
    configureHttpAuth({
      getAccessToken: tokenStorage.getAccessToken,
      refreshAccessToken: performRefresh,
      onSessionExpired: clearSession,
    });
  }, [clearSession, performRefresh]);

  useEffect(() => {
    let mounted = true;
    const generation = sessionGeneration.current;

    async function restoreSession() {
      setRestoring(true);
      try {
        if (!tokenStorage.getRefreshToken()) {
          clearSession();
          return;
        }

        const accessToken = await refresh();
        if (!accessToken || !mounted || sessionGeneration.current !== generation) return;
        const me = await meRequest();
        if (mounted && sessionGeneration.current === generation) {
          setUser(me.data);
          setError(null);
        }
      } catch (restoreError) {
        if (mounted && sessionGeneration.current === generation) {
          setError(authErrorMessage(restoreError));
          if (tokenStorage.getRefreshToken()) clearSession();
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
