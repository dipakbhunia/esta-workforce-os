import { Alert, Box, Button, Card, CardContent, IconButton, InputLabel, MenuItem, Select, Snackbar, Stack, Tab, Tabs, Tooltip, Typography, FormControl } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Download, Edit3, Layers, LockKeyhole, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { RosterCalendarGrid, type RosterCellInput } from '../components/RosterCalendarGrid';
import { RosterDayDialog } from '../components/RosterDayDialog';
import { RosterLifecycleDialog } from '../components/RosterLifecycleDialog';
import { RosterPreviewPanel } from '../components/RosterPreviewPanel';
import { RosterSchedulerToolbar } from '../components/RosterSchedulerToolbar';
import { RosterStatusBadge } from '../components/RosterStatusBadge';
import { RosterTemplateApplyDialog } from '../components/RosterTemplateApplyDialog';
import { RotationPatternApplyDialog } from '../components/RotationPatternApplyDialog';
import { bulkUpsertShiftRosterDays, deleteShiftRosterDay, exportShiftRosterDays, getShiftRoster, getShiftRosterDays, lockShiftRoster, previewShiftRoster, publishShiftRoster, upsertShiftRosterDay } from '../services/shift-rosters-api';
import type { RosterDayType, RosterPreviewResponse, ShiftRosterDay } from '../types/shift-roster.types';
import { addDays, dateInputFromDate, dayTypeLabel, dayTypeTone, downloadBlob, employeeName, formatDateOnly, formatDateRange, formatDateTime, formatDurationDays, localDateForFilename, responseBlob, rosterDayShiftLabel, rosterDayTypeOptions, rosterStatusLabel, scopeLabel, weekStart } from '../utils/shift-roster-utils';

type ToastState = { severity: 'success' | 'error' | 'info'; message: string };

