import {
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TablePagination,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import {
  claimLabel,
  emailDeliveryStatusLabel,
  emailEventLabel,
  formatEmailDeliveryDate,
} from '../platform-communication-format';
import type { PlatformEmailDelivery } from '../platform-communication.types';

interface Props {
  rows: PlatformEmailDelivery[];
  total: number;
  page: number;
  limit: number;
  loading: boolean;
  filtered: boolean;
  onPaginationChange: (page: number, limit: number) => void;
}

export function PlatformEmailDeliveryList({
  rows,
  total,
  page,
  limit,
  loading,
  filtered,
  onPaginationChange,
}: Props) {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true });
  const emptyTitle = filtered
    ? 'No deliveries match the applied filters.'
    : 'No email deliveries available.';
  const emptyDescription = filtered
    ? 'Adjust or reset the applied filters.'
    : 'Durable email delivery evidence will appear here.';

  if (desktop) {
    return (
      <Box data-testid="email-delivery-desktop-list">
        <DataTable
          title="Email Delivery Logs"
          rows={rows}
          columns={columns}
          showSearch={false}
          gridProps={{
            getRowId: (row: PlatformEmailDelivery) => row.deliveryId,
            loading,
            paginationMode: 'server',
            paginationModel: { page: page - 1, pageSize: limit },
            pageSizeOptions: [10, 20, 50, 100],
            rowCount: total,
            getRowHeight: () => 'auto',
            getEstimatedRowHeight: () => 76,
            onPaginationModelChange: (model: GridPaginationModel) => {
              onPaginationChange(model.page + 1, model.pageSize);
            },
            slots: {
              noRowsOverlay: () => (
                <EmptyState title={emptyTitle} description={emptyDescription} />
              ),
            },
          }}
        />
      </Box>
    );
  }

  return (
    <Box data-testid="email-delivery-mobile-list">
      {rows.length ? (
        <Stack gap={1.5}>
          {rows.map(row => (
            <Card variant="outlined" key={row.deliveryId}>
              <CardContent>
                <Stack gap={1}>
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Box>
                      <StatusChip label={emailDeliveryStatusLabel(row.status)} tone={statusTone(row.status)} />
                      {claimLabel(row) ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {claimLabel(row)}
                        </Typography>
                      ) : null}
                    </Box>
                    <ExactValue value={row.deliveryId} />
                  </Stack>
                  <Fact label="Event Type" value={emailEventLabel(row.eventType)} />
                  <Fact label="Recipient" value={row.recipient} />
                  {row.companyId ? <Fact label="Company ID" value={row.companyId} /> : null}
                  <Fact label="Attempts" value={String(row.attemptCount)} />
                  <Fact
                    label={row.nextRetryAt ? 'Next retry' : 'Last attempt'}
                    value={formatEmailDeliveryDate(row.nextRetryAt ?? row.lastAttemptAt)}
                  />
                  <Fact label="Created" value={formatEmailDeliveryDate(row.createdAt)} />
                  <Button
                    component={Link}
                    to={`/platform-communication/email-delivery-logs/${row.deliveryId}`}
                    variant="outlined"
                  >
                    View Details
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <Card><EmptyState title={emptyTitle} description={emptyDescription} /></Card>
      )}
      <TablePagination
        component="div"
        count={total}
        page={page - 1}
        rowsPerPage={limit}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={(_, nextPage) => onPaginationChange(nextPage + 1, limit)}
        onRowsPerPageChange={event => onPaginationChange(1, Number(event.target.value))}
      />
    </Box>
  );
}

const columns: GridColDef<PlatformEmailDelivery>[] = [
  {
    field: 'status',
    headerName: 'Status',
    minWidth: 145,
    flex: 0.8,
    renderCell: ({ row }) => (
      <MultilineCell>
        <StatusChip label={emailDeliveryStatusLabel(row.status)} tone={statusTone(row.status)} />
        {claimLabel(row) ? (
          <Typography variant="caption" display="block" color="text.secondary" noWrap>
            {claimLabel(row)}
          </Typography>
        ) : null}
      </MultilineCell>
    ),
  },
  {
    field: 'eventType',
    headerName: 'Event Type',
    minWidth: 145,
    flex: 1,
    valueFormatter: value => emailEventLabel(String(value)),
  },
  {
    field: 'recipient',
    headerName: 'Recipient',
    minWidth: 180,
    flex: 1.25,
    renderCell: ({ row }) => <DiscoverableValue value={row.recipient} />,
  },
  {
    field: 'authority',
    headerName: 'Company / User',
    minWidth: 155,
    flex: 1,
    renderCell: ({ row }) => (
      <MultilineCell>
        <ExactValue value={row.companyId ?? 'Platform'} />
        <ExactValue value={row.recipientUserId} secondary />
      </MultilineCell>
    ),
  },
  {
    field: 'attempts',
    headerName: 'Attempts / Schedule',
    minWidth: 150,
    flex: 1,
    renderCell: ({ row }) => (
      <MultilineCell>
        <Typography variant="body2" fontWeight={700}>{row.attemptCount}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {formatEmailDeliveryDate(row.nextRetryAt ?? row.lastAttemptAt)}
        </Typography>
      </MultilineCell>
    ),
  },
  {
    field: 'createdAt',
    headerName: 'Created',
    minWidth: 175,
    flex: 1,
    renderCell: ({ row }) => (
      <Typography
        variant="body2"
        sx={{ py: 1.25, whiteSpace: 'normal', lineHeight: 1.35 }}
      >
        {formatEmailDeliveryDate(row.createdAt)}
      </Typography>
    ),
  },
  {
    field: 'action',
    headerName: 'Action',
    width: 105,
    sortable: false,
    filterable: false,
    renderCell: ({ row }) => (
      <Button
        component={Link}
        to={`/platform-communication/email-delivery-logs/${row.deliveryId}`}
        size="small"
        variant="outlined"
      >
        View
      </Button>
    ),
  },
];

function statusTone(status: string): StatusTone {
  if (status === 'DELIVERED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'CANCELLED') return 'neutral';
  return 'warning';
}

function MultilineCell({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minWidth: 0,
        py: 1.25,
      }}
    >
      {children}
    </Box>
  );
}

function DiscoverableValue({ value }: { value: string }) {
  return <Tooltip title={value}><Typography tabIndex={0} noWrap sx={{ maxWidth: '100%' }}>{value}</Typography></Tooltip>;
}

function ExactValue({ value, secondary = false }: { value: string; secondary?: boolean }) {
  const displayed = value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
  return (
    <Tooltip title={value}>
      <Typography tabIndex={0} variant={secondary ? 'caption' : 'body2'} color={secondary ? 'text.secondary' : undefined} noWrap>
        {displayed}
      </Typography>
    </Tooltip>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <Box minWidth={0}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  );
}
