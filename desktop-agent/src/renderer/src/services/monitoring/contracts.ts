export interface MonitoringService {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ActivitySample {
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  idleSeconds: number;
}

export interface ScreenshotMetadata {
  capturedAt: string;
  storageKey: string;
  mimeType: string;
}
