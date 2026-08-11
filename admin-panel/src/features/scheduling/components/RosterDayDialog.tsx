import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';
import type { RosterDayType, ShiftRosterDay, ShiftRosterDayPayload } from '../types/shift-roster.types';
import { dayTypeLabel, employeeName, rosterDayTypeOptions, toLocalDateInput } from '../utils/shift-roster-utils';

interface RosterDayDialogProps {
  open: boolean;
  day?: ShiftRosterDay | null;
  defaultEmployeeId?: string;
  defaultWorkDate?: string;
  employees: Employee[];
  shifts: Shift[];
  loading?: boolean;
  readonly?: boolean;
  onClose: () => void;
  onSubmit: (payload: ShiftRosterDayPayload) => void;
  onClear?: (day: ShiftRosterDay) => void;
}

export function RosterDayDialog({ open, day, defaultEmployeeId = '', defaultWorkDate = '', employees, shifts, loading, readonly, onClose, onSubmit, onClear }: RosterDayDialogProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [dayType, setDayType] = useState<RosterDayType>('WORKING');
  const [shiftId, setShiftId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmployeeId(day?.employeeId ?? defaultEmployeeId);
    setWorkDate(toLocalDateInput(day?.workDate) || defaultWorkDate);
    setDayType(day?.dayType ?? 'WORKING');
    setShiftId(day?.shiftId ?? day?.shift?.id ?? '');
    setNotes(day?.notes ?? '');
  }, [day, defaultEmployeeId, defaultWorkDate, open]);

  const error = useMemo(() => {
    if (!employeeId) return 'Employee is required.';
    if (!workDate) return 'Work date is required.';
    if (dayType === 'WORKING' && !shiftId) return 'Working roster days require a shift.';
    return '';
  }, [dayType, employeeId, shiftId, workDate]);

  const submit = () => {
    if (error || readonly) return;
    onSubmit({ employeeId, workDate, dayType, shiftId: dayType === 'WORKING' ? shiftId : null, source: 'MANUAL', notes: notes.trim() || null });
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{day ? 'Edit Roster Day' : 'Add Roster Day'}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {readonly ? <Alert severity="info">This roster is read-only. Locked rosters cannot be edited.</Alert> : null}
          <FormControl fullWidth size="small" disabled={readonly || Boolean(day)}>
            <InputLabel id="roster-day-employee-label">Employee</InputLabel>
            <Select labelId="roster-day-employee-label" label="Employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.employeeCode}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" label="Work Date" type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} InputLabelProps={{ shrink: true }} disabled={readonly || Boolean(day)} fullWidth />
          <FormControl fullWidth size="small" disabled={readonly}>
            <InputLabel id="roster-day-type-label">Day Type</InputLabel>
            <Select labelId="roster-day-type-label" label="Day Type" value={dayType} onChange={(event) => setDayType(event.target.value as RosterDayType)}>
              {rosterDayTypeOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" disabled={readonly || dayType !== 'WORKING'}>
            <InputLabel id="roster-day-shift-label">Shift</InputLabel>
            <Select labelId="roster-day-shift-label" label="Shift" value={dayType === 'WORKING' ? shiftId : ''} onChange={(event) => setShiftId(event.target.value)}>
              <MenuItem value="">Select shift</MenuItem>
              {shifts.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name} ({shift.startTime}-{shift.endTime})</MenuItem>)}
            </Select>
          </FormControl>
          <TextField size="small" label="Notes" multiline minRows={3} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={readonly} fullWidth />
          {error && !readonly ? <Alert severity="warning">{error}</Alert> : <Alert severity="info">{dayType === 'WORKING' ? 'Working days require a shift.' : `${dayTypeLabel(dayType)} days are saved without a shift.`}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {day && !readonly && onClear ? <Button color="error" onClick={() => onClear(day)} disabled={loading}>Clear Day</Button> : null}
        <Button onClick={onClose} disabled={loading}>Close</Button>
        {!readonly ? <Button variant="contained" onClick={submit} disabled={Boolean(error) || loading}>{loading ? 'Saving...' : 'Save Day'}</Button> : null}
      </DialogActions>
    </Dialog>
  );
}
