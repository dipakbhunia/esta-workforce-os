import { Box, Button, Card, CardContent, Chip, Stack, TablePagination, Tooltip, Typography } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import type { PlatformUser, PlatformUserStatus } from '../platform-access.types';

interface Props { rows: PlatformUser[]; total: number; page: number; limit: number; loading: boolean; filtered: boolean; onManage: (id: string) => void; onPaginationChange: (page: number) => void }

export function PlatformUserList({ rows, total, page, limit, loading, filtered, onManage, onPaginationChange }: Props) {
  const columns: GridColDef<PlatformUser>[] = [
    { field: 'user', headerName: 'User', minWidth: 220, flex: 1.2, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Box minWidth={0}><Tooltip title={`${row.firstName} ${row.lastName}`}><Typography fontWeight={800} noWrap>{row.firstName} {row.lastName}</Typography></Tooltip><Tooltip title={row.email}><Typography variant="caption" color="text.secondary" display="block" noWrap>{row.email}</Typography></Tooltip></Box> },
    { field: 'status', headerName: 'Status', minWidth: 120, renderCell: ({ row }) => <StatusChip label={row.status} tone={statusTone(row.status)} /> },
    { field: 'roles', headerName: 'Global Roles', minWidth: 190, flex: 1, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Stack direction="row" gap={0.5} flexWrap="wrap">{row.roles.map(({ role }) => <Chip key={role.id} size="small" label={role.name} title={`${role.name} (${role.key})`} />)}</Stack> },
    { field: 'lastLoginAt', headerName: 'Last Login', minWidth: 170, valueGetter: (_, row) => formatDate(row.lastLoginAt) },
    { field: 'createdAt', headerName: 'Created', minWidth: 170, valueGetter: (_, row) => formatDate(row.createdAt) },
    { field: 'actions', headerName: 'Actions', minWidth: 115, sortable: false, filterable: false, disableColumnMenu: true, renderCell: ({ row }) => <Button size="small" variant="outlined" onClick={() => onManage(row.id)} aria-label={`Manage ${row.firstName} ${row.lastName}`}>Manage</Button> },
  ];
  const emptyTitle = filtered ? 'No users match the applied filters.' : 'No platform users available.';
  if (loading) return <LoadingSkeleton rows={7} />;
  return <>
    <Box data-testid="platform-users-desktop" sx={{ display: { xs: 'none', md: 'block' } }}><DataTable title="Platform Users" rows={rows} columns={columns} showSearch={false} gridProps={{ paginationMode: 'server', paginationModel: { page: page - 1, pageSize: limit }, pageSizeOptions: [limit], rowCount: total, rowHeight: 72, onPaginationModelChange: (model: GridPaginationModel) => onPaginationChange(model.page + 1), slots: { noRowsOverlay: () => <EmptyState title={emptyTitle} description={filtered ? 'Adjust or reset the applied filters.' : 'Create a platform user to get started.'} /> } }} /></Box>
    <Box data-testid="platform-users-mobile" sx={{ display: { xs: 'block', md: 'none' } }}>{rows.length ? <Stack gap={1.5}>{rows.map((row) => <Card key={row.id} variant="outlined"><CardContent><Stack gap={1.25}><Box><Typography fontWeight={800}>{row.firstName} {row.lastName}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.email}</Typography></Box><Fact label="Status"><StatusChip label={row.status} tone={statusTone(row.status)} /></Fact><Fact label="Global roles"><Stack direction="row" gap={0.5} flexWrap="wrap">{row.roles.map(({ role }) => <Chip key={role.id} size="small" label={role.name} />)}</Stack></Fact><Fact label="Last login">{formatDate(row.lastLoginAt)}</Fact><Fact label="Created">{formatDate(row.createdAt)}</Fact><Button variant="outlined" onClick={() => onManage(row.id)}>Manage User</Button></Stack></CardContent></Card>)}</Stack> : <Card><EmptyState title={emptyTitle} description={filtered ? 'Adjust or reset the applied filters.' : 'Create a platform user to get started.'} /></Card>}<TablePagination component="div" count={total} page={page - 1} rowsPerPage={limit} rowsPerPageOptions={[limit]} onPageChange={(_, next) => onPaginationChange(next + 1)} onRowsPerPageChange={() => undefined} /></Box>
  </>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) { return <Box><Typography variant="caption" color="text.secondary" display="block">{label}</Typography>{typeof children === 'string' ? <Typography variant="body2" fontWeight={700}>{children}</Typography> : children}</Box>; }
function formatDate(value: string | null) { if (!value) return 'Never'; const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Not available' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function statusTone(status: PlatformUserStatus): StatusTone { return status === 'ACTIVE' ? 'success' : status === 'SUSPENDED' ? 'danger' : 'warning'; }
