import { Alert } from '@mui/material';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';

export default function PlatformInvoicesPage() {
  return <PageLayout>
    <PageHeader title="Invoices" description="Review authoritative subscription Invoice records." breadcrumbs={['Admin', 'Billing', 'Invoices']} />
    <Alert severity="info">Invoice records are available. Operational list controls will be connected in the next Invoice Admin UX checkpoint.</Alert>
  </PageLayout>;
}
