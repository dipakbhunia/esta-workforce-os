import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

interface ConfirmDialogProps {
  open?: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  loading?: boolean;
  onClose?: () => void;
  onConfirm?: () => void;
}

export function ConfirmDialog({
  open = false,
  title = 'Confirm action',
  description = 'This is a reusable confirmation placeholder.',
  confirmLabel = 'Confirm',
  loading = false,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography color="text.secondary">{description}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button color="error" variant="contained" onClick={onConfirm ?? onClose} disabled={loading}>{loading ? 'Working...' : confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
