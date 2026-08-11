import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, InputLabel, ListItemText, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { Shift } from '@/features/organization/types/shift.types';
import type { Employee } from '@/features/people/types/employee.types';
import type { RosterCellInput } from './RosterCalendarGrid';
import type { RosterBulkSelectionOperation, RosterConflictMode } from './RosterSelectionActionBar';
import type { ShiftRosterDay } from '../types/shift-roster.types';
import { addDays, employeeName, formatDateOnly, rosterDayShiftLabel } from '../utils/shift-roster-utils';

export interface RosterBulkSelectionSubmitConfig {
  operation: RosterBulkSelectionOperation;
  mode: RosterConflictMode;
  shiftId?: string;
  notes?: string;
  targetEmployeeIds?: string[];
  sourceEmployeeId?: string;
  sourceDayId?: string;
}

interface RosterBulkSelectionDialogProps {
  open: boolean;
  operation: RosterBulkSelectionOperation | null;
  mode: RosterConflictMode;
  selectedCells: RosterCellInput[];
  visibleCells: RosterCellInput[];
  employees: Employee[];
  shifts: Shift[];
  sourceDay?: ShiftRosterDay | null;
  sourceDayCandidates?: ShiftRosterDay[];
  sourceWeekEmployeeId?: string | null;
  previousWeekDays: ShiftRosterDay[];
  weekStart: string;
  loading?: boolean;
  backendLimit: number;
  onClose: () => void;
  onSubmit: (config: RosterBulkSelectionSubmitConfig) => void;
}

