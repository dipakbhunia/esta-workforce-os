import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Pagination,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, Database, FileImage, HardDrive, Monitor, Users } from 'lucide-react';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatCard } from '@/components/stat-card';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getEmployees } from '@/features/people/services/employees-api';
import {
  FullscreenImageViewer,
  ScreenshotGallery,
  ScreenshotInspector,
  ScreenshotTimeline,
  type ScreenshotPreviewState,
} from '../components/screenshots';
import { getMonitoringScreenshotPreview, getMonitoringScreenshots } from '../services/monitoring-api';
import type { MonitoringScreenshot } from '../types/monitoring.types';
import { employeeName, formatBytes, formatDateTime } from '../utils/monitoring-format';

type ViewMode = 'gallery' | 'timeline';
const maxPreviewCacheEntries = 75;

export default function MonitoringScreenshotsPage() {
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [dateRange, setDateRange] = useState(() => createDateRangeValue('today'));
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, ScreenshotPreviewState>>({});
  const previewsRef = useRef(previews);
  const inFlight = useRef(new Set<string>());
  const [toast, setToast] = useState<string | null>(null);
  const pageSize = 20;

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    setPreviews({});
    previewsRef.current = {};
    inFlight.current.clear();
  }, [dateRange.dateFrom, dateRange.dateTo, deviceId, employeeId, page, search]);

  const screenshotsQuery = useQuery({
    queryKey: ['monitoring-screenshots', { page, pageSize, search, employeeId, deviceId, dateRange }],
    queryFn: () => getMonitoringScreenshots({
      page,
      limit: pageSize,
      search: search || undefined,
      employeeId: employeeId || undefined,
      deviceId: deviceId || undefined,
      dateFrom: dateRange.dateFrom || undefined,
      dateTo: dateRange.dateTo || undefined,
    }),
  });

  const employeesQuery = useQuery({
    queryKey: ['monitoring-screenshot-employees'],
    queryFn: () => getEmployees({ page: 1, limit: 100 }),
  });

  const screenshots = useMemo(() => screenshotsQuery.data?.data.data ?? [], [screenshotsQuery.data?.data.data]);
  const total = screenshotsQuery.data?.data.meta.total ?? 0;
  const totalPages = Math.max(1, screenshotsQuery.data?.data.meta.totalPages ?? 1);
  const selectedScreenshot = screenshots.find((item) => item.id === selectedId) ?? screenshots[0] ?? null;

  const summary = useMemo(() => {
    const employees = new Set<string>();
    const devices = new Set<string>();
    let latest: MonitoringScreenshot | null = null;
    let size = 0;
    let previewCount = 0;

    for (const screenshot of screenshots) {
      if (screenshot.employee?.id) employees.add(screenshot.employee.id);
      if (screenshot.deviceId) devices.add(screenshot.deviceId);
      if (screenshot.previewAvailable) previewCount += 1;
      size += screenshot.sizeBytes ?? 0;
      if (!latest || new Date(screenshot.capturedAt).getTime() > new Date(latest.capturedAt).getTime()) {
        latest = screenshot;
      }
    }

    return { employees: employees.size, devices: devices.size, latest, size, previewCount };
  }, [screenshots]);

  const deviceOptions = useMemo(() => {
    const map = new Map<string, number>();
    screenshots.forEach((screenshot) => {
      if (screenshot.deviceId) map.set(screenshot.deviceId, (map.get(screenshot.deviceId) ?? 0) + 1);
    });
    return Array.from(map.entries()).map(([id, count]) => ({ id, count }));
  }, [screenshots]);

  const employeeCounts = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    screenshots.forEach((screenshot) => {
      const id = screenshot.employee?.id;
      if (!id) return;
      const current = map.get(id) ?? { name: employeeName(screenshot.employee), count: 0 };
      current.count += 1;
      map.set(id, current);
    });
    return Array.from(map.entries()).map(([id, value]) => ({ id, ...value }));
  }, [screenshots]);

  const loadPreview = useCallback(async (id: string, force = false) => {
    const current = previewsRef.current[id];
    const validUntil = current?.expiresAt ? new Date(current.expiresAt).getTime() : 0;
    if (!force && current?.url && validUntil > Date.now() + 30_000) return;
    if (inFlight.current.has(id)) return;

    inFlight.current.add(id);
    setPreviews((value) => ({ ...value, [id]: { ...value[id], loading: true, error: undefined } }));
    try {
      const response = await getMonitoringScreenshotPreview(id);
      setPreviews((value) => ({
        ...prunePreviewCache(value, id),
        [id]: { url: response.data.url, expiresAt: response.data.expiresAt, loading: false },
      }));
    } catch {
      setPreviews((value) => ({
        ...value,
        [id]: { ...value[id], loading: false, error: 'Preview could not be loaded.' },
      }));
    } finally {
      inFlight.current.delete(id);
    }
  }, []);

  function resetFilters() {
    setSearch('');
    setEmployeeId('');
    setDeviceId('');
    setDateRange(createDateRangeValue('today'));
    setViewMode('gallery');
    setPage(1);
  }

  function openViewer(id: string) {
    setSelectedId(id);
    void loadPreview(id);
  }

  return (
    <PageLayout>
      <PageHeader
        title="Screenshots"
        description="Review secure employee screenshot previews with timeline context and metadata inspection."
        breadcrumbs={['Admin', 'Monitoring', 'Screenshots']}
      />

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => void screenshotsQuery.refetch()} />
            <ExportButton onClick={() => setToast('Screenshot export will be connected in the reporting phase.')} />
          </>
        )}
      >
        <DateRangePicker
          value={dateRange}
          defaultPreset="today"
          onChange={(value) => {
            setDateRange(value);
            setPage(1);
          }}
        />
        <SearchFilter
          placeholder="Search employee, MIME, checksum, or context"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <TextField
          select
          label="Employee"
          size="small"
          value={employeeId}
          onChange={(event) => {
            setEmployeeId(event.target.value);
            setPage(1);
          }}
          sx={{ minWidth: { xs: '100%', md: 220 } }}
        >
          <MenuItem value="">All employees</MenuItem>
          {(employeesQuery.data?.data.data ?? []).map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>
              {employee.employeeCode} - {[employee.user?.firstName, employee.user?.lastName].filter(Boolean).join(' ') || employee.user?.email || 'Employee'}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Device"
          size="small"
          value={deviceId}
          onChange={(event) => {
            setDeviceId(event.target.value);
            setPage(1);
          }}
          helperText="Device options are based on the currently loaded results."
          FormHelperTextProps={{ sx: { maxWidth: 220 } }}
          sx={{ minWidth: { xs: '100%', md: 190 } }}
        >
          <MenuItem value="">All devices</MenuItem>
          {deviceOptions.map((device) => (
            <MenuItem key={device.id} value={device.id}>
              {device.id.slice(0, 8)} ({device.count})
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={viewMode}
          onChange={(_, value: ViewMode | null) => value && setViewMode(value)}
          aria-label="Screenshot view mode"
          sx={{ height: 40 }}
        >
          <ToggleButton value="gallery" aria-label="Gallery view">Gallery</ToggleButton>
          <ToggleButton value="timeline" aria-label="Timeline view">Timeline</ToggleButton>
        </ToggleButtonGroup>
      </FilterToolbar>

      <SummaryCardsContainer>
        <StatCard label="Screenshots Captured" value={String(total)} helper="Matching current filters" icon={FileImage} tone="#2563EB" />
        <StatCard label="Employees Captured" value={String(summary.employees)} helper="Current loaded page" icon={Users} tone="#16A34A" />
        <StatCard label="Devices Used" value={String(summary.devices)} helper="Current loaded page" icon={Monitor} tone="#7C3AED" />
        <StatCard label="Latest Capture" value={summary.latest ? formatDateTime(summary.latest.capturedAt) : 'None'} helper="Current loaded page" icon={Clock} tone="#F59E0B" />
        <StatCard label="Total Storage Size" value={formatBytes(summary.size)} helper="Current loaded page" icon={Database} tone="#0EA5E9" />
        <StatCard label="Preview Available" value={String(summary.previewCount)} helper="Current loaded page" icon={CheckCircle2} tone="#16A34A" />
      </SummaryCardsContainer>

      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}
      {employeesQuery.isError && <Alert severity="warning">Employee filter could not be loaded.</Alert>}
      {screenshotsQuery.isError && (
        <Alert severity="error" action={<Button color="inherit" onClick={() => void screenshotsQuery.refetch()}>Retry</Button>}>
          Screenshot metadata could not be loaded.
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: employeeCounts.length ? '220px minmax(0, 1fr) 340px' : 'minmax(0, 1fr) 340px' }, gap: 2 }}>
        {employeeCounts.length > 0 && (
          <Box sx={{ display: { xs: 'none', xl: 'block' } }}>
            <SectionCard title="Employees" description="Loaded-page filter panel">
              <Stack spacing={1}>
                {employeeCounts.map((employee) => (
                  <Button
                    key={employee.id}
                    variant={employeeId === employee.id ? 'contained' : 'outlined'}
                    onClick={() => {
                      setEmployeeId(employeeId === employee.id ? '' : employee.id);
                      setPage(1);
                    }}
                    sx={{ justifyContent: 'space-between', textTransform: 'none' }}
                  >
                    <span>{employee.name}</span>
                    <Chip size="small" label={employee.count} />
                  </Button>
                ))}
              </Stack>
            </SectionCard>
          </Box>
        )}

        <SectionCard
          title={viewMode === 'gallery' ? 'Screenshot Gallery' : 'Screenshot Timeline'}
          description="Signed previews load on demand and expire automatically."
          action={<Chip label="Server pagination" size="small" />}
        >
          {screenshotsQuery.isFetching ? (
            <LoadingSkeleton rows={8} />
          ) : screenshots.length ? (
            <>
              {viewMode === 'gallery' ? (
                <ScreenshotGallery
                  screenshots={screenshots}
                  previews={previews}
                  onVisible={(id) => void loadPreview(id)}
                  onOpen={openViewer}
                  onRetry={(id) => void loadPreview(id, true)}
                />
              ) : (
                <ScreenshotTimeline screenshots={screenshots} onOpen={openViewer} />
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" justifyContent="space-between" gap={2} sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Showing page {page} of {totalPages}. Previews are requested only when visible or opened.
                  {' '}Device options are based on the currently loaded results.
                </Typography>
                <Pagination count={totalPages} page={page} onChange={(_, value) => setPage(value)} color="primary" />
              </Stack>
            </>
          ) : (
            <EmptyState title="No screenshots captured for this period." description="Try changing the date range or employee filter." />
          )}
        </SectionCard>

        <ScreenshotInspector screenshot={selectedScreenshot} />
      </Box>

      <FullscreenImageViewer
        open={Boolean(selectedId)}
        screenshots={screenshots}
        currentId={selectedId}
        previews={previews}
        onClose={() => setSelectedId(null)}
        onChange={setSelectedId}
        onLoadPreview={(id, force) => void loadPreview(id, force)}
      />
    </PageLayout>
  );
}

function prunePreviewCache(
  cache: Record<string, ScreenshotPreviewState>,
  keepId: string,
): Record<string, ScreenshotPreviewState> {
  const entries = Object.entries(cache).filter(([id]) => id !== keepId);
  const keep = entries.slice(Math.max(0, entries.length - (maxPreviewCacheEntries - 1)));
  return Object.fromEntries(keep);
}
