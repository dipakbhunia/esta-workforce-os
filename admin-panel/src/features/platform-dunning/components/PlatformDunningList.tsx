import { Box, Button, Card, CardContent, Stack, TablePagination, Tooltip, Typography } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { formatPlatformDunningAmount, formatPlatformDunningDate } from '../platform-dunning-format';
import type { PlatformDunningListItem } from '../platform-dunning.types';

interface Props { rows: PlatformDunningListItem[]; total: number; page: number; limit: number; loading: boolean; filtered: boolean; onPaginationChange: (page: number, limit: number) => void }

export function PlatformDunningList({ rows, total, page, limit, loading, filtered, onPaginationChange }: Props) {
  const title = filtered ? 'No Dunning records match the applied filters.' : 'No open Dunning records.';
  if (loading) return <LoadingSkeleton rows={7} />;
  return <>
    <Box data-testid="dunning-desktop-list" sx={{ display: { xs: 'none', md: 'block' }, width: '100%', minWidth: 0 }}><DataTable title="Open Dunning Register" rows={rows} columns={dunningDesktopColumns} showSearch={false} gridProps={{ getRowId: row => row.renewal.id, paginationMode: 'server', paginationModel: { page: page - 1, pageSize: limit }, pageSizeOptions: [10, 20, 50, 100], rowCount: total, rowHeight: 64, onPaginationModelChange: (model: GridPaginationModel) => onPaginationChange(model.page + 1, model.pageSize), slots: { noRowsOverlay: () => <EmptyState title={title} description={filtered ? 'Adjust or reset the applied filters.' : 'Due unresolved subscription renewals will appear here.'} /> } }} /></Box>
    <Box data-testid="dunning-mobile-list" sx={{ display: { xs: 'block', md: 'none' } }}>{rows.length ? <Stack gap={1.5}>{rows.map(row => <Card key={row.renewal.id} variant="outlined"><CardContent><Stack gap={1}><Typography fontWeight={800}>{row.company.name}</Typography><Exact value={row.company.id} secondary /><Fact label="Plan" value={`${row.subscription.plan.name} (${row.subscription.plan.code})`} /><Box><Typography variant="caption" color="text.secondary">Subscription</Typography><Exact value={row.subscription.id} /></Box><Fact label="Due" value={formatPlatformDunningDate(row.dueAt)} /><Fact label="Cycle ends" value={formatPlatformDunningDate(row.renewal.cycleEnd)} /><Box><Typography variant="caption" color="text.secondary">Payment status</Typography><div><StatusChip label={row.payment.status} tone={paymentTone(row.payment.status)} /></div></Box><Fact label="Amount" value={formatPlatformDunningAmount(row.payment.amountMinor, row.payment.currency)} /><Box><Typography variant="caption" color="text.secondary">Dunning reason</Typography><div><StatusChip label={reasonLabel(row.reason)} tone={reasonTone(row.reason)} /></div></Box><Fact label="Latest provider order" value={row.latestProviderOrder ? `${row.latestProviderOrder.status} · ${safe(row.latestProviderOrder.providerStatus)}` : 'Not available'} /><Button component={Link} to={`/billing/dunning/${row.renewal.id}`} variant="outlined">View Details</Button></Stack></CardContent></Card>)}</Stack> : <Card><EmptyState title={title} description={filtered ? 'Adjust or reset the applied filters.' : 'Due unresolved subscription renewals will appear here.'} /></Card>}<TablePagination component="div" count={total} page={page - 1} rowsPerPage={limit} onPageChange={(_, next) => onPaginationChange(next + 1, limit)} onRowsPerPageChange={event => onPaginationChange(1, Number(event.target.value))} rowsPerPageOptions={[10, 20, 50, 100]} /></Box>
  </>;
}

