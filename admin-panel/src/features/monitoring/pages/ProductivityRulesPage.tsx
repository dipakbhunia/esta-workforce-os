import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { ExportButton, FilterToolbar, RefreshButton, ResetButton, SearchFilter } from '@/components/filter-toolbar';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { StatusChip } from '@/components/status-chip';
import { useAuth } from '@/features/auth';
import {
  createApplicationProductivityRule,
  createWebsiteProductivityRule,
  deleteApplicationProductivityRule,
  deleteWebsiteProductivityRule,
  getApplicationProductivityRules,
  getWebsiteProductivityRules,
  updateApplicationProductivityRule,
  updateWebsiteProductivityRule,
} from '../services/monitoring-api';
import type {
  ApplicationProductivityPayload,
  ApplicationProductivityRule,
  PaginatedMonitoringResponse,
  ProductivityCategory,
  ProductivityRuleParams,
  ProductivityScopeType,
  WebsiteProductivityPayload,
  WebsiteProductivityRule,
} from '../types/monitoring.types';

type RuleKind = 'applications' | 'websites';
type RuleRecord = ApplicationProductivityRule | WebsiteProductivityRule;

const categories: Array<{ label: string; value: ProductivityCategory | '' }> = [
  { label: 'All categories', value: '' },
  { label: 'Productive', value: 'PRODUCTIVE' },
  { label: 'Neutral', value: 'NEUTRAL' },
  { label: 'Unproductive', value: 'UNPRODUCTIVE' },
  { label: 'Unclassified', value: 'UNCLASSIFIED' },
];

const enabledOptions = [
  { label: 'All states', value: '' },
  { label: 'Enabled', value: 'true' },
  { label: 'Disabled', value: 'false' },
];

const scopeOptions = [
  { label: 'All scopes', value: '' },
  { label: 'Global defaults', value: 'GLOBAL' },
  { label: 'Company overrides', value: 'COMPANY' },
];

