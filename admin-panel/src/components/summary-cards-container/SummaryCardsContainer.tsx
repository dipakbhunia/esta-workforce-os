import { Box } from '@mui/material';
import type { ReactNode } from 'react';

export function SummaryCardsContainer({ children, minCardWidth = 210 }: { children: ReactNode; minCardWidth?: number }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr',
          sm: `repeat(2, minmax(0, 1fr))`,
          lg: `repeat(auto-fit, minmax(${minCardWidth}px, 1fr))`,
        },
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}
