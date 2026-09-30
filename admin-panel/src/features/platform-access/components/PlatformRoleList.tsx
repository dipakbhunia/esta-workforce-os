import { Box, Button, Card, CardContent, Chip, Stack, TablePagination, Tooltip, Typography } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import type { PlatformRole } from '../platform-access.types';

interface Props { rows: PlatformRole[]; total: number; page: number; limit: number; loading: boolean; filtered: boolean; onView: (id: string) => void; onPaginationChange: (page: number) => void }

export function PlatformRoleList({ rows, total, page, limit, loading, filtered, onView, onPaginationChange }: Props) {
  const theme = useTheme();
  const desktopRegister = useMediaQuery(theme.breakpoints.up('lg'));
  const columns: GridColDef<PlatformRole>[] = [
    { field: 'role', headerName: 'Role', minWidth: 180, flex: 1, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Box minWidth={0}><Tooltip title={row.name}><Typography fontWeight={800} noWrap>{row.name}</Typography></Tooltip><Tooltip title={row.key}><Typography variant="caption" color="text.secondary" display="block" noWrap>{row.key}</Typography></Tooltip></Box> },
    { field: 'systemName', headerName: 'System Name', minWidth: 130, flex: 0.7, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => row.systemName ? <Chip size="small" label={row.systemName} /> : <Typography variant="body2" color="text.secondary">Custom</Typography> },
    { field: 'description', headerName: 'Description', minWidth: 190, flex: 1.3, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Tooltip title={row.description ?? 'No description'}><Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description ?? 'No description'}</Typography></Tooltip> },
    { field: 'permissions', headerName: 'Assigned Permissions', minWidth: 145, sortable: false, disableColumnMenu: true, valueGetter: (_, row) => row.permissions.length },
    { field: 'users', headerName: 'Assigned Users', minWidth: 120, sortable: false, disableColumnMenu: true, valueGetter: (_, row) => row._count.users },
    { field: 'actions', headerName: 'Action', minWidth: 120, sortable: false, filterable: false, disableColumnMenu: true, renderCell: ({ row }) => <Button size="small" variant="outlined" onClick={() => onView(row.id)} aria-label={`View ${row.name} details`}>View Details</Button> },
  ];
  const emptyTitle = filtered ? 'No roles match the applied filters.' : 'No platform roles available.';
  if (loading) return <Box role="status" aria-label="Loading platform roles"><LoadingSkeleton rows={6} /></Box>;
  return desktopRegister
    ? <Box data-testid="platform-roles-desktop"><DataTable title="Global Roles" rows={rows} columns={columns} showSearch={false} gridProps={{ paginationMode: 'server', paginationModel: { page: page - 1, pageSize: limit }, pageSizeOptions: [limit], rowCount: total, rowHeight: 72, onPaginationModelChange: (model: GridPaginationModel) => onPaginationChange(model.page + 1), slots: { noRowsOverlay: () => <EmptyState title={emptyTitle} description={filtered ? 'Adjust or reset the applied filters.' : 'No global role records were returned.'} /> } }} /></Box>
    : <Box data-testid="platform-roles-cards">{rows.length ? <Stack gap={1.5}>{rows.map((role) => <Card key={role.id} variant="outlined"><CardContent><Stack gap={1.25}><Box><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{role.name}</Typography><Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{role.key}</Typography></Box><Fact label="System name">{role.systemName ?? 'Custom'}</Fact><Fact label="Description">{role.description ?? 'No description'}</Fact><Fact label="Assigned permissions">{String(role.permissions.length)}</Fact><Fact label="Assigned users">{String(role._count.users)}</Fact><Button variant="outlined" onClick={() => onView(role.id)} aria-label={`View ${role.name} details`}>View Details</Button></Stack></CardContent></Card>)}</Stack> : <Card><EmptyState title={emptyTitle} description={filtered ? 'Adjust or reset the applied filters.' : 'No global role records were returned.'} /></Card>}<TablePagination component="div" count={total} page={page - 1} rowsPerPage={limit} rowsPerPageOptions={[limit]} onPageChange={(_, next) => onPaginationChange(next + 1)} onRowsPerPageChange={() => undefined} /></Box>;
}

function Fact({ label, children }: { label: string; children: string }) { return <Box><Typography variant="caption" color="text.secondary" display="block">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{children}</Typography></Box>; }
