import { Box, Button, Stack, Typography } from '@mui/material';
import { Plus } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { AppBreadcrumb } from '@/components/breadcrumb';

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: string[];
  primaryActionLabel?: string;
  primaryActionTo?: string;
}

export function PageHeader({ title, description, breadcrumbs = ['Admin'], primaryActionLabel, primaryActionTo }: PageHeaderProps) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
      <Box>
        <Box sx={{ mb: 1 }}>
          <AppBreadcrumb items={breadcrumbs} />
        </Box>
        <Typography variant="h2">{title}</Typography>
        {description && <Typography color="text.secondary" sx={{ mt: 0.75, maxWidth: 720 }}>{description}</Typography>}
      </Box>
      {primaryActionLabel && primaryActionTo && (
        <Button component={RouterLink} to={primaryActionTo} variant="contained" startIcon={<Plus size={18} />}>
          {primaryActionLabel}
        </Button>
      )}
    </Stack>
  );
}
