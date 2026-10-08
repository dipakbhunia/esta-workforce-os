import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPlatformUser, platformAccessKeys } from '../platform-access-api';
import type { PlatformRole } from '../platform-access.types';
import { platformAccessError } from './platform-access-errors';

interface Props { open: boolean; roles: PlatformRole[]; onClose: () => void }
const empty = { email: '', firstName: '', lastName: '', roleIds: [] as string[] };

export function CreatePlatformUserDialog({ open, roles, onClose }: Props) {
  const queryClient = useQueryClient(); const [form, setForm] = useState(empty); const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (!open) { setForm(empty); setSubmitted(false); } }, [open]);
  const mutation = useMutation({ mutationFn: createPlatformUser, onSuccess: async () => { setForm(empty); await queryClient.invalidateQueries({ queryKey: platformAccessKeys.users() }); onClose(); } });
  const valid = Boolean(form.email.trim() && form.firstName.trim() && form.lastName.trim()) && form.roleIds.length >= 1 && form.roleIds.length <= 10;
  const submit = () => { setSubmitted(true); if (!valid || mutation.isPending) return; mutation.mutate({ email: form.email.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim(), roleIds: form.roleIds }); };
  return <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth><DialogTitle>Invite Platform User</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
    {mutation.isError ? <Alert severity="error">{platformAccessError(mutation.error, 'The platform user could not be invited.')}</Alert> : null}
    <Alert severity="info">The user remains inactive until they set their password from the secure invitation email.</Alert>
    <TextField autoFocus required label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={submitted && !form.email.trim()} />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><TextField fullWidth required label="First name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} error={submitted && !form.firstName.trim()} /><TextField fullWidth required label="Last name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} error={submitted && !form.lastName.trim()} /></Stack>
    <FormGroup aria-label="Global roles">{roles.map((role) => <FormControlLabel key={role.id} control={<Checkbox checked={form.roleIds.includes(role.id)} onChange={(event) => setForm({ ...form, roleIds: event.target.checked ? [...form.roleIds, role.id] : form.roleIds.filter((id) => id !== role.id) })} />} label={role.name} />)}</FormGroup>
    {submitted && !form.roleIds.length ? <Alert severity="error">Select at least one global role.</Alert> : null}
  </Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button variant="contained" onClick={submit} disabled={mutation.isPending || (submitted && !valid)}>{mutation.isPending ? 'Inviting…' : 'Send Invitation'}</Button></DialogActions></Dialog>;
}
