import { Box, Card, CardContent, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { EmptyState } from '@/components/empty-state';
import type { Employee } from '@/features/people/types/employee.types';
import type { ShiftRosterDay } from '../types/shift-roster.types';
import { addDays, employeeName, formatDateOnly, rosterDayShiftLabel } from '../utils/shift-roster-utils';
import { RosterDayCell } from './RosterDayCell';

interface RosterCalendarGridProps {
  employees: Employee[];
  days: ShiftRosterDay[];
  weekStart: string;
  readonly?: boolean;
  onCellClick: (input: { employeeId: string; workDate: string; day?: ShiftRosterDay | null }) => void;
}

export function RosterCalendarGrid({ employees, days, weekStart, readonly, onCellClick }: RosterCalendarGridProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const dates = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const dayMap = new Map(days.map((day) => [`${day.employeeId}:${day.workDate.slice(0, 10)}`, day]));

  if (!employees.length) {
    return <EmptyState title="No employees available" description="Adjust the roster scope or employee filters to load employees for planning." />;
  }

  if (isMobile) {
    const agenda = employees.flatMap((employee) => dates.map((date) => ({ employee, date, day: dayMap.get(`${employee.id}:${date}`) ?? null })));
    return (
      <Stack gap={1.25}>
        {agenda.map(({ employee, date, day }) => (
          <Card key={`${employee.id}-${date}`} variant="outlined">
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Stack gap={1}>
                <Stack direction="row" justifyContent="space-between" gap={1}>
                  <Box minWidth={0}>
                    <Typography fontWeight={850} noWrap>{employeeName(employee)}</Typography>
                    <Typography variant="caption" color="text.secondary">{employee.employeeCode}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">{formatDateOnly(date)}</Typography>
                </Stack>
                <RosterDayCell day={day} disabled={readonly} onClick={() => onCellClick({ employeeId: employee.id, workDate: date, day })} />
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Box sx={{ minWidth: 1080, display: 'grid', gridTemplateColumns: '260px repeat(7, minmax(118px, 1fr))' }}>
        <HeaderCell sticky>Employee</HeaderCell>
        {dates.map((date) => <HeaderCell key={date}>{formatDateOnly(date)}</HeaderCell>)}
        {employees.map((employee) => (
          <Box key={employee.id} sx={{ display: 'contents' }}>
            <Box sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', borderTop: '1px solid', borderColor: 'divider', p: 1.25 }}>
              <Typography fontWeight={900} noWrap>{employeeName(employee)}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{employee.employeeCode} - {employee.department?.name ?? employee.branch?.name ?? 'No scope'}</Typography>
            </Box>
            {dates.map((date) => {
              const day = dayMap.get(`${employee.id}:${date}`) ?? null;
              return (
                <Box key={`${employee.id}-${date}`} sx={{ borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider', p: 0.75 }}>
                  <RosterDayCell day={day} disabled={readonly} onClick={() => onCellClick({ employeeId: employee.id, workDate: date, day })} />
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, py: 1 }}>
Use week navigation to review the roster period in focused seven-day windows.
      </Typography>
    </Box>
  );
}

function HeaderCell({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <Box sx={{ position: sticky ? 'sticky' : 'static', left: sticky ? 0 : undefined, zIndex: sticky ? 3 : 1, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider', p: 1.25 }}>
      <Typography variant="caption" fontWeight={900} color="text.secondary" noWrap>{children}</Typography>
    </Box>
  );
}
