import axios from 'axios';

export function authErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Backend unavailable or network connection failed.';
    }

    if (error.response.status === 401) {
      return 'Invalid email or password, or your session has expired.';
    }

    const message = (error.response.data as { message?: string })?.message;
    return message ?? 'Authentication request failed.';
  }

  return 'Something went wrong. Please try again.';
}
