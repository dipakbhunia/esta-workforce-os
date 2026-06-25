import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { authService } from '../services/api/auth.service';
import { tokenStorage } from '../services/storage/token-storage';
import type { AuthUser } from '../types/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function applyUser(nextUser: AuthUser | null): Promise<void> {
    setUser(nextUser);
    await window.esta.app.setAuthenticated(Boolean(nextUser));
  }

  async function logoutUser(): Promise<void> {
    await authService.logout();
    await applyUser(null);
  }

  useEffect(() => {
    void (async () => {
      try {
        const tokens = await tokenStorage.get();
        if (tokens) {
          await applyUser(await authService.me());
        } else {
          await window.esta.app.setAuthenticated(false);
        }
      } catch {
        await tokenStorage.clear();
        await applyUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return window.esta.app.onSignOutRequested(() => {
      void logoutUser();
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        await applyUser(await authService.login(email, password));
      },
      logout: logoutUser,
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}