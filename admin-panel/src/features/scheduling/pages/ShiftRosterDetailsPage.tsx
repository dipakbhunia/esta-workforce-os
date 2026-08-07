import { Alert, Box, Button, Card, CardContent, FormControl, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, Download, Edit3, Layers, LockKeyhole, Plus, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, Navigate, useLocation, useParams } from 'react-router-dom';
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
import { useShifts } from '@/features/organization/hooks';
import { getEmployees } from '@/features/people/services/employees-api';
import { RosterBulkActionDialog } from '../components/RosterBulkActionDialog';
import { RosterCalendarGrid } from '../components/RosterCalendarGrid';
import { RosterDayDialog } from '../components/RosterDayDialog';
import { RosterLifecycleDialog } from '../components/RosterLifecycleDialog';
import { RosterPreviewPanel } from '../components/RosterPreviewPanel';
import { RosterStatusBadge } from '../components/RosterStatusBadge';
import { RosterTemplateApplyDialog } from '../components/RosterTemplateApplyDialog';
import { bulkUpsertShiftRosterDays, deleteShiftRosterDay, exportShiftRosterDays, getShiftRoster, getShiftRosterDays, lockShiftRoster, previewShiftRoster, publishShiftRoster, upsertShiftRosterDay } from '../services/shift-rosters-api';
import type { RosterDayType, RosterPreviewResponse, ShiftRosterDay } from '../types/shift-roster.types';
import { addDays, dateInputFromDate, dayTypeLabel, dayTypeTone, downloadBlob, employeeName, formatDateOnly, formatDateRange, formatDateTime, formatDurationDays, localDateForFilename, responseBlob, rosterDayShiftLabel, rosterDayTypeOptions, scopeLabel, weekStart } from '../utils/shift-roster-utils';

