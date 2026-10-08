import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { PageLayout } from '@/components/page-layout';
import { getManageableRoles, getUsers, inviteUser } from '../services/users-api';

const usersKey = ['managed-users'] as const;
const empty = { email: '', firstName: '', lastName: '', roleIds: [] as string[] };

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [submitted, setSubmitted] = useState(false);
  const users = useQuery({ queryKey: usersKey, queryFn: () => getUsers({ page: 1, limit: 100 }) });
  const roles = useQuery({ queryKey: ['manageable-roles'], queryFn: getManageableRoles });
  const mutation = useMutation({ mutationFn: inviteUser, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: usersKey }); setForm(empty); setSubmitted(false); setOpen(false); } });
  const valid = Boolean(form.email.trim() && form.firstName.trim() && form.lastName.trim() && form.roleIds.length);
  const close = () => { if (!mutation.isPending) { setOpen(false); setForm(empty); setSubmitted(false); mutation.reset(); } };
  const submit = () => { setSubmitted(true); if (!valid || mutation.isPending) return; mutation.mutate({ ...form, email: form.email.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim() }); };

  const userRows = users.data?.data.data ?? [];
  const roleRows = roles.data?.data.data ?? [];
  return <PageLayout><Stack gap={3}>
    <PageHeader title="Users" description="Manage tenant login identities, access, and account lifecycle." breadcrumbs={['Admin', 'Settings', 'Users']} primaryAction={<Button variant="contained" onClick={() => setOpen(true)} sx={{ width: { xs: '100%', sm: 'auto' } }}>Invite User</Button>} />
    {users.isLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading users" /></Box> : null}
    {users.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => users.refetch()}>Retry</Button>}>Users could not be loaded.</Alert> : null}
    {users.data && userRows.length === 0 ? <Alert severity="info">No tenant users found. Invite the first user to get started.</Alert> : null}
    {userRows.map((user) => <Paper key={user.id} variant="outlined" sx={{ p: 2 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box sx={{ minWidth: 0 }}><Typography fontWeight={600}>{user.firstName} {user.lastName}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{user.email}</Typography></Box><Typography variant="body2">{user.status}</Typography></Stack></Paper>)}
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth aria-labelledby="invite-user-title"><DialogTitle id="invite-user-title">Invite Tenant User</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
      <Alert severity="info">The user remains inactive until they set a password from the secure invitation email.</Alert>
      {mutation.isError ? <Alert severity="error">The invitation could not be sent. Review the details and try again.</Alert> : null}
      <TextField autoFocus required label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} error={submitted && !form.email.trim()} />
      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><TextField fullWidth required label="First name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} error={submitted && !form.firstName.trim()} /><TextField fullWidth required label="Last name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} error={submitted && !form.lastName.trim()} /></Stack>
      {roles.isLoading ? <CircularProgress size={24} aria-label="Loading roles" /> : null}
      {roles.isError ? <Alert severity="error" action={<Button color="inherit" onClick={() => roles.refetch()}>Retry</Button>}>Roles could not be loaded.</Alert> : null}
      <FormGroup aria-label="Tenant roles">{roleRows.map((role) => <FormControlLabel key={role.id} control={<Checkbox checked={form.roleIds.includes(role.id)} onChange={(event) => setForm({ ...form, roleIds: event.target.checked ? [...form.roleIds, role.id] : form.roleIds.filter((id) => id !== role.id) })} />} label={role.name} />)}</FormGroup>
      {submitted && !form.roleIds.length ? <Alert severity="error">Select at least one tenant role.</Alert> : null}
    </Stack></DialogContent><DialogActions><Button onClick={close} disabled={mutation.isPending}>Cancel</Button><Button variant="contained" onClick={submit} disabled={mutation.isPending || roles.isError}>{mutation.isPending ? 'Inviting…' : 'Send Invitation'}</Button></DialogActions></Dialog>
  </Stack></PageLayout>;
}
