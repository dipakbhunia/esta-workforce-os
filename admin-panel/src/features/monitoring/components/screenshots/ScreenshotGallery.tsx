import { Box } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import type { MonitoringScreenshot } from '../../types/monitoring.types';
import { ScreenshotCard, type ScreenshotPreviewState } from './ScreenshotCard';

interface ScreenshotGalleryProps {
  screenshots: MonitoringScreenshot[];
  previews: Record<string, ScreenshotPreviewState>;
  onVisible: (id: string) => void;
  onOpen: (id: string) => void;
  onRetry: (id: string) => void;
}

export function ScreenshotGallery({ screenshots, previews, onVisible, onOpen, onRetry }: ScreenshotGalleryProps) {
  if (!screenshots.length) {
    return <EmptyState title="No screenshots captured for this period." description="Try another date range, employee, or search term." />;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(3, minmax(0, 1fr))',
          xl: 'repeat(4, minmax(0, 1fr))',
        },
        gap: 2,
      }}
    >
      {screenshots.map((screenshot) => (
        <ScreenshotCard
          key={screenshot.id}
          screenshot={screenshot}
          preview={previews[screenshot.id]}
          onVisible={onVisible}
          onOpen={onOpen}
          onRetry={onRetry}
        />
      ))}
    </Box>
  );
}
