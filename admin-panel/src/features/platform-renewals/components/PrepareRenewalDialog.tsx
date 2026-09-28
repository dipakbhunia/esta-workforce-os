import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useRef, useState, type FormEvent } from 'react';
import { platformRenewalKeys, preparePlatformRenewal } from '../platform-renewals-api';

interface Props { open: boolean; onClose: () => void; onPrepared: (renewalId: string, created: boolean) => void }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PrepareRenewalDialog({ open, onClose, onPrepared }: Props) {
  const client = useQueryClient();
  const [subscriptionId, setSubscriptionId] = useState('');
  const [validationError, setValidationError] = useState('');
  const submitting = useRef(false);
  const mutation = useMutation({ mutationFn: preparePlatformRenewal, onSuccess: async ({ data }) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: [...platformRenewalKeys.all, 'list'] }),
      client.invalidateQueries({ queryKey: ['platform-payments'] }),
    ]);
    reset(); onClose(); onPrepared(data.renewalId, data.created);
  }, onSettled: () => { submitting.current = false; } });
  const reset = () => { setSubscriptionId(''); setValidationError(''); mutation.reset(); };
  const close = () => { if (submitting.current) return; reset(); onClose(); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (submitting.current) return;
    const id = subscriptionId.trim();
    if (!id) return setValidationError('Subscription ID is required.');
    if (!UUID.test(id)) return setValidationError('Enter a valid Subscription UUID.');
    setValidationError(''); submitting.current = true; mutation.mutate(id);
  };
  return <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="prepare-renewal-title" aria-describedby="prepare-renewal-description"><form onSubmit={submit} noValidate>
    <DialogTitle id="prepare-renewal-title">Prepare Renewal</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>
      <Typography id="prepare-renewal-description" color="text.secondary">Enter the exact Subscription ID. The backend determines eligibility and reuses existing prepared Renewal evidence when applicable.</Typography>
      {mutation.isError ? <Alert severity="error">{prepareRenewalErrorMessage(mutation.error)}</Alert> : null}
      <TextField autoFocus required fullWidth label="Subscription ID" value={subscriptionId} disabled={mutation.isPending} error={Boolean(validationError)} helperText={validationError || 'Enter the Subscription UUID exactly as recorded.'} onChange={(event) => { setSubscriptionId(event.target.value); if (validationError) setValidationError(''); }} inputProps={{ spellCheck: false, autoComplete: 'off' }} />
      {mutation.isPending ? <Typography role="status" color="text.secondary">Preparing Renewal…</Typography> : null}
    </Stack></DialogContent><DialogActions><Button onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" variant="contained" disabled={mutation.isPending} startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>{mutation.isPending ? 'Preparing…' : 'Prepare Renewal'}</Button></DialogActions>
  </form></Dialog>;
}

export function prepareRenewalErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;
    if (code === 'PROVIDER_PREPARATION_FAILED') return 'The Renewal and Payment may already be durably prepared, but provider order preparation needs recovery. Refresh the register and review the resulting record before retrying.';
    if (error.response?.status === 404) return 'The Subscription was not found. Check the ID and try again.';
    if (error.response?.status === 409) return 'The Subscription is not currently eligible for Renewal preparation or conflicts with existing Renewal evidence.';
    if (error.response?.status === 422) return 'Renewal preparation is unavailable because the Subscription cycle or commercial snapshot is incomplete or unsupported.';
  }
  return 'Renewal could not be prepared. Check connectivity and try again.';
}
