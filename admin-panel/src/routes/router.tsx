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
const EmployeeCreatePage = lazy(() => import('@/features/people/pages/EmployeeCreatePage'));
const EmployeeDetailsPage = lazy(() => import('@/features/people/pages/EmployeeDetailsPage'));
const EmployeeEditPage = lazy(() => import('@/features/people/pages/EmployeeEditPage'));
const RolesPage = lazy(() => import('@/features/people/pages/RolesPage'));
const PermissionsPage = lazy(() => import('@/features/people/pages/PermissionsPage'));
const AttendancePage = lazy(() => import('@/features/attendance/pages/AttendancePage'));
const AttendanceDetailsPage = lazy(() => import('@/features/attendance/pages/AttendanceDetailsPage'));
const AttendanceCorrectionsPage = lazy(() => import('@/features/attendance/pages/AttendanceCorrectionsPage'));
const AttendanceCorrectionCreatePage = lazy(() => import('@/features/attendance/pages/AttendanceCorrectionCreatePage'));
const AttendanceCorrectionDetailsPage = lazy(() => import('@/features/attendance/pages/AttendanceCorrectionDetailsPage'));
const AttendancePoliciesPage = lazy(() => import('@/features/attendance/pages/AttendancePoliciesPage'));
const BreakPoliciesPage = lazy(() => import('@/features/attendance/pages/BreakPoliciesPage'));
const LeaveTypesPage = lazy(() => import('@/features/leave/pages/LeaveTypesPage'));
const LeaveRequestsPage = lazy(() => import('@/features/leave/pages/LeaveRequestsPage'));
const LeaveRequestCreatePage = lazy(() => import('@/features/leave/pages/LeaveRequestCreatePage'));
const LeaveRequestDetailsPage = lazy(() => import('@/features/leave/pages/LeaveRequestDetailsPage'));
const LeaveBalancesPage = lazy(() => import('@/features/leave/pages/LeaveBalancesPage'));
const LiveStatusPage = lazy(() => import('@/features/monitoring/pages/LiveStatusPage'));
const EmployeeMonitoringPage = lazy(() => import('@/features/monitoring/pages/EmployeeMonitoringPage'));
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'));
const ComingSoonPage = lazy(() => import('@/pages/ComingSoonPage'));
const CreatePage = lazy(() => import('@/pages/CreatePage'));
const EditPage = lazy(() => import('@/pages/EditPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

interface AppRoute {
  path: string;
  element: ReactElement;
  permission: Permission;
  roles?: RoleName[];
}

function lazyElement(element: ReactElement) {
  return <Suspense fallback={<LoadingSkeleton rows={8} />}>{element}</Suspense>;
}

function protectedElement(element: ReactElement, permission: Permission, roles?: RoleName[]) {
  return lazyElement(<RoleGuard permission={permission} roles={roles}>{element}</RoleGuard>);
}

const listRoutes: AppRoute[] = [
  { path: 'people/users', element: <UsersPage />, permission: 'people:manage', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR'] },
  { path: 'people/roles', element: <RolesPage />, permission: 'people:manage', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR'] },
  { path: 'people/permissions', element: <PermissionsPage />, permission: 'people:manage', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR'] },
  { path: 'attendance', element: <AttendancePage />, permission: 'attendance:view', roles: ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
  { path: 'attendance/policies', element: <AttendancePoliciesPage />, permission: 'attendance:manage', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'attendance/break-policies', element: <BreakPoliciesPage />, permission: 'attendance:manage', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR'] },
  { path: 'leave/types', element: <LeaveTypesPage />, permission: 'leave:manage', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'monitoring/live-status', element: <LiveStatusPage />, permission: 'monitoring:view' },
  { path: 'monitoring/employees', element: <EmployeeMonitoringPage />, permission: 'monitoring:view' },
  { path: 'reports', element: <ReportsPage />, permission: 'reports:view' },
  { path: 'settings', element: <SettingsPage />, permission: 'settings:view' },
];

const formPlaceholderRoutes = listRoutes.filter((route) => route.path !== 'attendance');

const comingSoonRoutes: AppRoute[] = [
  { path: 'employees/documents', element: <ComingSoonPage />, permission: 'employees:view', roles: ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] },
  { path: 'employees/onboarding', element: <ComingSoonPage />, permission: 'employees:view', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'employees/exit-management', element: <ComingSoonPage />, permission: 'employees:view', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'employees/assets', element: <ComingSoonPage />, permission: 'employees:view', roles: ['COMPANY_ADMIN', 'HR', 'MANAGER'] },
  { path: 'attendance/overtime-rules', element: <ComingSoonPage />, permission: 'attendance:manage', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'attendance/holiday-calendar', element: <ComingSoonPage />, permission: 'attendance:manage', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'monitoring/activity-timeline', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'monitoring/screenshots', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'monitoring/apps-urls', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'monitoring/devices', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'monitoring/idle-time', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'monitoring/productivity', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'monitoring/alerts', element: <ComingSoonPage />, permission: 'monitoring:view' },
  { path: 'reports/attendance', element: <ComingSoonPage />, permission: 'reports:view' },
  { path: 'reports/employees', element: <ComingSoonPage />, permission: 'reports:view' },
  { path: 'reports/leave', element: <ComingSoonPage />, permission: 'reports:view' },
  { path: 'reports/monitoring', element: <ComingSoonPage />, permission: 'reports:view' },
  { path: 'settings/company-profile', element: <ComingSoonPage />, permission: 'settings:view', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'settings/attendance', element: <ComingSoonPage />, permission: 'attendance:manage', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'settings/desktop-agent', element: <ComingSoonPage />, permission: 'settings:view', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'settings/notifications', element: <ComingSoonPage />, permission: 'settings:view', roles: ['COMPANY_ADMIN', 'HR'] },
  { path: 'settings/general', element: <ComingSoonPage />, permission: 'settings:view' },
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
          { path: 'organization/companies', element: protectedElement(<CompaniesPage />, 'companies:manage', ['SUPER_ADMIN']) },
          { path: 'organization/companies/create', element: protectedElement(<CompanyCreatePage />, 'companies:manage', ['SUPER_ADMIN']) },
          { path: 'organization/companies/:id', element: protectedElement(<CompanyDetailsPage />, 'companies:manage', ['SUPER_ADMIN']) },
          { path: 'organization/companies/:id/edit', element: protectedElement(<CompanyEditPage />, 'companies:manage', ['SUPER_ADMIN']) },
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
          { path: 'people/employees', element: protectedElement(<EmployeesPage />, 'employees:view', ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'people/employees/create', element: protectedElement(<EmployeeCreatePage />, 'employees:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'people/employees/:id', element: protectedElement(<EmployeeDetailsPage />, 'employees:view', ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'people/employees/:id/edit', element: protectedElement(<EmployeeEditPage />, 'employees:manage', ['COMPANY_ADMIN', 'HR']) },
          { path: 'settings/users', element: protectedElement(<UsersPage />, 'people:manage', ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR']) },
          { path: 'settings/roles', element: protectedElement(<RolesPage />, 'people:manage', ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR']) },
          { path: 'settings/permissions', element: protectedElement(<PermissionsPage />, 'people:manage', ['SUPER_ADMIN', 'COMPANY_ADMIN', 'HR']) },
          { path: 'attendance', element: protectedElement(<AttendancePage />, 'attendance:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'attendance/create', element: lazyElement(<NotFoundPage />) },
          { path: 'attendance/corrections', element: protectedElement(<AttendanceCorrectionsPage />, 'attendance:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'attendance/corrections/create', element: protectedElement(<AttendanceCorrectionCreatePage />, 'attendance:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'attendance/corrections/:id', element: protectedElement(<AttendanceCorrectionDetailsPage />, 'attendance:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'attendance/:id', element: protectedElement(<AttendanceDetailsPage />, 'attendance:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'leave/requests', element: protectedElement(<LeaveRequestsPage />, 'leave:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'leave/requests/create', element: protectedElement(<LeaveRequestCreatePage />, 'leave:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'leave/requests/:id', element: protectedElement(<LeaveRequestDetailsPage />, 'leave:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          { path: 'leave/balances', element: protectedElement(<LeaveBalancesPage />, 'leave:view', ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE']) },
          ...comingSoonRoutes.map((route) => ({ ...route, element: protectedElement(route.element, route.permission, route.roles) })),
          ...listRoutes.filter((route) => route.path !== 'attendance').map((route) => ({ ...route, element: protectedElement(route.element, route.permission, route.roles) })),
          ...formPlaceholderRoutes.map((route) => ({ path: `${route.path}/create`, element: protectedElement(<CreatePage />, route.permission, route.roles) })),
          ...formPlaceholderRoutes.map((route) => ({ path: `${route.path}/:id/edit`, element: protectedElement(<EditPage />, route.permission, route.roles) })),
          { path: '*', element: lazyElement(<NotFoundPage />) },
        ],
      },
    ],
  },
]);
