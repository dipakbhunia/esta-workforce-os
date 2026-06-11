import {
  MacOsApplicationTrackingProvider,
  MacOsMonitoringProvider,
  MacOsScreenshotProvider,
  WindowsApplicationTrackingProvider,
  WindowsMonitoringProvider,
  WindowsScreenshotProvider,
} from './providers';

export function createPlatformProviders(platform: string) {
  if (platform === 'darwin') {
    return {
      monitoring: new MacOsMonitoringProvider(),
      screenshots: new MacOsScreenshotProvider(),
      applications: new MacOsApplicationTrackingProvider(),
    };
  }
  return {
    monitoring: new WindowsMonitoringProvider(),
    screenshots: new WindowsScreenshotProvider(),
    applications: new WindowsApplicationTrackingProvider(),
  };
}
