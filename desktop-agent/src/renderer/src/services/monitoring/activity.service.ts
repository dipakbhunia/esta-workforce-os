import type { MonitoringService } from './contracts';

export class ActivityService implements MonitoringService {
  async start(): Promise<void> {
    // TODO: Collect policy-approved activity through a platform provider.
  }

  async stop(): Promise<void> {
    // TODO: Flush an active session without collecting input content.
  }
}
