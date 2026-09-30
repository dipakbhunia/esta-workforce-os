import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Stack, TextField } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createPlatformUser, platformAccessKeys } from '../platform-access-api';
import type { PlatformRole } from '../platform-access.types';
import { platformAccessError } from './platform-access-errors';

interface Props { open: boolean; roles: PlatformRole[]; onClose: () => void }
const empty = { email: '', password: '', firstName: '', lastName: '', roleIds: [] as string[] };

export function CreatePlatformUserDialog({ open, roles, onClose }: Props) {
  const queryClient = useQueryClient(); const [form, setForm] = useState(empty); const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (!open) { setForm(empty); setSubmitted(false); } }, [open]);
  const mutation = useMutation({ mutationFn: createPlatformUser, onSuccess: async () => { setForm(empty); await queryClient.invalidateQueries({ queryKey: platformAccessKeys.users() }); onClose(); } });
  const valid = Boolean(form.email.trim() && form.firstName.trim() && form.lastName.trim()) && form.password.length >= 8 && form.password.length <= 128 && form.roleIds.length >= 1 && form.roleIds.length <= 10;
  const submit = () => { setSubmitted(true); if (!valid || mutation.isPending) return; mutation.mutate({ email: form.email.trim(), password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim(), roleIds: form.roleIds }); };
  return <Dialog open={open} onClose={mutation.isPending ? undefined : onClose} maxWidth="sm" fullWidth><DialogTitle>Create Platform User</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
    {mutation.isError ? <Alert severity="error">{platformAccessError(mutation.error, 'The platform user could not be created.')}</Alert> : null}
    <TextField autoFocus required label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={submitted && !form.email.trim()} />
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><TextField fullWidth required label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} error={submitted && !form.firstName.trim()} /><TextField fullWidth required label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} error={submitted && !form.lastName.trim()} /></Stack>
    <TextField required label="Temporary password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={submitted && (form.password.length < 8 || form.password.length > 128)} helperText="8–128 characters. The password is sent only with this request." inputProps={{ minLength: 8, maxLength: 128 }} />
    <FormGroup aria-label="Global roles">{roles.map((role) => <FormControlLabel key={role.id} control={<Checkbox checked={form.roleIds.includes(role.id)} onChange={(e) => setForm({ ...form, roleIds: e.target.checked ? [...form.roleIds, role.id] : form.roleIds.filter((id) => id !== role.id) })} />} label={role.name} />)}</FormGroup>
    {submitted && !form.roleIds.length ? <Alert severity="error">Select at least one global role.</Alert> : null}
  </Stack></DialogContent><DialogActions><Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button variant="contained" onClick={submit} disabled={mutation.isPending || (submitted && !valid)}>{mutation.isPending ? 'Creating…' : 'Create User'}</Button></DialogActions></Dialog>;
}
