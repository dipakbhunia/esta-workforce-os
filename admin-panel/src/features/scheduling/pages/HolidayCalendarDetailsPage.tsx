import { Alert, Box, Button, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, Edit3, Eye, RefreshCw, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { DateRangePicker, createCustomDateRangeValue, formatDateRangeChip } from '@/components/enterprise/date-range';
import { EnterpriseFilterCard, EnterpriseFilterSearch, type EnterpriseActiveFilter } from '@/components/enterprise/filters';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { deleteHoliday, exportHolidays, getHolidayCalendar, getHolidays } from '../services/holiday-calendars-api';
import type { Holiday, HolidayType } from '../types/holiday-calendar.types';
import { calendarScopeLabel, dayOfWeek, formatDate, formatDateTime, holidayTypeLabel, holidayTypes, mandatoryLabel, recurringLabel, statusLabel, userLabel } from '../utils/holiday-calendar-utils';

interface LocationState { success?: string }

export default function HolidayCalendarDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(() => {
    const success = (location.state as LocationState | null)?.success;
    return success ? { severity: 'success', message: success } : null;
  });
  const [search, setSearch] = useState('');
  const [type, setType] = useState<HolidayType | ''>('');
  const [optional, setOptional] = useState<'true' | 'false' | ''>('');
  const [recurring, setRecurring] = useState<'true' | 'false' | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [archiveTarget, setArchiveTarget] = useState<Holiday | null>(null);

  const calendarQuery = useQuery({ queryKey: ['holiday-calendar', id], queryFn: () => getHolidayCalendar(id!), enabled: Boolean(id) });
  const holidaysQuery = useQuery({
    queryKey: ['holidays', id, { page: pagination.page + 1, limit: pagination.pageSize, search, type, optional, recurring, dateFrom, dateTo }],
    queryFn: () => getHolidays(id!, { page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, type: type || undefined, optional: optional ? optional === 'true' : undefined, recurring: recurring ? recurring === 'true' : undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    enabled: Boolean(id),
  });
  const archiveMutation = useMutation({
    mutationFn: (holiday: Holiday) => deleteHoliday(id!, holiday.id),
    onSuccess: async () => {
      setArchiveTarget(null);
      setToast({ severity: 'success', message: 'Holiday archived.' });
      await queryClient.invalidateQueries({ queryKey: ['holidays', id] });
      await queryClient.invalidateQueries({ queryKey: ['holiday-calendar', id] });
    },
    onError: () => setToast({ severity: 'error', message: 'Holiday could not be archived.' }),
  });
  const exportMutation = useMutation({
    mutationFn: () => exportHolidays(id!, { search: search || undefined, type: type || undefined, optional: optional ? optional === 'true' : undefined, recurring: recurring ? recurring === 'true' : undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
    onSuccess: (response) => {
      downloadBlob(response.data, `holidays-${todayForFilename()}.csv`);
      setToast({ severity: 'success', message: 'Holiday CSV export started.' });
    },
    onError: () => setToast({ severity: 'error', message: 'Holiday export failed.' }),
  });

  const calendar = calendarQuery.data?.data;
  const rows = holidaysQuery.data?.data.data ?? [];
  const meta = holidaysQuery.data?.data.meta;
  const totalHolidayCount = calendar?.holidayCount ?? calendar?.holidays?.length ?? 0;
  const hasAnyHolidays = totalHolidayCount > 0;
  const hasFilters = Boolean(search || type || optional || recurring || dateFrom || dateTo);
  const isEmpty = !holidaysQuery.isFetching && !holidaysQuery.isError && meta?.total === 0;
  const showCalendarEmpty = !hasAnyHolidays;
  const showFilteredEmpty = hasAnyHolidays && isEmpty;
  const resetPage = () => setPagination((current) => ({ ...current, page: 0 }));
  const clearRange = () => { setDateFrom(''); setDateTo(''); resetPage(); };
  const resetFilters = () => { setSearch(''); setType(''); setOptional(''); setRecurring(''); setDateFrom(''); setDateTo(''); resetPage(); };

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (type) filters.push({ key: 'type', label: 'Type', value: holidayTypeLabel(type), onRemove: () => { setType(''); resetPage(); } });
    if (optional) filters.push({ key: 'optional', label: 'Category', value: optional === 'true' ? 'Optional' : 'Mandatory', onRemove: () => { setOptional(''); resetPage(); } });
    if (recurring) filters.push({ key: 'recurring', label: 'Recurring', value: recurring === 'true' ? 'Recurring' : 'One-time', onRemove: () => { setRecurring(''); resetPage(); } });
    if (dateFrom && dateTo) filters.push({ key: 'dateRange', label: 'Date Range', value: formatDateRangeChip({ startDate: dateFrom, endDate: dateTo }), onRemove: clearRange });
    return filters;
  }, [dateFrom, dateTo, optional, recurring, search, type]);

  const summaryText = useMemo(() => {
    if (!meta) return undefined;
    if (meta.total === 0) return hasFilters ? `${activeFilters.length} filters applied` : undefined;
    const start = (meta.page - 1) * meta.limit + 1;
    const end = Math.min(meta.page * meta.limit, meta.total);
    return `Showing ${start}-${end} of ${meta.total} holidays`;
  }, [activeFilters.length, hasFilters, meta]);

  const columns = useMemo<GridColDef<Holiday>[]>(() => [
    { field: 'date', headerName: 'Holiday Date', minWidth: 150, valueGetter: (_, row) => formatDate(row.date) },
    { field: 'name', headerName: 'Holiday Name', minWidth: 220, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{row.name}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.notes ?? dayOfWeek(row.date)}</Typography></Box> },
    { field: 'type', headerName: 'Holiday Type', minWidth: 155, valueGetter: (_, row) => holidayTypeLabel(row.type) },
    { field: 'day', headerName: 'Day of Week', minWidth: 130, valueGetter: (_, row) => dayOfWeek(row.date) },
    { field: 'optional', headerName: 'Mandatory/Optional', minWidth: 160, valueGetter: (_, row) => mandatoryLabel(row.optional) },
    { field: 'recurring', headerName: 'Recurring', minWidth: 120, valueGetter: (_, row) => recurringLabel(row.recurring) },
    { field: 'status', headerName: 'Status', minWidth: 110, renderCell: () => <StatusChip label="Active" tone="success" /> },
    { field: 'actions', headerName: 'Actions', sortable: false, filterable: false, minWidth: 140, renderCell: ({ row }) => <Stack direction="row" gap={0.25}><Tooltip title="View"><IconButton component={RouterLink} to={`/scheduling/holiday-calendar/${id}/holidays/${row.id}`} size="small" aria-label={`View ${row.name}`}><Eye size={17} /></IconButton></Tooltip><Tooltip title="Edit"><IconButton component={RouterLink} to={`/scheduling/holiday-calendar/${id}/holidays/${row.id}/edit`} size="small" aria-label={`Edit ${row.name}`}><Edit3 size={17} /></IconButton></Tooltip><Tooltip title="Archive holiday"><IconButton size="small" color="error" onClick={() => setArchiveTarget(row)} aria-label={`Archive ${row.name}`}><Archive size={17} /></IconButton></Tooltip></Stack> },
  ], [id]);

  if (calendarQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (calendarQuery.isError || !calendar) return <Alert severity="error">Holiday calendar could not be loaded.</Alert>;

  return (
    <PageLayout>
      <PageHeader title={calendar.name} description="Manage holidays in this calendar." breadcrumbs={['Admin', 'Scheduling', 'Holiday Calendar', 'Details']} primaryActionLabel="Add Holiday" primaryActionTo={`/scheduling/holiday-calendar/${calendar.id}/holidays/create`} />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="flex-end">
        <Button component={RouterLink} to={`/scheduling/holiday-calendar/${calendar.id}/edit`} variant="outlined" startIcon={<Edit3 size={18} />}>Edit Calendar</Button>
      </Stack>
      <SectionCard title="Calendar Overview" description="Key calendar settings and holiday coverage.">
        <Box sx={detailGrid}>
          <Detail label="Scope" value={calendarScopeLabel(calendar)} />
          <Detail label="Year" value={String(calendar.year ?? 'Not configured')} />
          <Detail label="Branch" value={calendar.branchId ? calendar.branch?.name ?? 'Selected branch' : '-'} />
          <Detail label="Timezone" value={calendar.timezone} />
          <Detail label="Status" value={statusLabel(calendar.enabled)} chipTone={calendar.enabled ? 'success' : 'neutral'} />
          <Detail label="Holidays" value={String(totalHolidayCount)} />
          <Detail label="Mandatory" value={String(calendar.mandatoryCount ?? 0)} />
          <Detail label="Optional" value={String(calendar.optionalCount ?? 0)} />
          <Detail label="Description" value={calendar.description ?? 'Not configured'} />
          <Detail label="Notes" value={calendar.notes ?? 'Not configured'} />
          <Detail label="Created By" value={userLabel(calendar.createdBy)} />
          <Detail label="Updated" value={formatDateTime(calendar.updatedAt)} />
        </Box>
      </SectionCard>
      <Alert severity="info">Branch calendars apply only to their selected branch. Company calendars apply company-wide.</Alert>
      {showCalendarEmpty ? (
        <SectionCard title="Holidays" description="Add the first holiday to this calendar." action={<Button component={RouterLink} to={`/scheduling/holiday-calendar/${calendar.id}/holidays/create`} variant="contained">Add Holiday</Button>}>
          <EmptyState title="No Holidays Added" description="Add the first holiday to this calendar." />
        </SectionCard>
      ) : (
        <>
          <EnterpriseFilterCard title="Holiday Filters" description="Filter holidays by type, category, recurrence, date, and search." loading={holidaysQuery.isFetching || exportMutation.isPending} summary={summaryText} activeFilters={activeFilters} actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void holidaysQuery.refetch()} disabled={holidaysQuery.isFetching}>Refresh</Button><Tooltip title="Export all filtered holidays as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()}>{exportMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip></>} search={<EnterpriseFilterSearch value={search} label="Search holidays" placeholder="Search holiday name or notes" loading={holidaysQuery.isFetching} onChange={(value) => { setSearch(value); resetPage(); }} />} filters={<><FormControl size="small" fullWidth><InputLabel id="holiday-type-filter-label">Type</InputLabel><Select labelId="holiday-type-filter-label" label="Type" value={type} onChange={(event) => { setType(event.target.value as HolidayType | ''); resetPage(); }}><MenuItem value="">All Types</MenuItem>{holidayTypes.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</Select></FormControl><FormControl size="small" fullWidth><InputLabel id="holiday-optional-filter-label">Category</InputLabel><Select labelId="holiday-optional-filter-label" label="Category" value={optional} onChange={(event) => { setOptional(event.target.value as 'true' | 'false' | ''); resetPage(); }}><MenuItem value="">All Categories</MenuItem><MenuItem value="false">Mandatory</MenuItem><MenuItem value="true">Optional</MenuItem></Select></FormControl><FormControl size="small" fullWidth><InputLabel id="holiday-recurring-filter-label">Recurring</InputLabel><Select labelId="holiday-recurring-filter-label" label="Recurring" value={recurring} onChange={(event) => { setRecurring(event.target.value as 'true' | 'false' | ''); resetPage(); }}><MenuItem value="">All</MenuItem><MenuItem value="true">Recurring</MenuItem><MenuItem value="false">One-time</MenuItem></Select></FormControl><Box sx={{ width: '100%', minWidth: 0 }}><DateRangePicker label="Holiday Date Range" value={createCustomDateRangeValue(dateFrom, dateTo)} defaultPreset="customRange" mode="filter" onChange={(value) => { setDateFrom(value.dateFrom); setDateTo(value.dateTo); resetPage(); }} onClear={clearRange} /></Box></>} />
          {holidaysQuery.isError ? <Alert severity="error">Holidays could not be loaded.</Alert> : null}
          {showFilteredEmpty ? (
            <SectionCard title="Holidays" description="Adjust or clear filters to broaden the result set." action={<Button variant="outlined" onClick={resetFilters}>Clear Filters</Button>}>
              <EmptyState title="No holidays match the current filters" description="Adjust or clear the active filters and try again." />
            </SectionCard>
          ) : (
            <DataTable title="Holidays" rows={rows} columns={columns} showSearch={false} gridProps={{ loading: holidaysQuery.isFetching, paginationMode: 'server', rowCount: meta?.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 64, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title="No holidays match the current filters" description="Adjust or clear the active filters and try again." /> } }} />
          )}
        </>
      )}
      <ConfirmDialog open={Boolean(archiveTarget)} title="Archive Holiday" description="This removes the holiday from future scheduling. Existing attendance snapshots remain unchanged." confirmLabel="Archive Holiday" loading={archiveMutation.isPending} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function Detail({ label, value, chipTone }: { label: string; value: string; chipTone?: 'success' | 'neutral' }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><div>{chipTone ? <StatusChip label={value} tone={chipTone} /> : <Typography fontWeight={850}>{value}</Typography>}</div></Box>; }
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function todayForFilename() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 };