import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import {
  createBillingProvider,
  configureBillingProviderCredentials,
  getBillingProviders,
  getBillingSettings,
  runBillingProviderAction,
  updateBillingProvider,
  updateBillingSettings,
  validateBillingProviderCredentials,
} from './billing-settings-api';
import type {
  BillingProviderConfiguration,
  BillingProviderPayload,
  BillingProviderUpdatePayload,
  BillingSettings,
  BillingSettingsPayload,
  InvoiceNumberResetPolicy,
  PaymentProviderMode,
  RenewalMode,
} from './billing-settings.types';

const grid = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
};

interface SettingsFormValue {
  invoicePrefix: string;
  invoiceNumberResetPolicy: InvoiceNumberResetPolicy;
  defaultPaymentTermsDays: string;
  defaultInvoiceNotes: string;
  sellerLegalName: string;
  sellerBillingEmail: string;
  sellerAddressLine1: string;
  sellerAddressLine2: string;
  sellerCity: string;
  sellerState: string;
  sellerStateCode: string;
  sellerPostalCode: string;
  sellerCountry: string;
  gstEnabled: boolean;
  gstin: string;
  gstLegalName: string;
  gstRegisteredState: string;
  gstRegisteredStateCode: string;
  renewalMode: RenewalMode;
  renewalLeadDays: string;
  renewalGracePeriodDays: string;
  renewalReminderDays: string;
}

type ProviderCommand =
  | { kind: 'create'; payload: BillingProviderPayload }
  | { kind: 'update'; id: string; payload: BillingProviderUpdatePayload }
  | { kind: 'action'; id: string; action: 'enable' | 'disable' | 'default' };

