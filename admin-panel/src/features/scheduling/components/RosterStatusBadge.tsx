import { StatusChip } from '@/components/status-chip';
import type { ShiftRosterStatus } from '../types/shift-roster.types';
import { rosterStatusLabel, rosterStatusTone } from '../utils/shift-roster-utils';

export function RosterStatusBadge({ status }: { status: ShiftRosterStatus }) {
  return <StatusChip label={rosterStatusLabel(status)} tone={rosterStatusTone(status)} />;
}
