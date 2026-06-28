import type { ReactElement } from 'react';
import { lazy, Suspense } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { ProtectedRoute, PublicRoute, RoleGuard, type Permission, type RoleName } from '@/features/auth';
import { AppLayout } from '@/layouts';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const CompaniesPage = lazy(() => import('@/features/organization/pages/CompaniesPage'));
const CompanyCreatePage = lazy(() => import('@/features/organization/pages/CompanyCreatePage'));
const CompanyDetailsPage = lazy(() => import('@/features/organization/pages/CompanyDetailsPage'));
const CompanyEditPage = lazy(() => import('@/features/organization/pages/CompanyEditPage'));
const BranchesPage = lazy(() => import('@/features/organization/pages/BranchesPage'));
const BranchCreatePage = lazy(() => import('@/features/organization/pages/BranchCreatePage'));
const BranchDetailsPage = lazy(() => import('@/features/organization/pages/BranchDetailsPage'));
const BranchEditPage = lazy(() => import('@/features/organization/pages/BranchEditPage'));
const DepartmentsPage = lazy(() => import('@/features/organization/pages/DepartmentsPage'));
const DepartmentCreatePage = lazy(() => import('@/features/organization/pages/DepartmentCreatePage'));
const DepartmentDetailsPage = lazy(() => import('@/features/organization/pages/DepartmentDetailsPage'));
const DepartmentEditPage = lazy(() => import('@/features/organization/pages/DepartmentEditPage'));
const DesignationsPage = lazy(() => import('@/features/organization/pages/DesignationsPage'));
const DesignationCreatePage = lazy(() => import('@/features/organization/pages/DesignationCreatePage'));
const DesignationDetailsPage = lazy(() => import('@/features/organization/pages/DesignationDetailsPage'));
const DesignationEditPage = lazy(() => import('@/features/organization/pages/DesignationEditPage'));
const ShiftsPage = lazy(() => import('@/features/organization/pages/ShiftsPage'));
const ShiftCreatePage = lazy(() => import('@/features/organization/pages/ShiftCreatePage'));
const ShiftDetailsPage = lazy(() => import('@/features/organization/pages/ShiftDetailsPage'));
const ShiftEditPage = lazy(() => import('@/features/organization/pages/ShiftEditPage'));
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

interface AppRoute {
  path: string;
  element: ReactElement;
  permission: Permission;
}

function lazyElement(element: ReactElement) {
  return <Suspense fallback={<LoadingSkeleton rows={8} />}>{element}</Suspense>;
}

function protectedElement(element: ReactElement, permission: Permission, roles?: RoleName[]) {
  return lazyElement(<RoleGuard permission={permission} roles={roles}>{element}</RoleGuard>);
}

const listRoutes: AppRoute[] = [
  { path: 'people/users', element: <UsersPage />, permission: 'people:manage' },
  { path: 'people/employees', element: <EmployeesPage />, permission: 'people:manage' },
  { path: 'people/roles', element: <RolesPage />, permission: 'people:manage' },
  { path: 'people/permissions', element: <PermissionsPage />, permission: 'people:manage' },
  { path: 'attendance', element: <AttendancePage />, permission: 'attendance:view' },
  { path: 'attendance/policies', element: <AttendancePoliciesPage />, permission: 'attendance:manage' },
  { path: 'attendance/break-policies', element: <BreakPoliciesPage />, permission: 'attendance:manage' },
  { path: 'leave/types', element: <LeaveTypesPage />, permission: 'leave:manage' },
  { path: 'leave/requests', element: <LeaveRequestsPage />, permission: 'leave:view' },
  { path: 'monitoring/live-status', element: <LiveStatusPage />, permission: 'monitoring:view' },
  { path: 'monitoring/employees', element: <EmployeeMonitoringPage />, permission: 'monitoring:view' },
  { path: 'reports', element: <ReportsPage />, permission: 'reports:view' },
  { path: 'settings', element: <SettingsPage />, permission: 'settings:view' },
];

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [
      { path: '/login', element: lazyElement(<LoginPage />) },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: protectedElement(<DashboardPage />, 'dashboard:view') },
          { path: 'organization/companies', element: protectedElement(<CompaniesPage />, 'companies:manage', ['SUPER_ADMIN', 'COMPANY_ADMIN']) },
          { path: 'organization/companies/create', element: protectedElement(<CompanyCreatePage />, 'companies:manage', ['SUPER_ADMIN']) },
          { path: 'organization/companies/:id', element: protectedElement(<CompanyDetailsPage />, 'companies:manage', ['SUPER_ADMIN', 'COMPANY_ADMIN']) },
          { path: 'organization/companies/:id/edit', element: protectedElement(<CompanyEditPage />, 'companies:manage', ['SUPER_ADMIN', 'COMPANY_ADMIN']) },
          { path: 'organization/branches', element: protectedElement(<BranchesPage />, 'branches:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/branches/create', element: protectedElement(<BranchCreatePage />, 'branches:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/branches/:id', element: protectedElement(<BranchDetailsPage />, 'branches:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/branches/:id/edit', element: protectedElement(<BranchEditPage />, 'branches:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/departments', element: protectedElement(<DepartmentsPage />, 'departments:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/departments/create', element: protectedElement(<DepartmentCreatePage />, 'departments:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/departments/:id', element: protectedElement(<DepartmentDetailsPage />, 'departments:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/departments/:id/edit', element: protectedElement(<DepartmentEditPage />, 'departments:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/designations', element: protectedElement(<DesignationsPage />, 'designations:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/designations/create', element: protectedElement(<DesignationCreatePage />, 'designations:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/designations/:id', element: protectedElement(<DesignationDetailsPage />, 'designations:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/designations/:id/edit', element: protectedElement(<DesignationEditPage />, 'designations:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/shifts', element: protectedElement(<ShiftsPage />, 'shifts:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/shifts/create', element: protectedElement(<ShiftCreatePage />, 'shifts:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/shifts/:id', element: protectedElement(<ShiftDetailsPage />, 'shifts:view', ['COMPANY_ADMIN', 'HR']) },
          { path: 'organization/shifts/:id/edit', element: protectedElement(<ShiftEditPage />, 'shifts:manage', ['COMPANY_ADMIN', 'HR']) },
          ...listRoutes.map((route) => ({ ...route, element: protectedElement(route.element, route.permission) })),
          ...listRoutes.map((route) => ({ path: `${route.path}/create`, element: protectedElement(<CreatePage />, route.permission) })),
          ...listRoutes.map((route) => ({ path: `${route.path}/:id/edit`, element: protectedElement(<EditPage />, route.permission) })),
          { path: '*', element: lazyElement(<NotFoundPage />) },
        ],
      },
    ],
  },
]);