export default function BillingSettingsPage() {
  const client = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['billing-settings'],
    queryFn: getBillingSettings,
  });
  const providersQuery = useQuery({
    queryKey: ['billing-settings', 'providers'],
    queryFn: getBillingProviders,
  });
  const [form, setForm] = useState<SettingsFormValue | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    if (settingsQuery.data?.data && !isDirty) {
      setForm(toForm(settingsQuery.data.data));
    }
  }, [isDirty, settingsQuery.data]);

  const settingsMutation = useMutation({
    mutationFn: updateBillingSettings,
    onSuccess: (response) => {
      client.setQueryData(['billing-settings'], response);
      setForm(toForm(response.data));
      setIsDirty(false);
      setSavedMessage('Billing Settings saved.');
      setError(null);
    },
    onError: (reason) => setError(apiError(reason, 'Billing Settings could not be saved.')),
  });

  const providerMutation = useMutation({
    mutationFn: (command: ProviderCommand) => {
      if (command.kind === 'create') return createBillingProvider(command.payload);
      if (command.kind === 'update') return updateBillingProvider(command.id, command.payload);
      return runBillingProviderAction(command.id, command.action);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['billing-settings', 'providers'] });
      setSavedMessage('Payment provider configuration updated.');
      setError(null);
    },
    onError: (reason) => setError(apiError(reason, 'Payment provider configuration could not be updated.')),
  });

  const submitSettings = () => {
    if (!form) return;
    const errors = validateSettings(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError('Review the highlighted Billing Settings fields.');
      return;
    }
    setError(null);
    settingsMutation.mutate(toPayload(form));
  };

  if (settingsQuery.isError) {
    return <PageLayout><Alert severity="error" action={<Button onClick={() => void settingsQuery.refetch()}>Retry</Button>}>Billing Settings could not be loaded.</Alert></PageLayout>;
  }
  if (settingsQuery.isLoading || !form) return <LoadingSkeleton rows={10} />;

  const set = <K extends keyof SettingsFormValue>(key: K, value: SettingsFormValue[K]) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
    setIsDirty(true);
    setFieldErrors((current) => ({ ...current, [key]: '' }));
  };

  return <PageLayout>
    <PageHeader title="Billing Settings" description="Configure platform invoice, legal, GST, renewal-policy, and non-secret payment-provider defaults." breadcrumbs={['Admin', 'Billing', 'Billing Settings']} />
    {error ? <Alert severity="error" onClose={() => setError(null)}>{error}</Alert> : null}

    <SectionCard title="Invoice Settings" description="Defaults for future invoices. Number sequence generation is not implemented in B1.">
      <Box sx={grid}>
        <TextField required label="Invoice prefix" value={form.invoicePrefix} onChange={(event) => set('invoicePrefix', event.target.value.toUpperCase())} error={Boolean(fieldErrors.invoicePrefix)} helperText={fieldErrors.invoicePrefix || 'Uppercase letters, numbers, underscore, slash, or hyphen; maximum 20 characters.'} inputProps={{ maxLength: 20 }} />
        <TextField select label="Number reset policy" value={form.invoiceNumberResetPolicy} onChange={(event) => set('invoiceNumberResetPolicy', event.target.value as InvoiceNumberResetPolicy)} helperText="Stored policy only; no sequence is generated yet.">
          <MenuItem value="NEVER">Never reset</MenuItem>
          <MenuItem value="CALENDAR_YEAR">Calendar year</MenuItem>
          <MenuItem value="FINANCIAL_YEAR">Financial year</MenuItem>
        </TextField>
        <TextField required type="number" label="Default payment terms (days)" value={form.defaultPaymentTermsDays} onChange={(event) => set('defaultPaymentTermsDays', event.target.value)} error={Boolean(fieldErrors.defaultPaymentTermsDays)} helperText={fieldErrors.defaultPaymentTermsDays || 'Allowed range: 0–365 days.'} inputProps={{ min: 0, max: 365, step: 1 }} />
        <TextField label="Default invoice notes" value={form.defaultInvoiceNotes} onChange={(event) => set('defaultInvoiceNotes', event.target.value)} multiline minRows={3} inputProps={{ maxLength: 2000 }} helperText="Optional text to snapshot into future invoices." />
      </Box>
    </SectionCard>

    <SectionCard title="Seller / Legal Identity" description="Platform seller details. Future invoices must snapshot these values when issued.">
      <Box sx={grid}>
        <TextField label="Legal / business name" value={form.sellerLegalName} onChange={(event) => set('sellerLegalName', event.target.value)} inputProps={{ maxLength: 160 }} />
        <TextField type="email" label="Billing email" value={form.sellerBillingEmail} onChange={(event) => set('sellerBillingEmail', event.target.value)} error={Boolean(fieldErrors.sellerBillingEmail)} helperText={fieldErrors.sellerBillingEmail} inputProps={{ maxLength: 254 }} />
        <TextField label="Address line 1" value={form.sellerAddressLine1} onChange={(event) => set('sellerAddressLine1', event.target.value)} inputProps={{ maxLength: 240 }} />
        <TextField label="Address line 2" value={form.sellerAddressLine2} onChange={(event) => set('sellerAddressLine2', event.target.value)} inputProps={{ maxLength: 240 }} />
        <TextField label="City" value={form.sellerCity} onChange={(event) => set('sellerCity', event.target.value)} inputProps={{ maxLength: 100 }} />
        <TextField label="State" value={form.sellerState} onChange={(event) => set('sellerState', event.target.value)} inputProps={{ maxLength: 100 }} />
        <TextField label="State code" value={form.sellerStateCode} onChange={(event) => set('sellerStateCode', event.target.value.toUpperCase())} error={Boolean(fieldErrors.sellerStateCode)} helperText={fieldErrors.sellerStateCode} inputProps={{ maxLength: 10 }} />
        <TextField label="Postal code" value={form.sellerPostalCode} onChange={(event) => set('sellerPostalCode', event.target.value)} inputProps={{ maxLength: 20 }} />
        <TextField label="Country" value={form.sellerCountry} onChange={(event) => set('sellerCountry', event.target.value)} inputProps={{ maxLength: 80 }} />
      </Box>
    </SectionCard>

    <SectionCard title="GST Settings" description="Conservative registration metadata only; GST invoice generation is not implemented in B1.">
      <Stack gap={2}>
        <FormControlLabel control={<Switch checked={form.gstEnabled} onChange={(_, checked) => set('gstEnabled', checked)} />} label="Enable GST configuration" />
        <Box sx={grid}>
          <TextField required={form.gstEnabled} disabled={!form.gstEnabled} label="GSTIN" value={form.gstin} onChange={(event) => set('gstin', event.target.value.toUpperCase())} error={Boolean(fieldErrors.gstin)} helperText={fieldErrors.gstin || 'Format validation only; tax treatment still requires compliance review.'} inputProps={{ maxLength: 15 }} />
          <TextField required={form.gstEnabled && !form.sellerLegalName.trim()} disabled={!form.gstEnabled} label="GST legal name" value={form.gstLegalName} onChange={(event) => set('gstLegalName', event.target.value)} error={Boolean(fieldErrors.gstLegalName)} helperText={fieldErrors.gstLegalName || 'May use the seller legal name when this is blank.'} inputProps={{ maxLength: 160 }} />
          <TextField disabled={!form.gstEnabled} label="Registered state" value={form.gstRegisteredState} onChange={(event) => set('gstRegisteredState', event.target.value)} inputProps={{ maxLength: 100 }} />
          <TextField disabled={!form.gstEnabled} label="Registered state code" value={form.gstRegisteredStateCode} onChange={(event) => set('gstRegisteredStateCode', event.target.value.toUpperCase())} error={Boolean(fieldErrors.gstRegisteredStateCode)} helperText={fieldErrors.gstRegisteredStateCode} inputProps={{ maxLength: 10 }} />
        </Box>
      </Stack>
    </SectionCard>

    <SectionCard title="Renewal Defaults" description="Policy defaults only. Renewal cycles, invoicing, collection, and subscription transitions are not active in B1.">
      <Stack gap={2}>
        <Alert severity="info">Selecting Automatic records a future policy preference only; it does not schedule renewals or collect payments.</Alert>
        <Box sx={grid}>
          <TextField select label="Renewal mode" value={form.renewalMode} onChange={(event) => set('renewalMode', event.target.value as RenewalMode)}>
            <MenuItem value="MANUAL">Manual</MenuItem>
            <MenuItem value="AUTOMATIC">Automatic policy (execution not implemented)</MenuItem>
          </TextField>
          <TextField required type="number" label="Renewal lead time (days)" value={form.renewalLeadDays} onChange={(event) => set('renewalLeadDays', event.target.value)} error={Boolean(fieldErrors.renewalLeadDays)} helperText={fieldErrors.renewalLeadDays || 'Future orchestration lead time; 0–365.'} inputProps={{ min: 0, max: 365, step: 1 }} />
          <TextField required type="number" label="Grace period (days)" value={form.renewalGracePeriodDays} onChange={(event) => set('renewalGracePeriodDays', event.target.value)} error={Boolean(fieldErrors.renewalGracePeriodDays)} helperText={fieldErrors.renewalGracePeriodDays || 'Policy value only; 0–365.'} inputProps={{ min: 0, max: 365, step: 1 }} />
          <TextField label="Reminder days before renewal" value={form.renewalReminderDays} onChange={(event) => set('renewalReminderDays', event.target.value)} error={Boolean(fieldErrors.renewalReminderDays)} helperText={fieldErrors.renewalReminderDays || 'Comma-separated unique days, for example 30, 7, 1.'} />
        </Box>
      </Stack>
    </SectionCard>

    <Stack direction="row" justifyContent="flex-end">
      <Button variant="contained" startIcon={<Save size={18} />} disabled={settingsMutation.isPending} onClick={submitSettings}>{settingsMutation.isPending ? 'Saving…' : 'Save Billing Settings'}</Button>
    </Stack>

    <SectionCard title="Payment Providers" description="Configured provider runtime supports TEST-mode Razorpay order preparation, checkout signature confirmation, verified webhook payment-truth processing, and activation of eligible subscriptions from CAPTURED payment truth. Credential checks are structural only; connectivity verification, provider payment fetch or polling, active capture operations, Payments management UI, and refunds are not implemented.">
      {providersQuery.isError ? <Alert severity="error" action={<Button onClick={() => void providersQuery.refetch()}>Retry</Button>}>Payment provider configurations could not be loaded.</Alert> : providersQuery.isLoading ? <LoadingSkeleton rows={3} /> : <ProviderSettings providers={providersQuery.data?.data ?? []} busy={providerMutation.isPending} run={(command) => providerMutation.mutate(command)} />}
    </SectionCard>

    <Snackbar open={Boolean(savedMessage)} autoHideDuration={4000} onClose={() => setSavedMessage('')} message={savedMessage} />
  </PageLayout>;
}

