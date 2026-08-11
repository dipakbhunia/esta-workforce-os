import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, ListItemText, MenuItem, Select, Stack, TextField } from '@mui/material';
import { useMemo, useState } from 'react';
import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';
import type { RosterDayType, ShiftRosterDayPayload } from '../types/shift-roster.types';
import { eachDate, employeeName, rosterDayTypeOptions } from '../utils/shift-roster-utils';

interface RosterBulkActionDialogProps {
  open: boolean;
  employees: Employee[];
  shifts: Shift[];
  loading?: boolean;
  readonly?: boolean;
  onClose: () => void;
  onSubmit: (days: ShiftRosterDayPayload[]) => void;
}

export function RosterBulkActionDialog({ open, employees, shifts, loading, readonly, onClose, onSubmit }: RosterBulkActionDialogProps) {
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dayType, setDayType] = useState<RosterDayType>('WORKING');
  const [shiftId, setShiftId] = useState('');
  const [notes, setNotes] = useState('');

  const dates = useMemo(() => eachDate(dateFrom, dateTo), [dateFrom, dateTo]);
  const totalCells = employeeIds.length * dates.length;
  const error = useMemo(() => {
    if (readonly) return 'Roster is read-only.';
    if (!employeeIds.length) return 'Select at least one employee.';
    if (!dateFrom || !dateTo) return 'Select a date range.';
    if (dateFrom > dateTo) return 'Date From must not be after Date To.';
    if (totalCells > 500) return 'Bulk update is limited to 500 roster cells.';
    if (dayType === 'WORKING' && !shiftId) return 'Working bulk updates require a shift.';
    return '';
  }, [dateFrom, dateTo, dayType, employeeIds.length, readonly, shiftId, totalCells]);

  const submit = () => {
    if (error) return;
    onSubmit(employeeIds.flatMap((employeeId) => dates.map((workDate) => ({
      employeeId,
      workDate,
      dayType,
      shiftId: dayType === 'WORKING' ? shiftId : null,
      source: 'MANUAL',
      notes: notes.trim() || null,
    }))));
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Bulk Update Roster Days</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="bulk-employees-label">Employees</InputLabel>
            <Select
              labelId="bulk-employees-label"
              multiple
              label="Employees"
              value={employeeIds}
              onChange={(event) => setEmployeeIds(typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value)}
              renderValue={(selected) => `${selected.length} employee${selected.length === 1 ? '' : 's'} selected`}
            >
              {employees.map((employee) => (
                <MenuItem key={employee.id} value={employee.id}>
                  <Checkbox checked={employeeIds.includes(employee.id)} />
                  <ListItemText primary={`${employeeName(employee)} - ${employee.employeeCode}`} secondary={employee.department?.name ?? employee.branch?.name ?? undefined} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField size="small" label="Date From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField size="small" label="Date To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-day-type-label">Day Type</InputLabel>
              <Select labelId="bulk-day-type-label" label="Day Type" value={dayType} onChange={(event) => setDayType(event.target.value as RosterDayType)}>
                {rosterDayTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small" disabled={dayType !== 'WORKING'}>
              <InputLabel id="bulk-shift-label">Shift</InputLabel>
              <Select labelId="bulk-shift-label" label="Shift" value={dayType === 'WORKING' ? shiftId : ''} onChange={(event) => setShiftId(event.target.value)}>
                <MenuItem value="">Select shift</MenuItem>
                {shifts.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name} ({shift.startTime}-{shift.endTime})</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>
          <TextField size="small" label="Notes" multiline minRows={2} value={notes} onChange={(event) => setNotes(event.target.value)} fullWidth />
          <Alert severity={error ? 'warning' : 'info'}>
            {error || `Apply the selected day type and shift to ${totalCells} roster cell${totalCells === 1 ? '' : 's'} across ${employeeIds.length} employee${employeeIds.length === 1 ? '' : 's'} and ${dates.length} day${dates.length === 1 ? '' : 's'}.`}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={Boolean(error) || loading}>{loading ? 'Applying...' : 'Apply Bulk Update'}</Button>
      </DialogActions>
    </Dialog>
  );
}
