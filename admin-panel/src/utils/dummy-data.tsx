import type { GridColDef, GridRowsProp } from '@mui/x-data-grid';
import { ActionMenu } from '@/components/action-menu';
import { AvatarCell } from '@/components/avatar-cell';
import { StatusChip } from '@/components/status-chip';

export const employees = [
  { id: 1, name: 'Aarav Mehta', email: 'aarav@esta.local', team: 'Engineering', location: 'Mumbai', status: 'Working', role: 'Frontend Lead' },
  { id: 2, name: 'Neha Sharma', email: 'neha@esta.local', team: 'People Ops', location: 'Delhi', status: 'On Break', role: 'HR Manager' },
  { id: 3, name: 'Kabir Khan', email: 'kabir@esta.local', team: 'Finance', location: 'Bengaluru', status: 'Offline', role: 'Payroll Analyst' },
  { id: 4, name: 'Isha Rao', email: 'isha@esta.local', team: 'Design', location: 'Pune', status: 'Working', role: 'Product Designer' },
  { id: 5, name: 'Rohan Iyer', email: 'rohan@esta.local', team: 'Sales', location: 'Hyderabad', status: 'Late', role: 'Account Executive' },
];

export const liveRows: GridRowsProp = employees;

export const liveColumns: GridColDef[] = [
  { field: 'name', headerName: 'Employee', minWidth: 240, flex: 1, renderCell: (params) => <AvatarCell name={params.row.name} email={params.row.email} /> },
  { field: 'team', headerName: 'Team', minWidth: 150, flex: 0.8 },
  { field: 'role', headerName: 'Role', minWidth: 170, flex: 0.9 },
  { field: 'location', headerName: 'Location', minWidth: 130 },
  { field: 'status', headerName: 'Status', minWidth: 130, renderCell: (params) => <StatusChip label={params.value} tone={statusTone(params.value)} /> },
  { field: 'actions', headerName: '', width: 72, sortable: false, filterable: false, renderCell: () => <ActionMenu /> },
];

export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  if (['Working', 'Active', 'Approved', 'Online'].includes(status)) return 'success';
  if (['On Break', 'Pending', 'Late'].includes(status)) return 'warning';
  if (['Offline', 'Rejected', 'Suspended'].includes(status)) return 'danger';
  if (['Draft', 'Inactive'].includes(status)) return 'neutral';
  return 'info';
}

export function entityRows(entity: string): GridRowsProp {
  return Array.from({ length: 18 }).map((_, index) => ({
    id: index + 1,
    name: `${entity} ${index + 1}`,
    code: `${entity.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, '0')}`,
    owner: employees[index % employees.length].name,
    company: index % 2 === 0 ? 'Demo Company' : 'Esta Labs',
    status: index % 5 === 0 ? 'Inactive' : index % 4 === 0 ? 'Pending' : 'Active',
    updatedAt: `2026-06-${String((index % 24) + 1).padStart(2, '0')}`,
  }));
}

export function entityColumns(entity: string): GridColDef[] {
  return [
    { field: 'name', headerName: entity, minWidth: 230, flex: 1, renderCell: (params) => <AvatarCell name={params.value} email={params.row.code} /> },
    { field: 'company', headerName: 'Company', minWidth: 160, flex: 0.8 },
    { field: 'owner', headerName: 'Owner', minWidth: 170, flex: 0.9 },
    { field: 'status', headerName: 'Status', minWidth: 130, renderCell: (params) => <StatusChip label={params.value} tone={statusTone(params.value)} /> },
    { field: 'updatedAt', headerName: 'Updated', minWidth: 130 },
    { field: 'actions', headerName: '', width: 72, sortable: false, filterable: false, renderCell: () => <ActionMenu /> },
  ];
}