function ProviderSettings({ providers, busy, run }: { providers: BillingProviderConfiguration[]; busy: boolean; run: (command: ProviderCommand) => void }) {
  if (!providers.length) return <NewProviderForm busy={busy} run={run} />;
  return <Stack gap={2}>{providers.map((provider) => <ProviderCard key={provider.id} provider={provider} busy={busy} run={run} />)}</Stack>;
}

function NewProviderForm({ busy, run }: { busy: boolean; run: (command: ProviderCommand) => void }) {
  const [mode, setMode] = useState<PaymentProviderMode>('TEST');
  const [displayName, setDisplayName] = useState('Razorpay');
  const [accountReference, setAccountReference] = useState('');
  return <Stack gap={2}>
    <Alert severity="info">Razorpay is the first supported provider type. Creating metadata does not verify credentials or connectivity.</Alert>
    <Box sx={grid}>
      <TextField label="Provider" value="Razorpay" disabled />
      <TextField select label="Mode" value={mode} onChange={(event) => setMode(event.target.value as PaymentProviderMode)}><MenuItem value="TEST">Test</MenuItem><MenuItem value="LIVE">Live</MenuItem></TextField>
      <TextField label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} inputProps={{ maxLength: 120 }} />
      <TextField label="Account/reference metadata" value={accountReference} onChange={(event) => setAccountReference(event.target.value)} helperText="Optional non-secret reference. Never enter credentials or secret keys." inputProps={{ maxLength: 255 }} />
    </Box>
    <Stack direction="row" justifyContent="flex-end"><Button variant="outlined" disabled={busy} onClick={() => run({ kind: 'create', payload: { provider: 'RAZORPAY', mode, displayName: nullable(displayName), accountReference: nullable(accountReference) } })}>Add Provider Configuration</Button></Stack>
  </Stack>;
}

