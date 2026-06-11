export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface DeviceInformation {
  identifier: string;
  name: string;
  platform: string;
  osVersion: string;
  architecture: string;
  appVersion: string;
}

export interface DesktopSettings {
  heartbeatIntervalMs: number;
}

export interface EstaDesktopApi {
  tokens: {
    get: () => Promise<AuthTokens | null>;
    set: (tokens: AuthTokens) => Promise<void>;
    clear: () => Promise<void>;
  };
  device: {
    getInformation: () => Promise<DeviceInformation>;
  };
  settings: {
    get: () => Promise<DesktopSettings>;
    update: (settings: Partial<DesktopSettings>) => Promise<DesktopSettings>;
  };
  app: {
    getVersion: () => Promise<string>;
  };
}
