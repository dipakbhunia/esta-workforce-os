import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { safeStorage } = require('electron') as typeof import('electron');
import type { AuthTokens } from '../../shared/contracts';
import { JsonFileStore } from './json-file-store';

interface StoredTokens {
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
}

export class SecureTokenStore {
  constructor(private readonly store: JsonFileStore<StoredTokens>) {}

  async get(): Promise<AuthTokens | null> {
    const stored = await this.store.read();
    if (!stored.encryptedAccessToken || !stored.encryptedRefreshToken) {
      return null;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    try {
      return {
        accessToken: safeStorage.decryptString(
          Buffer.from(stored.encryptedAccessToken, 'base64'),
        ),
        refreshToken: safeStorage.decryptString(
          Buffer.from(stored.encryptedRefreshToken, 'base64'),
        ),
      };
    } catch {
      await this.clear();
      return null;
    }
  }

  async set(tokens: AuthTokens): Promise<void> {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Operating system secure storage is unavailable');
    }
    await this.store.write({
      encryptedAccessToken: safeStorage
        .encryptString(tokens.accessToken)
        .toString('base64'),
      encryptedRefreshToken: safeStorage
        .encryptString(tokens.refreshToken)
        .toString('base64'),
    });
  }

  async clear(): Promise<void> {
    await this.store.write({});
  }
}
