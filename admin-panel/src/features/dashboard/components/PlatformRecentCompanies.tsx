import { Box, Card, CardContent, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import type { CompanyStatus, PlatformCommercialState, PlatformDashboardResponse } from '../platform-dashboard.types';

export function PlatformRecentCompanies({ companies }: { companies: PlatformDashboardResponse['recentCompanies'] }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack gap={2}>
          <Box>
            <Typography component="h2" variant="h4">Recent Companies</Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>Newest company tenants in backend-provided order.</Typography>
          </Box>
          {companies.length ? (
            <TableContainer sx={{ maxWidth: '100%' }}>
              <Table size="small" aria-label="Recent companies">
                <TableHead><TableRow><TableCell>Company</TableCell><TableCell>Status</TableCell><TableCell>Commercial State</TableCell><TableCell>Created</TableCell></TableRow></TableHead>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell><Typography fontWeight={800}>{company.name}</Typography></TableCell>
                      <TableCell><StatusChip label={displayEnum(company.status)} tone={companyTone(company.status)} /></TableCell>
                      <TableCell><StatusChip label={displayEnum(company.commercialState)} tone={commercialTone(company.commercialState)} /></TableCell>
                      <TableCell>{formatDateTime(company.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : <Typography color="text.secondary">No recent companies are available.</Typography>}
        </Stack>
      </CardContent>
    </Card>
  );
}

function companyTone(status: CompanyStatus): StatusTone {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'danger';
  if (status === 'TRIAL') return 'info';
  return 'neutral';
}

function commercialTone(state: PlatformCommercialState): StatusTone {
  if (state === 'ACTIVE_SUBSCRIPTION') return 'success';
  if (state === 'SUSPENDED_SUBSCRIPTION') return 'warning';
  if (state === 'TRIAL') return 'info';
  return 'neutral';
}

function displayEnum(value: string) {
  return value.toLowerCase().split('_').map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-IN');
}
