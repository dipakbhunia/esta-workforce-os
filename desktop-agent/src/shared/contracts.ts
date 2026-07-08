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
  idleTimeoutMs: number;
  startWithWindows: boolean;
}

export interface ForegroundWindowMetadata {
  capturedAt: string;
  platform: string;
  processId: number | null;
  processName: string | null;
  executableName: string | null;
  applicationName: string | null;
  windowTitle: string | null;
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
  system: {
    getIdleTimeSeconds: () => Promise<number>;
    getForegroundWindow: () => Promise<ForegroundWindowMetadata>;
  };
  app: {
    getVersion: () => Promise<string>;
    setAuthenticated: (authenticated: boolean) => Promise<void>;
    showAndFocus: () => Promise<void>;
    onSignOutRequested: (callback: () => void) => () => void;
  };
}
