import type { MonitoringScreenshot } from '../../types/monitoring.types';

export function screenshotApplication(screenshot: MonitoringScreenshot): string {
  const metadata = screenshot.metadata ?? {};
  const foreground = metadata.foreground as Record<string, unknown> | undefined;
  return stringValue(metadata.applicationName) ?? stringValue(foreground?.applicationName) ?? 'Application not available';
}

export function screenshotWindowTitle(screenshot: MonitoringScreenshot): string {
  const metadata = screenshot.metadata ?? {};
  const foreground = metadata.foreground as Record<string, unknown> | undefined;
  return stringValue(metadata.windowTitle) ?? stringValue(foreground?.windowTitle) ?? 'Window title not available';
}

export function screenshotAttendanceId(screenshot: MonitoringScreenshot): string | null {
  const value = screenshot.metadata?.attendanceId;
  return typeof value === 'string' && value ? value : null;
}

export function screenshotResolution(screenshot: MonitoringScreenshot): string {
  return screenshot.width && screenshot.height ? `${screenshot.width} x ${screenshot.height}` : 'Not available';
}

export function screenshotDeviceLabel(screenshot: MonitoringScreenshot): string {
  return screenshot.deviceId ? `Device ${screenshot.deviceId.slice(0, 8)}` : 'Device not available';
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
