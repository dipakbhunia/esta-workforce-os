import { Box, Button, Card, CardContent, Stack, TablePagination, Tooltip, Typography } from '@mui/material';
import { type GridColDef, type GridPaginationModel } from '@mui/x-data-grid';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import { formatPlatformPaymentAmount } from '../platform-payments-format';
import type { PlatformPayment } from '../platform-payments.types';

interface Props {
  rows: PlatformPayment[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filtered: boolean;
  onPaginationChange: (page: number, limit: number) => void;
}

export function PlatformPaymentList({ rows, total, page, limit, loading, filtered, onPaginationChange }: Props) {
  const paginationModel = { page: page - 1, pageSize: limit };
  const columns: GridColDef<PlatformPayment>[] = [
    { field: 'payment', headerName: 'Payment', minWidth: 175, flex: .8, renderCell: ({ row }) => <IdBlock value={row.id} secondary={label(row.purpose)} /> },
    { field: 'company', headerName: 'Company / Subscription', minWidth: 240, flex: 1.2, renderCell: ({ row }) => <Box minWidth={0}><Typography component={Link} to={`/organization/companies/${row.company.id}`} fontWeight={800} color="text.primary" noWrap>{row.company.name}</Typography><Typography component={Link} to={`/saas/subscriptions/${row.subscription.id}`} display="block" variant="caption" color="text.secondary" noWrap>{row.subscription.plan.name} ({row.subscription.plan.code})</Typography></Box> },
    { field: 'amount', headerName: 'Amount', minWidth: 145, valueGetter: (_, row) => formatPlatformPaymentAmount(row.amountMinor, row.currency) },
    { field: 'status', headerName: 'Payment Status', minWidth: 210, flex: .8, renderCell: ({ row }) => <Box><StatusChip label={row.status} tone={paymentTone(row.status)} />{row.providerStatus ? <Typography variant="caption" display="block" color="text.secondary">{row.providerStatus}</Typography> : null}{row.status === 'FAILED' && row.failure ? <Tooltip title={`${row.failure.code ?? 'Failure'}: ${row.failure.message ?? 'No safe failure message'}`}><Typography variant="caption" display="block" color="error" noWrap>{row.failure.message ?? row.failure.code ?? 'Payment failed'}</Typography></Tooltip> : null}</Box> },
    { field: 'provider', headerName: 'Provider', minWidth: 120, renderCell: ({ row }) => <Box><Typography variant="body2">{row.provider}</Typography><Typography variant="caption" color="text.secondary">{row.mode}</Typography></Box> },
    { field: 'order', headerName: 'Current Provider Order', minWidth: 200, flex: .8, renderCell: ({ row }) => row.providerOrder ? <IdBlock value={row.providerOrder.providerOrderId} secondary={row.providerOrder.status} /> : <Typography color="text.secondary">Not available</Typography> },
    { field: 'activation', headerName: 'Activation', minWidth: 140, renderCell: ({ row }) => <StatusChip label={row.activation.status} tone={activationTone(row.activation.status)} /> },
    { field: 'createdAt', headerName: 'Created', minWidth: 190, renderCell: ({ row }) => <Tooltip title={row.createdAt}><Typography variant="body2">{formatDate(row.createdAt)}</Typography></Tooltip> },
    { field: 'action', headerName: 'Action', minWidth: 130, sortable: false, filterable: false, renderCell: ({ row }) => <Button component={Link} to={`/billing/payments/${row.id}`} variant="outlined" size="small">View Details</Button> },
  ];
  const change = (model: GridPaginationModel) => onPaginationChange(model.page + 1, model.pageSize);
  const emptyTitle = filtered ? 'No payments match the applied filters.' : 'No payments recorded yet.';

  if (loading) return <LoadingSkeleton rows={7} />;
  return <>
    <Box sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } }}>
      <DataTable title="Payment Register" rows={rows} columns={columns} showSearch={false} gridProps={{ paginationMode: 'server', paginationModel, pageSizeOptions: [10, 20, 50, 100], rowCount: total, onPaginationModelChange: change, slots: { noRowsOverlay: () => <EmptyState title={emptyTitle} description={filtered ? 'Adjust or clear the applied filters.' : 'Provider payments will appear here when recorded.'} /> } }} />
    </Box>
    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      {rows.length === 0 ? <Card><EmptyState title={emptyTitle} description={filtered ? 'Adjust or clear the applied filters.' : 'Provider payments will appear here when recorded.'} /></Card> : <Stack gap={1.5}>{rows.map((row) => <PaymentCard key={row.id} payment={row} />)}</Stack>}
      <TablePagination component="div" count={total} page={page - 1} rowsPerPage={limit} onPageChange={(_, next) => onPaginationChange(next + 1, limit)} onRowsPerPageChange={(event) => onPaginationChange(1, Number(event.target.value))} rowsPerPageOptions={[10, 20, 50, 100]} />
    </Box>
  </>;
}

function PaymentCard({ payment }: { payment: PlatformPayment }) {
  return <Card variant="outlined"><CardContent><Stack gap={1.5}><Stack direction="row" justifyContent="space-between" gap={1}><IdBlock value={payment.id} secondary={label(payment.purpose)} /><StatusChip label={payment.status} tone={paymentTone(payment.status)} /></Stack><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}><Fact label="Company" value={payment.company.name} /><Fact label="Plan" value={`${payment.subscription.plan.name} (${payment.subscription.plan.code})`} /><Fact label="Amount" value={formatPlatformPaymentAmount(payment.amountMinor, payment.currency)} /><Fact label="Provider / Mode" value={`${payment.provider} / ${payment.mode}`} /><Fact label="Activation" value={payment.activation.status} /><Fact label="Created" value={formatDate(payment.createdAt)} /></Box>{payment.status === 'FAILED' && payment.failure ? <Typography variant="body2" color="error">{payment.failure.message ?? payment.failure.code ?? 'Payment failed'}</Typography> : null}<Button component={Link} to={`/billing/payments/${payment.id}`} variant="outlined">View Details</Button></Stack></CardContent></Card>;
}

function IdBlock({ value, secondary }: { value: string; secondary: string }) { return <Box minWidth={0}><Tooltip title={value}><Typography fontWeight={800} noWrap>{shortId(value)}</Typography></Tooltip><Typography variant="caption" color="text.secondary" noWrap>{secondary}</Typography></Box>; }
function Fact({ label: name, value }: { label: string; value: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{name}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
function shortId(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function label(value: string) { return value.replaceAll('_', ' '); }
function formatDate(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Date unavailable'; }
function paymentTone(status: PlatformPayment['status']): StatusTone { return status === 'CAPTURED' ? 'success' : status === 'FAILED' ? 'danger' : status === 'AUTHORIZED' ? 'info' : 'warning'; }
function activationTone(status: PlatformPayment['activation']['status']): StatusTone { return status === 'COMPLETED' ? 'success' : status === 'BLOCKED' ? 'danger' : status === 'PENDING' ? 'warning' : status === 'UNRESOLVED' ? 'info' : 'neutral'; }