export default function ShiftRosterDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [week, setWeek] = useState(weekStart(dateInputFromDate(new Date())));
  const [weekInitializedRosterId, setWeekInitializedRosterId] = useState<string | null>(null);
  const [schedulerSearch, setSchedulerSearch] = useState('');
  const [search, setSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [dayType, setDayType] = useState<RosterDayType | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateRangeError, setDateRangeError] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 25 });
  const [dayDialog, setDayDialog] = useState<RosterCellInput | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [templateApplyOpen, setTemplateApplyOpen] = useState(false);
  const [rotationApplyOpen, setRotationApplyOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<ShiftRosterDay | null>(null);
  const [copySource, setCopySource] = useState<ShiftRosterDay | null>(null);
  const [copyTarget, setCopyTarget] = useState<RosterCellInput | null>(null);
  const [lifecycle, setLifecycle] = useState<'publish' | 'lock' | null>(null);
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null);
  const [toast, setToast] = useState<ToastState | null>(location.state?.success ? { severity: 'success', message: location.state.success } : null);

  const calendarWeekEnd = addDays(week, 6);
  const rosterQuery = useQuery({ queryKey: ['shift-roster', id], queryFn: () => getShiftRoster(id!), enabled: Boolean(id) });
  const roster = rosterQuery.data?.data;
  const rosterDateFrom = roster?.dateFrom?.slice(0, 10) ?? null;
  const rosterDateTo = roster?.dateTo?.slice(0, 10) ?? null;
  const schedulerReadOnly = roster?.status !== 'DRAFT';
  const schedulerReadonlyReason = roster ? `${rosterStatusLabel(roster.status)} rosters are read-only in the scheduler.` : 'Roster is read-only in the scheduler.';

  useEffect(() => {
    if (!roster || weekInitializedRosterId === roster.id) return;
    setWeek(resolveInitialSchedulerWeek(roster.dateFrom, roster.dateTo));
    setWeekInitializedRosterId(roster.id);
  }, [roster, weekInitializedRosterId]);

  const employeeQuery = useQuery({ queryKey: ['employees', { rosterId: id, branchId: roster?.branchId, departmentId: roster?.departmentId }], queryFn: () => getEmployees({ page: 1, limit: 100, branchId: roster?.branchId ?? undefined, departmentId: roster?.departmentId ?? undefined }), enabled: Boolean(id) });
  const shiftsQuery = useShifts();

  const calendarDaysQuery = useQuery({
    queryKey: ['shift-roster-calendar-days', id, { week, calendarWeekEnd }],
    queryFn: () => getShiftRosterDays(id!, { page: 1, limit: 100, dateFrom: week, dateTo: calendarWeekEnd }),
    enabled: Boolean(id) && Boolean(roster),
  });

  const daysQuery = useQuery({
    queryKey: ['shift-roster-days', id, { page: pagination.page + 1, limit: pagination.pageSize, search, employeeId, dayType, dateFrom, dateTo, week }],
    queryFn: () => getShiftRosterDays(id!, { page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, employeeId: employeeId || undefined, dayType: dayType || undefined, dateFrom: dateFrom || week, dateTo: dateTo || calendarWeekEnd }),
    enabled: Boolean(id) && !dateRangeError,
  });

  const employees = employeeQuery.data?.data.data ?? [];
  const shifts = shiftsQuery.data?.data.data ?? [];
  const days = daysQuery.data?.data.data ?? [];
  const calendarDays = calendarDaysQuery.data?.data.data ?? [];
  const meta = daysQuery.data?.data.meta;
  const duration = inclusiveDateDuration(roster?.dateFrom, roster?.dateTo);
  const hasFilters = Boolean(search || employeeId || dayType || dateFrom || dateTo);

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
  const calendarEmployees = useMemo(() => {
    const term = schedulerSearch.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) => [
      employeeName(employee),
      employee.employeeCode,
      employee.department?.name,
      employee.designation?.name,
      employee.branch?.name,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [employees, schedulerSearch]);

  const activeFilters = useMemo<EnterpriseActiveFilter[]>(() => {
    const filters: EnterpriseActiveFilter[] = [];
    if (search) filters.push({ key: 'search', label: 'Search', value: search, onRemove: () => { setSearch(''); resetPage(); } });
    if (employeeId) filters.push({ key: 'employee', label: 'Employee', value: employees.find((employee) => employee.id === employeeId)?.employeeCode ?? 'Selected employee', onRemove: () => { setEmployeeId(''); resetPage(); } });
    if (dayType) filters.push({ key: 'dayType', label: 'Day Type', value: dayTypeLabel(dayType), onRemove: () => { setDayType(''); resetPage(); } });
    if (dateFrom && dateTo) filters.push({ key: 'dateRange', label: 'Date Range', value: formatDateRangeChip({ dateFrom, dateTo, preset: 'customRange' }), onRemove: clearRange });
    return filters;
  }, [dateFrom, dateTo, dayType, employeeId, employees, search]);

  const copyModeLabel = useMemo(() => {
    if (!copySource) return null;
    return `Copying ${rosterDayShiftLabel(copySource)} from ${formatDateOnly(copySource.workDate)}. Choose an empty target cell, or confirm replacement for an occupied cell.`;
  }, [copySource]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['shift-roster', id] }),
      queryClient.invalidateQueries({ queryKey: ['shift-roster-days', id] }),
      queryClient.invalidateQueries({ queryKey: ['shift-roster-calendar-days', id] }),
      queryClient.invalidateQueries({ queryKey: ['shift-rosters'] }),
    ]);
  };

  const upsertMutation = useMutation({ mutationFn: (payload: Parameters<typeof upsertShiftRosterDay>[1]) => upsertShiftRosterDay(id!, payload), onSuccess: async () => { setDayDialog(null); setToast({ severity: 'success', message: 'Roster day saved.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster day could not be saved.' }) });
  const copyMutation = useMutation({ mutationFn: (payload: Parameters<typeof upsertShiftRosterDay>[1]) => upsertShiftRosterDay(id!, payload), onSuccess: async () => { setCopyTarget(null); setCopySource(null); setToast({ severity: 'success', message: 'Roster day copied.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster day could not be copied.' }) });
  const bulkMutation = useMutation({ mutationFn: (payload: Parameters<typeof bulkUpsertShiftRosterDays>[1]) => bulkUpsertShiftRosterDays(id!, payload), onSuccess: async (response) => { setBulkOpen(false); setToast({ severity: 'success', message: `${response.data.count} roster cells updated.` }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Bulk update failed.' }) });
  const clearMutation = useMutation({ mutationFn: (day: ShiftRosterDay) => deleteShiftRosterDay(id!, day.id), onSuccess: async () => { setClearTarget(null); setDayDialog(null); setToast({ severity: 'success', message: 'Roster day cleared.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster day could not be cleared.' }) });
  const previewMutation = useMutation({ mutationFn: () => previewShiftRoster(id!), onSuccess: (response) => { setPreview(response.data); setTab(2); setToast({ severity: response.data.valid ? 'success' : 'error', message: response.data.valid ? 'Preview passed.' : `Preview found ${response.data.errors.length} blocking issue(s).` }); }, onError: () => setToast({ severity: 'error', message: 'Preview failed.' }) });
  const publishMutation = useMutation({ mutationFn: async () => { const response = await previewShiftRoster(id!); setPreview(response.data); if (!response.data.valid) throw new Error('Preview has errors'); return publishShiftRoster(id!); }, onSuccess: async () => { setLifecycle(null); setToast({ severity: 'success', message: 'Roster published.' }); await invalidate(); }, onError: () => { setLifecycle(null); setTab(2); setToast({ severity: 'error', message: 'Publish blocked. Resolve preview errors first.' }); } });
  const lockMutation = useMutation({ mutationFn: () => lockShiftRoster(id!), onSuccess: async () => { setLifecycle(null); setToast({ severity: 'success', message: 'Roster locked.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Roster could not be locked.' }) });
  const exportDaysMutation = useMutation({
    mutationFn: () => exportShiftRosterDays(id!, { search: search || undefined, employeeId: employeeId || undefined, dayType: dayType || undefined, dateFrom: dateFrom || week, dateTo: dateTo || calendarWeekEnd }),
    onSuccess: (response) => {
      const code = roster?.code?.replace(/[^A-Za-z0-9_-]+/g, '-') || 'roster';
      downloadBlob(responseBlob(response), `shift-roster-days-${code}-${localDateForFilename()}.csv`);
      setToast({ severity: 'success', message: 'Roster days CSV export started.' });
    },
    onError: () => setToast({ severity: 'error', message: 'Roster days export failed. Narrow filters and try again.' }),
  });

  const columns = useMemo<GridColDef<ShiftRosterDay>[]>(() => [
    { field: 'employee', headerName: 'Employee', minWidth: 260, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={850} noWrap>{employeeName(row.employee)}</Typography><Typography variant="caption" color="text.secondary" noWrap>{row.employee?.employeeCode ?? row.employeeId}</Typography></Box> },
    { field: 'workDate', headerName: 'Work Date', minWidth: 140, valueGetter: (_, row) => formatDateOnly(row.workDate) },
    { field: 'dayType', headerName: 'Day Type', minWidth: 150, renderCell: ({ row }) => <StatusChip label={dayTypeLabel(row.dayType)} tone={dayTypeTone(row.dayType)} /> },
    { field: 'shift', headerName: 'Shift', minWidth: 240, valueGetter: (_, row) => rosterDayShiftLabel(row) },
    { field: 'source', headerName: 'Source', minWidth: 160, valueGetter: (_, row) => row.source.replace(/_/g, ' ') },
    { field: 'notes', headerName: 'Notes', minWidth: 220, valueGetter: (_, row) => row.notes ?? '-' },
    { field: 'actions', headerName: 'Actions', minWidth: 120, sortable: false, filterable: false, renderCell: ({ row }) => <Stack direction="row"><Tooltip title={schedulerReadOnly ? schedulerReadonlyReason : 'Edit day'}><span><IconButton size="small" disabled={schedulerReadOnly} onClick={() => setDayDialog({ day: row, employeeId: row.employeeId, workDate: row.workDate.slice(0, 10) })}><Edit3 size={17} /></IconButton></span></Tooltip><Tooltip title={schedulerReadOnly ? schedulerReadonlyReason : 'Clear day'}><span><IconButton size="small" color="error" disabled={schedulerReadOnly} onClick={() => setClearTarget(row)}><Trash2 size={17} /></IconButton></span></Tooltip></Stack> },
  ], [schedulerReadOnly, schedulerReadonlyReason]);

  const canPreviousWeek = !rosterDateFrom || addDays(week, -1) >= rosterDateFrom;
  const canNextWeek = !rosterDateTo || addDays(week, 7) <= rosterDateTo;
  const weekLabel = `${formatDateOnly(week)} - ${formatDateOnly(calendarWeekEnd)}`;

  const setBoundedWeek = (nextWeek: string) => setWeek(clampWeekToRoster(nextWeek, rosterDateFrom, rosterDateTo));
  const selectTodayWeek = () => setBoundedWeek(weekStart(dateInputFromDate(new Date())));
  const ensureSchedulerEditable = () => {
    if (!schedulerReadOnly) return true;
    setToast({ severity: 'info', message: schedulerReadonlyReason });
    return false;
  };
  const ensureInRosterPeriod = (workDate: string) => {
    if (!isOutOfRosterPeriod(workDate, rosterDateFrom, rosterDateTo)) return true;
    setToast({ severity: 'info', message: 'This date is outside the roster period and cannot be edited.' });
    return false;
  };
  const openCellEditor = (input: RosterCellInput) => {
    if (!ensureSchedulerEditable() || !ensureInRosterPeriod(input.workDate)) return;
    setDayDialog(input);
  };
  const startCopy = (day: ShiftRosterDay) => {
    if (!ensureSchedulerEditable()) return;
    setCopySource(day);
    setToast({ severity: 'info', message: 'Copy mode enabled. Select the target roster cell.' });
  };
  const selectCopyTarget = (input: RosterCellInput) => {
    if (!copySource) {
      openCellEditor(input);
      return;
    }
    if (!ensureSchedulerEditable() || !ensureInRosterPeriod(input.workDate)) return;
    if (input.day) {
      setCopyTarget(input);
      return;
    }
    copyRosterDay(copySource, input);
  };
  const copyRosterDay = (source: ShiftRosterDay, target: RosterCellInput) => {
    copyMutation.mutate({
      employeeId: target.employeeId,
      workDate: target.workDate,
      dayType: source.dayType,
      shiftId: source.dayType === 'WORKING' ? source.shiftId ?? source.shift?.id ?? null : null,
      source: 'MANUAL',
      notes: source.notes ?? null,
    });
  };
  const requestClear = (day: ShiftRosterDay) => {
    if (!ensureSchedulerEditable()) return;
    setClearTarget(day);
  };
  const targetEmployeeName = copyTarget ? employeeName(employees.find((employee) => employee.id === copyTarget.employeeId)) : 'selected employee';

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

      <Card><Tabs value={tab} onChange={(_, value) => setTab(value)} variant="scrollable" scrollButtons="auto" aria-label="Roster details tabs"><Tab label="Weekly Calendar" /><Tab label="Roster Days" /><Tab label="Validation" /></Tabs></Card>

      {tab === 0 ? (
        <SectionCard title="Weekly Calendar Scheduler" description="Plan one focused seven-day window with explicit edit, copy, and clear actions.">
          <Stack gap={2}>
            <RosterSchedulerToolbar
              weekLabel={weekLabel}
              employeeSearch={schedulerSearch}
              employeeCount={employees.length}
              visibleEmployeeCount={calendarEmployees.length}
              readonly={schedulerReadOnly}
              readonlyReason={schedulerReadonlyReason}
              canPreviousWeek={canPreviousWeek}
              canNextWeek={canNextWeek}
              copyModeLabel={copyModeLabel}
              loading={calendarDaysQuery.isFetching || employeeQuery.isFetching || copyMutation.isPending || clearMutation.isPending || upsertMutation.isPending}
              onPreviousWeek={() => setBoundedWeek(addDays(week, -7))}
              onToday={selectTodayWeek}
              onNextWeek={() => setBoundedWeek(addDays(week, 7))}
              onEmployeeSearchChange={setSchedulerSearch}
              onCancelCopy={() => { setCopySource(null); setCopyTarget(null); }}
              onBulkUpdate={() => ensureSchedulerEditable() && setBulkOpen(true)}
              onApplyTemplate={() => ensureSchedulerEditable() && setTemplateApplyOpen(true)}
              onApplyRotation={() => ensureSchedulerEditable() && setRotationApplyOpen(true)}
            />
            {calendarDaysQuery.isError ? <Alert severity="error">Roster calendar days could not be loaded. Refresh the page or try another week.</Alert> : null}
            <RosterCalendarGrid
              employees={calendarEmployees}
              days={calendarDays}
              weekStart={week}
              rosterDateFrom={roster.dateFrom}
              rosterDateTo={roster.dateTo}
              readonly={schedulerReadOnly}
              readonlyReason={schedulerReadonlyReason}
              copySource={copySource}
              loading={calendarDaysQuery.isFetching || employeeQuery.isFetching}
              onEditCell={openCellEditor}
              onCopyCell={startCopy}
              onClearCell={requestClear}
              onSelectCopyTarget={selectCopyTarget}
            />

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
            actions={<><Button variant="text" startIcon={<RotateCcw size={17} />} onClick={resetFilters} disabled={!hasFilters}>Reset</Button><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void daysQuery.refetch()} disabled={daysQuery.isFetching || Boolean(dateRangeError)}>Refresh</Button><Tooltip title="Export filtered roster days as CSV"><span><Button variant="outlined" startIcon={<Download size={17} />} onClick={() => exportDaysMutation.mutate()} disabled={exportDaysMutation.isPending || Boolean(dateRangeError)}>{exportDaysMutation.isPending ? 'Exporting...' : 'Export'}</Button></span></Tooltip><Button variant="contained" startIcon={<Layers size={17} />} onClick={() => ensureSchedulerEditable() && setBulkOpen(true)} disabled={schedulerReadOnly}>Bulk Update</Button></>}
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

      <RosterDayDialog open={Boolean(dayDialog)} day={dayDialog?.day ?? null} defaultEmployeeId={dayDialog?.employeeId} defaultWorkDate={dayDialog?.workDate} employees={employees} shifts={shifts} readonly={schedulerReadOnly} loading={upsertMutation.isPending || clearMutation.isPending} onClose={() => setDayDialog(null)} onSubmit={(payload) => upsertMutation.mutate(payload)} onClear={(day) => setClearTarget(day)} />
      <RosterBulkActionDialog open={bulkOpen} employees={employees} shifts={shifts} readonly={schedulerReadOnly} loading={bulkMutation.isPending} onClose={() => setBulkOpen(false)} onSubmit={(days) => bulkMutation.mutate({ days })} />
      <RosterTemplateApplyDialog open={templateApplyOpen} roster={roster} onClose={() => setTemplateApplyOpen(false)} onApplied={async () => { setToast({ severity: 'success', message: 'Template applied to this draft roster.' }); await invalidate(); }} />
      <RotationPatternApplyDialog open={rotationApplyOpen} roster={roster} onClose={() => setRotationApplyOpen(false)} onApplied={async () => { setToast({ severity: 'success', message: 'Rotation pattern applied to this draft roster.' }); await invalidate(); }} />
      <RosterLifecycleDialog open={Boolean(lifecycle)} action={lifecycle ?? 'publish'} loading={publishMutation.isPending || lockMutation.isPending} blocked={lifecycle === 'publish' && preview?.valid === false} onClose={() => setLifecycle(null)} onConfirm={() => lifecycle === 'publish' ? publishMutation.mutate() : lockMutation.mutate()} />
      <ConfirmDialog open={Boolean(clearTarget)} title="Clear Roster Day" description="This draft roster day will be removed from the period." confirmLabel="Clear Day" loading={clearMutation.isPending} onClose={() => setClearTarget(null)} onConfirm={() => clearTarget && clearMutation.mutate(clearTarget)} />
      <ConfirmDialog open={Boolean(copyTarget)} title="Replace Existing Roster Day?" description={`The target cell for ${targetEmployeeName} on ${formatDateOnly(copyTarget?.workDate)} already contains roster data. Replace it with the copied assignment?`} confirmLabel="Replace Cell" loading={copyMutation.isPending} onClose={() => setCopyTarget(null)} onConfirm={() => copySource && copyTarget && copyRosterDay(copySource, copyTarget)} />
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

function resolveInitialSchedulerWeek(rosterStart?: string | null, rosterEnd?: string | null) {
  const today = dateInputFromDate(new Date());
  const start = rosterStart?.slice(0, 10) ?? null;
  const end = rosterEnd?.slice(0, 10) ?? null;
  if (start && today < start) return weekStart(start);
  if (end && today > end) return weekStart(end);
  return weekStart(today);
}

function clampWeekToRoster(nextWeek: string, rosterStart: string | null, rosterEnd: string | null) {
  if (rosterStart && addDays(nextWeek, 6) < rosterStart) return weekStart(rosterStart);
  if (rosterEnd && nextWeek > rosterEnd) return weekStart(rosterEnd);
  return nextWeek;
}

function isOutOfRosterPeriod(date: string, rosterStart: string | null, rosterEnd: string | null) {
  return Boolean((rosterStart && date < rosterStart) || (rosterEnd && date > rosterEnd));
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h4" sx={{ mt: 0.5 }}>{value}</Typography></CardContent></Card>;
}