export const dunningDesktopColumns: GridColDef<PlatformDunningListItem>[] = [
  { field: 'company', headerName: 'Company', minWidth: 125, flex: 1.1, renderCell: ({ row }) => <Box minWidth={0} width="100%"><DiscoverableText value={row.company.name} emphasized /><Exact value={row.company.id} secondary /></Box> },
  { field: 'subscription', headerName: 'Subscription / Plan', minWidth: 140, flex: 1.2, renderCell: ({ row }) => <Box minWidth={0} width="100%"><DiscoverableText value={`${row.subscription.plan.name} (${row.subscription.plan.code})`} emphasized /><Exact value={row.subscription.id} secondary /></Box> },
  { field: 'due', headerName: 'Due / Cycle', minWidth: 130, flex: 1, renderCell: ({ row }) => <Box minWidth={0}><Typography variant="body2" fontWeight={700} noWrap>{formatPlatformDunningDate(row.dueAt)}</Typography><Typography variant="caption" color="text.secondary" noWrap>to {formatPlatformDunningDate(row.renewal.cycleEnd)}</Typography></Box> },
  { field: 'payment', headerName: 'Payment', minWidth: 120, flex: 0.9, renderCell: ({ row }) => <Box minWidth={0} width="100%"><StatusChip label={row.payment.status} tone={paymentTone(row.payment.status)} /><DiscoverableText value={formatPlatformDunningAmount(row.payment.amountMinor, row.payment.currency)} secondary /></Box> },
  { field: 'reason', headerName: 'Dunning Reason', minWidth: 120, flex: 0.9, renderCell: ({ row }) => <StatusChip label={reasonLabel(row.reason)} tone={reasonTone(row.reason)} /> },
  { field: 'order', headerName: 'Latest Provider Order', minWidth: 130, flex: 1, renderCell: ({ row }) => row.latestProviderOrder ? <Box minWidth={0} width="100%"><StatusChip label={row.latestProviderOrder.status} tone={orderTone(row.latestProviderOrder.status)} /><DiscoverableText value={safe(row.latestProviderOrder.providerStatus)} secondary /></Box> : <Typography variant="body2" color="text.secondary">Not available</Typography> },
  { field: 'action', headerName: 'Action', width: 100, minWidth: 100, maxWidth: 100, sortable: false, filterable: false, renderCell: ({ row }) => <Button component={Link} to={`/billing/dunning/${row.renewal.id}`} variant="outlined" size="small">View Details</Button> },
];

function paymentTone(status: string): StatusTone { return status === 'FAILED' ? 'danger' : status === 'AUTHORIZED' ? 'info' : status === 'CAPTURED' ? 'success' : 'warning'; }
function reasonTone(reason: PlatformDunningListItem['reason']): StatusTone { return reason === 'PAYMENT_FAILED' ? 'danger' : reason === 'PAYMENT_AUTHORIZED' ? 'info' : 'warning'; }
function reasonLabel(reason: PlatformDunningListItem['reason']) { return reason ? reason.replaceAll('_', ' ') : 'OPEN'; }
function orderTone(status: string): StatusTone { return status === 'PAID' ? 'success' : status === 'CREATED' ? 'info' : 'neutral'; }
function safe(value: string) { return value.trim() || 'Not available'; }
function DiscoverableText({ value, emphasized = false, secondary = false }: { value: string; emphasized?: boolean; secondary?: boolean }) { return <Tooltip title={value}><Typography tabIndex={0} aria-label={value} variant={secondary ? 'caption' : 'body2'} color={secondary ? 'text.secondary' : undefined} fontWeight={emphasized ? 800 : undefined} noWrap sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</Typography></Tooltip>; }
function Exact({ value, secondary = false }: { value: string; secondary?: boolean }) { return <Tooltip title={value}><Typography tabIndex={0} aria-label={value} variant={secondary ? 'caption' : 'body2'} color={secondary ? 'text.secondary' : undefined} noWrap>{value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value}</Typography></Tooltip>; }
function Fact({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
