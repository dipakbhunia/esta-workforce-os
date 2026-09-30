import axios from 'axios';

export function platformAccessError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const status = error.response?.status;
  if (status === 400) return 'The request is invalid or would violate a platform access rule.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'This action is restricted or would remove protected platform access.';
  if (status === 404) return 'The platform user or role no longer exists. Refresh and try again.';
  if (status === 409) return 'That email address is already assigned to another user.';
  return fallback;
}
