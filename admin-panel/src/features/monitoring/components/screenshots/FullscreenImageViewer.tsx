import { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, Info, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { MonitoringScreenshot } from '../../types/monitoring.types';
import { employeeName, formatDateTime } from '../../utils/monitoring-format';
import type { ScreenshotPreviewState } from './ScreenshotCard';
import { ScreenshotInspector } from './ScreenshotInspector';

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
  const currentIndex = screenshots.findIndex((item) => item.id === currentId);
  const screenshot = currentIndex >= 0 ? screenshots[currentIndex] : null;
  const preview = screenshot ? previews[screenshot.id] : undefined;

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
  }, [move, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, open]);

  return (
    <Dialog open={open} onClose={onClose} fullScreen maxWidth={false} aria-label="Screenshot fullscreen viewer">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box minWidth={0}>
          <Typography variant="h6" noWrap>{screenshot ? employeeName(screenshot.employee) : 'Screenshot Preview'}</Typography>
          <Typography variant="caption" color="text.secondary">{screenshot ? formatDateTime(screenshot.capturedAt) : ''}</Typography>
        </Box>
        <Stack direction="row" gap={0.75}>
          <Tooltip title="Previous screenshot"><span><IconButton aria-label="Previous screenshot" disabled={currentIndex <= 0} onClick={() => move(-1)}><ChevronLeft size={20} /></IconButton></span></Tooltip>
          <Tooltip title="Next screenshot"><span><IconButton aria-label="Next screenshot" disabled={currentIndex < 0 || currentIndex >= screenshots.length - 1} onClick={() => move(1)}><ChevronRight size={20} /></IconButton></span></Tooltip>
          <Tooltip title="Zoom out"><IconButton aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}><Minus size={20} /></IconButton></Tooltip>
          <Tooltip title="Zoom in"><IconButton aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}><Plus size={20} /></IconButton></Tooltip>
          <Tooltip title="Reset zoom"><IconButton aria-label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw size={20} /></IconButton></Tooltip>
          <Tooltip title={showMetadata ? 'Hide metadata' : 'Show metadata'}><IconButton aria-label={showMetadata ? 'Hide metadata panel' : 'Show metadata panel'} onClick={() => setShowMetadata((value) => !value)}><Info size={20} /></IconButton></Tooltip>
          <Tooltip title="Close viewer"><IconButton aria-label="Close viewer" onClick={onClose}><X size={20} /></IconButton></Tooltip>
        </Stack>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ p: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', lg: showMetadata ? 'minmax(0, 1fr) 360px' : '1fr' }, minHeight: 0 }}>
        <Box sx={{ bgcolor: '#0F172A', minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'auto', p: 2 }}>
          {preview?.loading && <CircularProgress />}
          {preview?.url && (
            <Box
              component="img"
              src={preview.url}
              alt={screenshot ? `Screenshot captured for ${employeeName(screenshot.employee)}` : 'Screenshot preview'}
              onError={() => screenshot && onLoadPreview(screenshot.id, true)}
              sx={{ maxWidth: `${100 * zoom}%`, maxHeight: `${100 * zoom}%`, objectFit: 'contain', transition: 'max-width 120ms ease, max-height 120ms ease' }}
            />
          )}
          {!preview?.loading && !preview?.url && (
            <Stack alignItems="center" spacing={2} sx={{ color: '#fff' }}>
              <Typography>{preview?.error ?? 'Preview is not loaded yet.'}</Typography>
              {screenshot && <Button variant="contained" onClick={() => onLoadPreview(screenshot.id, true)}>Retry preview</Button>}
            </Stack>
          )}
        </Box>
        {showMetadata && <Box sx={{ p: 2, overflow: 'auto' }}><ScreenshotInspector screenshot={screenshot} /></Box>}
      </DialogContent>
    </Dialog>
  );
}
