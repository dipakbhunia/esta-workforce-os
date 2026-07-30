import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, FileDown, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusChip } from '@/components/status-chip';
import { deleteMonitoringAlertPolicy, getMonitoringAlertPolicies } from '../services/monitoring-api';
import type { MonitoringAlertPolicy, MonitoringAlertPolicyScope } from '../types/monitoring.types';

function alertTypeCount(policy: MonitoringAlertPolicy) {
  return Object.keys(policy.settings ?? {}).length;
}

export default function MonitoringAlertPoliciesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<MonitoringAlertPolicyScope | ''>('');
  const [enabled, setEnabled] = useState<boolean | ''>('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [deleteTarget, setDeleteTarget] = useState<MonitoringAlertPolicy | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => ({ page: pagination.page + 1, limit: pagination.pageSize, search: search || undefined, scope: scope || undefined, enabled }), [enabled, pagination.page, pagination.pageSize, scope, search]);
  const policiesQuery = useQuery({ queryKey: ['monitoring-alert-policies', params], queryFn: () => getMonitoringAlertPolicies(params).then((response) => response.data) });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMonitoringAlertPolicy(id),
    onSuccess: async () => {
      setToast('Alert policy deleted.');
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['monitoring-alert-policies'] });
    },
  });

  function resetFilters() {
    setSearch('');
    setScope('');
    setEnabled('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  const columns = useMemo<GridColDef<MonitoringAlertPolicy>[]>(() => [
    { field: 'name', headerName: 'Policy', flex: 1, minWidth: 260, renderCell: ({ row }) => <Stack><Typography component={RouterLink} to={`/monitoring/alert-policies/${row.id}/edit`} sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 850 }}>{row.name}</Typography><Typography variant="caption" color="text.secondary">{row.description || 'No description'}</Typography></Stack> },
    { field: 'scope', headerName: 'Scope', width: 150, renderCell: ({ row }) => <StatusChip label={row.scope} tone="info" /> },
    { field: 'enabled', headerName: 'Enabled', width: 120, renderCell: ({ row }) => <StatusChip label={row.enabled ? 'Enabled' : 'Disabled'} tone={row.enabled ? 'success' : 'neutral'} /> },
    { field: 'priority', headerName: 'Priority', width: 110 },
    { field: 'types', headerName: 'Alert Types', width: 150, valueGetter: (_, row) => `${alertTypeCount(row)} configured` },
    { field: 'maintenance', headerName: 'Maintenance', width: 170, valueGetter: (_, row) => row.maintenanceStart && row.maintenanceEnd ? 'Configured' : 'Not configured' },
    { field: 'actions', headerName: 'Actions', width: 220, sortable: false, renderCell: ({ row }) => <Stack direction="row" gap={1}><Button size="small" component={RouterLink} to={`/monitoring/alert-policies/${row.id}/edit`}>Edit</Button><Button size="small" color="error" onClick={() => setDeleteTarget(row)} startIcon={<Trash2 size={15} />}>Delete</Button></Stack> },
  ], []);

  const rows = policiesQuery.data?.data ?? [];

  return (
    <PageLayout>
      <PageHeader title="Alert Policies" description="Configure alert thresholds, scope overrides, working-hour behavior, and maintenance suppression." breadcrumbs={['Admin', 'Monitoring', 'Alert Policies']} primaryActionLabel="Create Policy" primaryActionTo="/monitoring/alert-policies/create" />
      {toast && <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>}
      {policiesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void policiesQuery.refetch()}>Retry</Button>}>Unable to load alert policies.</Alert>}
      <FilterToolbar actions={<><ResetButton onClick={resetFilters} /><RefreshButton onClick={() => void policiesQuery.refetch()} /><Button variant="outlined" startIcon={<FileDown size={16} />} onClick={() => setToast('Export will be connected in the reporting phase.')}>Export</Button></>}>
        <SearchFilter placeholder="Search policy name or description" value={search} onChange={(value) => { setSearch(value); setPagination((current) => ({ ...current, page: 0 })); }} />
        <TextField select label="Scope" size="small" value={scope} onChange={(event) => { setScope(event.target.value as MonitoringAlertPolicyScope | ''); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">All scopes</MenuItem>
          {['SYSTEM', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField select label="Enabled" size="small" value={String(enabled)} onChange={(event) => { const value = event.target.value; setEnabled(value === '' ? '' : value === 'true'); setPagination((current) => ({ ...current, page: 0 })); }} sx={{ minWidth: 160 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="true">Enabled</MenuItem>
          <MenuItem value="false">Disabled</MenuItem>
        </TextField>
      </FilterToolbar>
      {policiesQuery.isLoading ? <LoadingSkeleton rows={8} /> : rows.length === 0 ? <EmptyState title="No alert policies found" description="Create a policy to override system defaults for a company, team, or employee." /> : <DataTable title="Policies" rows={rows} columns={columns} toolbar={<Typography variant="body2" color="text.secondary">Server-side policy list</Typography>} gridProps={{ paginationMode: 'server', rowCount: policiesQuery.data?.meta.total ?? 0, paginationModel: pagination, onPaginationModelChange: setPagination, getRowHeight: () => 68 }} />}
      <ConfirmDialog open={Boolean(deleteTarget)} title="Delete alert policy?" description={deleteTarget ? `${deleteTarget.name} will be soft deleted.` : undefined} confirmLabel="Delete" loading={deleteMutation.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} />
    </PageLayout>
  );
}
