import { Alert, Box, Button, Card, CardContent, Stack, TablePagination, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SeatUsageSummary } from './SeatUsageSummary';
import { getCompanySeatUsage } from './usage-seats-api';

export default function CompanySeatDetailsPage() {
  const { companyId = '' } = useParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const query = useQuery({
    queryKey: ['usage-seats', 'company', companyId, { search, page, limit }],
    queryFn: () => getCompanySeatUsage(companyId, { page: page + 1, limit, search: search.trim() || undefined }),
    enabled: Boolean(companyId),
  });
  const value = query.data?.data;
  const consumers = value?.consumers.data ?? [];
  const total = value?.consumers.meta.total ?? 0;

  return <PageLayout>
    <PageHeader title={value ? `${value.company.name} Seat Details` : 'Company Seat Details'} description="Current seat-consuming Employees and canonical commercial capacity." breadcrumbs={['Admin', 'SaaS Management', 'Usage & Seats', value?.company.name ?? 'Details']} />
    {query.isLoading ? <LoadingSkeleton rows={8} /> : query.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => void query.refetch()}>Retry</Button>}>Company seat details could not be loaded.</Alert> : value ? <Stack gap={2}>
      <SeatUsageSummary value={value} showDetailsLink={false} />
      <Card><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between"><TextField size="small" label="Search consuming Employees" placeholder="Name or employee code" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} sx={{ minWidth: { sm: 300 } }} /><Button variant="outlined" startIcon={<RefreshCw size={17} />} onClick={() => void query.refetch()}>Refresh</Button></Stack></CardContent></Card>
      {consumers.length === 0 ? <Card><EmptyState title={search ? 'No matching seat consumers' : 'No seats currently used'} description={search ? 'Adjust the Employee search.' : 'No ACTIVE, non-deleted Employees currently consume seats.'} /></Card> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{consumers.map((consumer) => <Card key={consumer.id} variant="outlined"><CardContent><Stack gap={1}><Typography component={Link} to={`/people/employees/${consumer.id}`} color="text.primary" fontWeight={850} sx={{ textDecoration: 'none', overflowWrap: 'anywhere' }}>{consumer.name}</Typography><Fact label="Employee code" value={consumer.employeeCode} /><Fact label="Status" value={consumer.status} /><Fact label="Department" value={consumer.department?.name ?? 'Unassigned'} /><Fact label="Designation" value={consumer.designation?.name ?? 'Unassigned'} /><Button component={Link} to={`/people/employees/${consumer.id}`} variant="outlined">View Employee</Button></Stack></CardContent></Card>)}</Box>}
      <TablePagination component="div" count={total} page={page} rowsPerPage={limit} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setLimit(Number(event.target.value)); setPage(0); }} rowsPerPageOptions={[10, 20, 50]} />
    </Stack> : <Alert severity="warning">Company not found.</Alert>}
  </PageLayout>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <Box minWidth={0}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
}
