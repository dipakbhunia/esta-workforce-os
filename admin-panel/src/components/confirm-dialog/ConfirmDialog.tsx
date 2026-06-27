import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

export function ConfirmDialog({ open = false, title = 'Confirm action', description = 'This is a reusable confirmation placeholder.', onClose }: { open?: boolean; title?: string; description?: string; onClose?: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent><Typography color="text.secondary">{description}</Typography></DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="contained" onClick={onClose}>Confirm</Button>
      </DialogActions>
    </Dialog>
  );
}
