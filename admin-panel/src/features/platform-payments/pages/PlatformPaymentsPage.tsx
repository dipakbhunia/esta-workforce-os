import { Alert } from '@mui/material';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';

export default function PlatformPaymentsPage() {
  return <PageLayout>
    <PageHeader title="Payments" description="Read-only operational payment history for the SaaS platform." breadcrumbs={['Admin', 'Billing', 'Payments']} />
    <Alert severity="info">The operational payment register will be introduced in the next reviewed checkpoint.</Alert>
  </PageLayout>;
}