export function RosterBulkSelectionDialog({
  open,
  operation,
  mode,
  selectedCells,
  visibleCells,
  employees,
  shifts,
  sourceDay,
  sourceDayCandidates = [],
  sourceWeekEmployeeId,
  previousWeekDays,
  weekStart,
  loading,
  backendLimit,
  onClose,
  onSubmit,
}: RosterBulkSelectionDialogProps) {
  const [shiftId, setShiftId] = useState('');
  const [notes, setNotes] = useState('');
  const [conflictMode, setConflictMode] = useState<RosterConflictMode>(mode);
  const [targetEmployeeIds, setTargetEmployeeIds] = useState<string[]>([]);
  const [sourceEmployeeId, setSourceEmployeeId] = useState('');
  const [copyDaySourceId, setCopyDaySourceId] = useState('');

  useEffect(() => {
    if (!open) return;
    setShiftId('');
    setNotes('');
    setConflictMode(mode);
    setSourceEmployeeId(sourceWeekEmployeeId ?? selectedCells[0]?.employeeId ?? '');
    setCopyDaySourceId(sourceDay?.id ?? sourceDayCandidates[0]?.id ?? '');
    const selectedEmployeeIds = unique(selectedCells.map((cell) => cell.employeeId));
    const fallbackTargets = selectedEmployeeIds.length ? selectedEmployeeIds : employees.map((employee) => employee.id);
    const sourceId = sourceWeekEmployeeId ?? sourceDay?.employeeId ?? '';
    setTargetEmployeeIds(fallbackTargets.filter((employeeId) => employeeId !== sourceId));
  }, [employees, mode, open, selectedCells, sourceDay?.employeeId, sourceDay?.id, sourceDayCandidates, sourceWeekEmployeeId]);

  const selectedExistingCount = selectedCells.filter((cell) => Boolean(cell.day)).length;
  const effectiveSourceDay = operation === 'COPY_DAY' ? sourceDayCandidates.find((day) => day.id === copyDaySourceId) ?? sourceDay ?? null : sourceDay ?? null;
  const sourceEmployee = employees.find((employee) => employee.id === sourceEmployeeId);
  const selectedShift = shifts.find((shift) => shift.id === shiftId);
  const targetEmployeeOptions = useMemo(
    () => operation === 'COPY_WEEK' ? employees.filter((employee) => employee.id !== sourceEmployeeId) : employees,
    [employees, operation, sourceEmployeeId],
  );
  const safeTargetEmployeeIds = useMemo(
    () => operation === 'COPY_WEEK' ? targetEmployeeIds.filter((employeeId) => employeeId !== sourceEmployeeId) : targetEmployeeIds,
    [operation, sourceEmployeeId, targetEmployeeIds],
  );

  const preview = useMemo(() => buildPreview({ operation, conflictMode, selectedCells, visibleCells, targetEmployeeIds: safeTargetEmployeeIds, sourceDay: effectiveSourceDay, sourceEmployeeId, previousWeekDays, weekStart }), [conflictMode, effectiveSourceDay, operation, previousWeekDays, safeTargetEmployeeIds, selectedCells, sourceEmployeeId, visibleCells, weekStart]);

  const title = operationTitle(operation);
  const needsShift = operation === 'ASSIGN_SHIFT';
  const needsEmployeeTargets = operation === 'COPY_WEEK' || operation === 'DUPLICATE_PREVIOUS_WEEK';
  const replacementRisk = conflictMode === 'REPLACE_SELECTED' && preview.replacements > 0;
  const overLimit = preview.writes > backendLimit;
  const error = useMemo(() => {
    if (!operation) return 'Select a bulk operation.';
    if (needsShift && !shiftId) return 'Select a working shift.';
    if (operation === 'COPY_DAY' && !effectiveSourceDay) return 'Choose one selected existing roster day as the source.';
    if (operation === 'COPY_DAY' && !preview.targetCells) return 'Select at least one additional target cell to receive the copied day.';
    if (operation === 'COPY_WEEK' && !sourceEmployeeId) return 'Select a source employee.';
    if (operation === 'COPY_WEEK' && !targetEmployeeOptions.length) return 'No other employees are available for this visible roster.';
    if (operation === 'COPY_WEEK' && !safeTargetEmployeeIds.length) return 'Select at least one other employee.';
    if (operation === 'DUPLICATE_PREVIOUS_WEEK' && !safeTargetEmployeeIds.length) return 'Select at least one target employee.';
    if (operation === 'CLEAR' && !selectedExistingCount) return 'Selected cells do not contain roster days to clear.';
    if (!preview.writes && operation !== 'CLEAR') return 'There are no writable cells for this operation.';
    if (operation === 'CLEAR' && !preview.writes) return 'There are no existing roster days to clear.';
    if (overLimit) return `This operation would affect ${preview.writes} cells. The backend limit is ${backendLimit}. Reduce the selection.`;
    return '';
  }, [backendLimit, effectiveSourceDay, needsShift, operation, overLimit, preview.targetCells, preview.writes, safeTargetEmployeeIds.length, selectedExistingCount, shiftId, sourceEmployeeId, targetEmployeeOptions.length]);

  if (!operation) return null;

  const submit = () => {
    if (error) return;
    onSubmit({ operation, mode: conflictMode, shiftId, notes: notes.trim() || undefined, targetEmployeeIds: safeTargetEmployeeIds, sourceEmployeeId, sourceDayId: effectiveSourceDay?.id });
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          <Alert severity={replacementRisk || operation === 'CLEAR' ? 'warning' : 'info'}>
            {operation === 'CLEAR'
              ? 'Bulk clear deletes existing roster-day cells one by one. If a network error occurs, the page will refetch to show the backend state.'
              : conflictMode === 'EMPTY_ONLY'
                ? 'Empty Only writes into open cells and skips occupied roster days.'
                : 'Replace Selected may overwrite existing roster days after confirmation.'}
          </Alert>

          {(operation === 'ASSIGN_SHIFT') ? (
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-selection-shift-label">Working Shift</InputLabel>
              <Select labelId="bulk-selection-shift-label" label="Working Shift" value={shiftId} onChange={(event) => setShiftId(event.target.value)}>
                <MenuItem value="">Select shift</MenuItem>
                {shifts.map((shift) => <MenuItem key={shift.id} value={shift.id}>{shift.name} ({shift.startTime}-{shift.endTime})</MenuItem>)}
              </Select>
            </FormControl>
          ) : null}

          {(operation !== 'CLEAR') ? (
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-selection-mode-label">Replace Mode</InputLabel>
              <Select labelId="bulk-selection-mode-label" label="Replace Mode" value={conflictMode} onChange={(event) => setConflictMode(event.target.value as RosterConflictMode)}>
                <MenuItem value="EMPTY_ONLY">Fill empty roster days only</MenuItem>
                <MenuItem value="REPLACE_SELECTED">Replace selected roster days</MenuItem>
              </Select>
            </FormControl>
          ) : null}

          {operation === 'COPY_DAY' && sourceDayCandidates.length > 1 ? (
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-copy-day-source-label">Source Day</InputLabel>
              <Select labelId="bulk-copy-day-source-label" label="Source Day" value={copyDaySourceId} onChange={(event) => setCopyDaySourceId(event.target.value)}>
                {sourceDayCandidates.map((day) => <MenuItem key={day.id} value={day.id}>{rosterDayShiftLabel(day)} on {formatDateOnly(day.workDate)}</MenuItem>)}
              </Select>
            </FormControl>
          ) : null}

          {operation === 'COPY_WEEK' ? (
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-source-employee-label">Source Employee</InputLabel>
              <Select
                labelId="bulk-source-employee-label"
                label="Source Employee"
                value={sourceEmployeeId}
                onChange={(event) => {
                  const nextSourceEmployeeId = event.target.value;
                  setSourceEmployeeId(nextSourceEmployeeId);
                  setTargetEmployeeIds((current) => current.filter((employeeId) => employeeId !== nextSourceEmployeeId));
                }}
              >
                {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.employeeCode}</MenuItem>)}
              </Select>
            </FormControl>
          ) : null}

          {needsEmployeeTargets ? (
            <FormControl fullWidth size="small">
              <InputLabel id="bulk-target-employees-label">Target Employees</InputLabel>
              <Select
                labelId="bulk-target-employees-label"
                multiple
                label="Target Employees"
                value={safeTargetEmployeeIds}
                onChange={(event) => {
                  const nextTargetEmployeeIds = typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value;
                  setTargetEmployeeIds(operation === 'COPY_WEEK' ? nextTargetEmployeeIds.filter((employeeId) => employeeId !== sourceEmployeeId) : nextTargetEmployeeIds);
                }}
                renderValue={(selected) => `${selected.length} employee${selected.length === 1 ? '' : 's'} selected`}
              >
                {targetEmployeeOptions.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    <Checkbox checked={safeTargetEmployeeIds.includes(employee.id)} />
                    <ListItemText primary={`${employeeName(employee)} - ${employee.employeeCode}`} secondary={employee.department?.name ?? employee.branch?.name ?? undefined} />
                  </MenuItem>
                ))}
              </Select>
              {operation === 'COPY_WEEK' && !targetEmployeeOptions.length ? (
                <Typography variant="caption" color="text.secondary">No other employees are available for this visible roster.</Typography>
              ) : null}
            </FormControl>
          ) : null}

          {operation === 'ASSIGN_SHIFT' || operation === 'WEEKLY_OFF' || operation === 'NO_SHIFT' ? (
            <TextField size="small" label="Notes" multiline minRows={2} value={notes} onChange={(event) => setNotes(event.target.value)} fullWidth />
          ) : null}

          <Divider />
          <Stack gap={0.75}>
            <Typography fontWeight={900}>Preview</Typography>
            <Typography variant="body2" color="text.secondary">Target cells: {preview.targetCells}</Typography>
            <Typography variant="body2" color="text.secondary">New writes: {preview.newWrites}</Typography>
            <Typography variant="body2" color="text.secondary">Replacements: {preview.replacements}</Typography>
            <Typography variant="body2" color="text.secondary">Skipped occupied cells: {preview.skippedExisting}</Typography>
            <Typography variant="body2" color="text.secondary">Skipped out-of-period cells: {preview.skippedOutOfPeriod}</Typography>
            <Typography variant="body2" color="text.secondary">Empty/no-op cells: {preview.emptyNoOp}</Typography>
            <Typography variant="body2" color="text.secondary">Affected employees: {preview.affectedEmployees}</Typography>
            <Typography variant="body2" color="text.secondary">Date range: {preview.dateRange}</Typography>
            {effectiveSourceDay ? <Typography variant="body2" color="text.secondary">Source day: {rosterDayShiftLabel(effectiveSourceDay)} on {formatDateOnly(effectiveSourceDay.workDate)}</Typography> : null}
            {operation === 'COPY_DAY' ? <Typography variant="body2" color="text.secondary">Copy Day targets are the selected cells other than the source cell.</Typography> : null}
            {sourceEmployee ? <Typography variant="body2" color="text.secondary">Source employee: {employeeName(sourceEmployee)}</Typography> : null}
            {selectedShift ? <Typography variant="body2" color="text.secondary">Working shift: {selectedShift.name} ({selectedShift.startTime}-{selectedShift.endTime})</Typography> : null}
            {preview.holidayOrWeeklyOffWarnings > 0 && operation === 'ASSIGN_SHIFT' ? <Alert severity="warning">{preview.holidayOrWeeklyOffWarnings} selected cells are weekly off or holiday roster days.</Alert> : null}
            {error ? <Alert severity="warning">{error}</Alert> : null}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" color={operation === 'CLEAR' || replacementRisk ? 'warning' : 'primary'} onClick={submit} disabled={Boolean(error) || loading}>{loading ? 'Applying...' : replacementRisk ? 'Confirm Replace' : operation === 'CLEAR' ? 'Confirm Clear' : 'Apply'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function buildPreview(params: {
  operation: RosterBulkSelectionOperation | null;
  conflictMode: RosterConflictMode;
  selectedCells: RosterCellInput[];
  visibleCells: RosterCellInput[];
  targetEmployeeIds: string[];
  sourceDay?: ShiftRosterDay | null;
  sourceEmployeeId: string;
  previousWeekDays: ShiftRosterDay[];
  weekStart: string;
}) {
  const targets = resolveTargets(params);
  const inPeriodTargets = targets;
  const occupied = inPeriodTargets.filter((cell) => Boolean(cell.day));
  const open = inPeriodTargets.length - occupied.length;
  const writes = params.operation === 'CLEAR'
    ? occupied.length
    : params.conflictMode === 'EMPTY_ONLY'
      ? open
      : inPeriodTargets.length;
  const replacements = params.operation === 'CLEAR' ? 0 : params.conflictMode === 'REPLACE_SELECTED' ? occupied.length : 0;
  const newWrites = params.operation === 'CLEAR' ? 0 : params.conflictMode === 'EMPTY_ONLY' ? open : open;
  const dates = unique(inPeriodTargets.map((cell) => cell.workDate)).sort();
  return {
    targetCells: inPeriodTargets.length,
    writes,
    newWrites,
    replacements,
    skippedExisting: params.operation !== 'CLEAR' && params.conflictMode === 'EMPTY_ONLY' ? occupied.length : 0,
    skippedOutOfPeriod: 0,
    emptyNoOp: params.operation === 'CLEAR' ? open : 0,
    affectedEmployees: unique(inPeriodTargets.map((cell) => cell.employeeId)).length,
    dateRange: dates.length ? `${formatDateOnly(dates[0])} - ${formatDateOnly(dates[dates.length - 1])}` : 'No dates',
    holidayOrWeeklyOffWarnings: inPeriodTargets.filter((cell) => cell.day?.dayType === 'HOLIDAY' || cell.day?.dayType === 'WEEKLY_OFF').length,
  };
}