function ProviderCard({ provider, busy, run }: { provider: BillingProviderConfiguration; busy: boolean; run: (command: ProviderCommand) => void }) {
  const [mode, setMode] = useState(provider.mode);
  const [displayName, setDisplayName] = useState(provider.displayName ?? '');
  const [accountReference, setAccountReference] = useState(provider.accountReference ?? '');
  const [credentialOpen, setCredentialOpen] = useState(false);
  useEffect(() => { setMode(provider.mode); setDisplayName(provider.displayName ?? ''); setAccountReference(provider.accountReference ?? ''); }, [provider]);
  return <Stack gap={2} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: { xs: 2, md: 2.5 } }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
      <Box><Typography variant="h5">{provider.displayName || provider.provider}</Typography><Typography variant="body2" color="text.secondary">{provider.provider} · {provider.mode} mode · connectivity not verified</Typography></Box>
      <Stack direction="row" gap={1} flexWrap="wrap"><StatusChip label={provider.enabled ? 'Enabled' : 'Disabled'} tone={provider.enabled ? 'success' : 'neutral'} />{provider.isDefault ? <StatusChip label="Default" tone="info" /> : null}{provider.accountReference ? <StatusChip label="Metadata configured" tone="neutral" /> : null}</Stack>
    </Stack>
    <Box sx={grid}>
      <TextField select label="Mode" value={mode} onChange={(event) => setMode(event.target.value as PaymentProviderMode)}><MenuItem value="TEST">Test</MenuItem><MenuItem value="LIVE">Live</MenuItem></TextField>
      <TextField label="Display name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} inputProps={{ maxLength: 120 }} />
      <TextField label="Account/reference metadata" value={accountReference} onChange={(event) => setAccountReference(event.target.value)} helperText="Non-secret metadata only." inputProps={{ maxLength: 255 }} />
    </Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} sx={{ p: 2, border: '1px solid', borderColor: provider.mode === 'LIVE' ? 'warning.main' : 'info.main', borderRadius: 2 }}>
      <Box><Typography fontWeight={800}>{provider.mode} credentials: {provider.credentialsConfigured ? 'Configured' : 'Not configured'}</Typography><Typography variant="body2" color="text.secondary">{provider.credentialsConfigured ? `Version ${provider.credentialVersion} · fingerprint suffix ${provider.credentialFingerprint ?? 'unavailable'} · updated ${provider.credentialUpdatedAt ? new Date(provider.credentialUpdatedAt).toLocaleString('en-IN') : 'unknown'}` : 'No effective write-only credential is available.'}</Typography></Box>
      <Button variant="outlined" disabled={busy} onClick={() => setCredentialOpen(true)}>{provider.credentialsConfigured ? 'Rotate credentials' : 'Configure credentials'}</Button>
    </Stack>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1}>
      <Button variant="outlined" disabled={busy} onClick={() => run({ kind: 'update', id: provider.id, payload: { mode, displayName: nullable(displayName), accountReference: nullable(accountReference) } })}>Save Metadata</Button>
      {provider.enabled ? <Button color="warning" disabled={busy} onClick={() => run({ kind: 'action', id: provider.id, action: 'disable' })}>Disable</Button> : <Button disabled={busy} onClick={() => run({ kind: 'action', id: provider.id, action: 'enable' })}>Enable</Button>}
      <Button variant="contained" disabled={busy || !provider.enabled || provider.isDefault} onClick={() => run({ kind: 'action', id: provider.id, action: 'default' })}>{provider.isDefault ? 'Current Default' : 'Make Default'}</Button>
    </Stack>
    <CredentialDialog provider={provider} open={credentialOpen} onClose={() => setCredentialOpen(false)} />
  </Stack>;
}

