import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { Keyboard, MousePointerClick, Move, ScrollText } from 'lucide-react';

export interface InputActivityCounts {
  keyboardCount?: number | null;
  mouseClickCount?: number | null;
  mouseMoveCount?: number | null;
  scrollCount?: number | null;
}

interface InputActivityMetricsProps {
  counts?: InputActivityCounts | null;
  compact?: boolean;
  emptyText?: string;
}

const metrics = [
  {
    key: 'keyboardCount',
    label: 'Keyboard',
    ariaLabel: 'Keyboard count',
    tooltip: 'Number of key-down events during this session.',
    color: '#2563EB',
    icon: Keyboard,
  },
  {
    key: 'mouseClickCount',
    label: 'Mouse',
    ariaLabel: 'Mouse click count',
    tooltip: 'Left/right/middle clicks.',
    color: '#16A34A',
    icon: MousePointerClick,
  },
  {
    key: 'mouseMoveCount',
    label: 'Movement',
    ariaLabel: 'Mouse movement count',
    tooltip: 'Movement activity count.',
    color: '#7C3AED',
    icon: Move,
  },
  {
    key: 'scrollCount',
    label: 'Scroll',
    ariaLabel: 'Scroll count',
    tooltip: 'Mouse wheel activity count.',
    color: '#F59E0B',
    icon: ScrollText,
  },
] as const;

export function InputActivityMetrics({
  counts,
  compact = false,
  emptyText = 'Input activity not available',
}: InputActivityMetricsProps) {
  if (!hasAvailableInputActivity(counts)) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyText}
      </Typography>
    );
  }

  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      gap={compact ? 0.75 : 1}
      role="list"
      aria-label="Input activity metrics"
      sx={{ alignItems: 'center' }}
    >
      {metrics.map((metric) => {
        const value = metricValue(counts?.[metric.key]);
        if (value === null) return null;
        const Icon = metric.icon;
        return (
          <Tooltip key={metric.key} title={metric.tooltip} arrow>
            <Box
              role="listitem"
              tabIndex={0}
              aria-label={`${metric.ariaLabel}: ${formatCount(value)}`}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: compact ? 1 : 1.25,
                py: compact ? 0.45 : 0.65,
                borderRadius: 999,
                border: '1px solid #E5E7EB',
                bgcolor: '#FFFFFF',
                color: '#111827',
                minWidth: compact ? 'auto' : 116,
                boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)',
                '&:focus-visible': {
                  outline: `2px solid ${metric.color}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Icon size={compact ? 14 : 16} color={metric.color} strokeWidth={2.2} aria-hidden="true" />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1 }}>
                  {metric.label}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                  {formatCount(value)}
                </Typography>
              </Box>
            </Box>
          </Tooltip>
        );
      })}
    </Stack>
  );
}

export function hasAvailableInputActivity(counts?: InputActivityCounts | null): boolean {
  return metrics.some((metric) => metricValue(counts?.[metric.key]) !== null);
}

export function inputActivityFromRecord(record?: InputActivityCounts | null): InputActivityCounts {
  return {
    keyboardCount: metricValue(record?.keyboardCount),
    mouseClickCount: metricValue(record?.mouseClickCount),
    mouseMoveCount: metricValue(record?.mouseMoveCount),
    scrollCount: metricValue(record?.scrollCount),
  };
}

export function inputActivityFromMetadata(metadata?: Record<string, unknown> | null): InputActivityCounts {
  const activity = objectValue(metadata?.activitySession) ?? objectValue(metadata?.inputActivity);
  return {
    keyboardCount: metricValue(activity?.keyboardCount ?? metadata?.keyboardCount),
    mouseClickCount: metricValue(activity?.mouseClickCount ?? metadata?.mouseClickCount),
    mouseMoveCount: metricValue(activity?.mouseMoveCount ?? metadata?.mouseMoveCount),
    scrollCount: metricValue(activity?.scrollCount ?? metadata?.scrollCount),
  };
}

export function formatInputCount(value: number | null | undefined): string {
  const normalizedValue = metricValue(value);
  return normalizedValue === null ? 'Not available' : formatCount(normalizedValue);
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metricValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatCount(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}
