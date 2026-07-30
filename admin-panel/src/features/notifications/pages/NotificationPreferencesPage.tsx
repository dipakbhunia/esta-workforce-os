import { Alert, Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FormActions } from '@/components/form-actions';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { getMyNotificationPreferences, updateMyNotificationPreferences } from '../services/notifications-api';
import type { NotificationPreference } from '../types/notification.types';

const fallbackPreference: NotificationPreference = {
  inAppEnabled: true,
  emailEnabled: true,
  criticalAlerts: true,
  warningAlerts: true,
  infoAlerts: true,
  alertOpened: true,
  alertResolved: false,
  quietHoursStart: '',
  quietHoursEnd: '',
  timezone: '',
};

export default function NotificationPreferencesPage() {
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({ queryKey: ['notification-preferences', 'me'], queryFn: () => getMyNotificationPreferences().then((response) => response.data) });
  const [form, setForm] = useState<NotificationPreference>(fallbackPreference);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (preferencesQuery.data) setForm({ ...fallbackPreference, ...preferencesQuery.data });
  }, [preferencesQuery.data]);

  const updateMutation = useMutation({
    mutationFn: updateMyNotificationPreferences,
    onSuccess: async (response) => {
      setForm({ ...fallbackPreference, ...response.data });
      setToast('Notification preferences saved.');
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });

  function setBool(key: keyof NotificationPreference, value: boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  if (preferencesQuery.isLoading) return <PageLayout><LoadingSkeleton rows={8} /></PageLayout>;

  return (
    <PageLayout>
      <PageHeader title="Notification Settings" description="Choose how monitoring alert lifecycle notifications reach you. Critical alerts may bypass quiet hours." breadcrumbs={['Admin', 'Alerts & Notifications', 'Notification Preferences']} />
      {toast && <Alert severity="success" onClose={() => setToast(null)}>{toast}</Alert>}
      {preferencesQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void preferencesQuery.refetch()}>Retry</Button>}>Unable to load notification preferences.</Alert>}
      <Box component="form" onSubmit={(event) => { event.preventDefault(); updateMutation.mutate(form); }}>
        <SectionCard title="In-App Notifications" description="In-app notifications power the header badge, drawer, and Notification Center.">
          <FormControlLabel control={<Switch checked={form.inAppEnabled} onChange={(event) => setBool('inAppEnabled', event.target.checked)} />} label="Enable in-app notifications" />
        </SectionCard>
        <SectionCard title="Email Notifications" description="Email uses the backend SMTP foundation. SMTP credentials are never shown here.">
          <Stack gap={1.5}>
            <FormControlLabel control={<Switch checked={form.emailEnabled} onChange={(event) => setBool('emailEnabled', event.target.checked)} />} label="Enable email notifications" />
            <Typography variant="body2" color="text.secondary">By default, critical opened alerts can send email. Warning and info emails stay off unless enabled by preference and policy.</Typography>
          </Stack>
        </SectionCard>
        <SectionCard title="Severity Preferences" description="Choose which alert severities can create notifications.">
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <FormControlLabel control={<Switch checked={form.criticalAlerts} onChange={(event) => setBool('criticalAlerts', event.target.checked)} />} label="Critical alerts" />
            <FormControlLabel control={<Switch checked={form.warningAlerts} onChange={(event) => setBool('warningAlerts', event.target.checked)} />} label="Warning alerts" />
            <FormControlLabel control={<Switch checked={form.infoAlerts} onChange={(event) => setBool('infoAlerts', event.target.checked)} />} label="Info alerts" />
          </Stack>
        </SectionCard>
        <SectionCard title="Lifecycle Preferences" description="Reading notifications does not acknowledge or resolve the underlying alert.">
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <FormControlLabel control={<Switch checked={form.alertOpened} onChange={(event) => setBool('alertOpened', event.target.checked)} />} label="Alert opened/reopened" />
            <FormControlLabel control={<Switch checked={form.alertResolved} onChange={(event) => setBool('alertResolved', event.target.checked)} />} label="Alert resolved" />
          </Stack>
        </SectionCard>
        <SectionCard title="Quiet Hours" description="Non-critical email can be delayed during quiet hours. In-app notifications are still created immediately.">
          <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <TextField label="Quiet hours start" type="time" value={form.quietHoursStart ?? ''} onChange={(event) => setForm((current) => ({ ...current, quietHoursStart: event.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Quiet hours end" type="time" value={form.quietHoursEnd ?? ''} onChange={(event) => setForm((current) => ({ ...current, quietHoursEnd: event.target.value }))} InputLabelProps={{ shrink: true }} />
            <TextField label="Timezone" value={form.timezone ?? ''} placeholder="Company fallback" onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))} sx={{ minWidth: 220 }} />
          </Stack>
        </SectionCard>
        <Stack direction="row" justifyContent="flex-start" sx={{ mt: 2 }}><Button variant="outlined" onClick={() => setForm({ ...fallbackPreference, ...preferencesQuery.data })} disabled={updateMutation.isPending}>Reset</Button></Stack>
        <FormActions cancelTo="/settings" submitLabel="Save preferences" loading={updateMutation.isPending} />
      </Box>
    </PageLayout>
  );
}
