import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import { DataGrid, type DataGridProps, type GridColDef, type GridRowsProp } from '@mui/x-data-grid';
import type { ReactNode } from 'react';
import { SearchBox } from '@/components/search-box';

interface DataTableProps {
  title: string;
  rows: GridRowsProp;
  columns: GridColDef[];
  searchPlaceholder?: string;
  toolbar?: ReactNode;
  showSearch?: boolean;
  gridProps?: Partial<DataGridProps>;
}

export function DataTable({ title, rows, columns, searchPlaceholder = 'Search records', toolbar, showSearch = true, gridProps }: DataTableProps) {
  return (
    <Card sx={{ overflow: 'hidden', width: '100%', maxWidth: '100%', minWidth: 0 }}>
      <CardContent sx={{ pb: 1.5, minWidth: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ minWidth: 0 }}>
          <Typography variant="h4">{title}</Typography>
          {toolbar ?? (showSearch ? <SearchBox placeholder={searchPlaceholder} /> : null)}
        </Stack>
      </CardContent>
      <Box sx={{ width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
        <DataGrid
          autoHeight
          rows={rows}
          columns={columns}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } }, density: 'compact' }}
          disableRowSelectionOnClick
          sx={{
            width: '100%',
            minWidth: 0,
            border: 0,
            '& .MuiDataGrid-columnHeaders': { position: 'sticky', top: 0, zIndex: 1, bgcolor: '#F9FAFB' },
            '& .MuiDataGrid-main, & .MuiDataGrid-virtualScroller, & .MuiDataGrid-footerContainer': { minWidth: 0 },
            '& .MuiDataGrid-row:hover': { bgcolor: '#F8FAFC' },
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-columnHeader:focus': { outline: 'none' },
          }}
          {...gridProps}
        />
      </Box>
    </Card>
  );
}
