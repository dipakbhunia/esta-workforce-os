import { Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '60vh', textAlign: 'center' }} gap={2}>
      <Typography variant="h1">404</Typography>
      <Typography color="text.secondary">This admin page does not exist yet.</Typography>
      <Button component={RouterLink} to="/" variant="contained">Back to dashboard</Button>
    </Stack>
  );
}
