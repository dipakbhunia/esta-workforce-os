import { Card, CardContent, Stack, Typography } from '@mui/material';
import { DataGrid, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import { SearchBox } from '@/components/search-box';

export function DataTable({ title, rows, columns, searchPlaceholder = 'Search records' }: { title: string; rows: GridRowsProp; columns: GridColDef[]; searchPlaceholder?: string }) {
  return (
    <Card sx={{ overflow: 'hidden' }}>
      <CardContent sx={{ pb: 1.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Typography variant="h4">{title}</Typography>
          <SearchBox placeholder={searchPlaceholder} />
        </Stack>
      </CardContent>
      <DataGrid
        autoHeight
        rows={rows}
        columns={columns}
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 10 } }, density: 'compact' }}
        disableRowSelectionOnClick
        sx={{
          border: 0,
          '& .MuiDataGrid-columnHeaders': { position: 'sticky', top: 0, zIndex: 1, bgcolor: '#F9FAFB' },
          '& .MuiDataGrid-row:hover': { bgcolor: '#F8FAFC' },
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': { outline: 'none' },
        }}
      />
    </Card>
  );
}