export default function ShiftRosterDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [week, setWeek] = useState(weekStart(dateInputFromDate(new Date())));
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dayType, setDayType] = useState<RosterDayType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateRangeError, setDateRangeError] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [dayDialog, setDayDialog] = useState<{ employeeId?: string; workDate?: string; day?: ShiftRosterDay | null } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [templateApplyOpen, setTemplateApplyOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<ShiftRosterDay | null>(null);
  const [lifecycle, setLifecycle] = useState<'publish' | 'lock' | null>(null);
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error' | 'info'; message: string } | null>(location.state?.success ? { severity: 'success', message: location.state.success } : null);

  const rosterQuery = useQuery({ queryKey: ['shift-roster', id], queryFn: () => getShiftRoster(id!), enabled: Boolean(id) });
  const roster = rosterQuery.data?.data;
  const readonly = roster?.status === 'LOCKED' || roster?.status === 'CANCELLED';

  const employeeQuery = useQuery({ queryKey: ['employees', { rosterId: id, branchId: roster?.branchId, departmentId: roster?.departmentId }], queryFn: () => getEmployees({ page: 1, limit: 100, branchId: roster?.branchId ?? undefined, departmentId: roster?.departmentId ?? undefined }), enabled: Boolean(id) });
  const shiftsQuery = useShifts();

  const daysQuery = useQuery({
    queryKey: ['shift-roster-days', id, { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, dayType, dateFrom, dateTo, week }],
    queryFn: () => getShiftRosterDays(id!, { page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, employeeId: employeeId || undefined, dayType: dayType || undefined, dateFrom: dateFrom || week, dateTo: dateTo || addDays(week, 6) }),
    enabled: Boolean(id) && !dateRangeError,
  });

  const employees = employeeQuery.data?.data.data ?? [];
  const shifts = shiftsQuery.data?.data.data ?? [];
  const days = daysQuery.data?.data.data ?? [];
  const meta = daysQuery.data?.data.meta;
  const duration = inclusiveDateDuration(roster?.dateFrom, roster?.dateTo);
  const hasFilters = Boolean(search || employeeId || dayType || dateFrom || dateTo);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shift-roster', id] }),
      queryClient.invalidateQueries({ queryKey: ['shift-roster-days', id] }),
      queryClient.invalidateQueries({ queryKey: ['shift-rosters'] }),
    ]);
  };

  const upsertMutation = useMutation({ mutationFn: (payload: Parameters<typeof upsertShiftRosterDay>[1]) => upsertShiftRosterDay(id!, payload), onSuccess: async () => { setDayDialog(null); setToast({ severity: 'success', message: 'Roster day saved.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster day could not be saved.' }) });
  const bulkMutation = useMutation({ mutationFn: (payload: Parameters<typeof bulkUpsertShiftRosterDays>[1]) => bulkUpsertShiftRosterDays(id!, payload), onSuccess: async (response) => { setBulkOpen(false); setToast({ severity: 'success', message: `${response.data.count} roster cells updated.` }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Bulk update failed.' }) });
  const clearMutation = useMutation({ mutationFn: (day: ShiftRosterDay) => deleteShiftRosterDay(id!, day.id), onSuccess: async () => { setClearTarget(null); setDayDialog(null); setToast({ severity: 'success', message: 'Roster day cleared.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster day could not be cleared.' }) });
  const previewMutation = useMutation({ mutationFn: () => previewShiftRoster(id!), onSuccess: (response) => { setPreview(response.data); setTab(2); setToast({ severity: response.data.valid ? 'success' : 'error', message: response.data.valid ? 'Preview passed.' : `Preview found ${response.data.errors.length} blocking issue(s).` }); }, onError: () => setToast({ severity: 'error', message: 'Preview failed.' }) });
  const publishMutation = useMutation({ mutationFn: async () => { const response = await previewShiftRoster(id!); setPreview(response.data); if (!response.data.valid) throw new Error('Preview has errors'); return publishShiftRoster(id!); }, onSuccess: async () => { setLifecycle(null); setToast({ severity: 'success', message: 'Roster published.' }); await invalidate(); }, onError: () => { setLifecycle(null); setTab(2); setToast({ severity: 'error', message: 'Publish blocked. Resolve preview errors first.' }); } });
  const lockMutation = useMutation({ mutationFn: () => lockShiftRoster(id!), onSuccess: async () => { setLifecycle(null); setToast({ severity: 'success', message: 'Roster locked.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster could not be locked.' }) });
  const exportDaysMutation = useMutation({
    mutationFn: () => exportShiftRosterDays(id!, { search: search || undefined, employeeId: employeeId || undefined, dayType: dayType || undefined, dateFrom: dateFrom || week, dateTo: dateTo || addDays(week, 6) }),
    onSuccess: (response) => {
      const code = roster?.code?.replace(/[^A-Za-z0-9_-]+/g, '-') || 'roster';
      downloadBlob(responseBlob(response), `shift-roster-days-${code}-${localDateForFilename()}.csv`);
      setToast({ severity: 'success', message: 'Roster days CSV export started.' });
    },
    onError: () => setToast({ severity: 'error', message: 'Roster days export failed. Narrow filters and try again.' }),
  });

  const resetPage = () => setPagination((current) => ({ ...current, page: 0 }));
  const setRange = (start: string, end: string) => {
    if (end < start) {
      setDateRangeError('End date must be on or after the start date.');
      return;
    }
    setDateRangeError('');
    setDateFrom(start);
    setDateTo(end);
    resetPage();
  };
  const clearRange = () => { setDateFrom(''); setDateTo(''); setDateRangeError(''); resetPage(); };
  const resetFilters = () => { setSearch(''); setEmployeeId(''); setDayType(''); clearRange(); };

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (employeeId) filters.push({ key: 'employee', label: 'Employee', value: employees.find((employee) => employee.id === employeeId)?.employeeCode ?? 'Selected employee', onRemove: () => { setEmployeeId(''); resetPage(); } });
    if (dayType) filters.push({ key: 'dayType', label: 'Day Type', value: dayTypeLabel(dayType), onRemove: () => { setDayType(''); resetPage(); } });
    if (dateFrom && dateTo) filters.push({ key: 'dateRange', label: 'Date Range', value: formatDateRangeChip({ dateFrom, dateTo, preset: 'customRange' }), onRemove: clearRange });
    return filters;
  }, [dateFrom, dateTo, dayType, employeeId, employees, search]);

  const columns = useMemo<GridColDef<ShiftRosterDay>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 260, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{employeeName(row.employee)}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.employee?.employeeCode ?? row.employeeId}</Typography></Box> },
    { field: 'workDate', headerName: 'Work Date', minWidth: 140, valueGetter: (_, row) => formatDateOnly(row.workDate) },
    { field: 'dayType', headerName: 'Day Type', minWidth: 150, renderCell: ({ row }) => <StatusChip label={dayTypeLabel(row.dayType)} tone={dayTypeTone(row.dayType)} /> },
    { field: 'shift', headerName: 'Shift', minWidth: 240, valueGetter: (_, row) => rosterDayShiftLabel(row) },
    { field: 'source', headerName: 'Source', minWidth: 160, valueGetter: (_, row) => row.source.replace(/_/g, ' ') },
    { field: 'notes', headerName: 'Notes', minWidth: 220, valueGetter: (_, row) => row.notes ?? '-' },
    { field: 'actions', headerName: 'Actions', minWidth: 120, sortable: false, filterable: false, renderCell: ({ row }) => <Stack direction="row"><Tooltip title={readonly ? 'Locked roster is read-only' : 'Edit day'}><span><IconButton size="small" disabled={readonly} onClick={() => setDayDialog({ day: row })}><Edit3 size={17} /></IconButton></span></Tooltip><Tooltip title={readonly ? 'Locked roster is read-only' : 'Clear day'}><span><IconButton size="small" color="error" disabled={readonly} onClick={() => setClearTarget(row)}><Trash2 size={17} /></IconButton></span></Tooltip></Stack> },
  ], [readonly]);

  if (!id) return <Navigate to="/scheduling/shift-roster" replace />;
  if (rosterQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (rosterQuery.isError || !roster) return <PageLayout><Alert severity="error">Shift roster could not be loaded.</Alert></PageLayout>;

  const summary = dateRangeError
    || (meta && meta.total > 0
      ? `Showing ${(meta.page - 1) * meta.limit + 1}-${Math.min(meta.page * meta.limit, meta.total)} of ${meta.total} roster days`
      : hasFilters ? 'No roster days match the current filters.' : 'No roster days have been added yet.');

  return (
    <PageLayout>
      <PageHeader title={roster.name} description="Review calendar coverage, roster days, validation, and lifecycle status." breadcrumbs={['Admin', 'Scheduling', 'Shift Roster', roster.name]} />
      <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
        <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">
          <RosterStatusBadge status={roster.status} />
          <StatusChip label={`${roster.code} / v${roster.version}`} tone="neutral" />
          <StatusChip label={scopeLabel(roster)} tone="info" />
          <StatusChip label={roster.timezone} tone="neutral" />
        </Stack>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<ShieldCheck size={17} />} onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>Preview</Button>
          <Button variant="outlined" startIcon={<Layers size={17} />} onClick={() => setTemplateApplyOpen(true)} disabled={readonly || roster.status !== 'DRAFT'}>Apply Template</Button>
          <Button component={RouterLink} to={`/scheduling/shift-roster/${id}/edit`} variant="outlined" startIcon={<Edit3 size={17} />} disabled={roster.status !== 'DRAFT'}>Edit Draft</Button>
          <Button variant="contained" startIcon={<CalendarDays size={17} />} disabled={roster.status !== 'DRAFT'} onClick={() => setLifecycle('publish')}>Publish</Button>
          <Button variant="outlined" color="warning" startIcon={<LockKeyhole size={17} />} disabled={roster.status !== 'PUBLISHED'} onClick={() => setLifecycle('lock')}>Lock</Button>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
        <InfoCard title="Date Range" value={formatDateRange(roster)} />
        <InfoCard title="Duration" value={formatDurationDays(duration)} />
        <InfoCard title="Published" value={formatDateTime(roster.publishedAt)} />
        <InfoCard title="Locked" value={formatDateTime(roster.lockedAt)} />
        <InfoCard title="Coverage" value="Not available" />
      </Stack>

      <Card><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Roster details tabs"><Tab label="Calendar" /><Tab label="Roster Days" /><Tab label="Validation" /></Tabs></Card>

      {tab === 0 ? (
        <SectionCard title="Weekly Roster Grid" description="Employees are rows and work dates are columns. Use week navigation to keep planning bounded.">
          <Stack gap={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between">
              <Stack direction="row" gap={1}><Button variant="outlined" startIcon={<ChevronLeft size={17} />} onClick={() => setWeek(addDays(week, -7))}>Previous Week</Button><Button variant="outlined" endIcon={<ChevronRight size={17} />} onClick={() => setWeek(addDays(week, 7))}>Next Week</Button></Stack>
              <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => setDayDialog({})} disabled={readonly}>Add Day</Button>
            </Stack>
            <RosterCalendarGrid employees={employees} days={days} weekStart={week} readonly={readonly} onCellClick={(input) => setDayDialog(input)} />
          </Stack>
        </SectionCard>
      ) : null}

      {tab === 1 ? (
        <>
          <EnterpriseFilterCard
            title="Roster Day Filters"
            description="Filter roster days using employee, day type, search, and date range."
            loading={daysQuery.isFetching || exportDaysMutation.isPending}
            summary={summary}
            activeFilters={activeFilters}
            actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void daysQuery.refetch()} disabled={daysQuery.isFetching || Boolean(dateRangeError)}>Refresh</Button><Tooltip title="Export filtered roster days as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} onClick={() => exportDaysMutation.mutate()} disabled={exportDaysMutation.isPending || Boolean(dateRangeError)}>{exportDaysMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip><Button variant="contained" startIcon={<Layers size={17} />} onClick={() => setBulkOpen(true)} disabled={readonly}>Bulk Update</Button></>}
            search={<EnterpriseFilterSearch value={search} label="Search roster days" placeholder="Search employee, code, or shift" loading={daysQuery.isFetching} onChange={(value) => { setSearch(value); resetPage(); }} />}
            filters={<>
              <FormControl size="small" fullWidth><InputLabel id="roster-day-employee-filter-label">Employee</InputLabel><Select labelId="roster-day-employee-filter-label" label="Employee" value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); resetPage(); }}><MenuItem value="">All Employees</MenuItem>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.employeeCode}</MenuItem>)}</Select></FormControl>
              <FormControl size="small" fullWidth><InputLabel id="roster-day-type-filter-label">Day Type</InputLabel><Select labelId="roster-day-type-filter-label" label="Day Type" value={dayType} onChange={(event) => { setDayType(event.target.value as RosterDayType | ''); resetPage(); }}><MenuItem value="">All Types</MenuItem>{rosterDayTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></FormControl>
              <Box sx={{ width: '100%', minWidth: 0 }}><DateRangePicker label="Date Range" value={createCustomDateRangeValue(dateFrom, dateTo)} defaultPreset="customRange" mode="filter" onChange={(value) => setRange(value.dateFrom, value.dateTo)} onClear={clearRange} error={Boolean(dateRangeError)} helperText={dateRangeError || 'Roster days within this range.'} /></Box>
            </>}
          />
          <DataTable title="Roster Days" rows={days} columns={columns} showSearch={false} gridProps={{ loading: daysQuery.isFetching, paginationMode: 'server', rowCount: meta?.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 64, slots: { loadingOverlay: () => <LoadingSkeleton rows={6} />, noRowsOverlay: () => <EmptyState title={hasFilters ? 'No roster days match the current filters.' : 'No roster days have been added yet.'} description={hasFilters ? 'Adjust filters to broaden the roster day list.' : 'Add individual days or use bulk update to plan this roster.'} /> } }} />
        </>
      ) : null}

      {tab === 2 ? <RosterPreviewPanel preview={preview} loading={previewMutation.isPending} /> : null}

      <RosterDayDialog open={Boolean(dayDialog)} day={dayDialog?.day ?? null} defaultEmployeeId={dayDialog?.employeeId} defaultWorkDate={dayDialog?.workDate} employees={employees} shifts={shifts} readonly={readonly} loading={upsertMutation.isPending || clearMutation.isPending} onClose={() => setDayDialog(null)} onSubmit={(payload) => upsertMutation.mutate(payload)} onClear={(day) => setClearTarget(day)} />
      <RosterBulkActionDialog open={bulkOpen} employees={employees} shifts={shifts} readonly={readonly} loading={bulkMutation.isPending} onClose={() => setBulkOpen(false)} onSubmit={(days) => bulkMutation.mutate({ days })} />
      <RosterTemplateApplyDialog open={templateApplyOpen} roster={roster} onClose={() => setTemplateApplyOpen(false)} onApplied={() => setToast({ severity: 'success', message: 'Template applied to this draft roster.' })} />
      <RosterLifecycleDialog open={Boolean(lifecycle)} action={lifecycle ?? 'publish'} loading={publishMutation.isPending || lockMutation.isPending} blocked={lifecycle === 'publish' && preview?.valid === false} onClose={() => setLifecycle(null)} onConfirm={() => lifecycle === 'publish' ? publishMutation.mutate() : lockMutation.mutate()} />
      <ConfirmDialog open={Boolean(clearTarget)} title="Clear Roster Day" description="This draft roster day will be removed from the period." confirmLabel="Clear Day" loading={clearMutation.isPending} onClose={() => setClearTarget(null)} onConfirm={() => clearTarget && clearMutation.mutate(clearTarget)} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function inclusiveDateDuration(from?: string | null, to?: string | null) {
  if (!from || !to || to < from) return null;
  const start = new Date(`${from.slice(0, 10)}T00:00:00`);
  const end = new Date(`${to.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h4" sx={{ mt: 0.5 }}>{value}</Typography></CardContent></Card>;
}
