import { useEffect, useRef } from 'react';
import { Box, Button, Card, CardActionArea, CardContent, Chip, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { Eye, ImageOff, RefreshCw } from 'lucide-react';
import { AvatarCell } from '@/components/avatar-cell';
import { StatusChip } from '@/components/status-chip';
import type { MonitoringScreenshot } from '../../types/monitoring.types';
import { employeeEmail, employeeName, formatBytes, formatDateTime } from '../../utils/monitoring-format';
import { screenshotApplication, screenshotDeviceLabel, screenshotResolution, screenshotWindowTitle } from './screenshot-helpers';

export interface ScreenshotPreviewState {
  url?: string;
  expiresAt?: string;
  loading?: boolean;
  error?: string;
}

interface ScreenshotCardProps {
  screenshot: MonitoringScreenshot;
  preview?: ScreenshotPreviewState;
  onVisible: (id: string) => void;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
}

export function ScreenshotCard({ screenshot, preview, onVisible, onOpen, onRetry }: ScreenshotCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !screenshot.previewAvailable) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          onVisible(screenshot.id);
          observer.disconnect();
        }
      },
      { rootMargin: '220px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, screenshot.id, screenshot.previewAvailable]);

  const app = screenshotApplication(screenshot);
  const title = screenshotWindowTitle(screenshot);

  return (
    <Card
      ref={ref}
      tabIndex={0}
      sx={{
        height: '100%',
        overflow: 'hidden',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
        '&:hover, &:focus-visible': {
          transform: 'translateY(-2px)',
          boxShadow: '0 16px 40px rgba(15, 23, 42, 0.10)',
          outline: 'none',
        },
      }}
    >
      <CardActionArea onClick={() => onOpen(screenshot.id)} aria-label={`Open screenshot captured at ${formatDateTime(screenshot.capturedAt)}`}>
        <Box sx={{ position: 'relative', aspectRatio: '16 / 10', bgcolor: '#EEF2F7', display: 'grid', placeItems: 'center' }}>
          {preview?.loading ? (
            <Skeleton variant="rectangular" width="100%" height="100%" />
          ) : preview?.url ? (
            <Box
              component="img"
              src={preview.url}
              alt={`Screenshot for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}
              loading="lazy"
              onError={() => onRetry(screenshot.id)}
              sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <Stack alignItems="center" spacing={1} color="text.secondary">
              <ImageOff size={24} />
              <Typography variant="caption">{preview?.error ? 'Preview unavailable' : 'Preview pending'}</Typography>
            </Stack>
          )}
          <Chip
            size="small"
            label={screenshot.previewAvailable ? 'Preview' : 'Metadata only'}
            sx={{ position: 'absolute', top: 10, right: 10, bgcolor: 'rgba(255,255,255,0.92)', fontWeight: 700 }}
          />
        </Box>
      </CardActionArea>
      <CardContent>
        <Stack spacing={1.25}>
          <AvatarCell name={employeeName(screenshot.employee)} email={employeeEmail(screenshot.employee)} />
          <Stack direction="row" justifyContent="space-between" gap={1}>
            <Typography variant="caption" color="text.secondary">{formatDateTime(screenshot.capturedAt)}</Typography>
            <StatusChip label={screenshot.mimeType || 'Image'} tone="neutral" />
          </Stack>
          <Tooltip title={title}>
            <Typography variant="body2" fontWeight={700} noWrap>{app}</Typography>
          </Tooltip>
          <Typography variant="caption" color="text.secondary" noWrap>{title}</Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            <Chip size="small" label={screenshotDeviceLabel(screenshot)} />
            <Chip size="small" label={screenshotResolution(screenshot)} />
            <Chip size="small" label={formatBytes(screenshot.sizeBytes)} />
          </Stack>
          <Stack direction="row" gap={1}>
            <Tooltip title={`Open screenshot for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}>
              <Button
                size="small"
                startIcon={<Eye size={16} />}
                onClick={() => onOpen(screenshot.id)}
                aria-label={`Open screenshot for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}
              >
                Open
              </Button>
            </Tooltip>
            {preview?.error && (
              <Tooltip title={`Retry preview for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}>
                <Button
                  size="small"
                  startIcon={<RefreshCw size={16} />}
                  onClick={() => onRetry(screenshot.id)}
                  aria-label={`Retry preview for ${employeeName(screenshot.employee)} captured ${formatDateTime(screenshot.capturedAt)}`}
                >
                  Retry
                </Button>
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