function CredentialDialog({ provider, open, onClose }: { provider: BillingProviderConfiguration; open: boolean; onClose: () => void }) {
  const client = useQueryClient(); const [keyId, setKeyId] = useState(''); const [keySecret, setKeySecret] = useState(''); const [webhookSecret, setWebhookSecret] = useState(''); const [confirmed, setConfirmed] = useState(false); const [message, setMessage] = useState('');
  const save = useMutation({ mutationFn: () => configureBillingProviderCredentials(provider.id, { keyId, keySecret, webhookSecret }), onSuccess: async () => { setKeyId(''); setKeySecret(''); setWebhookSecret(''); setConfirmed(false); setMessage('Credentials saved. Secret values were cleared and will not be redisplayed.'); await client.invalidateQueries({ queryKey: ['billing-settings', 'providers'] }); }, onError: (cause) => setMessage(apiError(cause, 'Credentials could not be saved.')) });
  const validate = useMutation({ mutationFn: () => validateBillingProviderCredentials(provider.id), onSuccess: ({ data }) => setMessage(data.success ? `Structural validation passed for version ${data.credentialVersion}. Network connectivity was not tested.` : 'Structural validation failed. Network connectivity was not tested.'), onError: (cause) => setMessage(apiError(cause, 'Structural validation failed. Network connectivity was not tested.')) });
  const close = () => { if (save.isPending || validate.isPending) return; setKeyId(''); setKeySecret(''); setWebhookSecret(''); setConfirmed(false); setMessage(''); onClose(); };
  return <Dialog open={open} onClose={close} fullWidth maxWidth="sm"><DialogTitle>{provider.credentialsConfigured ? 'Rotate' : 'Configure'} {provider.mode} credentials</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}><Alert severity={provider.mode === 'LIVE' ? 'warning' : 'info'}><strong>{provider.mode} mode.</strong> Secrets are write-only and never redisplayed. Structural validation only; network connectivity not tested.</Alert>{message ? <Alert severity="info">{message}</Alert> : null}<TextField required label="Key ID" value={keyId} onChange={(event) => setKeyId(event.target.value)} autoComplete="off" /><TextField required type="password" label="Key Secret" value={keySecret} onChange={(event) => setKeySecret(event.target.value)} autoComplete="new-password" /><TextField required type="password" label="Webhook Secret" value={webhookSecret} onChange={(event) => setWebhookSecret(event.target.value)} autoComplete="new-password" />{provider.credentialsConfigured ? <FormControlLabel control={<Checkbox checked={confirmed} onChange={(_, value) => setConfirmed(value)} />} label="I understand rotation replaces the effective credential and old secrets cannot be recovered from this UI." /> : null}</Stack></DialogContent><DialogActions><Button onClick={close}>Close</Button>{provider.credentialsConfigured ? <Button variant="outlined" disabled={validate.isPending} onClick={() => validate.mutate()}>Validate credentials</Button> : null}<Button variant="contained" disabled={!keyId.trim() || !keySecret.trim() || !webhookSecret.trim() || (provider.credentialsConfigured && !confirmed) || save.isPending} onClick={() => save.mutate()}>{provider.credentialsConfigured ? 'Rotate credentials' : 'Configure credentials'}</Button></DialogActions></Dialog>;
}

