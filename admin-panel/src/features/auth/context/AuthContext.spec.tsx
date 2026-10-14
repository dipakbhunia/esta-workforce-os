import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useContext, type ContextType } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, AuthProvider } from './AuthContext';
import { tokenStorage } from '../services/token-storage';
import type { AuthResponse, AuthUser, LoginCredentials } from '../types/auth.types';

const api = vi.hoisted(() => ({
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  meRequest: vi.fn(),
  refreshRequest: vi.fn(),
}));

vi.mock('../services/auth-api', () => api);

const oldUser: AuthUser = {
  id: 'old-user', companyId: null, email: 'old@example.test', firstName: 'Old', lastName: 'User', status: 'ACTIVE', roles: ['SUPER_ADMIN'],
};
const newUser: AuthUser = {
  id: 'new-user', companyId: null, email: 'new@example.test', firstName: 'New', lastName: 'User', status: 'ACTIVE', roles: ['SUPER_ADMIN'],
};

function authResponse(user: AuthUser, suffix: string): AuthResponse {
  return { accessToken: `${suffix}-access`, refreshToken: `${suffix}-refresh`, tokenType: 'Bearer', user };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

let currentAuth: ContextType<typeof AuthContext>;

function Observer() {
  currentAuth = useContext(AuthContext);
  return <div>{currentAuth?.loading ? 'loading' : currentAuth?.user?.email ?? 'anonymous'}</div>;
}

function renderProvider(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = <QueryClientProvider client={client}><AuthProvider><Observer /></AuthProvider></QueryClientProvider>;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

describe('AuthProvider refresh lifecycle', () => {
  beforeEach(() => {
    tokenStorage.clearTokens();
    for (const mock of Object.values(api)) mock.mockReset();
    api.logoutRequest.mockResolvedValue({ data: { success: true } });
  });

  it('uses one refresh request during StrictMode restoration', async () => {
    const refresh = deferred<{ data: AuthResponse }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockReturnValue(refresh.promise);
    api.meRequest.mockResolvedValue({ data: oldUser });

    renderProvider(true);
    await waitFor(() => expect(api.refreshRequest).toHaveBeenCalledOnce());
    await act(async () => refresh.resolve({ data: authResponse(oldUser, 'rotated') }));

    expect(await screen.findByText(oldUser.email)).toBeInTheDocument();
    expect(api.refreshRequest).toHaveBeenCalledOnce();
    expect(tokenStorage.getRefreshToken()).toBe('rotated-refresh');
  });

  it('clears an unchanged session after restoration refresh is rejected', async () => {
    tokenStorage.setTokens('expired-access', 'expired-refresh', false);
    api.refreshRequest.mockRejectedValue(new Error('refresh rejected'));

    renderProvider();

    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(api.refreshRequest).toHaveBeenCalledOnce();
    expect(api.meRequest).not.toHaveBeenCalled();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('does not resurrect a session when logout occurs during refresh', async () => {
    const refresh = deferred<{ data: AuthResponse }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockReturnValue(refresh.promise);
    api.meRequest.mockResolvedValue({ data: oldUser });

    renderProvider();
    await waitFor(() => expect(api.refreshRequest).toHaveBeenCalledOnce());
    await act(async () => currentAuth?.logout());
    expect(tokenStorage.getRefreshToken()).toBeNull();

    await act(async () => refresh.resolve({ data: authResponse(oldUser, 'stale') }));
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(api.meRequest).not.toHaveBeenCalled();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('ignores a restoration profile response that succeeds after logout', async () => {
    const profile = deferred<{ data: AuthUser }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockResolvedValue({ data: authResponse(oldUser, 'rotated') });
    api.meRequest.mockReturnValue(profile.promise);

    renderProvider();
    await waitFor(() => expect(api.meRequest).toHaveBeenCalledOnce());
    await act(async () => currentAuth?.logout());
    await act(async () => profile.resolve({ data: oldUser }));

    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(currentAuth?.user).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBeNull();
  });

  it('ignores a stale restoration profile success after another account logs in', async () => {
    const oldProfile = deferred<{ data: AuthUser }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockResolvedValue({ data: authResponse(oldUser, 'rotated') });
    api.loginRequest.mockResolvedValue({ data: authResponse(newUser, 'login') });
    api.meRequest.mockReturnValueOnce(oldProfile.promise).mockResolvedValueOnce({ data: newUser });

    renderProvider();
    await waitFor(() => expect(api.meRequest).toHaveBeenCalledOnce());
    await act(async () => currentAuth?.login({ email: newUser.email, password: 'not-a-real-password', remember: false }));
    await waitFor(() => expect(currentAuth?.user).toEqual(newUser));
    await act(async () => oldProfile.resolve({ data: oldUser }));

    expect(screen.getByText(newUser.email)).toBeInTheDocument();
    expect(currentAuth?.user).toEqual(newUser);
  });

  it('ignores a stale restoration profile failure after another account logs in', async () => {
    const oldProfile = deferred<{ data: AuthUser }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockResolvedValue({ data: authResponse(oldUser, 'rotated') });
    api.loginRequest.mockResolvedValue({ data: authResponse(newUser, 'login') });
    api.meRequest.mockReturnValueOnce(oldProfile.promise).mockResolvedValueOnce({ data: newUser });

    renderProvider();
    await waitFor(() => expect(api.meRequest).toHaveBeenCalledOnce());
    await act(async () => currentAuth?.login({ email: newUser.email, password: 'not-a-real-password', remember: false }));
    await waitFor(() => expect(currentAuth?.user).toEqual(newUser));
    await act(async () => oldProfile.reject(new Error('stale profile failed')));

    expect(screen.getByText(newUser.email)).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBe('login-refresh');
    expect(currentAuth?.error).toBeNull();
  });

  it('does not let an older refresh overwrite a newer login', async () => {
    const refresh = deferred<{ data: AuthResponse }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockReturnValue(refresh.promise);
    api.loginRequest.mockResolvedValue({ data: authResponse(newUser, 'login') });
    api.meRequest.mockResolvedValue({ data: newUser });

    renderProvider();
    await waitFor(() => expect(api.refreshRequest).toHaveBeenCalledOnce());
    const credentials: LoginCredentials = { email: newUser.email, password: 'not-a-real-password', remember: false };
    await act(async () => currentAuth?.login(credentials));
    await waitFor(() => expect(currentAuth?.user).toEqual(newUser));

    await act(async () => refresh.resolve({ data: authResponse(oldUser, 'stale') }));
    expect(await screen.findByText(newUser.email)).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBe('login-refresh');
  });

  it('does not let an older refresh failure clear a newer login', async () => {
    const refresh = deferred<{ data: AuthResponse }>();
    tokenStorage.setTokens('old-access', 'old-refresh', false);
    api.refreshRequest.mockReturnValue(refresh.promise);
    api.loginRequest.mockResolvedValue({ data: authResponse(newUser, 'login') });
    api.meRequest.mockResolvedValue({ data: newUser });

    renderProvider();
    await waitFor(() => expect(api.refreshRequest).toHaveBeenCalledOnce());
    await act(async () => currentAuth?.login({ email: newUser.email, password: 'not-a-real-password', remember: false }));
    await waitFor(() => expect(currentAuth?.user).toEqual(newUser));
    await act(async () => refresh.reject(new Error('old refresh failed')));

    expect(screen.getByText(newUser.email)).toBeInTheDocument();
    expect(tokenStorage.getRefreshToken()).toBe('login-refresh');
    expect(currentAuth?.error).toBeNull();
  });

  it('does not surface an older login failure over a newer authenticated session', async () => {
    const oldLogin = deferred<{ data: AuthResponse }>();
    api.loginRequest.mockReturnValueOnce(oldLogin.promise).mockResolvedValueOnce({ data: authResponse(newUser, 'login') });
    api.meRequest.mockResolvedValue({ data: newUser });

    renderProvider();
    await screen.findByText('anonymous');
    let olderLogin!: Promise<void>;
    act(() => {
      olderLogin = currentAuth!.login({ email: oldUser.email, password: 'not-a-real-password', remember: false });
    });
    await waitFor(() => expect(api.loginRequest).toHaveBeenCalledOnce());
    await act(async () => currentAuth?.login({ email: newUser.email, password: 'not-a-real-password', remember: false }));
    await waitFor(() => expect(currentAuth?.user).toEqual(newUser));
    const olderLoginRejected = expect(olderLogin).rejects.toThrow('older login failed');
    await act(async () => oldLogin.reject(new Error('older login failed')));
    await olderLoginRejected;

    expect(screen.getByText(newUser.email)).toBeInTheDocument();
    expect(currentAuth?.error).toBeNull();
    expect(tokenStorage.getRefreshToken()).toBe('login-refresh');
  });
});
