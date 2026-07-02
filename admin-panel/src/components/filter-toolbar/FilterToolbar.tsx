import { Box, Card, CardContent, Stack } from '@mui/material';
import type { ReactNode } from 'react';

export function FilterToolbar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  return (
    <Card>
      <CardContent sx={{ py: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          gap={1.25}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                xl: 'repeat(auto-fit, minmax(170px, max-content))',
              },
              gap: 1.25,
              alignItems: 'center',
              flex: 1,
              minWidth: 0,
            }}
          >
            {children}
          </Box>
          {actions && <ToolbarActions>{actions}</ToolbarActions>}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function ToolbarActions({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      gap={1}
      alignItems={{ xs: 'stretch', sm: 'center' }}
      justifyContent="flex-end"
      sx={{
        '& .MuiButton-root': {
          minHeight: 40,
          whiteSpace: 'nowrap',
        },
      }}
    >
      {children}
    </Stack>
  );
}
