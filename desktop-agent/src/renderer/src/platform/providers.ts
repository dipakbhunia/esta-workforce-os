export interface MonitoringProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ScreenshotProvider {
  capture(): Promise<never>;
}

export interface ApplicationTrackingProvider {
  getActiveApplication(): Promise<never>;
}

export class WindowsMonitoringProvider implements MonitoringProvider {
  async start(): Promise<void> {
    // TODO: Implement Windows monitoring only after policy and consent design.
  }

  async stop(): Promise<void> {
    // TODO: Stop future Windows provider resources.
  }
}

export class WindowsScreenshotProvider implements ScreenshotProvider {
  capture(): Promise<never> {
    return Promise.reject(new Error('Screenshot capture is not implemented'));
  }
}

export class WindowsApplicationTrackingProvider
  implements ApplicationTrackingProvider
{
  getActiveApplication(): Promise<never> {
    return Promise.reject(
      new Error('Application tracking is not implemented'),
    );
  }
}

export class MacOsMonitoringProvider implements MonitoringProvider {
  async start(): Promise<void> {
    // TODO: Add macOS permissions and provider implementation.
  }

  async stop(): Promise<void> {
    // TODO: Stop future macOS provider resources.
  }
}

export class MacOsScreenshotProvider implements ScreenshotProvider {
  capture(): Promise<never> {
    return Promise.reject(new Error('macOS screenshot capture is not implemented'));
  }
}

export class MacOsApplicationTrackingProvider
  implements ApplicationTrackingProvider
{
  getActiveApplication(): Promise<never> {
    return Promise.reject(
      new Error('macOS application tracking is not implemented'),
    );
  }
}
