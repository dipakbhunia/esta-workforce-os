import { Alert, Box, Button, Chip, FormControl, InputLabel, MenuItem, Select, Stack, Tooltip, Typography } from '@mui/material';
import { CalendarDays, Copy, Eraser, Layers, MousePointer2, RotateCcw, Trash2 } from 'lucide-react';

export type RosterBulkSelectionOperation = 'ASSIGN_SHIFT' | 'WEEKLY_OFF' | 'NO_SHIFT' | 'CLEAR' | 'COPY_DAY' | 'COPY_WEEK' | 'DUPLICATE_PREVIOUS_WEEK';
export type RosterConflictMode = 'EMPTY_ONLY' | 'REPLACE_SELECTED';

interface RosterSelectionActionBarProps {
  selectionMode: boolean;
  selectedCount: number;
  selectedExistingCount: number;
  selectedEmployeeCount: number;
  selectedDateCount: number;
  readonly?: boolean;
  readonlyReason?: string;
  conflictMode: RosterConflictMode;
  canCopyDay: boolean;
  canCopyWeek: boolean;
  canDuplicatePreviousWeek: boolean;
  duplicatePreviousWeekReason?: string;
  onEnterSelectionMode: () => void;
  onCancelSelection: () => void;
  onConflictModeChange: (mode: RosterConflictMode) => void;
  onSelectVisibleWeek: () => void;
  onClearSelection: () => void;
  onOperation: (operation: RosterBulkSelectionOperation) => void;
}

export function RosterSelectionActionBar({
  selectionMode,
  selectedCount,
  selectedExistingCount,
  selectedEmployeeCount,
  selectedDateCount,
  readonly,
  readonlyReason,
  conflictMode,
  canCopyDay,
  canCopyWeek,
  canDuplicatePreviousWeek,
  duplicatePreviousWeekReason,
  onEnterSelectionMode,
  onCancelSelection,
  onConflictModeChange,
  onSelectVisibleWeek,
  onClearSelection,
  onOperation,
}: RosterSelectionActionBarProps) {
  if (!selectionMode) {
    return (
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
        <Alert severity={readonly ? 'info' : 'info'} sx={{ flex: 1 }}>
          {readonly ? readonlyReason ?? 'This roster is read-only. Selection workflows are available only for draft rosters.' : 'Use Select Cells for bulk assignment, copy, and clear workflows across the visible week.'}
        </Alert>
        <Tooltip title={readonly ? readonlyReason ?? 'Roster is read-only' : 'Select cells in the visible week'}>
          <span>
            <Button variant="contained" startIcon={<MousePointer2 size={17} />} disabled={readonly} onClick={onEnterSelectionMode}>Select Cells</Button>
          </span>
        </Tooltip>
      </Stack>
    );
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'primary.light', bgcolor: 'rgba(37,99,235,0.06)', borderRadius: 3, p: 1.5 }}>
      <Stack gap={1.25}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box minWidth={0}>
            <Typography fontWeight={900}>{selectedCount} cell{selectedCount === 1 ? '' : 's'} selected</Typography>
            <Typography variant="caption" color="text.secondary">
              {selectedExistingCount} existing, {Math.max(0, selectedCount - selectedExistingCount)} open, {selectedEmployeeCount} employee{selectedEmployeeCount === 1 ? '' : 's'}, {selectedDateCount} date{selectedDateCount === 1 ? '' : 's'}.
            </Typography>
          </Box>
          <Stack direction="row" gap={0.75} flexWrap="wrap" justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
            <Chip size="small" color="primary" label="Selection mode" />
            <Button size="small" variant="outlined" startIcon={<CalendarDays size={16} />} onClick={onSelectVisibleWeek}>Select Visible Week</Button>
            <Button size="small" variant="text" onClick={onClearSelection} disabled={!selectedCount}>Clear Selection</Button>
            <Button size="small" variant="text" color="inherit" onClick={onCancelSelection}>Cancel Selection</Button>
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', lg: 'row' }} gap={1} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
          <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 240 } }}>
            <InputLabel id="roster-selection-conflict-mode-label">Replace Mode</InputLabel>
            <Select
              labelId="roster-selection-conflict-mode-label"
              label="Replace Mode"
              value={conflictMode}
              onChange={(event) => onConflictModeChange(event.target.value as RosterConflictMode)}
            >
              <MenuItem value="EMPTY_ONLY">Fill empty roster days only</MenuItem>
              <MenuItem value="REPLACE_SELECTED">Replace selected roster days</MenuItem>
            </Select>
          </FormControl>
          <Stack direction="row" gap={0.75} flexWrap="wrap" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}>
            <Button size="small" variant="contained" startIcon={<Layers size={16} />} disabled={!selectedCount} onClick={() => onOperation('ASSIGN_SHIFT')}>Assign Shift</Button>
            <Button size="small" variant="outlined" disabled={!selectedCount} onClick={() => onOperation('WEEKLY_OFF')}>Weekly Off</Button>
            <Button size="small" variant="outlined" disabled={!selectedCount} onClick={() => onOperation('NO_SHIFT')}>No Shift</Button>
            <Button size="small" variant="outlined" color="error" startIcon={<Trash2 size={16} />} disabled={!selectedExistingCount} onClick={() => onOperation('CLEAR')}>Clear</Button>
            <Tooltip title={canCopyDay ? 'Copy one selected roster day to the other selected cells' : 'Select one existing roster day and at least one target cell'}>
              <span><Button size="small" variant="outlined" startIcon={<Copy size={16} />} disabled={!canCopyDay} onClick={() => onOperation('COPY_DAY')}>Copy Day</Button></span>
            </Tooltip>
            <Tooltip title={canCopyWeek ? 'Copy the selected employee week to target employees' : 'Select cells from one source employee'}>
              <span><Button size="small" variant="outlined" startIcon={<Copy size={16} />} disabled={!canCopyWeek} onClick={() => onOperation('COPY_WEEK')}>Copy Employee Week</Button></span>
            </Tooltip>
            <Tooltip title={canDuplicatePreviousWeek ? 'Duplicate previous week into the current visible week' : duplicatePreviousWeekReason ?? 'Previous week cannot be duplicated'}>
              <span><Button size="small" variant="outlined" startIcon={<RotateCcw size={16} />} disabled={!canDuplicatePreviousWeek} onClick={() => onOperation('DUPLICATE_PREVIOUS_WEEK')}>Duplicate Previous Week</Button></span>
            </Tooltip>
          </Stack>
        </Stack>

        {conflictMode === 'REPLACE_SELECTED' ? (
          <Alert severity="warning" icon={<Eraser size={18} />}>
            Replace selected roster days can overwrite existing cells and requires confirmation before saving.
          </Alert>
        ) : null}
      </Stack>
    </Box>
  );
}
