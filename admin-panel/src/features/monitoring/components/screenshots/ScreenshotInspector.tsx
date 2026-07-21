import { Box, Divider, Stack, Typography } from '@mui/material';
import { SectionCard } from '@/components/section-card';
import type { MonitoringScreenshot } from '../../types/monitoring.types';
import { employeeEmail, employeeName, formatBytes, formatDateTime } from '../../utils/monitoring-format';
import { screenshotApplication, screenshotAttendanceId, screenshotDeviceLabel, screenshotResolution, screenshotWindowTitle } from './screenshot-helpers';
import { ScreenshotInputMetrics } from './ScreenshotInputMetrics';

export function ScreenshotInspector({
  screenshot,
  showInputMetrics = true,
}: {
  screenshot: MonitoringScreenshot | null;
  showInputMetrics?: boolean;
}) {
  if (!screenshot) {
    return (
      <SectionCard title="Inspector" description="Select a screenshot to inspect metadata.">
        <Typography variant="body2" color="text.secondary">No screenshot selected.</Typography>
      </SectionCard>
    );
  }

  const items = [
    ['Employee', employeeName(screenshot.employee)],
    ['Email', employeeEmail(screenshot.employee) ?? 'Not available'],
    ['Employee Code', screenshot.employee?.employeeCode ?? 'Not available'],
    ['Capture Time', formatDateTime(screenshot.capturedAt)],
    ['Application', screenshotApplication(screenshot)],
    ['Window Title', screenshotWindowTitle(screenshot)],
    ['Device', screenshotDeviceLabel(screenshot)],
    ['Platform', platformFromMetadata(screenshot) ?? 'Not available'],
    ['Resolution', screenshotResolution(screenshot)],
    ['File Size', formatBytes(screenshot.sizeBytes)],
    ['MIME Type', screenshot.mimeType || 'Not available'],
    ['Screenshot ID', screenshot.id],
    ['Attendance Context', screenshotAttendanceId(screenshot) ?? 'Not available'],
  ];

  return (
    <SectionCard title="Inspector" description="Screenshot metadata and safe context.">
      <Stack spacing={1.25}>
        {items.map(([label, value]) => (
          <Box key={label}>
            <Typography variant="caption" color="text.secondary" fontWeight={800}>{label}</Typography>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>{value}</Typography>
          </Box>
        ))}
        {showInputMetrics && <ScreenshotInputMetrics counts={screenshot.inputMetrics} compact />}
        <Divider />
        <Typography variant="caption" color="text.secondary">
          Raw storage keys and bucket paths are intentionally hidden. Use the secure preview endpoint for image access.
        </Typography>
      </Stack>
    </SectionCard>
  );
}

function platformFromMetadata(screenshot: MonitoringScreenshot): string | null {
  const foreground = screenshot.metadata?.foreground as Record<string, unknown> | undefined;
  return typeof foreground?.platform === 'string' ? foreground.platform : null;
}
