import { Alert, Box, Button, CircularProgress, Divider, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import {
  getCompanyOnboardingReadiness,
  InvalidCompanyOnboardingReadinessResponseError,
  UnsupportedCompanyOnboardingReadinessContractError,
} from '../services/companies-api';
import type { CompanyOnboardingReadinessStatus } from '../types/company.types';

export const companyOnboardingReadinessQueryKey = (companyId: string) => ['company', companyId, 'onboarding-readiness'] as const;

export function CompanyOnboardingReadinessPanel({ companyId }: { companyId: string }) {
  const readinessQuery = useQuery({
    queryKey: companyOnboardingReadinessQueryKey(companyId),
    queryFn: () => getCompanyOnboardingReadiness(companyId),
    retry: false,
  });
  const readiness = readinessQuery.data?.data;

  if (readinessQuery.isLoading) {
    return <Box aria-busy="true" aria-label="Loading Company onboarding readiness"><LoadingSkeleton rows={4} /></Box>;
  }

  if (!readiness) {
    const message = readinessErrorMessage(readinessQuery.error);
    return (
      <SectionCard title="Company Onboarding Readiness" description="Server-evaluated administrative readiness and follow-up requirements.">
        <Alert severity="error" role="alert" action={<Button color="inherit" onClick={() => void readinessQuery.refetch()}>Retry</Button>}>
          {message}
        </Alert>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Company Onboarding Readiness"
      description="Administrative readiness is authoritative; optional commercial, billing, operational, and profile follow-ups remain separate."
      action={
        <Button
          variant="outlined"
          size="small"
          startIcon={readinessQuery.isFetching ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
          disabled={readinessQuery.isFetching}
          onClick={() => void readinessQuery.refetch()}
        >
          {readinessQuery.isFetching ? 'Refreshing' : 'Refresh'}
        </Button>
      }
    >
      <Stack gap={2} aria-live="polite" aria-busy={readinessQuery.isFetching}>
        {readinessQuery.isError ? (
          <Alert
            severity="warning"
            role="alert"
            action={<Button color="inherit" onClick={() => void readinessQuery.refetch()}>Retry refresh</Button>}
          >
            The latest readiness refresh failed. Displaying data from the previous successful evaluation.
          </Alert>
        ) : null}
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between">
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography fontWeight={800}>Overall administrative status</Typography>
            <StatusChip label={statusLabel(readiness.overallStatus)} tone={statusTone(readiness.overallStatus)} />
            <StatusChip
              label={`${readiness.blockingCount} blocking ${readiness.blockingCount === 1 ? 'issue' : 'issues'}`}
              tone={readiness.blockingCount > 0 ? 'danger' : 'success'}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Evaluated {formatEvaluationTime(readiness.evaluatedAt)}
          </Typography>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {readiness.items.map((item) => {
            const safeRoute = item.remediation && safeRemediationRoute(item.remediation.route);
            return (
              <Box key={item.id} component="article" sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: { xs: 1.5, sm: 2 }, minWidth: 0 }}>
                <Stack gap={1} height="100%">
                  <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ sm: 'flex-start' }}>
                    <Box minWidth={0}>
                      <Typography component="h5" variant="subtitle1" fontWeight={800}>{item.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{categoryLabel(item.category)}</Typography>
                    </Box>
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                      <StatusChip label={item.blocking ? 'Required' : 'Optional follow-up'} tone={item.blocking ? 'info' : 'neutral'} />
                      <StatusChip label={statusLabel(item.status)} tone={statusTone(item.status)} />
                    </Stack>
                  </Stack>
                  <Divider />
                  <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{item.explanation}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Reason: {item.reasonCode}</Typography>
                  {safeRoute ? (
                    <Box mt="auto" pt={0.5}>
                      <Button component={RouterLink} to={safeRoute} size="small" variant="text">{item.remediation!.label}</Button>
                    </Box>
                  ) : null}
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Stack>
    </SectionCard>
  );
}

function safeRemediationRoute(route: string): string | null {
  if (!route.startsWith('/') || route.startsWith('//') || route.includes('\\')) return null;
  try {
    const parsed = new URL(route, 'https://esta.invalid');
    if (parsed.origin !== 'https://esta.invalid') return null;
    if (!/^\/organization\/companies(?:\/[^/?#]+(?:\/edit)?)?\/?$/.test(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function readinessErrorMessage(error: unknown) {
  if (error instanceof UnsupportedCompanyOnboardingReadinessContractError) return 'This readiness contract version is not supported. No readiness result is shown.';
  if (error instanceof InvalidCompanyOnboardingReadinessResponseError) return 'The readiness response was empty or invalid. No readiness result is shown.';
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 403) return 'You do not have permission to view Company onboarding readiness.';
    if (error.response?.status === 404) return 'Company onboarding readiness is unavailable because the Company was not found or has been archived.';
    if (error.response?.status === 401) return 'Your session could not be authorized. Sign in again if the session refresh does not complete.';
  }
  return 'Company onboarding readiness could not be loaded. Try again.';
}

function statusLabel(status: CompanyOnboardingReadinessStatus) {
  return status.split('_').map((part) => part[0] + part.slice(1).toLowerCase()).join(' ');
}

function statusTone(status: CompanyOnboardingReadinessStatus): StatusTone {
  if (status === 'READY') return 'success';
  if (status === 'BLOCKED') return 'danger';
  if (status === 'INCOMPLETE') return 'warning';
  if (status === 'UNAVAILABLE') return 'danger';
  return 'neutral';
}

function categoryLabel(category: string) {
  return category[0] + category.slice(1).toLowerCase();
}

function formatEvaluationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'at an unavailable time' : date.toLocaleString();
}
