import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

interface ReviewCorrectionDialogProps {
  open: boolean;
  action: 'APPROVED' | 'REJECTED';
  employeeName?: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (reviewerComment?: string) => void;
}

export function ReviewCorrectionDialog({
  open,
  action,
  employeeName,
  loading = false,
  onClose,
  onSubmit,
}: ReviewCorrectionDialogProps) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const rejecting = action === 'REJECTED';

  useEffect(() => {
    if (!open) {
      setComment('');
      setError('');
    }
  }, [open]);

  function submit() {
    const trimmed = comment.trim();
    if (rejecting && !trimmed) {
      setError('Reviewer comment is required when rejecting a correction request.');
      return;
    }
    onSubmit(trimmed || undefined);
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{rejecting ? 'Reject correction request' : 'Approve correction request'}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            {rejecting
              ? `Reject the pending correction request${employeeName ? ` for ${employeeName}` : ''}. Attendance will not be changed.`
              : `Approve the pending correction request${employeeName ? ` for ${employeeName}` : ''}. The backend will apply the requested attendance changes.`}
          </Typography>
          <TextField
            label={rejecting ? 'Reviewer Comment' : 'Reviewer Comment (optional)'}
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              setError('');
            }}
            multiline
            minRows={3}
            error={Boolean(error)}
            helperText={error || (rejecting ? 'Required for rejection.' : 'Optional approval note.')}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button color={rejecting ? 'error' : 'success'} variant="contained" onClick={submit} disabled={loading}>
          {loading ? 'Working...' : rejecting ? 'Reject' : 'Approve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
