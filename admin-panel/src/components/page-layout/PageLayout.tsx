import { Stack } from '@mui/material';
import type { ReactNode } from 'react';

export function PageLayout({ children }: { children: ReactNode }) {
  return (
    <Stack
      gap={3}
      sx={{
        width: '100%',
        maxWidth: '1680px',
        mx: 'auto',
      }}
    >
      {children}
    </Stack>
  );
}
