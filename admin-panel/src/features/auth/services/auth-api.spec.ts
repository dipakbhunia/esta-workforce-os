import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginRequest, logoutRequest, refreshRequest } from './auth-api';

const post = vi.hoisted(() => vi.fn());

vi.mock('@/services/http', () => ({ http: { post } }));

describe('authentication API refresh boundaries', () => {
  beforeEach(() => post.mockReset().mockResolvedValue({ data: {} }));

  it.each([
    ['login', () => loginRequest('admin@example.test', 'not-a-real-password')],
    ['refresh', () => refreshRequest('refresh-token')],
    ['logout', () => logoutRequest('refresh-token')],
  ])('prevents the %s endpoint from recursively triggering refresh', async (_name, request) => {
    await request();
    expect(post.mock.calls[0]?.[2]).toEqual({ skipAuthRefresh: true });
  });
});
