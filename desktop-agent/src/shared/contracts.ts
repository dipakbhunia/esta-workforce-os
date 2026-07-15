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

export interface InputActivitySnapshot {
  keyboardCount: number;
  mouseClickCount: number;
  mouseMoveCount: number;
  scrollCount: number;
}

export interface ScreenshotCaptureContext {
  deviceId: string;
  attendanceId?: string | null;
  foreground?: ForegroundWindowMetadata | null;
}

export interface QueuedScreenshotCapture {
  id: string;
  clientCaptureId: string;
  deviceId: string;
  filePath: string;
  capturedAt: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  checksum: string;
  attempts: number;
  nextAttemptAt: string | null;
  metadata: Record<string, unknown>;
}

export interface ScreenshotFilePayload {
  item: QueuedScreenshotCapture;
  base64: string;
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
    isScreenLocked: () => Promise<boolean>;
    onScreenLockChanged: (callback: (locked: boolean) => void) => () => void;
  };
  inputActivity: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    snapshotAndReset: () => Promise<InputActivitySnapshot>;
  };
  screenshots: {
    capture: (context: ScreenshotCaptureContext) => Promise<QueuedScreenshotCapture | null>;
    listQueue: () => Promise<QueuedScreenshotCapture[]>;
    readFile: (id: string) => Promise<ScreenshotFilePayload>;
    markUploaded: (id: string) => Promise<void>;
    markFailed: (id: string, retryAfterMs?: number) => Promise<void>;
  };
  app: {
    getVersion: () => Promise<string>;
    setAuthenticated: (authenticated: boolean) => Promise<void>;
    showAndFocus: () => Promise<void>;
    onSignOutRequested: (callback: () => void) => () => void;
  };
}
