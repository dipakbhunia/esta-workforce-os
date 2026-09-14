import { Box, Button, Card, CardContent, Stack, TablePagination, Tooltip, Typography } from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { formatPlatformInvoiceAmount, formatPlatformInvoiceDate } from '../platform-invoices-format';
import type { PlatformInvoiceSummary } from '../platform-invoices.types';

interface Props { rows: PlatformInvoiceSummary[]; total: number; page: number; limit: number; loading: boolean; filtered: boolean; onPaginationChange: (page: number, limit: number) => void }
export function PlatformInvoiceList({ rows, total, page, limit, loading, filtered, onPaginationChange }: Props) {
  const columns: GridColDef<PlatformInvoiceSummary>[] = [
    { field: 'invoiceNumber', headerName: 'Invoice', minWidth: 180, flex: .8, renderCell: ({ row }) => <Exact value={row.invoiceNumber} /> },
    { field: 'issuedAt', headerName: 'Issued', minWidth: 190, renderCell: ({ row }) => <Tooltip title={row.issuedAt}><Typography variant="body2">{formatPlatformInvoiceDate(row.issuedAt)}</Typography></Tooltip> },
    { field: 'references', headerName: 'Company / Subscription', minWidth: 220, flex: 1, renderCell: ({ row }) => <Box><Exact value={row.companyId} /><Exact value={row.subscriptionId} subtle /></Box> },
    { field: 'sourcePaymentId', headerName: 'Source Payment', minWidth: 180, flex: .8, renderCell: ({ row }) => <Exact value={row.sourcePaymentId} /> },
    { field: 'servicePeriod', headerName: 'Service Period', minWidth: 220, flex: 1, renderCell: ({ row }) => <Typography variant="body2">{formatPlatformInvoiceDate(row.servicePeriodStart)} – {formatPlatformInvoiceDate(row.servicePeriodEnd)}</Typography> },
    { field: 'total', headerName: 'Total', minWidth: 160, valueGetter: (_, row) => formatPlatformInvoiceAmount(row.totalMinor, row.currency) },
    { field: 'action', headerName: 'Action', minWidth: 130, sortable: false, filterable: false, renderCell: ({ row }) => <Button component={Link} to={`/billing/invoices/${row.id}`} variant="outlined" size="small">View Details</Button> },
  ];
  const emptyTitle = filtered ? 'No invoices match the applied filters.' : 'No Invoice records available.';
  if (loading) return <LoadingSkeleton rows={7} />;
  return <>
    <Box sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' } }}>
      <DataTable title="Invoice Register" rows={rows} columns={columns} showSearch={false} gridProps={{ paginationMode: 'server', paginationModel: { page: page - 1, pageSize: limit }, pageSizeOptions: [10, 20, 50, 100], rowCount: total, onPaginationModelChange: (model: GridPaginationModel) => onPaginationChange(model.page + 1, model.pageSize), slots: { noRowsOverlay: () => <EmptyState title={emptyTitle} description={filtered ? 'Adjust or clear the applied filters.' : 'Issued subscription Invoices will appear here.'} /> } }} />
    </Box>
    <Box sx={{ display: { xs: 'block', md: 'none' } }}>
      {rows.length ? <Stack gap={1.5}>{rows.map((row) => <InvoiceCard key={row.id} invoice={row} />)}</Stack> : <Card><EmptyState title={emptyTitle} description={filtered ? 'Adjust or clear the applied filters.' : 'Issued subscription Invoices will appear here.'} /></Card>}
      <TablePagination component="div" count={total} page={page - 1} rowsPerPage={limit} onPageChange={(_, next) => onPaginationChange(next + 1, limit)} onRowsPerPageChange={(event) => onPaginationChange(1, Number(event.target.value))} rowsPerPageOptions={[10, 20, 50, 100]} />
    </Box>
  </>;
}
function InvoiceCard({ invoice }: { invoice: PlatformInvoiceSummary }) { return <Card variant="outlined"><CardContent><Stack gap={1.25}><Exact value={invoice.invoiceNumber} /><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}><Fact label="Issued" value={formatPlatformInvoiceDate(invoice.issuedAt)} /><Fact label="Total" value={formatPlatformInvoiceAmount(invoice.totalMinor, invoice.currency)} /><Fact label="Company ID" value={invoice.companyId} /><Fact label="Subscription ID" value={invoice.subscriptionId} /><Fact label="Source Payment ID" value={invoice.sourcePaymentId} /><Fact label="Service period" value={`${formatPlatformInvoiceDate(invoice.servicePeriodStart)} – ${formatPlatformInvoiceDate(invoice.servicePeriodEnd)}`} /></Box><Button component={Link} to={`/billing/invoices/${invoice.id}`} variant="outlined">View Details</Button></Stack></CardContent></Card>; }
function Exact({ value, subtle = false }: { value: string; subtle?: boolean }) { return <Tooltip title={value}><Typography variant={subtle ? 'caption' : 'body2'} color={subtle ? 'text.secondary' : 'text.primary'} fontWeight={subtle ? 400 : 800} noWrap>{value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value}</Typography></Tooltip>; }
function Fact({ label, value }: { label: string; value: string }) { return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
