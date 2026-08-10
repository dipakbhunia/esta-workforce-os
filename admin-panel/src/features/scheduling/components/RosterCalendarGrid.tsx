import { Box, Card, CardContent, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import type { Employee } from '@/features/people/types/employee.types';
import type { ShiftRosterDay } from '../types/shift-roster.types';
import { addDays, dateInputFromDate, employeeName, formatDateOnly } from '../utils/shift-roster-utils';
import { RosterDayCell } from './RosterDayCell';

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
        {agenda.map(({ employee, date, day }) => {
          const outOfPeriod = isOutOfRosterPeriod(date, rosterStart, rosterEnd);
          const input = { employeeId: employee.id, workDate: date, day };
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

  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 3, maxWidth: '100%' }} aria-busy={loading}>
      <Box sx={{ minWidth: 1024, display: 'grid', gridTemplateColumns: '220px repeat(7, minmax(108px, 1fr))' }}>
        <HeaderCell sticky>Employee</HeaderCell>
        {dates.map((date) => <DateHeaderCell key={date} date={date} today={today} outOfPeriod={isOutOfRosterPeriod(date, rosterStart, rosterEnd)} />)}
        {employees.map((employee) => (
          <Box key={employee.id} sx={{ display: 'contents' }}>
            <Box sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', p: 0.95, minWidth: 0 }}>
              <Typography fontWeight={900} noWrap>{employeeName(employee)}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{employee.employeeCode}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {employee.department?.name ?? employee.designation?.name ?? employee.branch?.name ?? 'No scope'}
              </Typography>
            </Box>
            {dates.map((date) => {
              const day = dayMap.get(`${employee.id}:${date}`) ?? null;
              const outOfPeriod = isOutOfRosterPeriod(date, rosterStart, rosterEnd);
              const input = { employeeId: employee.id, workDate: date, day };
              return (
                <Box key={`${employee.id}-${date}`} sx={{ borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider', p: 0.55, bgcolor: isWeekend(date) ? 'rgba(15,23,42,0.015)' : 'background.paper' }}>
                  <RosterDayCell
                    day={day}
                    disabled={readonly}
                    outOfPeriod={outOfPeriod}
                    readonlyReason={readonlyReason}
                    copyMode={Boolean(copySource)}
                    copyingSource={copySource?.id === day?.id}
                    onEdit={() => onEditCell(input)}
                    onCopy={day ? () => onCopyCell(day) : undefined}
                    onClear={day ? () => onClearCell(day) : undefined}
                    onSelectTarget={() => copySource ? onSelectCopyTarget(input) : onEditCell(input)}
                  />
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function HeaderCell({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <Box sx={{ position: sticky ? 'sticky' : 'sticky', top: 0, left: sticky ? 0 : undefined, zIndex: sticky ? 4 : 3, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider', p: 1.1 }}>
      <Typography variant="caption" fontWeight={900} color="text.secondary" noWrap>{children}</Typography>
    </Box>
  );
}

function DateHeaderCell({ date, today, outOfPeriod }: { date: string; today: string; outOfPeriod: boolean }) {
  const weekend = isWeekend(date);
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: today === date ? 'rgba(37,99,235,0.08)' : weekend ? 'grey.100' : 'grey.50', borderBottom: '1px solid', borderLeft: '1px solid', borderColor: 'divider', p: 0.85, opacity: outOfPeriod ? 0.62 : 1 }}>
      <Stack gap={0.25} alignItems="center">
        <Typography variant="caption" fontWeight={900} color={today === date ? 'primary.main' : 'text.primary'} noWrap>{weekdayLabel(date)}</Typography>
        <Typography variant="caption" color="text.secondary" noWrap>{formatDateOnly(date)}</Typography>
        <Typography variant="caption" color={today === date ? 'primary.main' : weekend ? 'warning.main' : 'text.secondary'} noWrap>
          {today === date ? 'Today' : weekend ? 'Weekend' : outOfPeriod ? 'Out of period' : 'Roster day'}
        </Typography>
      </Stack>
    </Box>
  );
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
