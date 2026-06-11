import type { MonitoringService } from './contracts';

export class IdleDetectionService implements MonitoringService {
  async start(): Promise<void> {
    // TODO: Read aggregate system idle time through a platform adapter.
  }

  async stop(): Promise<void> {
    // TODO: Stop future idle polling.
  }
}
