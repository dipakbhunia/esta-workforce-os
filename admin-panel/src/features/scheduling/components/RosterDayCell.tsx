import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import { StatusChip } from '@/components/status-chip';
import type { RosterDayType, ShiftRosterDay } from '../types/shift-roster.types';
import { dayTypeLabel, dayTypeTone, rosterDayShiftLabel } from '../utils/shift-roster-utils';

const stateStyles: Record<RosterDayType | 'OPEN', { border: string; bg: string; accent: string }> = {
  WORKING: { border: '#BBF7D0', bg: '#F0FDF4', accent: '#16A34A' },
  WEEKLY_OFF: { border: '#BFDBFE', bg: '#EFF6FF', accent: '#2563EB' },
  HOLIDAY: { border: '#FDE68A', bg: '#FFFBEB', accent: '#D97706' },
  LEAVE: { border: '#E5E7EB', bg: '#F9FAFB', accent: '#6B7280' },
  NO_SHIFT: { border: '#FECACA', bg: '#FEF2F2', accent: '#DC2626' },
  OPEN: { border: '#E5E7EB', bg: '#F8FAFC', accent: '#94A3B8' },
};

export function RosterDayCell({ day, disabled, onClick }: { day?: ShiftRosterDay | null; disabled?: boolean; onClick?: () => void }) {
  const dayType = day?.dayType ?? 'OPEN';
  const style = stateStyles[dayType];
  const shiftCode = day?.shift?.code ?? day?.shiftCode ?? null;
  const start = day?.shift?.startTime ?? day?.shiftStartTime;
  const end = day?.shift?.endTime ?? day?.shiftEndTime;
  const timing = start && end ? `${start} - ${end}` : null;
  const title = day ? (shiftCode ?? rosterDayShiftLabel(day)) : 'No shift planned';

  return (
    <ButtonBase
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={`${day ? `${dayTypeLabel(day.dayType)}: ${rosterDayShiftLabel(day)}` : 'No shift planned'} roster cell`}
      sx={{
        width: '100%',
        minHeight: 86,
        p: 1,
        borderRadius: 2.25,
        border: '1px solid',
        borderColor: style.border,
        bgcolor: style.bg,
        textAlign: 'left',
        justifyContent: 'stretch',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        '&:hover': disabled ? {} : { borderColor: style.accent, boxShadow: '0 10px 22px rgba(15,23,42,0.08)', transform: 'translateY(-1px)' },
        '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Stack gap={0.7} width="100%" minWidth={0}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={0.5}>
          <StatusChip label={day ? dayTypeLabel(day.dayType) : 'Open'} tone={day ? dayTypeTone(day.dayType) : 'neutral'} />
          {day?.source ? <Typography variant="caption" color="text.secondary" noWrap>{day.source.replace(/_/g, ' ')}</Typography> : null}
        </Stack>
        <Box minWidth={0}>
          <Typography variant="body2" fontWeight={900} noWrap>{title}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{day?.dayType === 'WORKING' ? timing ?? rosterDayShiftLabel(day) : day ? day.notes || dayTypeLabel(day.dayType) : 'Click to plan this day'}</Typography>
        </Box>
      </Stack>
    </ButtonBase>
  );
}