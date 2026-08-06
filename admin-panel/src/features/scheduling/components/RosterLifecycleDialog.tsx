import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, Button, Stack, Typography } from '@mui/material';

interface RosterLifecycleDialogProps {
  open: boolean;
  action: 'publish' | 'lock';
  loading?: boolean;
  blocked?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RosterLifecycleDialog({ open, action, loading, blocked, onClose, onConfirm }: RosterLifecycleDialogProps) {
  const isPublish = action === 'publish';
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isPublish ? 'Publish Shift Roster' : 'Lock Shift Roster'}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {blocked ? <Alert severity="error">Publish is blocked because preview returned validation errors.</Alert> : null}
          <Alert severity={isPublish ? 'warning' : 'info'}>
            {isPublish
              ? 'Publishing makes roster days operational for attendance resolution. Existing attendance snapshots remain unchanged.'
              : 'Locked rosters are immutable. Attendance, reporting, and future payroll history can depend on this roster.'}
          </Alert>
          <Typography variant="body2" color="text.secondary">
            This action is sent to the backend and the roster status is updated only after the request succeeds.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color={isPublish ? 'primary' : 'warning'} onClick={onConfirm} disabled={loading || blocked}>{loading ? 'Working...' : isPublish ? 'Publish Roster' : 'Lock Roster'}</Button>
      </DialogActions>
    </Dialog>
  );
}
