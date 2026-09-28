import { Breadcrumbs, Typography } from '@mui/material';
import { ChevronRight } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';

export type AppBreadcrumbItem = string | { label: string; to?: string };

interface AppBreadcrumbProps {
  items: AppBreadcrumbItem[];
}

export function AppBreadcrumb({ items }: AppBreadcrumbProps) {
  return (
    <Breadcrumbs separator={<ChevronRight size={14} />} sx={{ color: 'text.secondary' }}>
      {items.map((item, index) => {
        const label = typeof item === 'string' ? item : item.label;
        const to = typeof item === 'string' ? undefined : item.to;
        const current = index === items.length - 1;
        return to && !current ? (
          <Typography key={`${label}-${index}`} component={RouterLink} to={to} variant="caption" color="text.secondary" fontWeight={500}>{label}</Typography>
        ) : (
          <Typography key={`${label}-${index}`} variant="caption" color={current ? 'text.primary' : 'text.secondary'} fontWeight={current ? 800 : 500} aria-current={current ? 'page' : undefined}>{label}</Typography>
        );
      })}
    </Breadcrumbs>
  );
}
