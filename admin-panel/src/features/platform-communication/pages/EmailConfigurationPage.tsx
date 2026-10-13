import { Alert, Box, Button, MenuItem, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip, type StatusTone } from '@/components/status-chip';
import {
  createSmtpConfigurationDraft,
  getSmtpConfiguration,
  listSmtpConfigurationVersions,
  platformCommunicationKeys,
  runSmtpConfigurationAction,
  selectSmtpConfiguration,
  toggleDatabaseSmtp,
  updateSmtpConfigurationDraft,
} from '../platform-communication-api';
import type { SmtpConfigurationDraftPayload, SmtpConfigurationVersion, SmtpSecurityMode } from '../platform-communication.types';

type FormValue = Omit<SmtpConfigurationDraftPayload, 'port'> & { port: string };
type ConfirmAction = { kind: 'activate' | 'rollback'; version: SmtpConfigurationVersion } | { kind: 'enable' | 'disable' };
const emptyForm: FormValue = { host: '', port: '587', securityMode: 'STARTTLS', username: '', password: '', senderEmail: '', senderDisplayName: '' };

export default function EmailConfigurationPage() {
  const client = useQueryClient();
  const [editing, setEditing] = useState<SmtpConfigurationVersion | null>(null);
  const [form, setForm] = useState<FormValue>(emptyForm);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const configuration = useQuery({ queryKey: platformCommunicationKeys.configuration, queryFn: getSmtpConfiguration });
  const history = useQuery({ queryKey: platformCommunicationKeys.configurationVersions, queryFn: listSmtpConfigurationVersions });
  const settings = configuration.data?.data.settings;
  const versions = history.data?.data.data ?? [];

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: platformCommunicationKeys.configuration }),
      client.invalidateQueries({ queryKey: platformCommunicationKeys.configurationVersions }),
    ]);
  };

  const save = useMutation({
    mutationFn: async () => {
      const error = validateForm(form, Boolean(editing));
      if (error) throw new Error(error);
      const base = { host: form.host.trim(), port: Number(form.port), securityMode: form.securityMode, username: form.username.trim(), senderEmail: form.senderEmail.trim().toLowerCase(), senderDisplayName: form.senderDisplayName.trim() };
      if (!editing) return createSmtpConfigurationDraft({ ...base, password: form.password });
      return updateSmtpConfigurationDraft(editing.id, { ...base, ...(form.password ? { password: form.password } : {}), revision: editing.revision });
    },
    onSuccess: async ({ data }) => {
      setEditing(data); setForm(toForm(data)); setNotice(`Version ${data.version} saved. Password input was cleared and will not be redisplayed.`); setFormError(''); await refresh();
    },
    onError: (error) => setFormError(safeError(error, 'SMTP configuration could not be saved.')),
  });

  const action = useMutation({
    mutationFn: async ({ version, name }: { version: SmtpConfigurationVersion; name: 'validate' | 'test-connection' | 'test-email' }) => runSmtpConfigurationAction(version.id, name, version.revision),
    onSuccess: async (_, input) => { setNotice(actionSuccess(input.name)); await refresh(); },
    onError: (error) => setNotice(safeError(error, 'The SMTP action could not be completed.')),
  });

  const authority = useMutation({
    mutationFn: async (value: ConfirmAction) => {
      if (!settings) throw new Error('SMTP settings are unavailable.');
      if (value.kind === 'activate' || value.kind === 'rollback') return selectSmtpConfiguration(value.version.id, value.kind, settings.revision, value.version.revision);
      return toggleDatabaseSmtp(value.kind, settings.revision);
    },
    onSuccess: async (_, value) => { setConfirm(null); setNotice(authoritySuccess(value)); await refresh(); },
    onError: (error) => { setConfirm(null); setNotice(safeError(error, 'SMTP authority was not changed.')); },
  });

  const startCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); };
  const startEdit = (version: SmtpConfigurationVersion) => { setEditing(version); setForm(toForm(version)); setFormError(''); };
  const update = <K extends keyof FormValue>(key: K, value: FormValue[K]) => setForm(current => ({ ...current, [key]: value }));
  const loading = configuration.isLoading || history.isLoading;
  const failed = configuration.isError || history.isError;
  const busy = save.isPending || action.isPending || authority.isPending;

  return <PageLayout>
    <PageHeader title="Email Configuration" description="Manage versioned platform SMTP configuration without exposing stored credentials." breadcrumbs={['Admin', 'Platform Communication', 'Email Configuration']} primaryAction={<Button variant="contained" onClick={startCreate} disabled={busy}>New draft</Button>} />
    <Alert severity="warning"><strong>Deployment control:</strong> activation, rollback, enable, and disable are accepted only when the server-side management gate is enabled. This UI cannot inspect or bypass that gate.</Alert>
    {failed ? <Alert severity="error" action={<Button onClick={() => { void configuration.refetch(); void history.refetch(); }}>Retry</Button>}>Email configuration could not be loaded.</Alert> : null}
    {loading ? <LoadingSkeleton rows={5} /> : !failed && settings ? <>
      <SectionCard title="Current SMTP authority" description="Authoritative server state; environment fallback ends permanently after first database activation.">
        <Box sx={summaryGrid}>
          <Summary label="Authority" value={settings.databaseAuthorityEstablishedAt ? 'Database' : 'Environment (pre-cutover)'} />
          <Summary label="Database delivery" value={settings.enabled ? 'Enabled' : 'Disabled'} />
          <Summary label="Active version" value={activeVersionLabel(settings.activeConfigurationVersionId, versions)} />
          <Summary label="Settings revision" value={String(settings.revision)} />
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ mt: 2 }}>
          {settings.enabled ? <Button color="warning" variant="outlined" disabled={busy || !settings.databaseAuthorityEstablishedAt} onClick={() => setConfirm({ kind: 'disable' })}>Disable database SMTP</Button> : <Button variant="outlined" disabled={busy || !settings.activeConfigurationVersionId} onClick={() => setConfirm({ kind: 'enable' })}>Enable database SMTP</Button>}
        </Stack>
      </SectionCard>

      <SectionCard title={editing ? `Edit version ${editing.version}` : 'Create SMTP draft'} description={editing ? 'Leaving password blank retains the stored write-only secret. Saving resets validation and test evidence.' : 'A password is required for every new draft and is never returned by the API.'}>
        <Box sx={formGrid}>
          <TextField required label="SMTP host" value={form.host} onChange={e => update('host', e.target.value)} inputProps={{ maxLength: 253 }} />
          <TextField required type="number" label="Port" value={form.port} onChange={e => update('port', e.target.value)} inputProps={{ min: 1, max: 65535 }} />
          <TextField required select label="Security mode" value={form.securityMode} onChange={e => update('securityMode', e.target.value as SmtpSecurityMode)}><MenuItem value="PLAIN">Plain (policy restricted)</MenuItem><MenuItem value="STARTTLS">STARTTLS</MenuItem><MenuItem value="TLS">Implicit TLS</MenuItem></TextField>
          <TextField required label="Authentication username" value={form.username} onChange={e => update('username', e.target.value)} inputProps={{ maxLength: 320 }} />
          <TextField required={!editing} type="password" label={editing ? 'New SMTP password (optional)' : 'SMTP password'} value={form.password} onChange={e => update('password', e.target.value)} autoComplete="new-password" helperText={editing ? 'Leave blank to retain the existing secret.' : 'Write-only; minimum 8 characters.'} inputProps={{ maxLength: 4096 }} />
          <TextField required type="email" label="Sender email" value={form.senderEmail} onChange={e => update('senderEmail', e.target.value)} inputProps={{ maxLength: 320 }} />
          <TextField required label="Sender display name" value={form.senderDisplayName} onChange={e => update('senderDisplayName', e.target.value)} inputProps={{ maxLength: 160 }} />
        </Box>
        {formError ? <Alert severity="error" sx={{ mt: 2 }}>{formError}</Alert> : null}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1} sx={{ mt: 2 }}><Button onClick={startCreate} disabled={busy}>Clear</Button><Button variant="contained" onClick={() => save.mutate()} disabled={busy}>{save.isPending ? 'Saving…' : editing ? 'Save revision' : 'Create draft'}</Button></Stack>
      </SectionCard>

      <SectionCard title="Configuration version history" description="Newest first. Lifecycle actions always use the displayed server revision.">
        {!versions.length ? <Alert severity="info">No SMTP configuration versions exist. Create a draft to begin.</Alert> : <Stack gap={1.5}>{versions.map(version => <VersionCard key={version.id} version={version} active={settings.activeConfigurationVersionId === version.id} busy={busy} onEdit={startEdit} onAction={(name) => action.mutate({ version, name })} onAuthority={(kind) => setConfirm({ kind, version })} />)}</Stack>}
      </SectionCard>
    </> : null}
    <ConfirmDialog open={Boolean(confirm)} title={confirmTitle(confirm)} description={confirmDescription(confirm, settings?.databaseAuthorityEstablishedAt ?? null)} descriptionId="smtp-authority-confirmation" confirmLabel={confirmLabel(confirm)} loading={authority.isPending} onClose={() => setConfirm(null)} onConfirm={() => confirm && authority.mutate(confirm)} />
    <Snackbar open={Boolean(notice)} autoHideDuration={7000} onClose={() => setNotice('')} message={notice} />
  </PageLayout>;
}

