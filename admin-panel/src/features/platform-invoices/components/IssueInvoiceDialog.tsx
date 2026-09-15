import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useRef, useState, type FormEvent } from 'react';
import { issuePlatformInvoice, platformInvoiceKeys } from '../platform-invoices-api';

interface IssueInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onIssued: (invoiceId: string) => void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function IssueInvoiceDialog({ open, onClose, onIssued }: IssueInvoiceDialogProps) {
  const queryClient = useQueryClient();
  const [paymentId, setPaymentId] = useState('');
  const [validationError, setValidationError] = useState('');
  const submittingRef = useRef(false);
  const mutation = useMutation({
    mutationFn: issuePlatformInvoice,
    onSuccess: async ({ data }) => {
      await queryClient.invalidateQueries({ queryKey: [...platformInvoiceKeys.all, 'list'] });
      reset();
      onClose();
      onIssued(data.id);
    },
    onSettled: () => { submittingRef.current = false; },
  });

  const reset = () => {
    setPaymentId('');
    setValidationError('');
    mutation.reset();
  };
  const close = () => {
    if (submittingRef.current) return;
    reset();
    onClose();
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    const trimmedPaymentId = paymentId.trim();
    if (!trimmedPaymentId) {
      setValidationError('Payment ID is required.');
      return;
    }
    if (!UUID_PATTERN.test(trimmedPaymentId)) {
      setValidationError('Enter a valid Payment UUID.');
      return;
    }
    setValidationError('');
    submittingRef.current = true;
    mutation.mutate({ paymentId: trimmedPaymentId });
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="issue-invoice-title">
      <form onSubmit={submit} noValidate>
        <DialogTitle id="issue-invoice-title">Issue Invoice</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1, minWidth: 0 }}>
            <Typography color="text.secondary">
              Enter the exact ID of an eligible captured subscription-activation Payment. The backend will confirm eligibility before making an Invoice available.
            </Typography>
            {mutation.isError ? <Alert severity="error">{issueErrorMessage(mutation.error)}</Alert> : null}
            <TextField
              autoFocus
              required
              fullWidth
              label="Payment ID"
              value={paymentId}
              onChange={(event) => {
                setPaymentId(event.target.value);
                if (validationError) setValidationError('');
              }}
              error={Boolean(validationError)}
              helperText={validationError || 'Enter the Payment UUID exactly as recorded.'}
              disabled={mutation.isPending}
              inputProps={{ spellCheck: false, autoComplete: 'off' }}
            />
            {mutation.isPending ? <Typography role="status" color="text.secondary">Issuing Invoice…</Typography> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutation.isPending} startIcon={mutation.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {mutation.isPending ? 'Issuing…' : 'Issue Invoice'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function issueErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) return 'The source Payment was not found. Check the Payment ID and try again.';
    if (error.response?.status === 409) return 'This Payment is not eligible for Invoice issuance or conflicts with existing commercial records.';
    if (error.response?.status === 422) return 'Invoice could not be issued because required billing configuration or commercial evidence is incomplete. Review Billing Settings and try again.';
  }
  return 'Invoice could not be issued. Check connectivity and try again.';
}
