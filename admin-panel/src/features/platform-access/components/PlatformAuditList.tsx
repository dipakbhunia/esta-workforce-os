import { Box, Button, Card, CardContent, Stack, TablePagination, Tooltip, Typography } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import type { PlatformAuditRecord } from '../platform-access.types';

interface Props { rows: PlatformAuditRecord[]; total: number; page: number; limit: number; loading: boolean; filtered: boolean; onView: (id: string) => void; onPaginationChange: (page: number) => void }

export function PlatformAuditList({ rows, total, page, limit, loading, filtered, onView, onPaginationChange }: Props) {
  const theme = useTheme(); const desktop = useMediaQuery(theme.breakpoints.up('lg')); const emptyTitle = filtered ? 'No audit records match the applied filters.' : 'No platform audit records available.';
  const columns: GridColDef<PlatformAuditRecord>[] = [
    { field: 'createdAt', headerName: 'Timestamp', minWidth: 175, flex: 0.8, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Typography variant="body2">{formatAuditTime(row.createdAt)}</Typography> },
    { field: 'action', headerName: 'Action', minWidth: 190, flex: 1, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Exact value={row.action} /> },
    { field: 'actor', headerName: 'Actor', minWidth: 210, flex: 1.1, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={700} noWrap>{actorName(row)}</Typography><Tooltip title={row.actor?.email ?? row.actorUserId ?? 'No actor identity'}><Typography variant="caption" color="text.secondary" display="block" noWrap>{row.actor?.email ?? row.actorUserId ?? 'System / unavailable'}</Typography></Tooltip></Box> },
    { field: 'target', headerName: 'Target', minWidth: 190, flex: 1, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Box minWidth={0}><Typography fontWeight={700}>{row.entityType}</Typography><Tooltip title={row.entityId ?? 'No target ID'}><Typography variant="caption" color="text.secondary" display="block" noWrap>{row.entityId ?? 'No target ID'}</Typography></Tooltip></Box> },
    { field: 'ipAddress', headerName: 'Source IP', minWidth: 125, flex: 0.6, sortable: false, disableColumnMenu: true, valueGetter: (_, row) => row.ipAddress ?? 'Unavailable' },
    { field: 'actions', headerName: 'Action', minWidth: 120, sortable: false, filterable: false, disableColumnMenu: true, renderCell: ({ row }) => <Button size="small" variant="outlined" onClick={() => onView(row.id)} aria-label={`View audit ${row.id} details`}>View Details</Button> },
  ];
  if (loading) return <Box role="status" aria-label="Loading platform audit logs"><LoadingSkeleton rows={6} /></Box>;
  if (desktop) return <Box data-testid="platform-audits-desktop"><DataTable title="Platform Audit Register" rows={rows} columns={columns} showSearch={false} gridProps={{ paginationMode: 'server', paginationModel: { page: page - 1, pageSize: limit }, pageSizeOptions: [limit], rowCount: total, rowHeight: 72, onPaginationModelChange: (model: GridPaginationModel) => onPaginationChange(model.page + 1), slots: { noRowsOverlay: () => <EmptyState title={emptyTitle} description={filtered ? 'Adjust or reset the applied filters.' : 'No platform audit evidence was returned.'} /> } }} /></Box>;
  return <Box data-testid="platform-audits-cards">{rows.length ? <Stack gap={1.5}>{rows.map((row) => <Card key={row.id} variant="outlined"><CardContent><Stack gap={1.25}><Fact label="Timestamp" value={formatAuditTime(row.createdAt)} /><Fact label="Action" value={row.action} /><Fact label="Actor" value={actorName(row)} /><Fact label="Actor identity" value={row.actor?.email ?? row.actorUserId ?? 'System / unavailable'} /><Fact label="Target" value={`${row.entityType} · ${row.entityId ?? 'No target ID'}`} /><Fact label="Source IP" value={row.ipAddress ?? 'Unavailable'} /><Button variant="outlined" onClick={() => onView(row.id)} aria-label={`View audit ${row.id} details`}>View Details</Button></Stack></CardContent></Card>)}</Stack> : <Card><EmptyState title={emptyTitle} description={filtered ? 'Adjust or reset the applied filters.' : 'No platform audit evidence was returned.'} /></Card>}<TablePagination component="div" count={total} page={page - 1} rowsPerPage={limit} rowsPerPageOptions={[limit]} onPageChange={(_, next) => onPaginationChange(next + 1)} onRowsPerPageChange={() => undefined} /></Box>;
}

export function actorName(row: PlatformAuditRecord) { const name = row.actor ? `${row.actor.firstName} ${row.actor.lastName}`.trim() : ''; return name || (row.actor ? row.actor.email : 'System / unavailable'); }
export function formatAuditTime(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? 'Not available' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date); }
function Exact({ value }: { value: string }) { return <Tooltip title={value}><Typography variant="body2" fontWeight={700} noWrap>{value}</Typography></Tooltip>; }
function Fact({ label, value }: { label: string; value: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary" display="block">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
