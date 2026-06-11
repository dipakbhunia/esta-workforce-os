import type { MonitoringService } from './contracts';

export class ScreenshotService implements MonitoringService {
  async start(): Promise<void> {
    // TODO: Schedule capture only after a future explicit policy check.
  }

  async stop(): Promise<void> {
    // TODO: Cancel future screenshot scheduling.
  }
}
