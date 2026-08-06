import {
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';

export interface EnterpriseActiveFilter {
  key: string;
  label: string;
  value: string;
  onRemove?: () => void;
}

export interface EnterpriseFilterCardProps {
  title: string;
  description?: string;
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  activeFilters?: EnterpriseActiveFilter[];
  summary?: ReactNode;
  advancedFilters?: ReactNode;
  advancedOpen?: boolean;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * Reusable enterprise filter surface for list pages.
 * Keep business rules in feature pages; this component owns only layout,
 * hierarchy, responsive spacing, and accessibility affordances.
 */
export function EnterpriseFilterCard({
  title,
  description,
  search,
  filters,
  actions,
  activeFilters = [],
  summary,
  advancedFilters,
  advancedOpen = false,
  loading = false,
  disabled = false,
}: EnterpriseFilterCardProps) {
  const hasActiveFilters = activeFilters.length > 0;
  const hasFooter = Boolean(summary) || hasActiveFilters;

  return (
    <Card
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.05)',
        opacity: disabled ? 0.72 : 1,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
      }}
      aria-busy={loading}
    >
      <CardContent sx={{ p: { xs: 2, md: 2.5 }, minWidth: 0, '&:last-child': { pb: { xs: 1.75, md: 2.25 } } }}>
        <Stack gap={1.75} sx={{ minWidth: 0 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', md: 'flex-start' }}
            gap={1.5}
          >
            <Stack direction="row" gap={1.25} alignItems="flex-start" minWidth={0}>
              <Box
                sx={{
                  display: { xs: 'none', sm: 'grid' },
                  placeItems: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 2,
                  bgcolor: 'primary.50',
                  color: 'primary.main',
                }}
                aria-hidden
              >
                <SlidersHorizontal size={18} />
              </Box>
              <Box minWidth={0}>
                <Typography component="h2" variant="h4">
                  {title}
                </Typography>
                {description ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
                    {description}
                  </Typography>
                ) : null}
              </Box>
            </Stack>
            {actions ? <EnterpriseFilterActions>{actions}</EnterpriseFilterActions> : null}
          </Stack>

          {search ? <Box sx={{ minWidth: 0 }}>{search}</Box> : null}
          {filters ? <EnterpriseFilterGrid>{filters}</EnterpriseFilterGrid> : null}

          {advancedFilters ? (
            <Collapse in={advancedOpen} timeout={180} unmountOnExit>
              <EnterpriseFilterGrid>{advancedFilters}</EnterpriseFilterGrid>
            </Collapse>
          ) : null}

          {hasActiveFilters ? <EnterpriseActiveFilters filters={activeFilters} /> : null}

          {hasFooter ? (
            <>
              <Divider />
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                gap={0.75}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
              >
                {summary ? (
                  <Typography variant="body2" color="text.secondary">
                    {summary}
                  </Typography>
                ) : <span />}
                {hasActiveFilters ? (
                  <Typography variant="caption" color="text.secondary">
                    {activeFilters.length} {activeFilters.length === 1 ? 'filter' : 'filters'} applied
                  </Typography>
                ) : null}
              </Stack>
            </>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function EnterpriseFilterGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'grid',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(4, minmax(180px, 1fr))',
        },
        gap: 1.25,
        alignItems: 'center',
        '& .MuiInputBase-root': { minHeight: 42 },
      }}
    >
      {children}
    </Box>
  );
}

export function EnterpriseFilterActions({ children }: { children: ReactNode }) {
  return (
    <Stack
      direction="row"
      gap={1}
      flexWrap="wrap"
      justifyContent={{ xs: 'flex-start', md: 'flex-end' }}
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

export function EnterpriseActiveFilters({ filters }: { filters: EnterpriseActiveFilter[] }) {
  if (!filters.length) return null;

  return (
    <Stack direction="row" gap={0.75} flexWrap="wrap" aria-label="Active filters">
      {filters.map((filter) => (
        <Chip
          key={filter.key}
          size="small"
          variant="outlined"
          label={`${filter.label}: ${filter.value}`}
          onDelete={filter.onRemove}
          deleteIcon={filter.onRemove ? (
            <Tooltip title={`Remove ${filter.label} filter`}>
              <X size={14} />
            </Tooltip>
          ) : undefined}
          sx={{
            borderRadius: 999,
            bgcolor: 'background.paper',
            '& .MuiChip-label': { px: 1 },
          }}
        />
      ))}
    </Stack>
  );
}

