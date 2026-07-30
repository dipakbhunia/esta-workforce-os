import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Pagination,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Clock, Download, History, ShieldCheck, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DateRangePicker, createDateRangeValue } from '@/components/date-range-picker';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { getMonitoringDeviceHistory } from '../../services/monitoring-api';
import type { DeviceHistoryCategory, DeviceHistoryItem } from '../../types/monitoring.types';
import { formatDateTime, formatEnum } from '../../utils/monitoring-format';

const categories: Array<{ value: DeviceHistoryCategory | ''; label: string }> = [
  { value: '', label: 'All categories' },
  { value: 'REGISTRATION', label: 'Registration' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'MONITORING', label: 'Monitoring' },
  { value: 'DEVICE', label: 'Device' },
  { value: 'SYSTEM', label: 'System' },
];

const categoryTones: Record<DeviceHistoryCategory, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  REGISTRATION: 'info',
  SECURITY: 'warning',
  ASSIGNMENT: 'info',
  MONITORING: 'success',
  DEVICE: 'neutral',
  SYSTEM: 'neutral',
};

export function DeviceHistoryTimeline({ deviceId }: { deviceId: string }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DeviceHistoryCategory | ''>('');
  const [actor, setActor] = useState('');
  const [dateRange, setDateRange] = useState(createDateRangeValue('last30Days'));
  const [toast, setToast] = useState<string | null>(null);

  const queryParams = useMemo(() => ({
    page,
    pageSize: 20,
    search: search.trim() || undefined,
    category: category || undefined,
    actor: actor.trim() || undefined,
    dateFrom: dateRange.dateFrom || undefined,
    dateTo: dateRange.dateTo || undefined,
  }), [actor, category, dateRange.dateFrom, dateRange.dateTo, page, search]);

  const historyQuery = useQuery({
    queryKey: ['monitoring-device-history', deviceId, queryParams],
    queryFn: () => getMonitoringDeviceHistory(deviceId, queryParams),
    enabled: Boolean(deviceId),
  });

  const items = historyQuery.data?.data.items ?? [];
  const pagination = historyQuery.data?.data.pagination;

  function resetFilters() {
    setPage(1);
    setSearch('');
    setCategory('');
    setActor('');
    setDateRange(createDateRangeValue('last30Days'));
  }

  return (
    <Stack spacing={2.5}>
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}
      <SectionCard
        title="Device History"
        description="Audit-backed device timeline. Exports are placeholders until reporting export is enabled."
        action={(
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button disabled variant="outlined" startIcon={<Download size={16} />}>CSV</Button>
            <Button disabled variant="outlined" startIcon={<Download size={16} />}>Excel</Button>
          </Stack>
        )}
      >
        <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void historyQuery.refetch()} /><ExportButton onClick={() => setToast('Device history export will be connected in the reporting phase.')} /></>}>
          <SearchFilter placeholder="Search action or actor" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="device-history-category-label">Category</InputLabel>
            <Select
              labelId="device-history-category-label"
              label="Category"
              value={category}
              onChange={(event) => { setCategory(event.target.value as DeviceHistoryCategory | ''); setPage(1); }}
            >
              {categories.map((item) => <MenuItem key={item.value || 'all'} value={item.value}>{item.label}</MenuItem>)}
            </Select>
          </FormControl>
          <SearchFilter placeholder="Actor user ID" value={actor} onChange={(value) => { setActor(value); setPage(1); }} />
          <DateRangePicker value={dateRange} defaultPreset="last30Days" onChange={(value) => { setDateRange(value); setPage(1); }} />
        </FilterToolbar>

        {historyQuery.isLoading ? <LoadingSkeleton rows={7} /> : null}
        {historyQuery.isError ? (
          <Alert severity="error" action={<Button color="inherit" onClick={() => void historyQuery.refetch()}>Retry</Button>}>
            Device history could not be loaded.
          </Alert>
        ) : null}
        {!historyQuery.isLoading && !historyQuery.isError && !items.length ? (
          <EmptyState title="No device history found" description="Device actions will appear after registration, security, assignment, or monitoring changes are audited." />
        ) : null}

        {items.length ? (
          <Stack spacing={0} sx={{ position: 'relative', mt: 2 }}>
            <Box sx={{ position: 'absolute', left: 18, top: 12, bottom: 12, width: 2, bgcolor: 'divider' }} />
            {items.map((item) => <HistoryTimelineItem key={item.id} item={item} />)}
          </Stack>
        ) : null}

        {pagination && pagination.totalPages > 1 ? (
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ mt: 2.5 }}>
            <Typography variant="caption" color="text.secondary">
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} events)
            </Typography>
            <Pagination page={pagination.page} count={pagination.totalPages} onChange={(_, value) => setPage(value)} color="primary" />
          </Stack>
        ) : null}
      </SectionCard>
    </Stack>
  );
}

function HistoryTimelineItem({ item }: { item: DeviceHistoryItem }) {
  const metadataEntries = safeMetadataEntries(item.metadata);
  return (
    <Stack direction="row" gap={1.5} sx={{ position: 'relative', py: 1.5, pl: 0 }}>
      <Box sx={{ width: 38, display: 'flex', justifyContent: 'center', flex: '0 0 auto', zIndex: 1 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '12px', bgcolor: '#EFF6FF', color: '#2563EB', display: 'grid', placeItems: 'center', border: '1px solid', borderColor: 'divider' }}>
          {historyIcon(item.category)}
        </Box>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 1.75, bgcolor: '#FFFFFF' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.25} alignItems={{ xs: 'flex-start', md: 'center' }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
              <Typography variant="body2" fontWeight={850}>{item.title}</Typography>
              <StatusChip label={formatEnum(item.category)} tone={categoryTones[item.category]} />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.description}</Typography>
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            <Chip size="small" icon={<Clock size={14} />} label={formatDateTime(item.occurredAt)} />
            <Chip size="small" icon={<UserRound size={14} />} label={item.actor.name || 'System'} />
          </Stack>
        </Stack>
        {item.actor.email ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            Actor: {item.actor.email}
          </Typography>
        ) : null}
        {metadataEntries.length ? (
          <Accordion disableGutters elevation={0} sx={{ mt: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 2, '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ChevronDown size={16} />}>
              <Typography variant="caption" fontWeight={800}>Safe metadata</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'max-content 1fr' }, gap: 1, m: 0 }}>
                {metadataEntries.map(([key, value]) => (
                  <Box component="div" key={key} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="caption" color="text.secondary" fontWeight={800}>{key}</Typography>
                    <Typography component="dd" variant="caption" sx={{ m: 0, wordBreak: 'break-word' }}>{formatMetadataValue(value)}</Typography>
                  </Box>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        ) : null}
      </Box>
    </Stack>
  );
}

function historyIcon(category: DeviceHistoryCategory) {
  if (category === 'SECURITY') return <ShieldCheck size={17} />;
  if (category === 'REGISTRATION') return <History size={17} />;
  return <History size={17} />;
}

function safeMetadataEntries(metadata: Record<string, unknown> | null) {
  if (!metadata) return [];
  return Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null);
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(formatMetadataValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return 'Not available';
}
