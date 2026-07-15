import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ChevronLeft, ChevronRight, ExternalLink, Info, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { MonitoringScreenshot } from '../../types/monitoring.types';
import { employeeName, formatDateTime } from '../../utils/monitoring-format';
import type { ScreenshotPreviewState } from './ScreenshotCard';
import { ScreenshotInspector } from './ScreenshotInspector';
import { screenshotApplication } from './screenshot-helpers';

interface FullscreenImageViewerProps {
  open: boolean;
  screenshots: MonitoringScreenshot[];
  currentId: string | null;
  previews: Record<string, ScreenshotPreviewState>;
  onClose: () => void;
  onChange: (id: string) => void;
  onLoadPreview: (id: string, force?: boolean) => void;
}

export function FullscreenImageViewer({ open, screenshots, currentId, previews, onClose, onChange, onLoadPreview }: FullscreenImageViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [showMetadata, setShowMetadata] = useState(true);
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));
  const currentIndex = screenshots.findIndex((item) => item.id === currentId);
  const screenshot = currentIndex >= 0 ? screenshots[currentIndex] : null;
  const preview = screenshot ? previews[screenshot.id] : undefined;
  const appName = screenshot ? screenshotApplication(screenshot) : 'Application not available';

  useEffect(() => {
    if (open && screenshot) onLoadPreview(screenshot.id);
  }, [onLoadPreview, open, screenshot]);

  const move = useCallback((delta: number) => {
    if (!screenshots.length || currentIndex < 0) return;
    const next = screenshots[currentIndex + delta];
    if (next) {
      setZoom(1);
      onChange(next.id);
      onLoadPreview(next.id);
    }
  }, [currentIndex, onChange, onLoadPreview, screenshots]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'ArrowLeft') move(-1);
    if (event.key === 'ArrowRight') move(1);
    if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(3, value + 0.25));
    if (event.key === '-') setZoom((value) => Math.max(0.5, value - 0.25));
    if (event.key === '0') setZoom(1);
  }, [move, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="xl"
      aria-label="Screenshot fullscreen viewer"
      PaperProps={{
        sx: {
          height: { md: '92vh' },
          borderRadius: { xs: 0, md: 3 },
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <Box minWidth={0}>
          <Typography variant="h5" noWrap>{screenshot ? employeeName(screenshot.employee) : 'Screenshot Preview'}</Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {screenshot ? `${formatDateTime(screenshot.capturedAt)} · ${appName}` : 'Secure preview'}
          </Typography>
        </Box>
        <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" justifyContent="flex-end">
          {preview?.url && (
            <Tooltip title="Open secure preview in a new tab">
              <Button
                size="small"
                startIcon={<ExternalLink size={16} />}
                onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}
                aria-label="Open secure preview in a new tab"
              >
                Open preview
              </Button>
            </Tooltip>
          )}
          <Tooltip title="Previous screenshot"><span><IconButton aria-label="Previous screenshot" disabled={currentIndex <= 0} onClick={() => move(-1)}><ChevronLeft size={20} /></IconButton></span></Tooltip>
          <Tooltip title="Next screenshot"><span><IconButton aria-label="Next screenshot" disabled={currentIndex < 0 || currentIndex >= screenshots.length - 1} onClick={() => move(1)}><ChevronRight size={20} /></IconButton></span></Tooltip>
          <Tooltip title={showMetadata ? 'Hide inspector' : 'Show inspector'}><IconButton aria-label={showMetadata ? 'Hide inspector panel' : 'Show inspector panel'} onClick={() => setShowMetadata((value) => !value)}><Info size={20} /></IconButton></Tooltip>
          <Tooltip title="Close viewer"><IconButton aria-label="Close viewer" onClick={onClose}><X size={20} /></IconButton></Tooltip>
        </Stack>
      </DialogTitle>
      <DialogContent
        sx={{
          p: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: showMetadata ? 'minmax(0, 7fr) minmax(320px, 3fr)' : '1fr' },
          minHeight: 0,
          bgcolor: '#F8FAFC',
        }}
      >
        <Box sx={{ minHeight: 0, display: 'grid', gridTemplateRows: '1fr auto', overflow: 'hidden' }}>
          <Box
            sx={{
              m: { xs: 1.5, md: 2 },
              borderRadius: 3,
              bgcolor: '#111827',
              minHeight: 0,
              display: 'grid',
              placeItems: 'center',
              overflow: 'auto',
              p: 2,
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            {preview?.loading && <CircularProgress />}
            {preview?.url && (
              <Box
                component="img"
                src={preview.url}
                alt={screenshot ? `Screenshot captured for ${employeeName(screenshot.employee)} at ${formatDateTime(screenshot.capturedAt)}` : 'Screenshot preview'}
                onError={() => screenshot && onLoadPreview(screenshot.id, true)}
                sx={{
                  maxWidth: `${100 * zoom}%`,
                  maxHeight: `${100 * zoom}%`,
                  objectFit: 'contain',
                  borderRadius: 1.5,
                  boxShadow: '0 24px 70px rgba(0,0,0,0.35)',
                  transition: 'max-width 120ms ease, max-height 120ms ease',
                }}
              />
            )}
            {!preview?.loading && !preview?.url && (
              <Stack alignItems="center" spacing={2} sx={{ color: '#fff' }}>
                <Typography>{preview?.error ?? 'Preview is not loaded yet.'}</Typography>
                {screenshot && <Button variant="contained" onClick={() => onLoadPreview(screenshot.id, true)}>Retry preview</Button>}
              </Stack>
            )}
          </Box>
          <Stack
            direction="row"
            gap={1}
            justifyContent="center"
            alignItems="center"
            sx={{ px: 2, py: 1.5, borderTop: '1px solid #E5E7EB', bgcolor: 'background.paper' }}
          >
            <Tooltip title="Zoom out"><IconButton aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}><Minus size={20} /></IconButton></Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 54, textAlign: 'center' }}>{Math.round(zoom * 100)}%</Typography>
            <Tooltip title="Zoom in"><IconButton aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}><Plus size={20} /></IconButton></Tooltip>
            <Divider flexItem orientation="vertical" />
            <Tooltip title="Fit to screen"><IconButton aria-label="Fit screenshot to screen" onClick={() => setZoom(1)}><Maximize2 size={20} /></IconButton></Tooltip>
            <Tooltip title="Reset zoom"><IconButton aria-label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw size={20} /></IconButton></Tooltip>
          </Stack>
        </Box>
        {showMetadata && (
          <Box sx={{ p: 2, overflow: 'auto', borderLeft: { lg: '1px solid #E5E7EB' }, bgcolor: 'background.paper' }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" color="text.secondary">Activity Context</Typography>
                <Typography variant="body2" fontWeight={800}>{appName}</Typography>
                <Typography variant="caption" color="text.secondary">Only metadata returned with this screenshot is shown.</Typography>
              </Box>
              <ScreenshotInspector screenshot={screenshot} />
            </Stack>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