function toForm(value: BillingSettings): SettingsFormValue {
  return {
    invoicePrefix: value.invoicePrefix,
    invoiceNumberResetPolicy: value.invoiceNumberResetPolicy,
    defaultPaymentTermsDays: String(value.defaultPaymentTermsDays),
    defaultInvoiceNotes: value.defaultInvoiceNotes ?? '',
    sellerLegalName: value.sellerLegalName ?? '',
    sellerBillingEmail: value.sellerBillingEmail ?? '',
    sellerAddressLine1: value.sellerAddressLine1 ?? '',
    sellerAddressLine2: value.sellerAddressLine2 ?? '',
    sellerCity: value.sellerCity ?? '',
    sellerState: value.sellerState ?? '',
    sellerStateCode: value.sellerStateCode ?? '',
    sellerPostalCode: value.sellerPostalCode ?? '',
    sellerCountry: value.sellerCountry ?? '',
    gstEnabled: value.gstEnabled,
    gstin: value.gstin ?? '',
    gstLegalName: value.gstLegalName ?? '',
    gstRegisteredState: value.gstRegisteredState ?? '',
    gstRegisteredStateCode: value.gstRegisteredStateCode ?? '',
    renewalMode: value.renewalMode,
    renewalLeadDays: String(value.renewalLeadDays),
    renewalGracePeriodDays: String(value.renewalGracePeriodDays),
    renewalReminderDays: value.renewalReminderDays.join(', '),
  };
}

