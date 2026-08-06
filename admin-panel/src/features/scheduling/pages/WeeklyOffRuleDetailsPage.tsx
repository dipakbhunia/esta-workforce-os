import { Alert, Box, Button, Chip, Snackbar, Stack, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarDays, CalendarOff, Edit3, Info, Layers3, Power, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { deleteWeeklyOffRule, getWeeklyOffRule, updateWeeklyOffRule } from '../services/weekly-off-rules-api';
import type { WeeklyOffRule } from '../types/weekly-off-rule.types';
import { employeeName, formatDate, formatDateTime, previewText, ruleModeLabel, ruleScope, scopeLabel, statusLabel, weeklyOffDefaults, weeklyPatternLabel } from '../utils/weekly-off-rule-utils';

interface LocationState { success?: string }

export default function WeeklyOffRuleDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const [toggleTarget, setToggleTarget] = useState<WeeklyOffRule | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WeeklyOffRule | null>(null);
  const ruleQuery = useQuery({ queryKey: ['weekly-off-rule', id], queryFn: () => getWeeklyOffRule(id!), enabled: Boolean(id) });

  useEffect(() => { const success = (location.state as LocationState | null)?.success; if (success) setToast(success); }, [location.state]);

  const toggleMutation = useMutation({
    mutationFn: (rule: WeeklyOffRule) => updateWeeklyOffRule(rule.id, { enabled: !rule.enabled }),
    onSuccess: async (_, rule) => {
      setToggleTarget(null);
      setToast(rule.enabled ? 'Weekly off rule disabled.' : 'Weekly off rule enabled.');
      await queryClient.invalidateQueries({ queryKey: ['weekly-off-rule', id] });
      await queryClient.invalidateQueries({ queryKey: ['weekly-off-rules'] });
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (rule: WeeklyOffRule) => deleteWeeklyOffRule(rule.id),
    onSuccess: async () => {
      setArchiveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['weekly-off-rules'] });
      navigate('/scheduling/weekly-off-rules', { replace: true, state: { success: 'Weekly off rule archived.' } });
    },
  });

  if (ruleQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (ruleQuery.isError || !ruleQuery.data) return <Alert severity="error">Weekly off rule could not be loaded.</Alert>;

  const rule = ruleQuery.data.data;
  const preview = previewText(weeklyOffDefaults(rule), { branch: rule.branch?.name ?? undefined, department: rule.department?.name ?? undefined, employee: employeeName(rule.employee) });

  return (
    <PageLayout>
      <PageHeader title="Weekly Off Rule Details" description="Review rule scope, precedence, effective range, and update metadata." breadcrumbs={['Admin', 'Scheduling', 'Weekly Off Rules', 'Details']} />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="flex-end">
        <Button component={RouterLink} to={`/scheduling/weekly-off-rules/${rule.id}/edit`} variant="contained" startIcon={<Edit3 size={18} />}>Edit Rule</Button>
        <Button variant="outlined" startIcon={<Power size={18} />} onClick={() => setToggleTarget(rule)}>{rule.enabled ? 'Disable' : 'Enable'}</Button>
        <Button variant="outlined" color="error" startIcon={<Archive size={18} />} onClick={() => setArchiveTarget(rule)}>Archive</Button>
      </Stack>

      <SectionCard title="Rule Summary" description="The saved rule shown in the same style as the form preview." action={<Info size={20} aria-hidden />}>
        <Box sx={previewGrid}>
          <SummaryTile icon={<CalendarOff size={18} />} label="Pattern" value={preview.pattern} />
          <SummaryTile icon={<Layers3 size={18} />} label="Scope" value={preview.scope} />
          <SummaryTile icon={<CalendarDays size={18} />} label="Effective" value={preview.effective} />
          <SummaryTile icon={<ShieldCheck size={18} />} label="Status" value={statusLabel(rule.enabled)} chipTone={rule.enabled ? 'success' : 'neutral'} />
          <SummaryTile icon={<SlidersHorizontal size={18} />} label="Priority" value={String(rule.priority)} />
          <SummaryTile icon={<Info size={18} />} label="Mode" value={ruleModeLabel()} />
        </Box>
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2 }}>
          <Chip label="More specific rules take precedence" size="small" />
          <Chip label="Lower priority number wins" size="small" />
        </Stack>
      </SectionCard>

      <SectionCard title="Organization Scope" description="Where this rule applies.">
        <Box sx={detailGrid}>
          <Detail label="Scope Type" value={scopeTitle(ruleScope(rule))} />
          <Detail label="Scope" value={scopeLabel(rule)} />
          <Detail label="Branch" value={rule.branch?.name ?? rule.employee?.branch?.name ?? 'Not configured'} />
          <Detail label="Department" value={rule.department?.name ?? rule.employee?.department?.name ?? 'Not configured'} />
          <Detail label="Employee" value={employeeName(rule.employee)} />
          <Detail label="Precedence" value={'Employee \u2192 Department \u2192 Branch \u2192 Company'} />
        </Box>
      </SectionCard>

      <SectionCard title="Configuration" description="Fixed weekly pattern and effective work-date range.">
        <Box sx={detailGrid}>
          <Detail label="Weekly Pattern" value={weeklyPatternLabel(rule.weekdays)} />
          <Detail label="Effective From" value={formatDate(rule.effectiveFrom)} />
          <Detail label="Effective To" value={formatDate(rule.effectiveTo)} />
          <Detail label="Timezone" value={rule.timezone} />
        </Box>
      </SectionCard>

      <SectionCard title="Notes" description="Product guidance for this rule.">
        <Alert severity="info">Supported now: fixed weekdays, including every Saturday. Advanced Saturday rotations are planned for Rotation Patterns.</Alert>
      </SectionCard>

      <SectionCard title="Updated Metadata" description="Created and updated metadata from the scheduling service.">
        <Box sx={detailGrid}>
          <Detail label="Created" value={formatDateTime(rule.createdAt)} />
          <Detail label="Updated" value={formatDateTime(rule.updatedAt)} />
          <Detail label="Created By" value={userLabel(rule.createdBy)} />
          <Detail label="Updated By" value={userLabel(rule.updatedBy)} />
        </Box>
      </SectionCard>

      <ConfirmDialog open={Boolean(toggleTarget)} title={toggleTarget?.enabled ? 'Disable Weekly Off Rule' : 'Enable Weekly Off Rule'} description={toggleTarget?.enabled ? 'The rule stops applying to future work-calendar resolution. Existing attendance snapshots remain unchanged.' : 'The rule may begin applying according to its effective dates and priority.'} confirmLabel={toggleTarget?.enabled ? 'Disable Rule' : 'Enable Rule'} loading={toggleMutation.isPending} onClose={() => setToggleTarget(null)} onConfirm={() => toggleTarget && toggleMutation.mutate(toggleTarget)} />
      <ConfirmDialog open={Boolean(archiveTarget)} title="Archive Weekly Off Rule" description="This soft-removes the rule from future resolution. Existing attendance snapshots remain unchanged." confirmLabel="Archive Rule" loading={archiveMutation.isPending} onClose={() => setArchiveTarget(null)} onConfirm={() => archiveTarget && archiveMutation.mutate(archiveTarget)} />
      <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert> : undefined}</Snackbar>
    </PageLayout>
  );
}

function SummaryTile({ icon, label, value, chipTone }: { icon: React.ReactNode; label: string; value: string; chipTone?: 'success' | 'neutral' }) {
  return (
    <Box sx={summaryTileSx}>
      <Stack direction="row" gap={1} alignItems="center" color="text.secondary">
        {icon}
        <Typography variant="caption">{label}</Typography>
      </Stack>
      {chipTone ? <StatusChip label={value} tone={chipTone} /> : <Typography fontWeight={850}>{value}</Typography>}
    </Box>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={850}>{value}</Typography></Box>;
}

function userLabel(user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!user) return 'Not available';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'Not available';
}

function scopeTitle(scope: string) {
  if (scope === 'COMPANY') return 'Entire Company';
  if (scope === 'BRANCH') return 'Branch';
  if (scope === 'DEPARTMENT') return 'Department';
  return 'Employee';
}

const previewGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 };
const detailGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 };
const summaryTileSx = { p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.default', minWidth: 0 };