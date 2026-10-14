import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureHttpAuth, http, requestAuthRefresh } from './http';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('HTTP authentication refresh coordination', () => {
  let accessToken: string | null;
  const onSessionExpired = vi.fn();

  beforeEach(() => {
    accessToken = 'expired-access';
    onSessionExpired.mockReset();
  });

  it('shares one refresh across direct restoration and simultaneous 401 retries', async () => {
    const refresh = deferred<string | null>();
    const refreshAccessToken = vi.fn(() => refresh.promise);
    configureHttpAuth({
      getAccessToken: () => accessToken,
      refreshAccessToken,
      onSessionExpired,
    });

    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      if (config.headers.Authorization !== 'Bearer rotated-access') {
        throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
          data: {},
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
        });
      }
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    });

    const restoration = requestAuthRefresh();
    const firstRequest = http.get('/protected-one', { adapter });
    const secondRequest = http.get('/protected-two', { adapter });

    await vi.waitFor(() => expect(adapter).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(refreshAccessToken).toHaveBeenCalledOnce());
    accessToken = 'rotated-access';
    refresh.resolve(accessToken);

    await expect(restoration).resolves.toBe('rotated-access');
    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      expect.objectContaining({ data: { ok: true } }),
      expect.objectContaining({ data: { ok: true } }),
    ]);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it('expires the session once when simultaneous retries share a failed refresh', async () => {
    const refreshError = new Error('refresh rejected');
    const refreshAccessToken = vi.fn().mockRejectedValue(refreshError);
    configureHttpAuth({
      getAccessToken: () => accessToken,
      refreshAccessToken,
      onSessionExpired,
    });

    const adapter = async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {},
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
      });
    };

    const results = await Promise.allSettled([
      http.get('/protected-one', { adapter }),
      http.get('/protected-two', { adapter }),
    ]);
    expect(results).toEqual([
      expect.objectContaining({ status: 'rejected', reason: refreshError }),
      expect.objectContaining({ status: 'rejected', reason: refreshError }),
    ]);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it('starts an independent refresh after the previous flight settles', async () => {
    const refreshAccessToken = vi.fn()
      .mockResolvedValueOnce('first-access')
      .mockResolvedValueOnce('second-access');
    configureHttpAuth({ getAccessToken: () => accessToken, refreshAccessToken, onSessionExpired });

    await expect(requestAuthRefresh()).resolves.toBe('first-access');
    await expect(requestAuthRefresh()).resolves.toBe('second-access');
    expect(refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it('does not refresh again when the retried request also returns 401', async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue('rotated-access');
    configureHttpAuth({ getAccessToken: () => accessToken, refreshAccessToken, onSessionExpired });
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
        data: {}, status: 401, statusText: 'Unauthorized', headers: {}, config,
      });
    });

    await expect(http.get('/still-unauthorized', { adapter })).rejects.toMatchObject({ response: { status: 401 } });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
  });
});
