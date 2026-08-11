import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { GripVertical } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ShiftRosterDay } from '../types/shift-roster.types';
import { dayTypeLabel, rosterDayShiftLabel } from '../utils/shift-roster-utils';
import type { RosterCellInput } from './RosterCalendarGrid';

export interface RosterDragSource {
  day: ShiftRosterDay;
  employeeId: string;
  employeeLabel: string;
  workDate: string;
}

export interface RosterDragTarget extends RosterCellInput {
  employeeLabel: string;
}

interface RosterDragDropContextProps {
  enabled: boolean;
  busy?: boolean;
  children: ReactNode;
  onDrop: (source: RosterDragSource, target: RosterDragTarget) => void;
}

export function RosterDragDropContext({ enabled, busy, children, onDrop }: RosterDragDropContextProps) {
  const [activeSource, setActiveSource] = useState<RosterDragSource | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const source = event.active.data.current?.source as RosterDragSource | undefined;
    setActiveSource(source ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const source = event.active.data.current?.source as RosterDragSource | undefined;
    const target = event.over?.data.current?.target as RosterDragTarget | undefined;
    setActiveSource(null);
    if (!enabled || busy || !source || !target) return;
    if (cellIdentity(source) === cellIdentity(target)) return;
    onDrop(source, target);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragCancel={() => setActiveSource(null)}
      onDragEnd={handleDragEnd}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeSource ? (
          <Paper elevation={8} sx={{ px: 1.5, py: 1.1, minWidth: 190, border: '1px solid', borderColor: 'primary.main', borderRadius: 2.5 }}>
            <Stack gap={0.25}>
              <Typography variant="caption" color="primary.main" fontWeight={900}>Copy roster day</Typography>
              <Typography variant="body2" fontWeight={900}>{rosterDayShiftLabel(activeSource.day)}</Typography>
              <Typography variant="caption" color="text.secondary">{activeSource.employeeLabel}</Typography>
            </Stack>
          </Paper>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface RosterDragDropCellRenderState {
  dragHandle: ReactNode;
  dragging: boolean;
  dropStatus: string | null;
}

interface RosterDragDropCellProps {
  enabled: boolean;
  busy?: boolean;
  source?: RosterDragSource | null;
  target: RosterDragTarget;
  targetDisabled?: boolean;
  disabledReason?: string;
  children: (state: RosterDragDropCellRenderState) => ReactNode;
}

export function RosterDragDropCell({ enabled, busy, source, target, targetDisabled, disabledReason, children }: RosterDragDropCellProps) {
  const draggableId = `roster-drag:${cellIdentity(target)}`;
  const droppableId = `roster-drop:${cellIdentity(target)}`;
  const { active } = useDndContext();
  const activeSource = active?.data.current?.source as RosterDragSource | undefined;
  const sameAsSource = Boolean(activeSource && cellIdentity(activeSource) === cellIdentity(target));
  const dragDisabled = !enabled || busy || !source;
  const dropDisabled = !enabled || busy || targetDisabled || sameAsSource;
  const { attributes, listeners, setActivatorNodeRef, setNodeRef: setDraggableNodeRef, isDragging } = useDraggable({
    id: draggableId,
    data: { source },
    disabled: dragDisabled,
  });
  const { isOver, setNodeRef: setDroppableNodeRef } = useDroppable({
    id: droppableId,
    data: { target },
    disabled: dropDisabled,
  });
  const dragging = Boolean(activeSource);
  const dropStatus = !dragging
    ? null
    : sameAsSource
      ? 'Source cell'
      : targetDisabled
        ? disabledReason ?? 'Drop unavailable'
        : isOver
          ? target.day ? 'Release to review replacement' : 'Release to copy here'
          : target.day ? 'Occupied target' : 'Available target';

  const dragHandle = source && enabled ? (
    <Tooltip title={`Drag to copy ${dayTypeLabel(source.day.dayType)} to another roster cell`}>
      <span>
        <IconButton
          ref={setActivatorNodeRef}
          size="small"
          disabled={busy}
          aria-label={`Drag ${rosterDayShiftLabel(source.day)} for ${source.employeeLabel} on ${source.workDate}`}
          {...attributes}
          {...listeners}
          sx={{ p: 0.25, cursor: busy ? 'wait' : 'grab', '&:active': { cursor: 'grabbing' } }}
        >
          <GripVertical size={15} />
        </IconButton>
      </span>
    </Tooltip>
  ) : null;

  return (
    <Box
      ref={setDroppableNodeRef}
      sx={{
        position: 'relative',
        borderRadius: 2,
        outline: isOver ? '2px solid' : dragging && !dropDisabled ? '1px dashed' : 'none',
        outlineColor: isOver ? target.day ? 'warning.main' : 'success.main' : 'primary.light',
        outlineOffset: 1,
        opacity: dragging && dropDisabled && !sameAsSource ? 0.58 : 1,
        transition: 'outline-color 120ms ease, opacity 120ms ease',
      }}
      aria-label={dropStatus ? `${dropStatus}: ${target.employeeLabel} on ${target.workDate}` : undefined}
    >
      <Box ref={setDraggableNodeRef} sx={{ opacity: isDragging ? 0.45 : 1 }}>
        {children({ dragHandle, dragging: isDragging, dropStatus })}
      </Box>
      {dropStatus && dragging ? (
        <Box sx={{ position: 'absolute', inset: 'auto 4px 4px 4px', pointerEvents: 'none', display: 'flex', justifyContent: 'center' }}>
          <Typography
            variant="caption"
            fontWeight={900}
            sx={{ px: 0.65, py: 0.15, borderRadius: 1, bgcolor: isOver ? target.day ? 'warning.light' : 'success.light' : 'grey.100', color: 'text.primary', boxShadow: '0 1px 3px rgba(15,23,42,0.12)' }}
          >
            {dropStatus}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

export function isRosterDayDraggable(day?: ShiftRosterDay | null) {
  if (!day) return false;
  if (day.dayType === 'WORKING') return Boolean(day.shiftId ?? day.shift?.id);
  return day.dayType === 'WEEKLY_OFF' || day.dayType === 'NO_SHIFT';
}

function cellIdentity(cell: Pick<RosterCellInput, 'employeeId' | 'workDate'>) {
  return `${cell.employeeId}:${cell.workDate.slice(0, 10)}`;
}