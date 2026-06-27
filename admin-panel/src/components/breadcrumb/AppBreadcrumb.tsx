import { Breadcrumbs, Typography } from '@mui/material';
import { ChevronRight } from 'lucide-react';

interface AppBreadcrumbProps {
  items: string[];
}

export function AppBreadcrumb({ items }: AppBreadcrumbProps) {
  return (
    <Breadcrumbs separator={<ChevronRight size={14} />} sx={{ color: 'text.secondary' }}>
      {items.map((item, index) => (
        <Typography key={`${item}-${index}`} variant="caption" color={index === items.length - 1 ? 'text.primary' : 'text.secondary'} fontWeight={index === items.length - 1 ? 800 : 500}>
          {item}
        </Typography>
      ))}
    </Breadcrumbs>
  );
}
