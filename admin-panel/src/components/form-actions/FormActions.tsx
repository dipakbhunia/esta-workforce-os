import { Box, Button, Stack } from '@mui/material';
import { Save } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

export function FormActions({ cancelTo = '..', submitLabel = 'Save draft', loading = false }: { cancelTo?: string; submitLabel?: string; loading?: boolean }) {
  return (
    <Box sx={{ position: 'sticky', bottom: 0, zIndex: 5, mt: 3, py: 2, px: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 -8px 24px rgba(17,24,39,0.05)' }}>
      <Stack direction="row" justifyContent="flex-end" gap={1}>
        <Button component={RouterLink} to={cancelTo} variant="outlined" disabled={loading}>Cancel</Button>
        <Button type="submit" variant="contained" startIcon={<Save size={18} />} disabled={loading}>{loading ? 'Saving...' : submitLabel}</Button>
      </Stack>
    </Box>
  );
}
