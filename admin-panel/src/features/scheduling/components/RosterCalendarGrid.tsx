import { Box, Button, Card, CardContent, Checkbox, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import type { Employee } from '@/features/people/types/employee.types';
import type { ShiftRosterDay } from '../types/shift-roster.types';
import { addDays, dateInputFromDate, employeeName, formatDateOnly } from '../utils/shift-roster-utils';
import { RosterDayCell } from './RosterDayCell';
import { isRosterDayDraggable, RosterDragDropCell, RosterDragDropContext, type RosterDragSource, type RosterDragTarget } from './RosterDragDropContext';

export interface RosterCellInput {
  employeeId: string;
  workDate: string;
  day?: ShiftRosterDay | null;
}

interface RosterCalendarGridProps {
  employees: Employee[];
  days: ShiftRosterDay[];
  weekStart: string;
  rosterDateFrom?: string | null;
  rosterDateTo?: string | null;
  readonly?: boolean;
  readonlyReason?: string;
  copySource?: ShiftRosterDay | null;
  loading?: boolean;
  selectionMode?: boolean;
  selectedKeys?: Set<string>;
  onToggleCellSelection?: (input: RosterCellInput) => void;
  onToggleEmployeeSelection?: (employeeId: string) => void;
  onToggleDateSelection?: (workDate: string) => void;
  dragEnabled?: boolean;
  dragBusy?: boolean;
  onDragCopy?: (source: RosterDragSource, target: RosterDragTarget) => void;
  onEditCell: (input: RosterCellInput) => void;
  onCopyCell: (day: ShiftRosterDay) => void;
  onClearCell: (day: ShiftRosterDay) => void;
  onSelectCopyTarget: (input: RosterCellInput) => void;
}

export function RosterCalendarGrid({
  employees,
  days,
  weekStart,
  rosterDateFrom,
  rosterDateTo,
  readonly,
  readonlyReason,
  copySource,
  loading,
  selectionMode,
  selectedKeys = new Set<string>(),
  onToggleCellSelection,
  onToggleEmployeeSelection,
  onToggleDateSelection,
  dragEnabled,
  dragBusy,
  onDragCopy,
  onEditCell,
  onCopyCell,
  onClearCell,
  onSelectCopyTarget,
}: RosterCalendarGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const today = dateInputFromDate(new Date());
  const rosterStart = rosterDateFrom?.slice(0, 10) ?? null;
  const rosterEnd = rosterDateTo?.slice(0, 10) ?? null;
  const dayMap = new Map(days.map((day) => [`${day.employeeId}:${day.workDate.slice(0, 10)}`, day]));

  if (!employees.length) {
    return <EmptyState title="No employees available" description="Adjust the roster scope or employee search to load employees for planning." />;
  }

  if (isMobile) {
    const agenda = employees.flatMap((employee) => dates.map((date) => ({ employee, date, day: dayMap.get(`${employee.id}:${date}`) ?? null })));
    return (
      <Stack gap={1.25} aria-busy={loading}>
        {selectionMode ? <Typography variant="caption" color="text.secondary">Selection mode is active. Use each card checkbox to select cells for bulk actions.</Typography> : null}
        {agenda.map(({ employee, date, day }) => {
          const outOfPeriod = isOutOfRosterPeriod(date, rosterStart, rosterEnd);
          const input = { employeeId: employee.id, workDate: date, day };
          const selected = selectedKeys.has(cellKey(employee.id, date));
          return (
            <Card key={`${employee.id}-${date}`} variant="outlined">
              <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Stack gap={1}>
                  <Stack direction="row" justifyContent="space-between" gap={1}>
                    <Box minWidth={0}>
                      <Typography fontWeight={850} noWrap>{employeeName(employee)}</Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>{employee.employeeCode}</Typography>
                    </Box>
                    <Box textAlign="right">
                      <Typography variant="caption" fontWeight={800} color={date === today ? 'primary.main' : 'text.primary'}>{weekdayLabel(date)}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">{formatDateOnly(date)}</Typography>
                    </Box>
                  </Stack>
                  <RosterDayCell
                    day={day}
                    disabled={readonly}
                    outOfPeriod={outOfPeriod}
                    readonlyReason={readonlyReason}
                    copyMode={Boolean(copySource)}
                    copyingSource={copySource?.id === day?.id}
                    selectionMode={selectionMode}
                    selected={selected}
                    selectionLabel={employeeName(employee) + ' on ' + formatDateOnly(date)}
                    onToggleSelected={() => onToggleCellSelection?.(input)}
                    onEdit={() => onEditCell(input)}
                    onCopy={day ? () => onCopyCell(day) : undefined}
                    onClear={day ? () => onClearCell(day) : undefined}
                    onSelectTarget={() => copySource ? onSelectCopyTarget(input) : onEditCell(input)}
                  />
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    );
  }

  const desktopDragEnabled = Boolean(dragEnabled && !readonly && !selectionMode && !copySource);

  return (
    <RosterDragDropContext enabled={desktopDragEnabled} busy={dragBusy} onDrop={(source, target) => onDragCopy?.(source, target)}>
      <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 3, maxWidth: '100%' }} aria-busy={loading || dragBusy}>
        <Box sx={{ minWidth: 1024, display: 'grid', gridTemplateColumns: '220px repeat(7, minmax(108px, 1fr))' }}>
        <HeaderCell sticky>Employee</HeaderCell>
        {dates.map((date) => (
          <DateHeaderCell
            key={date}
            date={date}
            today={today}
            outOfPeriod={isOutOfRosterPeriod(date, rosterStart, rosterEnd)}
            selectionMode={selectionMode}
            selectedCount={employees.filter((employee) => selectedKeys.has(cellKey(employee.id, date))).length}
            selectableCount={employees.filter(() => !isOutOfRosterPeriod(date, rosterStart, rosterEnd)).length}
            onToggle={() => onToggleDateSelection?.(date)}
          />
        ))}
        {employees.map((employee) => {
          const rowDates = dates.filter((date) => !isOutOfRosterPeriod(date, rosterStart, rosterEnd));
          const rowSelectedCount = rowDates.filter((date) => selectedKeys.has(cellKey(employee.id, date))).length;
          return (
            <Box key={employee.id} sx={{ display: 'contents' }}>
              <Box sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', p: 0.95, minWidth: 0 }}>
                <Stack direction="row" gap={0.75} alignItems="flex-start">
                  {selectionMode ? (
                    <Checkbox
                      size="small"
                      checked={rowDates.length > 0 && rowSelectedCount === rowDates.length}
                      indeterminate={rowSelectedCount > 0 && rowSelectedCount < rowDates.length}
                      onChange={() => onToggleEmployeeSelection?.(employee.id)}
                      inputProps={{ 'aria-label': `Select visible week for ${employeeName(employee)}` }}
                      sx={{ p: 0.2 }}
                    />
                  ) : null}
                  <Box minWidth={0}>
                    <Typography fontWeight={900} noWrap>{employeeName(employee)}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{employee.employeeCode}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap display="block">
                      {employee.department?.name ?? employee.designation?.name ?? employee.branch?.name ?? 'No scope'}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
              {dates.map((date) => {
                const day = dayMap.get(`${employee.id}:${date}`) ?? null;
                const outOfPeriod = isOutOfRosterPeriod(date, rosterStart, rosterEnd);
                const input = { employeeId: employee.id, workDate: date, day };
                const selected = selectedKeys.has(cellKey(employee.id, date));
                const employeeLabel = employeeName(employee);
                const target: RosterDragTarget = { ...input, employeeLabel };
                const source: RosterDragSource | null = !outOfPeriod && !readonly && isRosterDayDraggable(day) && day
                  ? { day, employeeId: employee.id, employeeLabel, workDate: date }
                  : null;
                return (
                  <Box key={`${employee.id}-${date}`} sx={{ borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider', p: 0.55, bgcolor: isWeekend(date) ? 'rgba(15,23,42,0.015)' : 'background.paper' }}>
                    <RosterDragDropCell
                      enabled={desktopDragEnabled}
                      busy={dragBusy}
                      source={source}
                      target={target}
                      targetDisabled={Boolean(readonly || outOfPeriod)}
                      disabledReason={outOfPeriod ? 'Outside roster period' : readonlyReason}
                    >
                      {({ dragHandle }) => (
                        <RosterDayCell
                          day={day}
                          disabled={readonly}
                          outOfPeriod={outOfPeriod}
                          readonlyReason={readonlyReason}
                          copyMode={Boolean(copySource)}
                          copyingSource={copySource?.id === day?.id}
                          selectionMode={selectionMode}
                          selected={selected}
                          selectionLabel={employeeLabel + ' on ' + formatDateOnly(date)}
                          dragHandle={dragHandle}
                          onToggleSelected={() => onToggleCellSelection?.(input)}
                          onEdit={() => onEditCell(input)}
                          onCopy={day ? () => onCopyCell(day) : undefined}
                          onClear={day ? () => onClearCell(day) : undefined}
                          onSelectTarget={() => copySource ? onSelectCopyTarget(input) : onEditCell(input)}
                        />
                      )}
                    </RosterDragDropCell>
                  </Box>
                );
              })}
            </Box>
          );
        })}
        </Box>
      </Box>
    </RosterDragDropContext>
  );
}

function HeaderCell({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <Box sx={{ position: sticky ? 'sticky' : 'sticky', top: 0, left: sticky ? 0 : undefined, zIndex: sticky ? 4 : 3, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider', p: 1.1 }}>
      <Typography variant="caption" fontWeight={900} color="text.secondary" noWrap>{children}</Typography>
    </Box>
  );
}

function DateHeaderCell({ date, today, outOfPeriod, selectionMode, selectedCount, selectableCount, onToggle }: { date: string; today: string; outOfPeriod: boolean; selectionMode?: boolean; selectedCount: number; selectableCount: number; onToggle?: () => void }) {
  const weekend = isWeekend(date);
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: today === date ? 'rgba(37,99,235,0.08)' : weekend ? 'grey.100' : 'grey.50', borderBottom: '1px solid', borderLeft: '1px solid', borderColor: 'divider', p: 0.85, opacity: outOfPeriod ? 0.62 : 1 }}>
      <Stack gap={0.25} alignItems="center">
        {selectionMode && !outOfPeriod ? (
          <Checkbox
            size="small"
            checked={selectableCount > 0 && selectedCount === selectableCount}
            indeterminate={selectedCount > 0 && selectedCount < selectableCount}
            onChange={onToggle}
            inputProps={{ 'aria-label': `Select all visible employees for ${formatDateOnly(date)}` }}
            sx={{ p: 0.1 }}
          />
        ) : null}
        <Typography variant="caption" fontWeight={900} color={today === date ? 'primary.main' : 'text.primary'} noWrap>{weekdayLabel(date)}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{formatDateOnly(date)}</Typography>
        <Typography variant="caption" color={today === date ? 'primary.main' : weekend ? 'warning.main' : 'text.secondary'} noWrap>
          {today === date ? 'Today' : weekend ? 'Weekend' : outOfPeriod ? 'Out of period' : 'Roster day'}
        </Typography>
      </Stack>
    </Box>
  );
}

export function cellKey(employeeId: string, workDate: string) {
  return `${employeeId}:${workDate}`;
}

function weekdayLabel(dateInput: string) {
  const date = new Date(`${dateInput}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateInput;
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date);
}

function isWeekend(dateInput: string) {
  const day = new Date(`${dateInput}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function isOutOfRosterPeriod(date: string, rosterStart: string | null, rosterEnd: string | null) {
  return Boolean((rosterStart && date < rosterStart) || (rosterEnd && date > rosterEnd));
}
