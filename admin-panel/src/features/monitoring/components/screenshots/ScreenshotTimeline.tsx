import { Box, Button, Chip, Divider, Stack, Tooltip, Typography } from '@mui/material';
import { ImageOff } from 'lucide-react';
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

  let groups: ScreenshotTimelineDateGroup[];
  try {
    groups = groupScreenshots(screenshots);
  } catch {
    return (
      <EmptyState
        title="Screenshot timeline could not be rendered"
        description="Switch back to Gallery or adjust the filters while we recover the timeline formatting."
      />
    );
  }

  return (
    <Stack spacing={2}>
      {groups.map((dateGroup) => (
        <Box key={dateGroup.key}>
          <Typography variant="subtitle1" fontWeight={900} sx={{ mb: 1 }}>{dateGroup.label}</Typography>
          <Stack spacing={1.5}>
            {dateGroup.hours.map((hourGroup) => (
              <Box key={hourGroup.key} sx={{ borderLeft: '2px solid #E5E7EB', pl: 2 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={900}>{hourGroup.label}</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {hourGroup.employees.map((employeeGroup) => (
                    <Box key={employeeGroup.key}>
                      <Typography variant="body2" fontWeight={900} sx={{ mb: 0.75 }}>{employeeGroup.label}</Typography>
                      <Stack spacing={1}>
                        {employeeGroup.items.map((screenshot) => (
                          <Stack
                            key={screenshot.id}
                            direction={{ xs: 'column', md: 'row' }}
                            alignItems={{ xs: 'stretch', md: 'center' }}
                            gap={1.5}
                            sx={{ p: 1.25, border: '1px solid #E5E7EB', borderRadius: 2.5, bgcolor: '#fff' }}
                          >
                            <Box sx={{ width: 76, height: 48, borderRadius: 2, bgcolor: '#EEF2F7', color: 'text.secondary', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              <ImageOff size={18} />
                            </Box>
                            <Box sx={{ minWidth: 92 }}>
                              <Typography variant="caption" color="text.secondary">{safeTimeLabel(screenshot.capturedAt)}</Typography>
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" fontWeight={800} noWrap>{screenshotApplication(screenshot)}</Typography>
                              <Typography variant="caption" color="text.secondary" noWrap>{screenshotWindowTitle(screenshot)}</Typography>
                            </Box>
                            <Stack direction="row" gap={0.75} flexWrap="wrap">
                              <Chip size="small" label={screenshotDeviceLabel(screenshot)} />
                              <Chip size="small" label={screenshot.mimeType || 'Image'} />
                            </Stack>
                            <Tooltip title={`Preview screenshot for ${employeeName(screenshot.employee)} captured ${safeFullDateTime(screenshot.capturedAt)}`}>
                              <Button
                                size="small"
                                onClick={() => onOpen(screenshot.id)}
                                aria-label={`Preview screenshot for ${employeeName(screenshot.employee)} captured ${safeFullDateTime(screenshot.capturedAt)}`}
                              >
                                Preview
                              </Button>
                            </Tooltip>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </Box>
            ))}
          </Stack>
          <Divider sx={{ mt: 2 }} />
        </Box>
      ))}
    </Stack>
  );
}

interface ScreenshotTimelineEmployeeGroup {
  key: string;
  label: string;
  items: MonitoringScreenshot[];
}

interface ScreenshotTimelineHourGroup {
  key: string;
  label: string;
  employees: ScreenshotTimelineEmployeeGroup[];
}

interface ScreenshotTimelineDateGroup {
  key: string;
  label: string;
  hours: ScreenshotTimelineHourGroup[];
}

function groupScreenshots(screenshots: MonitoringScreenshot[]) {
  const groups = new Map<string, ScreenshotTimelineDateGroup>();
  const seen = new Set<string>();
  const sorted = [...screenshots].sort((left, right) => {
    const safeLeft = safeTime(left.capturedAt);
    const safeRight = safeTime(right.capturedAt);
    return safeLeft - safeRight || left.id.localeCompare(right.id);
  });

  for (const screenshot of sorted) {
    if (seen.has(screenshot.id)) continue;
    seen.add(screenshot.id);
    const date = parseCaptureDate(screenshot.capturedAt);
    const employeeKey = screenshot.employee?.id ?? screenshot.employee?.email ?? 'unknown-employee';
    const employeeLabel = employeeName(screenshot.employee);
    const dateKey = date ? safeDateKey(date) : 'unknown-date';
    const hourKey = date ? `${dateKey}-${date.getHours()}` : 'unknown-hour';

    const dateGroup = groups.get(dateKey) ?? { key: dateKey, label: date ? safeDateLabel(date) : 'Unknown date', hours: [] };
    const hourGroup = dateGroup.hours.find((group) => group.key === hourKey) ?? { key: hourKey, label: date ? safeHourLabel(date) : 'Unknown time', employees: [] };
    const employeeGroup = hourGroup.employees.find((group) => group.key === employeeKey) ?? { key: employeeKey, label: employeeLabel, items: [] };

    employeeGroup.items.push(screenshot);
    if (!hourGroup.employees.some((group) => group.key === employeeGroup.key)) hourGroup.employees.push(employeeGroup);
    if (!dateGroup.hours.some((group) => group.key === hourGroup.key)) dateGroup.hours.push(hourGroup);
    groups.set(dateKey, dateGroup);
  }
  return Array.from(groups.values());
}

function parseCaptureDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeTime(value?: string | null): number {
  return parseCaptureDate(value)?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function safeDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function safeDateLabel(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

function safeHourLabel(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return `${String(date.getHours()).padStart(2, '0')}:00`;
  }
}

function safeTimeLabel(value?: string | null): string {
  const date = parseCaptureDate(value);
  return date ? safeHourLabel(date) : 'Unknown time';
}

function safeFullDateTime(value?: string | null): string {
  return parseCaptureDate(value) ? formatDateTime(value) : 'Unknown time';
}