export function ProductivityRulesPage({ kind }: { kind: RuleKind }) {
  const isApplication = kind === 'applications';
  const labels = isApplication
    ? {
        title: 'Productivity Applications',
        description: 'Classify desktop applications as productive, neutral, unproductive, or unclassified.',
        primary: 'Application Name',
        normalized: 'Normalized Name',
        field: 'applicationName',
        placeholder: 'Visual Studio Code',
      }
    : {
        title: 'Productivity Websites',
        description: 'Classify website hostnames without storing full URLs, paths, or query strings.',
        primary: 'Hostname',
        normalized: 'Normalized Hostname',
        field: 'hostname',
        placeholder: 'github.com',
      };
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const canManage = roles.includes('SUPER_ADMIN') || roles.includes('COMPANY_ADMIN') || roles.includes('HR');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ProductivityCategory | ''>('');
  const [enabled, setEnabled] = useState('');
  const [scope, setScope] = useState<ProductivityScopeType | ''>('');
  const [pagination, setPagination] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RuleRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RuleRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params: ProductivityRuleParams = {
    page: pagination.page + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    category: category || undefined,
    enabled: enabled === '' ? undefined : enabled === 'true',
    scope: scope || undefined,
  };

  const query = useQuery({
    queryKey: ['productivity-rules', kind, params],
    queryFn: async (): Promise<PaginatedMonitoringResponse<RuleRecord>> => {
      const response = isApplication
        ? await getApplicationProductivityRules(params)
        : await getWebsiteProductivityRules(params);
      return response.data as PaginatedMonitoringResponse<RuleRecord>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: ApplicationProductivityPayload | WebsiteProductivityPayload): Promise<RuleRecord> => {
      const response = isApplication
        ? await createApplicationProductivityRule(payload as ApplicationProductivityPayload)
        : await createWebsiteProductivityRule(payload as WebsiteProductivityPayload);
      return response.data as RuleRecord;
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['productivity-rules', kind] });
      setToast('Productivity rule created.');
    },
    onError: () => setToast('Productivity rule could not be created. Check for duplicates and permissions.'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<ApplicationProductivityPayload | WebsiteProductivityPayload> }): Promise<RuleRecord> => {
      const response = isApplication
        ? await updateApplicationProductivityRule(id, payload as Partial<ApplicationProductivityPayload>)
        : await updateWebsiteProductivityRule(id, payload as Partial<WebsiteProductivityPayload>);
      return response.data as RuleRecord;
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['productivity-rules', kind] });
      setToast('Productivity rule updated.');
    },
    onError: () => setToast('Productivity rule could not be updated. Check for duplicates and permissions.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string): Promise<RuleRecord> => {
      const response = isApplication ? await deleteApplicationProductivityRule(id) : await deleteWebsiteProductivityRule(id);
      return response.data as RuleRecord;
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['productivity-rules', kind] });
      setToast('Productivity rule archived.');
    },
    onError: () => setToast('Productivity rule could not be archived.'),
  });

  const rows = useMemo(() => query.data?.data ?? [], [query.data?.data]);
  const columns = useMemo<GridColDef<RuleRecord>[]>(() => [
    {
      field: labels.field,
      headerName: labels.primary,
      flex: 1,
      minWidth: 240,
      renderCell: ({ row }) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography fontWeight={800} noWrap>{primaryValue(row)}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{row.notes || 'No notes'}</Typography>
        </Box>
      ),
    },
    { field: 'normalized', headerName: labels.normalized, minWidth: 190, valueGetter: (_, row) => normalizedValue(row) },
    {
      field: 'category',
      headerName: 'Category',
      minWidth: 150,
      renderCell: ({ row }) => <StatusChip label={formatCategory(row.category)} tone={categoryTone(row.category)} />,
    },
    {
      field: 'scopeType',
      headerName: 'Scope',
      minWidth: 145,
      renderCell: ({ row }) => <StatusChip label={row.scopeType === 'GLOBAL' ? 'Global' : 'Company'} tone={row.scopeType === 'GLOBAL' ? 'info' : 'success'} />,
    },
    {
      field: 'enabled',
      headerName: 'Enabled',
      minWidth: 120,
      renderCell: ({ row }) => <StatusChip label={row.enabled ? 'Enabled' : 'Disabled'} tone={row.enabled ? 'success' : 'neutral'} />,
    },
    { field: 'createdAt', headerName: 'Created', minWidth: 180, valueGetter: (_, row) => formatDate(row.createdAt) },
    {
      field: 'actions',
      headerName: 'Actions',
      minWidth: 130,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => canManage ? (
        <Stack direction="row" gap={0.5}>
          <Tooltip title="Edit rule"><IconButton size="small" onClick={() => { setEditing(row); setDialogOpen(true); }}><Edit3 size={17} /></IconButton></Tooltip>
          <Tooltip title="Archive rule"><IconButton size="small" color="error" onClick={() => setDeleteTarget(row)}><Trash2 size={17} /></IconButton></Tooltip>
        </Stack>
      ) : null,
    },
  ], [canManage, labels.field, labels.normalized, labels.primary]);

  function resetFilters() {
    setSearch('');
    setCategory('');
    setEnabled('');
    setScope('');
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function updateFilter(fn: () => void) {
    fn();
    setPagination((current) => ({ ...current, page: 0 }));
  }

  function submitRule(values: RuleFormValues) {
    const payload = isApplication
      ? { applicationName: values.primary.trim(), category: values.category, notes: values.notes.trim() || undefined, enabled: values.enabled }
      : { hostname: values.primary.trim(), category: values.category, notes: values.notes.trim() || undefined, enabled: values.enabled };
    if (editing) updateMutation.mutate({ id: editing.id, payload });
    else createMutation.mutate(payload);
  }

  return (
    <PageLayout>
      <PageHeader
        title={labels.title}
        description={labels.description}
        breadcrumbs={['Admin', 'Productivity', isApplication ? 'Applications' : 'Websites']}
      />

      <Alert severity="info">
        Company override rules take precedence over global defaults. This phase classifies records only; it does not calculate productivity scores.
      </Alert>

      <FilterToolbar
        actions={(
          <>
            <ResetButton onClick={resetFilters} />
            <RefreshButton onClick={() => void query.refetch()} />
            <ExportButton onClick={() => setToast('Export will be connected in a reporting phase.')} />
            {canManage && <Button variant="contained" startIcon={<Plus size={17} />} onClick={() => { setEditing(null); setDialogOpen(true); }}>Add Rule</Button>}
          </>
        )}
      >
        <SearchFilter placeholder={`Search ${isApplication ? 'applications' : 'websites'}`} value={search} onChange={(value) => updateFilter(() => setSearch(value))} />
        <TextField select size="small" label="Category" value={category} onChange={(event) => updateFilter(() => setCategory(event.target.value as ProductivityCategory | ''))}>
          {categories.map((option) => <MenuItem key={option.value || 'all'} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Enabled" value={enabled} onChange={(event) => updateFilter(() => setEnabled(event.target.value))}>
          {enabledOptions.map((option) => <MenuItem key={option.value || 'all'} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Scope" value={scope} onChange={(event) => updateFilter(() => setScope(event.target.value as ProductivityScopeType | ''))}>
          {scopeOptions.map((option) => <MenuItem key={option.value || 'all'} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
      </FilterToolbar>

      <DataTable
        title={isApplication ? 'Application Classification Rules' : 'Website Classification Rules'}
        rows={rows}
        columns={columns}
        toolbar={<Typography variant="body2" color="text.secondary">Server-side pagination, search, category and enabled filters</Typography>}
        gridProps={{
          loading: query.isFetching,
          rowHeight: 60,
          columnHeaderHeight: 48,
          paginationMode: 'server',
          rowCount: query.data?.meta.total ?? 0,
          paginationModel: pagination,
          onPaginationModelChange: setPagination,
          getRowId: (row) => row.id,
          slots: {
            loadingOverlay: () => <LoadingSkeleton rows={6} />,
            noRowsOverlay: () => <EmptyState title="No productivity rules found" description="Try changing filters or add a new classification rule." />,
          },
        }}
      />

      {query.isError && <Alert severity="error">Productivity rules could not be loaded. Check backend availability and permissions.</Alert>}
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      <RuleDialog
        open={dialogOpen}
        kind={kind}
        initial={editing}
        loading={createMutation.isPending || updateMutation.isPending}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSubmit={submitRule}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archive productivity rule?"
        description={`This will soft delete ${deleteTarget ? primaryValue(deleteTarget) : 'this rule'}. Existing usage records remain unchanged.`}
        confirmLabel="Archive rule"
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </PageLayout>
  );
}

interface RuleFormValues {
  primary: string;
  category: ProductivityCategory;
  notes: string;
  enabled: boolean;
}

function RuleDialog({ open, kind, initial, loading, onClose, onSubmit }: {
  open: boolean;
  kind: RuleKind;
  initial: RuleRecord | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: RuleFormValues) => void;
}) {
  const isApplication = kind === 'applications';
  const [primary, setPrimary] = useState('');
  const [category, setCategory] = useState<ProductivityCategory>('UNCLASSIFIED');
  const [notes, setNotes] = useState('');
  const [enabled, setEnabled] = useState(true);

  useMemo(() => {
    if (!open) return;
    setPrimary(initial ? primaryValue(initial) : '');
    setCategory(initial?.category ?? 'UNCLASSIFIED');
    setNotes(initial?.notes ?? '');
    setEnabled(initial?.enabled ?? true);
  }, [initial, open]);

  const title = initial ? 'Edit productivity rule' : 'Add productivity rule';
  const primaryLabel = isApplication ? 'Application Name' : 'Hostname';

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack gap={2.25} sx={{ pt: 1 }}>
          <TextField
            label={primaryLabel}
            value={primary}
            onChange={(event) => setPrimary(event.target.value)}
            placeholder={isApplication ? 'Visual Studio Code' : 'github.com'}
            required
            fullWidth
          />
          <TextField select label="Category" value={category} onChange={(event) => setCategory(event.target.value as ProductivityCategory)} fullWidth>
            {categories.filter((option) => option.value).map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
          <TextField label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} multiline minRows={3} fullWidth />
          <FormControlLabel control={<Checkbox checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />} label="Enabled" />
          {!isApplication && <Alert severity="info">Only the normalized hostname is stored. Paths, query strings, and fragments are ignored.</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          disabled={loading || !primary.trim()}
          onClick={() => onSubmit({ primary, category, notes, enabled })}
        >
          {loading ? 'Saving...' : 'Save rule'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function primaryValue(row: RuleRecord) {
  return 'applicationName' in row ? row.applicationName : row.hostname;
}

function normalizedValue(row: RuleRecord) {
  return 'normalizedName' in row ? row.normalizedName : row.normalizedHostname;
}

function formatCategory(category: ProductivityCategory) {
  return category.toLowerCase().replace(/_/g, ' ').replace(/^./, (value) => value.toUpperCase());
}

function categoryTone(category: ProductivityCategory) {
  if (category === 'PRODUCTIVE') return 'success' as const;
  if (category === 'UNPRODUCTIVE') return 'danger' as const;
  if (category === 'NEUTRAL') return 'info' as const;
  return 'neutral' as const;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
