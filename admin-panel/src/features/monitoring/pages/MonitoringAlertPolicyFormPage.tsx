import { Alert, Box, Button, Checkbox, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { createMonitoringAlertPolicy, getMonitoringAlertPolicy, updateMonitoringAlertPolicy } from '../services/monitoring-api';
import type { AlertTypePolicySetting, MonitoringAlertPolicyPayload, MonitoringAlertPolicyScope, MonitoringAlertSeverity, MonitoringAlertType } from '../types/monitoring.types';

const alertTypes: Array<{ type: MonitoringAlertType; label: string; threshold: boolean }> = [
  { type: 'DEVICE_OFFLINE', label: 'Device Offline', threshold: true },
  { type: 'MISSING_HEARTBEAT', label: 'Missing Heartbeat', threshold: true },
  { type: 'MONITORING_DISABLED', label: 'Monitoring Disabled', threshold: false },
  { type: 'DEVICE_REVOKED', label: 'Device Revoked', threshold: false },
  { type: 'REREGISTRATION_REQUIRED', label: 'Re-registration Required', threshold: false },
  { type: 'EXCESSIVE_IDLE', label: 'Excessive Idle', threshold: true },
  { type: 'SCREENSHOT_MISSING', label: 'Screenshot Missing', threshold: true },
];

const defaults: Record<MonitoringAlertType, AlertTypePolicySetting> = {
  DEVICE_OFFLINE: { enabled: true, severity: 'WARNING', thresholdMinutes: 10, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: true, autoResolve: true },
  MISSING_HEARTBEAT: { enabled: true, severity: 'CRITICAL', thresholdMinutes: 20, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: true, autoResolve: true },
  MONITORING_DISABLED: { enabled: true, severity: 'WARNING', thresholdMinutes: 0, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: false, autoResolve: true },
  DEVICE_REVOKED: { enabled: true, severity: 'CRITICAL', thresholdMinutes: 0, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: false, autoResolve: true },
  REREGISTRATION_REQUIRED: { enabled: true, severity: 'CRITICAL', thresholdMinutes: 0, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: false, autoResolve: true },
  EXCESSIVE_IDLE: { enabled: true, severity: 'WARNING', thresholdMinutes: 30, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: true, autoResolve: true },
  SCREENSHOT_MISSING: { enabled: true, severity: 'WARNING', thresholdMinutes: 30, gracePeriodMinutes: 0, workingHoursOnly: false, weekendEnabled: true, maintenanceIgnore: true, autoResolve: true },
};

function emptyPayload(): MonitoringAlertPolicyPayload {
  return { name: '', description: '', enabled: true, priority: 100, scope: 'COMPANY', settings: defaults };
}

export default function MonitoringAlertPolicyFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<MonitoringAlertPolicyPayload>(emptyPayload());
  const [error, setError] = useState<string | null>(null);

  const policyQuery = useQuery({
    queryKey: ['monitoring-alert-policy', id],
    queryFn: () => getMonitoringAlertPolicy(id ?? '').then((response) => response.data),
    enabled: isEdit,
  });

  useMemo(() => {
    if (!policyQuery.data) return;
    setForm({
      name: policyQuery.data.name,
      description: policyQuery.data.description ?? '',
      enabled: policyQuery.data.enabled,
      priority: policyQuery.data.priority,
      scope: policyQuery.data.scope,
      companyId: policyQuery.data.companyId ?? undefined,
      branchId: policyQuery.data.branchId ?? undefined,
      departmentId: policyQuery.data.departmentId ?? undefined,
      employeeId: policyQuery.data.employeeId ?? undefined,
      settings: { ...defaults, ...policyQuery.data.settings },
      maintenanceStart: policyQuery.data.maintenanceStart?.slice(0, 16),
      maintenanceEnd: policyQuery.data.maintenanceEnd?.slice(0, 16),
      maintenanceReason: policyQuery.data.maintenanceReason ?? '',
    });
  }, [policyQuery.data]);

  const mutation = useMutation({
    mutationFn: (payload: MonitoringAlertPolicyPayload) => isEdit ? updateMonitoringAlertPolicy(id ?? '', payload) : createMonitoringAlertPolicy(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitoring-alert-policies'] });
      navigate('/monitoring/alert-policies');
    },
    onError: () => setError('Unable to save alert policy. Check required scope IDs and settings.'),
  });

  function updateSetting(type: MonitoringAlertType, patch: Partial<AlertTypePolicySetting>) {
    setForm((current) => ({ ...current, settings: { ...current.settings, [type]: { ...defaults[type], ...(current.settings[type] ?? {}), ...patch } } }));
  }

  function save() {
    setError(null);
    if (!form.name.trim()) { setError('Policy name is required.'); return; }
    mutation.mutate({ ...form, name: form.name.trim(), description: form.description?.trim() || undefined });
  }

  if (isEdit && policyQuery.isLoading) return <PageLayout><LoadingSkeleton rows={10} /></PageLayout>;

  return (
    <PageLayout>
      <Button component={RouterLink} to="/monitoring/alert-policies" startIcon={<ArrowLeft size={17} />} sx={{ alignSelf: 'flex-start' }}>Back to Policies</Button>
      <PageHeader title={isEdit ? 'Edit Alert Policy' : 'Create Alert Policy'} description="Define thresholds and scoped overrides for monitoring alert detection." breadcrumbs={['Admin', 'Monitoring', 'Alert Policies', isEdit ? 'Edit' : 'Create']} />
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <SectionCard title="General" description="Name, status, priority, and policy scope.">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Policy Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          <TextField label="Priority" type="number" value={form.priority ?? 100} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} />
          <TextField select label="Scope" value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as MonitoringAlertPolicyScope })}>
            {['SYSTEM', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'EMPLOYEE'].map((scope) => <MenuItem key={scope} value={scope}>{scope}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Checkbox checked={form.enabled ?? true} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />} label="Policy enabled" />
          <TextField label="Description" value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} multiline minRows={2} sx={{ gridColumn: { md: '1 / -1' } }} />
        </Box>
      </SectionCard>

      <SectionCard title="Scope References" description="Use IDs from company, branch, department, or employee records. Only the matching field is used for the selected scope.">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Company ID" value={form.companyId ?? ''} onChange={(event) => setForm({ ...form, companyId: event.target.value || undefined })} helperText="Required for company and lower scopes unless your tenant is implicit." />
          <TextField label="Branch ID" value={form.branchId ?? ''} onChange={(event) => setForm({ ...form, branchId: event.target.value || undefined })} />
          <TextField label="Department ID" value={form.departmentId ?? ''} onChange={(event) => setForm({ ...form, departmentId: event.target.value || undefined })} />
          <TextField label="Employee ID" value={form.employeeId ?? ''} onChange={(event) => setForm({ ...form, employeeId: event.target.value || undefined })} />
        </Box>
      </SectionCard>

      <SectionCard title="Thresholds" description="Per-alert enablement, severity, thresholds, grace period, and auto-resolve behavior.">
        <Stack spacing={2}>
          {alertTypes.map(({ type, label, threshold }) => {
            const setting = { ...defaults[type], ...(form.settings[type] ?? {}) };
            return (
              <Box key={type} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 0.8fr 0.8fr 0.8fr 1fr' }, gap: 1.5, alignItems: 'center', p: 1.5, border: '1px solid #E5E7EB', borderRadius: 3 }}>
                <FormControlLabel control={<Checkbox checked={setting.enabled ?? true} onChange={(event) => updateSetting(type, { enabled: event.target.checked })} />} label={<Typography fontWeight={800}>{label}</Typography>} />
                <TextField select label="Severity" size="small" value={setting.severity ?? 'WARNING'} onChange={(event) => updateSetting(type, { severity: event.target.value as MonitoringAlertSeverity })}>
                  {['INFO', 'WARNING', 'CRITICAL'].map((severity) => <MenuItem key={severity} value={severity}>{severity}</MenuItem>)}
                </TextField>
                <TextField label="Threshold min" size="small" type="number" disabled={!threshold} value={setting.thresholdMinutes ?? 0} onChange={(event) => updateSetting(type, { thresholdMinutes: Number(event.target.value) })} />
                <TextField label="Grace min" size="small" type="number" value={setting.gracePeriodMinutes ?? 0} onChange={(event) => updateSetting(type, { gracePeriodMinutes: Number(event.target.value) })} />
                <FormControlLabel control={<Checkbox checked={setting.autoResolve ?? true} onChange={(event) => updateSetting(type, { autoResolve: event.target.checked })} />} label="Auto resolve" />
              </Box>
            );
          })}
        </Stack>
      </SectionCard>

      <SectionCard title="Working Hours & Suppression" description="Foundation controls. Shift-aware enforcement can expand here without redesigning attendance.">
        <Typography color="text.secondary">Working hours only, weekend behavior, maintenance suppression, and revoked-device cascading are stored per alert type. Revoked devices suppress offline, heartbeat, screenshot, and idle alerts automatically.</Typography>
      </SectionCard>

      <SectionCard title="Maintenance" description="Suppress non-critical monitoring alerts during planned maintenance windows.">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          <TextField label="Maintenance Start" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.maintenanceStart ?? ''} onChange={(event) => setForm({ ...form, maintenanceStart: event.target.value || undefined })} />
          <TextField label="Maintenance End" type="datetime-local" InputLabelProps={{ shrink: true }} value={form.maintenanceEnd ?? ''} onChange={(event) => setForm({ ...form, maintenanceEnd: event.target.value || undefined })} />
          <TextField label="Reason" value={form.maintenanceReason ?? ''} onChange={(event) => setForm({ ...form, maintenanceReason: event.target.value })} sx={{ gridColumn: { md: '1 / -1' } }} />
        </Box>
      </SectionCard>

      <Box sx={{ position: 'sticky', bottom: 0, zIndex: 5, mt: 3, py: 2, px: 2, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 -8px 24px rgba(17,24,39,0.05)' }}>
        <Stack direction="row" justifyContent="flex-end" gap={1}>
          <Button variant="outlined" onClick={() => navigate('/monitoring/alert-policies')} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="contained" startIcon={<Save size={18} />} onClick={save} disabled={mutation.isPending}>{mutation.isPending ? 'Saving...' : 'Save Policy'}</Button>
        </Stack>
      </Box>
    </PageLayout>
  );
}
