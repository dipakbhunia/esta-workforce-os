import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material';
import type { RosterDragSource, RosterDragTarget } from './RosterDragDropContext';
import { dayTypeLabel, formatDateOnly, rosterDayShiftLabel } from '../utils/shift-roster-utils';

interface RosterDropConflictDialogProps {
  open: boolean;
  source: RosterDragSource | null;
  target: RosterDragTarget | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function RosterDropConflictDialog({ open, source, target, loading, onClose, onConfirm }: RosterDropConflictDialogProps) {
  const protectedTarget = target?.day?.dayType === 'HOLIDAY' || target?.day?.dayType === 'LEAVE';
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Replace Occupied Roster Day?</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Alert severity="warning">
            This target already contains a roster day. Confirming will replace only the target; the source remains unchanged.
          </Alert>
          {protectedTarget ? (
            <Alert severity="warning">
              The target is marked {dayTypeLabel(target!.day!.dayType)}. Review the scheduling context before replacing it.
            </Alert>
          ) : null}
          <Stack gap={0.75}>
            <Typography variant="overline" color="text.secondary">Source</Typography>
            <Typography fontWeight={900}>{source?.employeeLabel ?? 'Employee unavailable'} · {formatDateOnly(source?.workDate)}</Typography>
            <Typography variant="body2">{rosterDayShiftLabel(source?.day)}</Typography>
          </Stack>
          <Divider />
          <Stack gap={0.75}>
            <Typography variant="overline" color="text.secondary">Current target</Typography>
            <Typography fontWeight={900}>{target?.employeeLabel ?? 'Employee unavailable'} · {formatDateOnly(target?.workDate)}</Typography>
            <Typography variant="body2">{rosterDayShiftLabel(target?.day)}</Typography>
          </Stack>
          <Divider />
          <Stack gap={0.75}>
            <Typography variant="overline" color="text.secondary">Proposed replacement</Typography>
            <Typography fontWeight={900}>{rosterDayShiftLabel(source?.day)}</Typography>
            <Typography variant="body2" color="text.secondary">Copied to {target?.employeeLabel ?? 'the target employee'} on {formatDateOnly(target?.workDate)}.</Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={onConfirm} disabled={loading || !source || !target}>
          {loading ? 'Replacing...' : 'Confirm Replace'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}