function VersionCard({ version, active, busy, onEdit, onAction, onAuthority }: { version: SmtpConfigurationVersion; active: boolean; busy: boolean; onEdit: (value: SmtpConfigurationVersion) => void; onAction: (name: 'validate' | 'test-connection' | 'test-email') => void; onAuthority: (name: 'activate' | 'rollback') => void }) {
  const editable = !version.firstActivatedAt && version.lifecycle !== 'REVOKED';
  const canValidate = version.lifecycle === 'DRAFT';
  const canTest = version.lifecycle === 'VALIDATED';
  const canEmail = version.lifecycle === 'TESTED' && version.connectionTestSucceeded;
  const eligible = canEmail && Boolean(version.restrictedTestEmailSentAt);
  return <Box sx={{ border: '1px solid', borderColor: active ? 'primary.main' : 'divider', borderRadius: 2, p: { xs: 1.5, md: 2 }, minWidth: 0 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5}>
      <Box sx={{ minWidth: 0 }}><Stack direction="row" gap={1} flexWrap="wrap" alignItems="center"><Typography variant="h5">Version {version.version}</Typography><StatusChip label={version.lifecycle} tone={tone(version.lifecycle)} />{active ? <StatusChip label="Active" tone="success" /> : null}</Stack><Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{version.host}:{version.port} · {version.securityMode} · {version.senderEmail}</Typography><Typography variant="caption" color="text.secondary">Revision {version.revision} · Password configured · Restricted test email {version.restrictedTestEmailSentAt ? 'accepted' : 'pending'}</Typography></Box>
      <Stack direction="row" gap={1} flexWrap="wrap" alignContent="flex-start">
        <Button size="small" variant="outlined" disabled={busy || !editable} onClick={() => onEdit(version)}>Edit</Button>
        <Button size="small" disabled={busy || !canValidate} onClick={() => onAction('validate')}>Validate</Button>
        <Button size="small" disabled={busy || !canTest} onClick={() => onAction('test-connection')}>Test connection</Button>
        <Button size="small" disabled={busy || !canEmail} onClick={() => onAction('test-email')}>Send restricted test email</Button>
        {version.firstActivatedAt ? <Button size="small" color="warning" disabled={busy || active || !eligible} onClick={() => onAuthority('rollback')}>Rollback</Button> : <Button size="small" variant="contained" disabled={busy || active || !eligible} onClick={() => onAuthority('activate')}>Activate</Button>}
      </Stack>
    </Stack>
  </Box>;
}

function Summary({ label, value }: { label: string; value: string }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography></Box>; }
function toForm(value: SmtpConfigurationVersion): FormValue { return { host: value.host, port: String(value.port), securityMode: value.securityMode, username: value.username, password: '', senderEmail: value.senderEmail, senderDisplayName: value.senderDisplayName }; }
function validateForm(value: FormValue, editing: boolean) { const port = Number(value.port); if (!value.host.trim() || !value.username.trim() || !value.senderEmail.trim() || !value.senderDisplayName.trim()) return 'Complete all required SMTP fields.'; if (!Number.isInteger(port) || port < 1 || port > 65535) return 'Port must be a whole number from 1 to 65535.'; if (!editing && value.password.length < 8) return 'SMTP password must contain at least 8 characters.'; if (editing && value.password && value.password.length < 8) return 'A replacement SMTP password must contain at least 8 characters.'; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.senderEmail.trim())) return 'Enter a valid sender email.'; return ''; }
function safeError(error: unknown, fallback: string) { if (error instanceof Error && !axios.isAxiosError(error)) return error.message; if (!axios.isAxiosError(error)) return fallback; if (error.response?.status === 409) return 'The configuration changed on the server. Refresh and retry with the latest revision.'; if (error.response?.status === 503) return 'The server deployment-readiness gate blocked SMTP authority management. No authority state was changed.'; if (error.response?.status === 429) return 'This action is temporarily rate limited. Wait before trying again.'; const message = (error.response?.data as { message?: string | string[] })?.message; return Array.isArray(message) ? message.join(', ') : message || fallback; }
function tone(value: SmtpConfigurationVersion['lifecycle']): StatusTone { return value === 'ACTIVE' ? 'success' : value === 'REVOKED' ? 'danger' : value === 'TESTED' ? 'info' : value === 'VALIDATED' ? 'warning' : 'neutral'; }
function activeVersionLabel(id: string | null, versions: SmtpConfigurationVersion[]) { if (!id) return 'None'; return `Version ${versions.find(item => item.id === id)?.version ?? 'unknown'}`; }
function actionSuccess(value: string) { return value === 'validate' ? 'Configuration validated.' : value === 'test-connection' ? 'Connection test completed. Authoritative state refreshed.' : 'Restricted test email accepted by the configured provider.'; }
function authoritySuccess(value: ConfirmAction) { return value.kind === 'activate' ? `Version ${value.version.version} activated.` : value.kind === 'rollback' ? `Rolled back to version ${value.version.version}.` : value.kind === 'disable' ? 'Database SMTP disabled; email claims remain paused.' : 'Database SMTP enabled.'; }
function confirmTitle(value: ConfirmAction | null) { if (!value) return 'Confirm SMTP authority change'; if (value.kind === 'activate') return `Activate version ${value.version.version}?`; if (value.kind === 'rollback') return `Roll back to version ${value.version.version}?`; return value.kind === 'disable' ? 'Disable database SMTP?' : 'Enable database SMTP?'; }
function confirmLabel(value: ConfirmAction | null) { if (!value) return 'Confirm'; return value.kind === 'activate' ? 'Activate' : value.kind === 'rollback' ? 'Roll back' : value.kind === 'disable' ? 'Disable' : 'Enable'; }
function confirmDescription(value: ConfirmAction | null, authorityAt: string | null) { if (!value) return ''; if (value.kind === 'activate') return authorityAt ? 'This changes the active database SMTP version. The backend will revalidate eligibility and revision authority.' : 'First activation permanently establishes database SMTP authority. Environment fallback will no longer be permitted. The backend will revalidate all evidence.'; if (value.kind === 'rollback') return 'This selects a previously activated, currently eligible version. There is no environment fallback.'; if (value.kind === 'disable') return 'Email delivery claims will pause without consuming attempts. Existing configuration and queued deliveries are preserved.'; return 'Email delivery claims may resume using the active database configuration. The backend revalidates current authority.'; }
const formGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 } as const;
const summaryGrid = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 2 } as const;
