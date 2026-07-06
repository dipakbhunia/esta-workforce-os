import { Alert, Button, MenuItem, TextField } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { useQuery } from '@tanstack/react-query';
import { Activity, CircleOff, Coffee, Wifi } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AvatarCell } from '@/components/avatar-cell';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatCard } from '@/components/stat-card';
import { StatusChip } from '@/components/status-chip';
import { SummaryCardsContainer } from '@/components/summary-cards-container';
import { getLiveStatuses } from '../services/monitoring-api';
import type { LiveStatusRecord, LiveStatusValue } from '../types/monitoring.types';
import { formatDateTime, formatEnum, heartbeatTone, liveStatusTone } from '../utils/monitoring-format';

const liveStatuses: LiveStatusValue[] = ['ONLINE', 'WORKING', 'ON_BREAK', 'AWAY', 'OFFLINE', 'PUNCHED_OUT', 'AUTO_PUNCHED_OUT'];

export default function LiveStatusPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });

  const liveStatusQuery = useQuery({
    queryKey: ['monitoring-live-status', { page: pagination.page + 1, limit: pagination.pageSize, search, status }],
    queryFn: () => getLiveStatuses({
      page: pagination.page + 1,
      limit: pagination.pageSize,
      search: search || undefined,
      status: status ? status as LiveStatusValue : undefined,
    }),
    refetchInterval: 60_000,
  });

  const rows = useMemo(() => liveStatusQuery.data?.data.data ?? [], [liveStatusQuery.data?.data.data]);
  const counts = useMemo(() => rows.reduce<Record<LiveStatusValue, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {
    ONLINE: 0,
    WORKING: 0,
    ON_BREAK: 0,
    AWAY: 0,
    OFFLINE: 0,
    PUNCHED_OUT: 0,
    AUTO_PUNCHED_OUT: 0,
  }), [rows]);

  const columns = useMemo<GridColDef<LiveStatusRecord>[]>(() => [
    {
      field: 'employee',
      headerName: 'Employee',
      minWidth: 240,
      flex: 1,
      sortable: false,
      renderCell: ({ row }) => <AvatarCell name={row.user?.name || row.user?.email || 'Employee'} email={row.user?.email ?? undefined} />,
    },
    { field: 'employeeCode', headerName: 'Employee Code', minWidth: 150 },
    { field: 'status', headerName: 'Live Status', minWidth: 160, renderCell: ({ row }) => <StatusChip label={formatEnum(row.status)} tone={liveStatusTone(row.status)} /> },
    { field: 'attendanceState', headerName: 'Attendance', minWidth: 170, valueGetter: (_, row) => formatEnum(row.attendanceState) },
    { field: 'heartbeatState', headerName: 'Heartbeat', minWidth: 145, renderCell: ({ row }) => <StatusChip label={formatEnum(row.heartbeatState)} tone={heartbeatTone(row.heartbeatState)} /> },
    { field: 'lastHeartbeatAt', headerName: 'Last Heartbeat', minWidth: 190, valueGetter: (_, row) => formatDateTime(row.lastHeartbeatAt) },
    { field: 'device', headerName: 'Device', minWidth: 220, valueGetter: (_, row) => row.device ? `${row.device.name} (${row.device.platform})` : 'Not assigned' },
  ], []);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  return (
    <PageLayout>
      <PageHeader title="Live Status" description="Monitor employee working, break, away, offline, and punched-out states." breadcrumbs={['Admin', 'Monitoring', 'Live Status']} />

      <SummaryCardsContainer>
        <StatCard label="Working" value={String(counts.WORKING)} helper="Currently punched in" icon={Activity} tone="#16A34A" />
        <StatCard label="On Break" value={String(counts.ON_BREAK)} helper="Active break session" icon={Coffee} tone="#F59E0B" />
        <StatCard label="Online" value={String(counts.ONLINE)} helper="Recent heartbeat" icon={Wifi} tone="#2563EB" />
        <StatCard label="Offline" value={String(counts.OFFLINE)} helper="No active presence" icon={CircleOff} tone="#6B7280" />
      </SummaryCardsContainer>

      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void liveStatusQuery.refetch()} /></>}>
        <SearchFilter placeholder="Search employee name, email, or code" value={search} onChange={(value) => {
          setSearch(value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} />
        <TextField select label="Status" size="small" value={status} onChange={(event) => {
          setStatus(event.target.value);
          setPagination((current) => ({ ...current, page: 0 }));
        }} sx={{ minWidth: { xs: '100%', md: 190 } }}>
          <MenuItem value="">All statuses</MenuItem>
          {liveStatuses.map((item) => <MenuItem key={item} value={item}>{formatEnum(item)}</MenuItem>)}
        </TextField>
      </FilterToolbar>

      <DataTable
        title="Employee Live Status"
        rows={rows.map((row) => ({ ...row, id: row.employeeId }))}
        columns={columns}
        toolbar={<></>}
        gridProps={{
          loading: liveStatusQuery.isFetching,
          rowHeight: 60,
          columnHeaderHeight: 48,
          paginationMode: 'server',
          rowCount: liveStatusQuery.data?.data.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No live statuses found" description="Try adjusting the search or status filter." />,
          },
        }}
      />

      {liveStatusQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void liveStatusQuery.refetch()}>Retry</Button>}>Live status could not be loaded.</Alert>}
    </PageLayout>
  );
}
