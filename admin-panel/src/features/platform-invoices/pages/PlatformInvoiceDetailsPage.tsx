import { Alert, Button } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';

export default function PlatformInvoiceDetailsPage() {
  const { invoiceId = '' } = useParams();
  return <PageLayout>
    <PageHeader title="Invoice Details" description="Authoritative Invoice evidence." breadcrumbs={['Admin', 'Billing', 'Invoices', 'Details']} />
    <Button component={Link} to="/billing/invoices" variant="outlined" sx={{ alignSelf: 'flex-start' }}>Back to Invoices</Button>
    {invoiceId ? <Alert severity="info">Invoice reference: {invoiceId}. Detailed evidence will be connected in the Invoice details checkpoint.</Alert> : <Alert severity="warning">The Invoice reference is missing.</Alert>}
  </PageLayout>;
}
