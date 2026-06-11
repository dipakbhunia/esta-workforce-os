import type { MonitoringService } from './contracts';

export class WebsiteTrackingService implements MonitoringService {
  async start(): Promise<void> {
    // TODO: Integrate a transparent, policy-controlled browser data source.
  }

  async stop(): Promise<void> {
    // TODO: Stop the future website usage provider.
  }
}