function toPayload(value: SettingsFormValue): BillingSettingsPayload {
  return {
    invoicePrefix: value.invoicePrefix.trim().toUpperCase(),
    invoiceNumberResetPolicy: value.invoiceNumberResetPolicy,
    defaultPaymentTermsDays: Number(value.defaultPaymentTermsDays),
    defaultInvoiceNotes: nullable(value.defaultInvoiceNotes),
    sellerLegalName: nullable(value.sellerLegalName),
    sellerBillingEmail: nullable(value.sellerBillingEmail),
    sellerAddressLine1: nullable(value.sellerAddressLine1),
    sellerAddressLine2: nullable(value.sellerAddressLine2),
    sellerCity: nullable(value.sellerCity),
    sellerState: nullable(value.sellerState),
    sellerStateCode: nullable(value.sellerStateCode.toUpperCase()),
    sellerPostalCode: nullable(value.sellerPostalCode),
    sellerCountry: nullable(value.sellerCountry),
    gstEnabled: value.gstEnabled,
    gstin: nullable(value.gstin.toUpperCase()),
    gstLegalName: nullable(value.gstLegalName),
    gstRegisteredState: nullable(value.gstRegisteredState),
    gstRegisteredStateCode: nullable(value.gstRegisteredStateCode.toUpperCase()),
    renewalMode: value.renewalMode,
    renewalLeadDays: Number(value.renewalLeadDays),
    renewalGracePeriodDays: Number(value.renewalGracePeriodDays),
    renewalReminderDays: parseReminderDays(value.renewalReminderDays),
  };
}

function validateSettings(value: SettingsFormValue) {
  const errors: Record<string, string> = {};
  if (!/^[A-Z0-9][A-Z0-9_/-]{0,19}$/.test(value.invoicePrefix.trim().toUpperCase())) errors.invoicePrefix = 'Enter a valid invoice prefix of at most 20 characters.';
  for (const [key, amount] of [['defaultPaymentTermsDays', value.defaultPaymentTermsDays], ['renewalLeadDays', value.renewalLeadDays], ['renewalGracePeriodDays', value.renewalGracePeriodDays]] as const) {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) errors[key] = 'Enter a whole number from 0 to 365.';
  }
  if (value.sellerBillingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.sellerBillingEmail.trim())) errors.sellerBillingEmail = 'Enter a valid billing email.';
  if (value.sellerStateCode && !/^[A-Z0-9-]{1,10}$/.test(value.sellerStateCode.trim().toUpperCase())) errors.sellerStateCode = 'Use up to 10 letters, numbers, or hyphens.';
  if (value.gstRegisteredStateCode && !/^[A-Z0-9-]{1,10}$/.test(value.gstRegisteredStateCode.trim().toUpperCase())) errors.gstRegisteredStateCode = 'Use up to 10 letters, numbers, or hyphens.';
  if (value.gstEnabled) {
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(value.gstin.trim().toUpperCase())) errors.gstin = 'Enter a valid 15-character GSTIN.';
    if (!value.gstLegalName.trim() && !value.sellerLegalName.trim()) errors.gstLegalName = 'Enter a GST legal name or seller legal name.';
  }
  const reminders = reminderError(value.renewalReminderDays);
  if (reminders) errors.renewalReminderDays = reminders;
  return errors;
}

function parseReminderDays(value: string) {
  if (!value.trim()) return [];
  return value.split(',').map((part) => Number(part.trim())).sort((a, b) => b - a);
}

function reminderError(value: string) {
  if (!value.trim()) return '';
  const parsed = parseReminderDays(value);
  if (parsed.some((day) => !Number.isInteger(day) || day < 0 || day > 365)) return 'Use comma-separated whole numbers from 0 to 365.';
  if (new Set(parsed).size !== parsed.length) return 'Reminder days must be unique.';
  if (parsed.length > 20) return 'Use no more than 20 reminder days.';
  return '';
}

function nullable(value: string) {
  return value.trim() || null;
}

function apiError(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const message = (error.response?.data as { message?: string | string[] })?.message;
  return Array.isArray(message) ? message.join(', ') : message || fallback;
}
