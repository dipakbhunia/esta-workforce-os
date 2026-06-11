import type { AuthTokens } from '@shared/contracts';

export interface TokenStorage {
  get(): Promise<AuthTokens | null>;
  set(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
}

export class ElectronTokenStorage implements TokenStorage {
  get(): Promise<AuthTokens | null> {
    return window.esta.tokens.get();
  }

  set(tokens: AuthTokens): Promise<void> {
    return window.esta.tokens.set(tokens);
  }

  clear(): Promise<void> {
    return window.esta.tokens.clear();
  }
}

export const tokenStorage = new ElectronTokenStorage();
