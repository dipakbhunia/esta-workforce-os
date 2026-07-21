import { Box, Stack, Tooltip, Typography } from '@mui/material';
import { InputActivityMetrics } from '../InputActivityMetrics';
import type { InputActivityCounts } from '../InputActivityMetrics';

interface ScreenshotInputMetricsProps {
  counts?: InputActivityCounts | null;
  compact?: boolean;
  showUnavailable?: boolean;
}

const tooltip =
  'Aggregate counter for the activity session associated with this screenshot. No key names, typed text, mouse coordinates, or raw event history are stored.';

export function ScreenshotInputMetrics({
  counts,
  compact = false,
  showUnavailable = true,
}: ScreenshotInputMetricsProps) {
  return (
    <Stack spacing={0.75}>
      <Stack direction="row" alignItems="center" gap={0.75}>
        <Typography variant="overline" color="text.secondary">
          Input Activity
        </Typography>
        <Tooltip title={tooltip} arrow>
          <Box
            component="span"
            tabIndex={0}
            aria-label="Input activity information"
            sx={{
              display: 'inline-flex',
              width: 18,
              height: 18,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '1px solid #E5E7EB',
              color: 'text.secondary',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'help',
              '&:focus-visible': {
                outline: '2px solid #2563EB',
                outlineOffset: 2,
              },
            }}
          >
            i
          </Box>
        </Tooltip>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Aggregate input counts for the associated activity session.
      </Typography>
      <InputActivityMetrics
        counts={counts}
        compact={compact}
        emptyText={showUnavailable ? 'Not available' : ''}
      />
    </Stack>
  );
}
