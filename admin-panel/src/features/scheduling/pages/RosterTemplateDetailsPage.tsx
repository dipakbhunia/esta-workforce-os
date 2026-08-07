import { Alert, Box, Button, Card, CardContent, Snackbar, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CalendarCheck, Edit3, Power, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, Navigate, useLocation, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout/PageLayout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { RosterTemplateApplyDialog } from '../components/RosterTemplateApplyDialog';
import { deleteRosterTemplate, getRosterTemplate, previewRosterTemplate, updateRosterTemplate } from '../services/roster-templates-api';
import type { RosterPreviewResponse } from '../types/roster-template.types';
import { dayTypeLabel, dayTypeTone, formatDateTime, statusLabel, statusTone, templateScopeLabel, templateWeekdays } from '../utils/roster-template-utils';

export default function RosterTemplateDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [toggleOpen, setToggleOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [preview, setPreview] = useState<RosterPreviewResponse | null>(null);
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(location.state?.success ? { severity: 'success', message: location.state.success } : null);

  const templateQuery = useQuery({ queryKey: ['roster-template', id], queryFn: () => getRosterTemplate(id!), enabled: Boolean(id) });
  const template = templateQuery.data?.data;
  const previewMutation = useMutation({ mutationFn: () => previewRosterTemplate(id!, { dateFrom: nextMonday(), dateTo: addDays(nextMonday(), 27) }), onSuccess: (response) => { setPreview(response.data); setToast({ severity: response.data.valid ? 'success' : 'error', message: response.data.valid ? 'Template preview passed.' : `Preview found ${response.data.errors.length} blocking issue(s).` }); }, onError: () => setToast({ severity: 'error', message: 'Template preview failed.' }) });
  const toggleMutation = useMutation({ mutationFn: () => updateRosterTemplate(id!, { enabled: !template?.enabled }), onSuccess: async () => { setToggleOpen(false); setToast({ severity: 'success', message: template?.enabled ? 'Roster template disabled.' : 'Roster template enabled.' }); await invalidate(); }, onError: () => setToast({ severity: 'error', message: 'Template status could not be changed.' }) });
  const archiveMutation = useMutation({ mutationFn: () => deleteRosterTemplate(id!), onSuccess: async () => { setArchiveOpen(false); setToast({ severity: 'success', message: 'Roster template archived.' }); await queryClient.invalidateQueries({ queryKey: ['roster-templates'] }); }, onError: () => setToast({ severity: 'error', message: 'Template could not be archived.' }) });
  const invalidate = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['roster-template', id] }), queryClient.invalidateQueries({ queryKey: ['roster-templates'] })]); };

  const days = useMemo(() => templateWeekdays.map((weekday) => ({ weekday, day: template?.days?.find((item) => item.dayOfWeek === weekday.dayOfWeek) })), [template?.days]);
  const workingCount = days.filter((item) => item.day?.dayType === 'WORKING').length;
  const weeklyOffCount = days.filter((item) => item.day?.dayType === 'WEEKLY_OFF').length;
  const noShiftCount = days.filter((item) => item.day?.dayType === 'NO_SHIFT').length;

  if (!id) return <Navigate to="/scheduling/roster-templates" replace />;
  if (templateQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (templateQuery.isError || !template) return <PageLayout><Alert severity="error">Roster template could not be loaded.</Alert></PageLayout>;

  return <PageLayout><PageHeader title={template.name} description="Review the reusable weekly pattern and apply it to draft rosters." breadcrumbs={['Admin', 'Scheduling', 'Roster Templates', template.name]} />
    <Stack direction={{ xs: 'column', lg: 'row' }} gap={2} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between"><Stack direction="row" gap={1} flexWrap="wrap"><StatusChip label={statusLabel(template.enabled)} tone={statusTone(template.enabled)} /><StatusChip label={`${template.code} / v${template.version}`} tone="neutral" /><StatusChip label={templateScopeLabel(template)} tone="info" /><StatusChip label={template.timezone} tone="neutral" /></Stack><Stack direction="row" gap={1} flexWrap="wrap"><Button variant="outlined" startIcon={<ShieldCheck size={17} />} onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>Preview</Button><Button variant="contained" startIcon={<CalendarCheck size={17} />} onClick={() => setApplyOpen(true)} disabled={!template.enabled}>Apply Template</Button><Button component={RouterLink} to={`/scheduling/roster-templates/${id}/edit`} variant="outlined" startIcon={<Edit3 size={17} />}>Edit</Button><Button variant="outlined" startIcon={<Power size={17} />} onClick={() => setToggleOpen(true)}>{template.enabled ? 'Disable' : 'Enable'}</Button><Button variant="outlined" color="error" startIcon={<Archive size={17} />} onClick={() => setArchiveOpen(true)}>Archive</Button></Stack></Stack>
    <Stack direction={{ xs: 'column', md: 'row' }} gap={2}><InfoCard title="Working Days" value={String(workingCount)} /><InfoCard title="Weekly Off" value={String(weeklyOffCount)} /><InfoCard title="No Shift" value={String(noShiftCount)} /><InfoCard title="Updated" value={formatDateTime(template.updatedAt)} /></Stack>
    <SectionCard title="Weekly Pattern" description="Apply this pattern when preparing draft rosters. Existing rosters stay unchanged until you apply it."><Box sx={patternGrid}>{days.map(({ weekday, day }) => <Box key={weekday.dayOfWeek} sx={dayCardSx}><Typography fontWeight={900}>{weekday.label}</Typography><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mt: 1 }}><StatusChip label={day ? dayTypeLabel(day.dayType) : 'Missing'} tone={day ? dayTypeTone(day.dayType) : 'danger'} />{day?.dayType === 'WORKING' ? <StatusChip label={day.shift?.name ?? day.shiftName ?? 'Shift unavailable'} tone="neutral" /> : null}</Stack><Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>{day?.notes || (day?.dayType === 'WORKING' ? `${day.shiftStartTime ?? day.shift?.startTime ?? '--'}-${day.shiftEndTime ?? day.shift?.endTime ?? '--'}` : 'No shift required')}</Typography></Box>)}</Box></SectionCard>
    <SectionCard title="Preview" description="Validation preview for the next four-week planning window.">{preview ? <Stack gap={1}><StatusChip label={preview.valid ? 'Preview Passed' : 'Preview Failed'} tone={preview.valid ? 'success' : 'danger'} />{[...preview.errors, ...preview.warnings, ...(preview.info ?? [])].map((issue, index) => <Alert key={`${issue.path}-${index}`} severity={preview.errors.includes(issue) ? 'error' : preview.warnings.includes(issue) ? 'warning' : 'info'}>{issue.path}: {issue.message}</Alert>)}</Stack> : <Typography color="text.secondary">Run preview to check this template against a sample date range.</Typography>}</SectionCard>
    <RosterTemplateApplyDialog open={applyOpen} template={template} onClose={() => setApplyOpen(false)} onApplied={() => setToast({ severity: 'success', message: 'Template applied to draft roster.' })} />
    <ConfirmDialog open={toggleOpen} title={template.enabled ? 'Disable Roster Template' : 'Enable Roster Template'} description={template.enabled ? 'Disabled templates cannot be applied to draft rosters.' : 'Enabled templates can be applied to draft rosters.'} confirmLabel={template.enabled ? 'Disable Template' : 'Enable Template'} loading={toggleMutation.isPending} onClose={() => setToggleOpen(false)} onConfirm={() => toggleMutation.mutate()} />
    <ConfirmDialog open={archiveOpen} title="Archive Roster Template" description="This removes the template from future roster planning. Existing roster days remain unchanged." confirmLabel="Archive Template" loading={archiveMutation.isPending} onClose={() => setArchiveOpen(false)} onConfirm={() => archiveMutation.mutate()} />
    <Snackbar open={Boolean(toast)} autoHideDuration={5000} onClose={() => setToast(null)}>{toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}</Snackbar>
  </PageLayout>;
}

function InfoCard({ title, value }: { title: string; value: string }) { return <Card variant="outlined" sx={{ flex: 1 }}><CardContent><Typography variant="caption" color="text.secondary">{title}</Typography><Typography variant="h4" sx={{ mt: 0.5 }}>{value}</Typography></CardContent></Card>; }
function nextMonday() { const date = new Date(); const diff = date.getDay() === 0 ? 1 : 8 - date.getDay(); date.setDate(date.getDate() + diff); return inputDate(date); }
function addDays(input: string, days: number) { const date = new Date(`${input}T00:00:00`); date.setDate(date.getDate() + days); return inputDate(date); }
function inputDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
const patternGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 };
const dayCardSx = { p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2.5, bgcolor: 'background.paper', minWidth: 0 };
