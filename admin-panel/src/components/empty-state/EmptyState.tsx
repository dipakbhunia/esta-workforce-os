import { Box, Button, Typography } from '@mui/material';
import { Inbox } from 'lucide-react';

export function EmptyState({ title = 'No records found', description = 'Try changing filters or create a new record.', actionLabel }: { title?: string; description?: string; actionLabel?: string }) {
  return (
    <Box sx={{ py: 7, px: 2, textAlign: 'center' }}>
      <Box sx={{ mx: 'auto', mb: 2, width: 48, height: 48, borderRadius: '14px', bgcolor: '#EEF2FF', color: 'primary.main', display: 'grid', placeItems: 'center' }}>
        <Inbox size={24} />
      </Box>
      <Typography variant="h4">{title}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.75 }}>{description}</Typography>
      {actionLabel && <Button sx={{ mt: 2 }} variant="outlined">{actionLabel}</Button>}
    </Box>
  );
}
