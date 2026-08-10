import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { Copy, Edit3, MousePointer2, Trash2 } from 'lucide-react';
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

interface RosterDayCellProps {
  day?: ShiftRosterDay | null;
  disabled?: boolean;
  outOfPeriod?: boolean;
  copyMode?: boolean;
  copyingSource?: boolean;
  readonlyReason?: string;
  onEdit?: () => void;
  onCopy?: () => void;
  onClear?: () => void;
  onSelectTarget?: () => void;
}

export function RosterDayCell({
  day,
  disabled,
  outOfPeriod,
  copyMode,
  copyingSource,
  readonlyReason,
  onEdit,
  onCopy,
  onClear,
  onSelectTarget,
}: RosterDayCellProps) {
  const dayType = day?.dayType ?? 'OPEN';
  const style = stateStyles[dayType];
  const shiftCode = day?.shift?.code ?? day?.shiftCode ?? null;
  const shiftName = day?.shift?.name ?? day?.shiftName ?? null;
  const start = day?.shift?.startTime ?? day?.shiftStartTime;
  const end = day?.shift?.endTime ?? day?.shiftEndTime;
  const timing = start && end ? `${start} - ${end}` : null;
  const title = outOfPeriod ? 'Out of period' : day ? (shiftCode ?? shiftName ?? rosterDayShiftLabel(day)) : 'Open';
  const detail = outOfPeriod
    ? 'Not in roster period'
    : day?.dayType === 'WORKING'
      ? timing ?? shiftName ?? rosterDayShiftLabel(day)
      : day ? day.notes || dayTypeLabel(day.dayType) : 'Not scheduled';
  const source = day?.source ? day.source.replace(/_/g, ' ') : null;
  const isDisabled = disabled || outOfPeriod;
  const disabledMessage = outOfPeriod ? 'Date is outside this roster period' : readonlyReason ?? 'Roster is read-only in the scheduler';
  const targetTitle = copyMode ? 'Copy here' : 'Select roster cell';

  return (
    <Box
      role="group"
      aria-label={`${day ? `${dayTypeLabel(day.dayType)}: ${rosterDayShiftLabel(day)}` : title} roster cell${isDisabled ? `, ${disabledMessage}` : ''}`}
      sx={{
        width: '100%',
        minHeight: outOfPeriod ? 68 : 82,
        p: outOfPeriod ? 0.75 : 0.85,
        borderRadius: 2,
        border: '1px solid',
        borderColor: copyingSource ? 'primary.main' : outOfPeriod ? '#E5E7EB' : style.border,
        bgcolor: copyingSource ? 'rgba(37,99,235,0.08)' : outOfPeriod ? '#F8FAFC' : style.bg,
        opacity: outOfPeriod ? 0.82 : 1,
        textAlign: 'left',
        position: 'relative',
        transition: 'border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease',
        '&:hover': isDisabled ? {} : { borderColor: style.accent, boxShadow: '0 8px 18px rgba(15,23,42,0.08)', transform: 'translateY(-1px)' },
      }}
    >
      <Stack gap={0.55} width="100%" minWidth={0}>
        {day && !outOfPeriod ? (
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={0.5} minWidth={0}>
            <StatusChip label={dayTypeLabel(day.dayType)} tone={dayTypeTone(day.dayType)} />
            {source ? <Typography variant="caption" color="text.secondary" noWrap>{source}</Typography> : null}
          </Stack>
        ) : null}
        <Box minWidth={0}>
          <Typography variant="body2" fontWeight={900} noWrap>{title}</Typography>
          <Typography variant="caption" color="text.secondary" noWrap>{detail}</Typography>
        </Box>
        {!outOfPeriod ? (
          <Stack direction="row" gap={0.25} justifyContent="flex-end" alignItems="center">
            <Tooltip title={isDisabled ? disabledMessage : 'Edit roster day'}>
              <span>
                <IconButton size="small" aria-label="Edit roster day" disabled={isDisabled} onClick={onEdit}>
                  <Edit3 size={15} />
                </IconButton>
              </span>
            </Tooltip>
            {day ? (
              <Tooltip title={isDisabled ? disabledMessage : 'Copy this roster day'}>
                <span>
                  <IconButton size="small" aria-label="Copy roster day" disabled={isDisabled} onClick={onCopy}>
                    <Copy size={15} />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            {day ? (
              <Tooltip title={isDisabled ? disabledMessage : 'Clear roster day'}>
                <span>
                  <IconButton size="small" color="error" aria-label="Clear roster day" disabled={isDisabled} onClick={onClear}>
                    <Trash2 size={15} />
                  </IconButton>
                </span>
              </Tooltip>
            ) : null}
            <Tooltip title={isDisabled ? disabledMessage : targetTitle}>
              <span>
                <IconButton size="small" color={copyMode ? 'primary' : 'default'} aria-label={copyMode ? 'Copy roster day to this cell' : 'Select roster cell'} disabled={isDisabled} onClick={onSelectTarget}>
                  <MousePointer2 size={15} />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}
