import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DateRangePicker, createCustomDateRangeValue } from '@/components/enterprise/date-range';
import { getEmployees } from '@/features/people/services/employees-api';
import { getShiftRosters } from '../services/shift-rosters-api';
import { applyRosterTemplate, getRosterTemplates } from '../services/roster-templates-api';
import type { RosterTemplate, RosterTemplateOverwriteMode } from '../types/roster-template.types';
import type { ShiftRosterPeriod } from '../types/shift-roster.types';
import { employeeName } from '../utils/shift-roster-utils';

interface Props {
  open: boolean;
  roster?: ShiftRosterPeriod | null;
  template?: RosterTemplate | null;
  onClose: () => void;
  onApplied?: () => void;
}

export function RosterTemplateApplyDialog({ open, roster, template, onClose, onApplied }: Props) {
  const queryClient = useQueryClient();
  const [rosterId, setRosterId] = useState(roster?.id ?? '');
  const [templateId, setTemplateId] = useState(template?.id ?? '');
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(roster?.dateFrom?.slice(0, 10) ?? '');
  const [dateTo, setDateTo] = useState(roster?.dateTo?.slice(0, 10) ?? '');
  const [overwriteMode, setOverwriteMode] = useState<RosterTemplateOverwriteMode>('EMPTY_ONLY');
  const [error, setError] = useState<string | null>(null);

  const rostersQuery = useQuery({ queryKey: ['shift-rosters', { selector: 'apply-template' }], queryFn: () => getShiftRosters({ page: 1, limit: 100, status: 'DRAFT' }), enabled: open && !roster });
  const templatesQuery = useQuery({ queryKey: ['roster-templates', { selector: 'apply-template' }], queryFn: () => getRosterTemplates({ page: 1, limit: 100, enabled: true }), enabled: open && !template });
  const selectedRoster = roster ?? rostersQuery.data?.data.data.find((item) => item.id === rosterId) ?? null;
  const employeesQuery = useQuery({ queryKey: ['employees', { selector: 'apply-template', branchId: selectedRoster?.branchId, departmentId: selectedRoster?.departmentId }], queryFn: () => getEmployees({ page: 1, limit: 100, branchId: selectedRoster?.branchId ?? undefined, departmentId: selectedRoster?.departmentId ?? undefined }), enabled: open && Boolean(selectedRoster) });
  const employees = employeesQuery.data?.data.data ?? [];
  const templates = templatesQuery.data?.data.data ?? [];

  const mutation = useMutation({
    mutationFn: () => applyRosterTemplate(selectedRoster!.id, { templateId: template?.id ?? templateId, employeeIds, dateFrom, dateTo, overwriteMode }),
    onSuccess: async (response) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['shift-roster', selectedRoster?.id] }), queryClient.invalidateQueries({ queryKey: ['shift-roster-days', selectedRoster?.id] }), queryClient.invalidateQueries({ queryKey: ['shift-rosters'] })]); onApplied?.(); onClose(); setError(null); setEmployeeIds([]); void response; },
    onError: () => setError('Template could not be applied. Confirm the roster is draft, employees are in scope, and dates are inside the roster period.'),
  });

  const canSubmit = Boolean(selectedRoster && (template?.id || templateId) && employeeIds.length && dateFrom && dateTo && dateFrom <= dateTo);
  const rangeHelper = selectedRoster ? `Choose dates inside ${selectedRoster.dateFrom.slice(0, 10)} to ${selectedRoster.dateTo.slice(0, 10)}.` : 'Select a draft roster first.';
  const summary = useMemo(() => `${employeeIds.length} employee(s) × ${dateFrom && dateTo && dateFrom <= dateTo ? dateCount(dateFrom, dateTo) : 0} day(s)`, [dateFrom, dateTo, employeeIds.length]);

  return <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth><DialogTitle>Apply Roster Template</DialogTitle><DialogContent><Stack gap={2} sx={{ pt: 1 }}>{error ? <Alert severity="error">{error}</Alert> : null}<Alert severity="info" icon={<CalendarCheck size={18} />}>Templates can be applied only while a roster is still in draft. Published and locked rosters stay protected.</Alert>{!roster ? <FormControl fullWidth><InputLabel id="apply-roster-label">Draft Roster</InputLabel><Select labelId="apply-roster-label" label="Draft Roster" value={rosterId} onChange={(event) => { setRosterId(event.target.value); setEmployeeIds([]); }}><MenuItem value="">Select Draft Roster</MenuItem>{(rostersQuery.data?.data.data ?? []).map((item) => <MenuItem key={item.id} value={item.id}>{item.name} ({item.code})</MenuItem>)}</Select></FormControl> : <TextField label="Draft Roster" value={`${roster.name} (${roster.code})`} disabled fullWidth />}{!template ? <FormControl fullWidth><InputLabel id="apply-template-label">Template</InputLabel><Select labelId="apply-template-label" label="Template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}><MenuItem value="">Select Template</MenuItem>{templates.map((item) => <MenuItem key={item.id} value={item.id}>{item.name} ({item.code})</MenuItem>)}</Select></FormControl> : <TextField label="Template" value={`${template.name} (${template.code})`} disabled fullWidth />}<FormControl fullWidth><InputLabel id="apply-employees-label">Employees</InputLabel><Select multiple labelId="apply-employees-label" label="Employees" value={employeeIds} onChange={(event) => setEmployeeIds(typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value)} disabled={!selectedRoster || employeesQuery.isLoading} renderValue={(selected) => `${selected.length} employee(s) selected`}><MenuItem value="__all" onClick={(event) => { event.preventDefault(); setEmployeeIds(employees.map((employee) => employee.id)); }}>Select all loaded employees</MenuItem>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employeeName(employee)} - {employee.employeeCode}</MenuItem>)}</Select></FormControl><DateRangePicker label="Apply Date Range" mode="form" presetsEnabled={false} value={createCustomDateRangeValue(dateFrom, dateTo)} onChange={(value) => { setDateFrom(value.dateFrom); setDateTo(value.dateTo); }} onClear={() => { setDateFrom(''); setDateTo(''); }} helperText={rangeHelper} error={Boolean(dateFrom && dateTo && dateFrom > dateTo)} /><FormControl fullWidth><InputLabel id="overwrite-mode-label">Overwrite Mode</InputLabel><Select labelId="overwrite-mode-label" label="Overwrite Mode" value={overwriteMode} onChange={(event) => setOverwriteMode(event.target.value as RosterTemplateOverwriteMode)}><MenuItem value="EMPTY_ONLY">Fill empty roster days only</MenuItem><MenuItem value="REPLACE_SELECTED">Replace selected roster days</MenuItem></Select></FormControl><Typography variant="caption" color="text.secondary">{overwriteMode === 'EMPTY_ONLY' ? 'Only blank roster days in the selected range will be filled.' : 'Selected roster days in the range will be replaced with this template pattern.'}</Typography><Typography variant="body2" color="text.secondary">Apply summary: {summary}</Typography></Stack></DialogContent><DialogActions><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Applying...' : 'Apply Template'}</Button></DialogActions></Dialog>;
}

function dateCount(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
