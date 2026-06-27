const ACCESS_TOKEN_KEY = 'esta.admin.accessToken';
const REFRESH_TOKEN_KEY = 'esta.admin.refreshToken';
const REMEMBER_KEY = 'esta.admin.remember';

function selectedStorage(remember: boolean): Storage {
  return remember ? window.localStorage : window.sessionStorage;
}

export const tokenStorage = {
  getAccessToken() {
    return window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? window.localStorage.getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken() {
    return window.sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? window.localStorage.getItem(REFRESH_TOKEN_KEY);
  },
  getRemember() {
    return window.localStorage.getItem(REMEMBER_KEY) === 'true';
  },
  setTokens(accessToken: string, refreshToken: string, remember: boolean) {
    this.clearTokens();
    selectedStorage(remember).setItem(ACCESS_TOKEN_KEY, accessToken);
    selectedStorage(remember).setItem(REFRESH_TOKEN_KEY, refreshToken);
    window.localStorage.setItem(REMEMBER_KEY, String(remember));
  },
  clearTokens() {
    window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
  },
};
