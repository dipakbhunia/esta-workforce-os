import type { MonitoringService } from './contracts';

export class ApplicationTrackingService implements MonitoringService {
  async start(): Promise<void> {
    // TODO: Use ApplicationTrackingProvider without reading application content.
  }

  async stop(): Promise<void> {
    // TODO: Stop the future provider and flush approved aggregates.
  }
}