function resolveTargets(params: {
  operation: RosterBulkSelectionOperation | null;
  selectedCells: RosterCellInput[];
  visibleCells: RosterCellInput[];
  targetEmployeeIds: string[];
  sourceDay?: ShiftRosterDay | null;
  sourceEmployeeId: string;
  previousWeekDays: ShiftRosterDay[];
  weekStart: string;
}) {
  if (params.operation === 'COPY_DAY' && params.sourceDay) {
    const sourceKey = cellKey(params.sourceDay.employeeId, params.sourceDay.workDate.slice(0, 10));
    return params.selectedCells.filter((cell) => cellKey(cell.employeeId, cell.workDate) !== sourceKey);
  }
  if (params.operation === 'COPY_WEEK') {
    const sourceDates = unique(params.visibleCells.filter((cell) => cell.employeeId === params.sourceEmployeeId && cell.day).map((cell) => cell.workDate));
    return params.targetEmployeeIds.flatMap((employeeId) => sourceDates.map((date) => findCell(params.visibleCells, employeeId, date)).filter(Boolean) as RosterCellInput[]);
  }
  if (params.operation === 'DUPLICATE_PREVIOUS_WEEK') {
    const previousDates = Array.from({ length: 7 }, (_, index) => addDays(params.weekStart, index - 7));
    const currentDates = Array.from({ length: 7 }, (_, index) => addDays(params.weekStart, index));
    return params.targetEmployeeIds.flatMap((employeeId) => previousDates.flatMap((previousDate, index) => {
      const hasSource = params.previousWeekDays.some((day) => day.employeeId === employeeId && day.workDate.slice(0, 10) === previousDate);
      const target = findCell(params.visibleCells, employeeId, currentDates[index]);
      return hasSource && target ? [target] : [];
    }));
  }
  return params.selectedCells;
}

function cellKey(employeeId: string, workDate: string) {
  return `${employeeId}:${workDate}`;
}

function findCell(cells: RosterCellInput[], employeeId: string, workDate: string) {
  return cells.find((cell) => cell.employeeId === employeeId && cell.workDate === workDate) ?? null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function operationTitle(operation: RosterBulkSelectionOperation | null) {
  switch (operation) {
    case 'ASSIGN_SHIFT': return 'Bulk Assign Working Shift';
    case 'WEEKLY_OFF': return 'Bulk Weekly Off';
    case 'NO_SHIFT': return 'Bulk No Shift';
    case 'CLEAR': return 'Bulk Clear Roster Days';
    case 'COPY_DAY': return 'Copy Day to Selected Cells';
    case 'COPY_WEEK': return 'Copy Employee Week';
    case 'DUPLICATE_PREVIOUS_WEEK': return 'Duplicate Previous Week';
    default: return 'Bulk Selection';
  }
}
