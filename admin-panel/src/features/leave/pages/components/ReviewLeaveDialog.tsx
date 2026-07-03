import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import type { ReviewLeaveRequestPayload } from '../../types/leave.types';

interface ReviewLeaveDialogProps {
  open: boolean;
  mode: 'APPROVED' | 'REJECTED';
  loading?: boolean;
  onClose: () => void;
  onSubmit: (payload: ReviewLeaveRequestPayload) => void;
}

export function ReviewLeaveDialog({ open, mode, loading = false, onClose, onSubmit }: ReviewLeaveDialogProps) {
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (open) setComment('');
  }, [open]);

  const isReject = mode === 'REJECTED';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isReject ? 'Reject leave request' : 'Approve leave request'}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            {isReject
              ? 'Add a clear comment so the employee understands why the request was rejected.'
              : 'Confirm approval for this leave request. A reviewer comment is optional.'}
          </Typography>
          <TextField
            label="Reviewer comment"
            multiline
            minRows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={isReject ? 'Example: Please adjust the dates and resubmit.' : 'Optional note'}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          color={isReject ? 'error' : 'success'}
          variant="contained"
          onClick={() => onSubmit({ status: mode, comment: comment.trim() || undefined })}
          disabled={loading}
        >
          {loading ? 'Saving...' : isReject ? 'Reject' : 'Approve'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
