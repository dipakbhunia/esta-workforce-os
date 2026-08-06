import { Alert, Stack, Typography } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import { SectionCard } from '@/components/section-card';
import type { RosterPreviewResponse, RosterValidationIssue } from '../types/shift-roster.types';

export function RosterPreviewPanel({ preview, loading }: { preview?: RosterPreviewResponse | null; loading?: boolean }) {
  if (!preview) {
    return <SectionCard title="Validation" description="Run preview to validate roster readiness before publishing."><EmptyState title="No validation run yet" description="Preview will show roster validation results without publishing." /></SectionCard>;
  }

  const info = preview.info ?? [];
  const hasIssues = preview.errors.length > 0 || preview.warnings.length > 0 || info.length > 0;

  return (
    <SectionCard title="Validation" description={preview.valid ? 'Roster is ready to publish.' : 'Resolve blocking errors before publishing.'}>
      <Stack gap={2} aria-busy={loading}>
        {!hasIssues ? (
          <Alert severity="success">
            <Typography fontWeight={800}>Roster validation passed</Typography>
            <Typography variant="body2">No blocking errors or warnings were found.</Typography>
          </Alert>
        ) : null}
        {preview.errors.length ? <IssueList title="Errors" severity="error" issues={preview.errors} /> : null}
        {preview.warnings.length ? <IssueList title="Warnings" severity="warning" issues={preview.warnings} /> : null}
        {info.length ? <IssueList title="Information" severity="info" issues={info} /> : null}
      </Stack>
    </SectionCard>
  );
}

function IssueList({ title, severity, issues }: { title: string; severity: 'error' | 'warning' | 'info'; issues: RosterValidationIssue[] }) {
  return (
    <Stack gap={1}>
      <Typography variant="h4">{title}</Typography>
      {issues.map((issue, index) => (
        <Alert key={`${issue.path}-${index}`} severity={severity}>
          <Typography fontWeight={800}>{issue.path}</Typography>
          <Typography variant="body2">{issue.message}</Typography>
        </Alert>
      ))}
    </Stack>
  );
}
