import { Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { getShiftRoster } from '../services/shift-rosters-api';
import { toLocalDateInput } from '../utils/shift-roster-utils';
import { ShiftRosterForm } from './ShiftRosterCreatePage';

export default function ShiftRosterEditPage() {
  const { id } = useParams();
  const rosterQuery = useQuery({ queryKey: ['shift-roster', id], queryFn: () => getShiftRoster(id!), enabled: Boolean(id) });

  if (!id) return <Navigate to="/scheduling/shift-roster" replace />;
  if (rosterQuery.isLoading) return <LoadingSkeleton rows={8} />;
  if (rosterQuery.isError || !rosterQuery.data?.data) return <Alert severity="error">Roster could not be loaded.</Alert>;
  const roster = rosterQuery.data.data;
  if (roster.status === 'LOCKED' || roster.status === 'CANCELLED') return <Navigate to={`/scheduling/shift-roster/${id}`} replace />;

  return (
    <ShiftRosterForm
      mode="edit"
      rosterId={id}
      initialValues={{
        name: roster.name,
        code: roster.code,
        notes: roster.notes ?? '',
        scope: roster.departmentId ? 'DEPARTMENT' : roster.branchId ? 'BRANCH' : 'COMPANY',
        branchId: roster.branchId ?? '',
        departmentId: roster.departmentId ?? '',
        dateFrom: toLocalDateInput(roster.dateFrom),
        dateTo: toLocalDateInput(roster.dateTo),
        timezone: roster.timezone,
      }}
    />
  );
}
