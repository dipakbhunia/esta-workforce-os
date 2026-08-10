import { Alert, Box, Button, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, Layers, RotateCcw, Search, Users } from 'lucide-react';

interface RosterSchedulerToolbarProps {
  weekLabel: string;
  employeeSearch: string;
  employeeCount: number;
  visibleEmployeeCount: number;
  readonly?: boolean;
  readonlyReason?: string;
  canPreviousWeek?: boolean;
  canNextWeek?: boolean;
  copyModeLabel?: string | null;
  loading?: boolean;
  onPreviousWeek: () => void;
  onToday: () => void;
  onNextWeek: () => void;
  onEmployeeSearchChange: (value: string) => void;
  onCancelCopy?: () => void;
  onBulkUpdate: () => void;
  onApplyTemplate: () => void;
  onApplyRotation: () => void;
}

export function RosterSchedulerToolbar({
  weekLabel,
  employeeSearch,
  employeeCount,
  visibleEmployeeCount,
  readonly,
  readonlyReason,
  canPreviousWeek = true,
  canNextWeek = true,
  copyModeLabel,
  loading,
  onPreviousWeek,
  onToday,
  onNextWeek,
  onEmployeeSearchChange,
  onCancelCopy,
  onBulkUpdate,
  onApplyTemplate,
  onApplyRotation,
}: RosterSchedulerToolbarProps) {
  return (
    <Stack gap={1.5}>
      {readonly ? <Alert severity="info">{readonlyReason ?? 'This roster is read-only in the scheduler.'}</Alert> : null}
      {copyModeLabel ? (
        <Alert
          severity="info"
          action={<Button size="small" color="inherit" onClick={onCancelCopy}>Cancel Copy</Button>}
        >
          {copyModeLabel}
        </Alert>
      ) : null}
      <Stack direction={{ xs: 'column', lg: 'row' }} gap={1.25} alignItems={{ xs: 'stretch', lg: 'center' }} justifyContent="space-between">
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button variant="outlined" startIcon={<ChevronLeft size={17} />} onClick={onPreviousWeek} disabled={!canPreviousWeek || loading}>Previous Week</Button>
            <Button variant="outlined" onClick={onToday} disabled={loading}>Today</Button>
            <Button variant="outlined" endIcon={<ChevronRight size={17} />} onClick={onNextWeek} disabled={!canNextWeek || loading}>Next Week</Button>
          </Stack>
          <Box sx={{ px: 1.25, py: 0.75, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', minWidth: { xs: '100%', sm: 240 } }}>
            <Typography variant="caption" color="text.secondary">Visible week</Typography>
            <Typography fontWeight={900}>{weekLabel}</Typography>
          </Box>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ xs: 'stretch', md: 'center' }} flexWrap="wrap" justifyContent={{ xs: 'flex-start', lg: 'flex-end' }}>
          <TextField
            size="small"
            label="Employee Search"
            placeholder="Search name or code"
            value={employeeSearch}
            onChange={(event) => onEmployeeSearchChange(event.target.value)}
            InputProps={{ startAdornment: <Search size={16} style={{ marginRight: 8 }} aria-hidden /> }}
            sx={{ minWidth: { xs: '100%', md: 220 } }}
          />
          <Tooltip title="Employees are based on the loaded roster scope results for this scheduler window.">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.8, border: '1px solid', borderColor: 'divider', borderRadius: 2, color: 'text.secondary' }}>
              <Users size={16} />
              <Typography variant="caption" fontWeight={800}>{visibleEmployeeCount}/{employeeCount} employees</Typography>
            </Box>
          </Tooltip>
          <Tooltip title={readonly ? readonlyReason ?? 'Roster is read-only in the scheduler' : 'Bulk update roster cells'}>
            <span><Button variant="outlined" size="small" startIcon={<Layers size={17} />} onClick={onBulkUpdate} disabled={readonly || loading}>Bulk Update</Button></span>
          </Tooltip>
          <Tooltip title={readonly ? readonlyReason ?? 'Roster is read-only in the scheduler' : 'Apply a roster template'}>
            <span><Button variant="outlined" size="small" startIcon={<Layers size={17} />} onClick={onApplyTemplate} disabled={readonly || loading}>Template</Button></span>
          </Tooltip>
          <Tooltip title={readonly ? readonlyReason ?? 'Roster is read-only in the scheduler' : 'Apply a rotation pattern'}>
            <span><Button variant="outlined" size="small" startIcon={<RotateCcw size={17} />} onClick={onApplyRotation} disabled={readonly || loading}>Rotation</Button></span>
          </Tooltip>
        </Stack>
      </Stack>
    </Stack>
  );
}
