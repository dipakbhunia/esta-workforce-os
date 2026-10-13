import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { SectionCard } from '@/components/section-card';
import { StatusChip } from '@/components/status-chip';
import { createEmailTemplateDraft, listEmailTemplates, listEmailTemplateVersions, platformCommunicationKeys,
  runEmailTemplateAction, selectEmailTemplateVersion, updateEmailTemplateDraft } from '../platform-communication-api';
import type { EmailTemplateCatalogItem, EmailTemplatePreview, EmailTemplateVersion } from '../platform-communication.types';

type Confirm = { action: 'publish' | 'rollback'; version: EmailTemplateVersion };
const blank = { subject: '', body: '' };

export default function EmailTemplatesPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedType, setSelectedType] = useState('');
  const [editing, setEditing] = useState<EmailTemplateVersion | null>(null);
  const [form, setForm] = useState(blank);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<EmailTemplatePreview | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const catalog = useQuery({ queryKey: platformCommunicationKeys.templates, queryFn: listEmailTemplates });
  const items = catalog.data?.data ?? [];
  useEffect(() => { if (!selectedType && items[0]) setSelectedType(items[0].notificationType); }, [items, selectedType]);
  const selected = items.find(item => item.notificationType === selectedType) ?? null;
  const history = useQuery({ queryKey: platformCommunicationKeys.templateVersions(selectedType),
    queryFn: () => listEmailTemplateVersions(selectedType), enabled: Boolean(selectedType) });
  const versions = history.data?.data.data ?? [];
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);
  const filtered = useMemo(() => items.filter(item => {
    const matches = `${label(item.notificationType)} ${item.category}`.toLowerCase().includes(search.trim().toLowerCase());
    const state = item.template?.activeVersion ? 'PUBLISHED' : item.template?.latestVersion?.lifecycle ?? 'UNCONFIGURED';
    return matches && (status === 'ALL' || status === state || (status === 'RUNTIME_DISABLED' && item.systemManagedActionLink));
  }), [items, search, status]);
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: platformCommunicationKeys.templates }),
    client.invalidateQueries({ queryKey: platformCommunicationKeys.templateVersions(selectedType) })]);

  const save = useMutation({ mutationFn: async () => {
    if (!selected) throw new Error('Select a template type.');
    if (!form.subject.trim() || !form.body.trim()) throw new Error('Subject and plain-text body are required.');
    if (editing) return updateEmailTemplateDraft(selected.notificationType, editing.id, { revision: editing.revision,
      subjectTemplate: form.subject, textBodyTemplate: form.body, placeholderContractVersion: 1 });
    return createEmailTemplateDraft(selected.notificationType, { templateRevision: selected.template?.revision ?? 0,
      subjectTemplate: form.subject, textBodyTemplate: form.body, placeholderContractVersion: 1 });
  }, onSuccess: async () => { setDirty(false); setMessage(editing ? 'Draft revision saved.' : 'Draft created.'); setEditing(null); setForm(blank); await refresh(); },
  onError: error => setMessage(safeError(error, 'Draft could not be saved.')) });

  const action = useMutation({ mutationFn: async ({ name, version }: { name: 'validate' | 'preview'; version: EmailTemplateVersion }) =>
    runEmailTemplateAction(selectedType, version.id, name, version.revision),
  onSuccess: async ({ data }, input) => { if (input.name === 'preview') setPreview(data as EmailTemplatePreview); else { setMessage('Draft validated.'); await refresh(); } },
  onError: error => setMessage(safeError(error, 'Template action failed.')) });

  const selection = useMutation({ mutationFn: async ({ action: name, version }: Confirm) => {
    if (!selected?.template) throw new Error('Template state is unavailable.');
    return selectEmailTemplateVersion(selectedType, version.id, name, selected.template.revision, version.revision);
  }, onSuccess: async (_, value) => { setConfirm(null); setMessage(value.action === 'publish' ? 'Version published for future eligible notifications.' : 'Active template rolled back for future notifications.'); await refresh(); },
  onError: error => { setConfirm(null); setMessage(safeError(error, 'Publication state could not be changed.')); } });
  const busy = save.isPending || action.isPending || selection.isPending;
  const selectItem = (item: EmailTemplateCatalogItem) => {
    if (dirty && !window.confirm('Discard unsaved template changes?')) return;
    setSelectedType(item.notificationType); setEditing(null); setForm(blank); setDirty(false); setPreview(null); setMessage('');
  };
  const edit = (version: EmailTemplateVersion) => { setEditing(version); setForm({ subject: version.subjectTemplate, body: version.textBodyTemplate }); setDirty(false); setPreview(null); };

  return <PageLayout>
    <PageHeader title="Email Templates" description="Manage versioned platform email subjects and plain-text content." breadcrumbs={['Admin', 'Platform Communication', 'Email Templates']} />
    <Alert severity="info">Publishing affects future notifications only. Existing queued notifications and retries keep their persisted content.</Alert>
    {catalog.isError ? <Alert severity="error" action={<Button onClick={() => catalog.refetch()}>Retry</Button>}>Email templates could not be loaded.</Alert> : null}
    {catalog.isLoading ? <LoadingSkeleton rows={6} /> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(280px, 0.8fr) minmax(0, 1.7fr)' }, gap: 2, alignItems: 'start' }}>
      <SectionCard title="Template catalog" description={`${items.length} supported email event types`}>
        <Stack gap={1.5}><TextField label="Search templates" value={search} onChange={e => setSearch(e.target.value)} />
          <FormControl><InputLabel id="template-status-label">Status</InputLabel><Select labelId="template-status-label" label="Status" value={status} onChange={e => setStatus(e.target.value)}><MenuItem value="ALL">All</MenuItem><MenuItem value="UNCONFIGURED">Unconfigured</MenuItem><MenuItem value="DRAFT">Draft</MenuItem><MenuItem value="PUBLISHED">Published</MenuItem><MenuItem value="RUNTIME_DISABLED">Runtime disabled</MenuItem></Select></FormControl>
          {!filtered.length ? <Alert severity="info">No templates match these filters.</Alert> : filtered.map(item => <Button key={item.notificationType} variant={item.notificationType === selectedType ? 'contained' : 'outlined'} onClick={() => selectItem(item)} sx={{ justifyContent: 'space-between', textAlign: 'left', minWidth: 0, py: 1.25 }}><Box sx={{ minWidth: 0 }}><Typography component="span" fontWeight={800} sx={{ display: 'block', overflowWrap: 'anywhere' }}>{label(item.notificationType)}</Typography><Typography component="span" variant="caption">{item.template?.activeVersion ? `Active v${item.template.activeVersion.version}` : item.template?.latestVersion ? item.template.latestVersion.lifecycle : 'Unconfigured'}</Typography></Box>{item.systemManagedActionLink ? <Chip size="small" label="Runtime disabled" color="warning" /> : <Chip size="small" label="Runtime enabled" color="success" />}</Button>)}</Stack>
      </SectionCard>
      {selected ? <Stack gap={2} minWidth={0}>
        {selected.systemManagedActionLink ? <Alert severity="warning"><strong>Security-controlled runtime:</strong> publishing this catalog entry does not override invitation, password-reset, or verification emails. Action links and mandatory security content remain system-owned.</Alert> : null}
        <SectionCard title={label(selected.notificationType)} description={`${selected.category} / Contract v${selected.placeholderContractVersion}`}>
          <Typography variant="subtitle2">Approved placeholders</Typography><Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 1 }}>{selected.allowedVariables.length ? selected.allowedVariables.map(value => <Chip key={value} label={`{{${value}}}`} sx={{ maxWidth: '100%', '& .MuiChip-label': { overflowWrap: 'anywhere' } }} />) : <Typography color="text.secondary">No placeholders are supported.</Typography>}</Stack>
          <Box sx={{ display: 'grid', gap: 2, mt: 2 }}><TextField required label="Subject" value={form.subject} onChange={e => { setForm(v => ({ ...v, subject: e.target.value })); setDirty(true); }} inputProps={{ maxLength: 998 }} /><TextField required multiline minRows={8} label="Plain-text body" value={form.body} onChange={e => { setForm(v => ({ ...v, body: e.target.value })); setDirty(true); }} inputProps={{ maxLength: 100000 }} /></Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1} sx={{ mt: 2 }}><Button disabled={busy} onClick={() => { setEditing(null); setForm(blank); setDirty(false); }}>New draft</Button><Button variant="contained" disabled={busy || !dirty} onClick={() => save.mutate()}>{save.isPending ? 'Saving...' : editing ? 'Save revision' : 'Create draft'}</Button></Stack>
        </SectionCard>
        <SectionCard title="Version history" description="Newest first. Actions use authoritative server revisions.">
          {history.isLoading ? <LoadingSkeleton rows={3} /> : history.isError ? <Alert severity="error" action={<Button onClick={() => history.refetch()}>Retry</Button>}>Version history could not be loaded.</Alert> : !versions.length ? <Alert severity="info">No versions exist. Create a draft to begin.</Alert> : <Stack gap={1.5}>{versions.map(version => <Box key={version.id} sx={{ border: '1px solid', borderColor: selected.template?.activeVersionId === version.id ? 'primary.main' : 'divider', borderRadius: 2, p: 2, minWidth: 0 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}><Box minWidth={0}><Stack direction="row" flexWrap="wrap" gap={1}><Typography fontWeight={800}>Version {version.version}</Typography><StatusChip label={version.lifecycle} tone={version.lifecycle === 'PUBLISHED' ? 'success' : version.lifecycle === 'DRAFT' ? 'info' : 'neutral'} />{selected.template?.activeVersionId === version.id ? <StatusChip label="Active" tone="success" /> : null}</Stack><Typography variant="caption" sx={{ overflowWrap: 'anywhere' }}>Revision {version.revision} / {version.id}</Typography></Box><Stack direction="row" flexWrap="wrap" gap={1}><Button size="small" disabled={busy || version.lifecycle !== 'DRAFT'} onClick={() => edit(version)}>Edit</Button><Button size="small" disabled={busy || version.lifecycle !== 'DRAFT'} onClick={() => action.mutate({ name: 'validate', version })}>Validate</Button><Button size="small" disabled={busy || version.lifecycle === 'RETIRED'} onClick={() => action.mutate({ name: 'preview', version })}>Preview</Button>{version.lifecycle === 'DRAFT' ? <Button size="small" variant="contained" disabled={busy || version.validationResultCode !== 'VALID'} onClick={() => setConfirm({ action: 'publish', version })}>Publish</Button> : <Button size="small" color="warning" disabled={busy || version.lifecycle !== 'PUBLISHED' || selected.template?.activeVersionId === version.id} onClick={() => setConfirm({ action: 'rollback', version })}>Rollback</Button>}</Stack></Stack></Box>)}</Stack>}
        </SectionCard>
        {preview ? <SectionCard title="Synthetic preview" description="Generated only from deterministic sample data. No email was sent and no notification was created."><Alert severity="info">Synthetic data / No functional action link</Alert><Typography variant="subtitle2" sx={{ mt: 2 }}>Subject</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{preview.subject}</Typography><Typography variant="subtitle2" sx={{ mt: 2 }}>Plain text</Typography><Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit', bgcolor: 'grey.50', p: 2, borderRadius: 1 }}>{preview.textBody}</Box><Typography variant="subtitle2">System-owned HTML envelope</Typography><Box component="iframe" title="Synthetic HTML email preview" srcDoc={preview.html} sandbox="" sx={{ width: '100%', minHeight: 280, border: '1px solid', borderColor: 'divider', borderRadius: 1 }} /></SectionCard> : null}
      </Stack> : null}
    </Box>}
    {message ? <Alert severity={/could not|failed|conflict/i.test(message) ? 'error' : 'success'} onClose={() => setMessage('')}>{message}</Alert> : null}
    <ConfirmDialog open={Boolean(confirm)} title={confirm?.action === 'publish' ? 'Publish template version?' : 'Roll back active template?'} description={`${confirm?.action === 'publish' ? 'Publication' : 'Rollback'} affects future eligible notifications only. Existing queued content will not change.`} confirmLabel={confirm?.action === 'publish' ? 'Publish' : 'Rollback'} loading={selection.isPending} onClose={() => setConfirm(null)} onConfirm={() => confirm && selection.mutate(confirm)} />
  </PageLayout>;
}

const label = (value: string) => value.toLowerCase().split('_').map(part => part[0].toUpperCase() + part.slice(1)).join(' ');
function safeError(error: unknown, fallback: string) { if (axios.isAxiosError(error)) { const data = error.response?.data as { message?: string; code?: string } | undefined; return data?.code ? `${data.message ?? fallback} (${data.code})` : data?.message ?? fallback; } return error instanceof Error ? error.message : fallback; }
