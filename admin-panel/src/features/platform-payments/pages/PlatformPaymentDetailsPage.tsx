import { Alert, Button } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';

export default function PlatformPaymentDetailsPage() {
  const { id } = useParams();
  return <PageLayout>
    <PageHeader title="Payment Details" description="Read-only operational payment record." breadcrumbs={['Admin', 'Billing', 'Payments', 'Details']} />
    <Alert severity="info">Payment details for reference {id ?? 'unknown'} will be introduced in a later reviewed checkpoint.</Alert>
    <Button component={Link} to="/billing/payments" variant="outlined">Back to Payments</Button>
  </PageLayout>;
}
