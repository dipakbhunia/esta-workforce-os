import { Button, Card, CardContent, Stack } from '@mui/material';
import { SlidersHorizontal } from 'lucide-react';
import { DataTable } from '@/components/data-table';
import { EmptyState } from '@/components/empty-state';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/search-box';
import { entityColumns, entityRows } from '@/utils/dummy-data';

interface EntityListPageProps {
  title: string;
  description: string;
  entity: string;
  createPath?: string;
}

export default function EntityListPage({ title, description, entity, createPath = 'create' }: EntityListPageProps) {
  const rows = entityRows(entity);
  return (
    <Stack gap={3}>
      <PageHeader title={title} description={description} breadcrumbs={['Admin', title]} primaryActionLabel={`Add ${entity}`} primaryActionTo={createPath} />
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} justifyContent="space-between">
            <SearchBox placeholder={`Search ${title.toLowerCase()}`} />
            <Button variant="outlined" startIcon={<SlidersHorizontal size={18} />}>Filters</Button>
          </Stack>
        </CardContent>
      </Card>
      {rows.length ? <DataTable title={`${title} Directory`} rows={rows} columns={entityColumns(entity)} /> : <EmptyState />}
    </Stack>
  );
}
