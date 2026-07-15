import { Box, Button, Chip, Divider, Stack, Tooltip, Typography } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import type { MonitoringScreenshot } from '../../types/monitoring.types';
import { employeeName, formatDateTime } from '../../utils/monitoring-format';
import { screenshotApplication, screenshotDeviceLabel, screenshotWindowTitle } from './screenshot-helpers';

interface ScreenshotTimelineProps {
  screenshots: MonitoringScreenshot[];
  onOpen: (id: string) => void;
}

export function ScreenshotTimeline({ screenshots, onOpen }: ScreenshotTimelineProps) {
  if (!screenshots.length) {
    return <EmptyState title="No screenshots captured for this period." description="Timeline will appear when screenshots are available." />;
  }

  const groups = groupScreenshots(screenshots);

  return (
    <Stack spacing={2}>
      {groups.map((group) => (
        <Box key={group.key}>
          <Typography variant="subtitle2" color="text.secondary" fontWeight={800} sx={{ mb: 1 }}>{group.label}</Typography>
          <Stack spacing={1}>
            {group.items.map((screenshot) => (
              <Stack
                key={screenshot.id}
                direction={{ xs: 'column', md: 'row' }}
                alignItems={{ xs: 'stretch', md: 'center' }}
                gap={1.5}
                sx={{ p: 1.5, border: '1px solid #E5E7EB', borderRadius: 2.5, bgcolor: '#fff' }}
              >
                <Box sx={{ minWidth: 130 }}>
                  <Typography variant="caption" color="text.secondary">{formatDateTime(screenshot.capturedAt)}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={800} noWrap>{employeeName(screenshot.employee)}</Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {screenshotApplication(screenshot)} - {screenshotWindowTitle(screenshot)}
                  </Typography>
                </Box>
                <Stack direction="row" gap={0.75} flexWrap="wrap">
                  <Chip size="small" label={screenshotDeviceLabel(screenshot)} />
                  <Chip size="small" label={screenshot.mimeType} />
                </Stack>
                <Tooltip title={`Preview screenshot for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}>
                  <Button
                    size="small"
                    onClick={() => onOpen(screenshot.id)}
                    aria-label={`Preview screenshot for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}
                  >
                    Preview
                  </Button>
                </Tooltip>
              </Stack>
            ))}
          </Stack>
          <Divider sx={{ mt: 2 }} />
        </Box>
      ))}
    </Stack>
  );
}

function groupScreenshots(screenshots: MonitoringScreenshot[]) {
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', hour: 'numeric' });
  const groups = new Map<string, { key: string; label: string; items: MonitoringScreenshot[] }>();
  const seen = new Set<string>();
  const sorted = [...screenshots].sort((left, right) => {
    const leftTime = new Date(left.capturedAt).getTime();
    const rightTime = new Date(right.capturedAt).getTime();
    const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
    return safeLeft - safeRight || left.id.localeCompare(right.id);
  });
  for (const screenshot of sorted) {
    if (seen.has(screenshot.id)) continue;
    seen.add(screenshot.id);
    const date = new Date(screenshot.capturedAt);
    const employeeKey = screenshot.employee?.id ?? screenshot.employee?.email ?? 'unknown-employee';
    const employeeLabel = employeeName(screenshot.employee);
    const key = Number.isNaN(date.getTime())
      ? `unknown-${employeeKey}`
      : `${date.toDateString()}-${date.getHours()}-${employeeKey}`;
    const label = Number.isNaN(date.getTime())
      ? `Unknown time - ${employeeLabel}`
      : `${formatter.format(date)} - ${employeeLabel}`;
    const current = groups.get(key) ?? { key, label, items: [] };
    current.items.push(screenshot);
    groups.set(key, current);
  }
  return Array.from(groups.values());
}
