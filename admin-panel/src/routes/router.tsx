import type { ReactElement } from 'react';
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { AppLayout } from '@/layouts';

const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const CompaniesPage = lazy(() => import('@/features/organization/pages/CompaniesPage'));
const BranchesPage = lazy(() => import('@/features/organization/pages/BranchesPage'));
const DepartmentsPage = lazy(() => import('@/features/organization/pages/DepartmentsPage'));
const DesignationsPage = lazy(() => import('@/features/organization/pages/DesignationsPage'));
const ShiftsPage = lazy(() => import('@/features/organization/pages/ShiftsPage'));
const UsersPage = lazy(() => import('@/features/people/pages/UsersPage'));
const EmployeesPage = lazy(() => import('@/features/people/pages/EmployeesPage'));
const RolesPage = lazy(() => import('@/features/people/pages/RolesPage'));
const PermissionsPage = lazy(() => import('@/features/people/pages/PermissionsPage'));
const AttendancePage = lazy(() => import('@/features/attendance/pages/AttendancePage'));
const AttendancePoliciesPage = lazy(() => import('@/features/attendance/pages/AttendancePoliciesPage'));
const BreakPoliciesPage = lazy(() => import('@/features/attendance/pages/BreakPoliciesPage'));
const LeaveTypesPage = lazy(() => import('@/features/leave/pages/LeaveTypesPage'));
const LeaveRequestsPage = lazy(() => import('@/features/leave/pages/LeaveRequestsPage'));
const LiveStatusPage = lazy(() => import('@/features/monitoring/pages/LiveStatusPage'));
const EmployeeMonitoringPage = lazy(() => import('@/features/monitoring/pages/EmployeeMonitoringPage'));
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'));
const CreatePage = lazy(() => import('@/pages/CreatePage'));
const EditPage = lazy(() => import('@/pages/EditPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

function lazyElement(element: ReactElement) {
  return <Suspense fallback={<LoadingSkeleton rows={8} />}>{element}</Suspense>;
}

const listRoutes = [
  { path: 'organization/companies', element: <CompaniesPage /> },
  { path: 'organization/branches', element: <BranchesPage /> },
  { path: 'organization/departments', element: <DepartmentsPage /> },
  { path: 'organization/designations', element: <DesignationsPage /> },
  { path: 'organization/shifts', element: <ShiftsPage /> },
  { path: 'people/users', element: <UsersPage /> },
  { path: 'people/employees', element: <EmployeesPage /> },
  { path: 'people/roles', element: <RolesPage /> },
  { path: 'people/permissions', element: <PermissionsPage /> },
  { path: 'attendance', element: <AttendancePage /> },
  { path: 'attendance/policies', element: <AttendancePoliciesPage /> },
  { path: 'attendance/break-policies', element: <BreakPoliciesPage /> },
  { path: 'leave/types', element: <LeaveTypesPage /> },
  { path: 'leave/requests', element: <LeaveRequestsPage /> },
  { path: 'monitoring/live-status', element: <LiveStatusPage /> },
  { path: 'monitoring/employees', element: <EmployeeMonitoringPage /> },
  { path: 'reports', element: <ReportsPage /> },
  { path: 'settings', element: <SettingsPage /> },
];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: lazyElement(<DashboardPage />) },
      ...listRoutes.map((route) => ({ ...route, element: lazyElement(route.element) })),
      ...listRoutes.map((route) => ({ path: `${route.path}/create`, element: lazyElement(<CreatePage />) })),
      ...listRoutes.map((route) => ({ path: `${route.path}/:id/edit`, element: lazyElement(<EditPage />) })),
      { path: '*', element: lazyElement(<NotFoundPage />) },
    ],
  },
]);
