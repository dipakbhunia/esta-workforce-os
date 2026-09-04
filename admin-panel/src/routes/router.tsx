import type { ReactElement } from 'react';
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, useParams } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { ProtectedRoute, PublicRoute, RoleGuard, type Permission, type RoleName } from '@/features/auth';
import {
  PLATFORM_ROLES,
  SHARED_ROLES,
  TENANT_ADMIN_ROLES,
  TENANT_ATTENDANCE_ROLES,
  TENANT_MANAGER_ROLES,
  TENANT_ROLES,
  TENANT_WORKFORCE_ROLES,
  mutableRoles,
} from '@/features/auth/utils/route-policy';
import { AppLayout } from '@/layouts';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const CompaniesPage = lazy(() => import('@/features/organization/pages/CompaniesPage'));
const CompanyCreatePage = lazy(() => import('@/features/organization/pages/CompanyCreatePage'));
const CompanyDetailsPage = lazy(() => import('@/features/organization/pages/CompanyDetailsPage'));
const CompanyEditPage = lazy(() => import('@/features/organization/pages/CompanyEditPage'));
const PlansPage = lazy(() => import('@/features/plans/PlansPage'));
const PlanFormPage = lazy(() => import('@/features/plans/PlanFormPage'));
const PlanDetailsPage = lazy(() => import('@/features/plans/PlanDetailsPage'));
const SubscriptionsPage = lazy(() => import('@/features/subscriptions/SubscriptionsPage'));
const SubscriptionCreatePage = lazy(() => import('@/features/subscriptions/SubscriptionCreatePage'));
const SubscriptionDetailsPage = lazy(() => import('@/features/subscriptions/SubscriptionDetailsPage'));
const SubscriptionAmendPage = lazy(() => import('@/features/subscriptions/SubscriptionAmendPage'));
const TrialsPage = lazy(() => import('@/features/trials/TrialsPage'));
const TrialCreatePage = lazy(() => import('@/features/trials/TrialCreatePage'));
const TrialDetailsPage = lazy(() => import('@/features/trials/TrialDetailsPage'));
const TrialConvertPage = lazy(() => import('@/features/trials/TrialConvertPage'));
const UsageSeatsPage = lazy(() => import('@/features/usage-seats/UsageSeatsPage'));
const CompanySeatDetailsPage = lazy(() => import('@/features/usage-seats/CompanySeatDetailsPage'));
const StorageUsagePage = lazy(() => import('@/features/storage-usage/StorageUsagePage'));
const CompanyStorageDetailsPage = lazy(() => import('@/features/storage-usage/CompanyStorageDetailsPage'));
const BillingSettingsPage = lazy(() => import('@/features/billing/BillingSettingsPage'));
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
const ShiftRostersPage = lazy(() => import('@/features/scheduling/pages/ShiftRostersPage'));
const ShiftRosterCreatePage = lazy(() => import('@/features/scheduling/pages/ShiftRosterCreatePage'));
const ShiftRosterDetailsPage = lazy(() => import('@/features/scheduling/pages/ShiftRosterDetailsPage'));
const ShiftRosterEditPage = lazy(() => import('@/features/scheduling/pages/ShiftRosterEditPage'));
const RosterTemplatesPage = lazy(() => import('@/features/scheduling/pages/RosterTemplatesPage'));
const RosterTemplateCreatePage = lazy(() => import('@/features/scheduling/pages/RosterTemplateCreatePage'));
const RosterTemplateDetailsPage = lazy(() => import('@/features/scheduling/pages/RosterTemplateDetailsPage'));
const RosterTemplateEditPage = lazy(() => import('@/features/scheduling/pages/RosterTemplateEditPage'));
const RotationPatternsPage = lazy(() => import('@/features/scheduling/pages/RotationPatternsPage'));
const RotationPatternCreatePage = lazy(() => import('@/features/scheduling/pages/RotationPatternCreatePage'));
const RotationPatternDetailsPage = lazy(() => import('@/features/scheduling/pages/RotationPatternDetailsPage'));
const RotationPatternEditPage = lazy(() => import('@/features/scheduling/pages/RotationPatternEditPage'));
const WeeklyOffRulesPage = lazy(() => import('@/features/scheduling/pages/WeeklyOffRulesPage'));
const WeeklyOffRuleCreatePage = lazy(() => import('@/features/scheduling/pages/WeeklyOffRuleCreatePage'));
const WeeklyOffRuleDetailsPage = lazy(() => import('@/features/scheduling/pages/WeeklyOffRuleDetailsPage'));
const HolidayCalendarsPage = lazy(() => import('@/features/scheduling/pages/HolidayCalendarsPage'));
const HolidayCalendarCreatePage = lazy(() => import('@/features/scheduling/pages/HolidayCalendarCreatePage'));
const HolidayCalendarDetailsPage = lazy(() => import('@/features/scheduling/pages/HolidayCalendarDetailsPage'));
const HolidayCalendarEditPage = lazy(() => import('@/features/scheduling/pages/HolidayCalendarEditPage'));
const HolidayCreatePage = lazy(() => import('@/features/scheduling/pages/HolidayCreatePage'));
const HolidayDetailsPage = lazy(() => import('@/features/scheduling/pages/HolidayDetailsPage'));
const HolidayEditPage = lazy(() => import('@/features/scheduling/pages/HolidayEditPage'));
const WeeklyOffRuleEditPage = lazy(() => import('@/features/scheduling/pages/WeeklyOffRuleEditPage'));
const ShiftAssignmentsPage = lazy(() => import('@/features/scheduling/pages/ShiftAssignmentsPage'));
const ShiftAssignmentCreatePage = lazy(() => import('@/features/scheduling/pages/ShiftAssignmentCreatePage'));
const ShiftAssignmentDetailsPage = lazy(() => import('@/features/scheduling/pages/ShiftAssignmentDetailsPage'));
const ShiftAssignmentEditPage = lazy(() => import('@/features/scheduling/pages/ShiftAssignmentEditPage'));
const ShiftAssignmentHistoryPage = lazy(() => import('@/features/scheduling/pages/ShiftAssignmentHistoryPage'));
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
const LeaveTypeCreatePage = lazy(() => import('@/features/leave/pages/LeaveTypeCreatePage'));
const LeaveTypeEditPage = lazy(() => import('@/features/leave/pages/LeaveTypeEditPage'));
const LeaveRequestsPage = lazy(() => import('@/features/leave/pages/LeaveRequestsPage'));
const LeaveRequestCreatePage = lazy(() => import('@/features/leave/pages/LeaveRequestCreatePage'));
const LeaveRequestDetailsPage = lazy(() => import('@/features/leave/pages/LeaveRequestDetailsPage'));
const LeaveBalancesPage = lazy(() => import('@/features/leave/pages/LeaveBalancesPage'));
const LiveStatusPage = lazy(() => import('@/features/monitoring/pages/LiveStatusPage'));
const MonitoringTimelinePage = lazy(() => import('@/features/monitoring/pages/MonitoringTimelinePage'));
const MonitoringActivityPage = lazy(() => import('@/features/monitoring/pages/MonitoringActivityPage'));
const MonitoringScreenshotsPage = lazy(() => import('@/features/monitoring/pages/MonitoringScreenshotsPage'));
const MonitoringAppsUrlsPage = lazy(() => import('@/features/monitoring/pages/MonitoringAppsUrlsPage'));
const MonitoringDevicesOverviewPage = lazy(() => import('@/features/monitoring/pages/MonitoringDevicesOverviewPage'));
const MonitoringIdleAnalyticsPage = lazy(() => import('@/features/monitoring/pages/MonitoringIdleAnalyticsPage'));
const MonitoringAlertsPage = lazy(() => import('@/features/monitoring/pages/MonitoringAlertsPage'));
const MonitoringOperationsPage = lazy(() => import('@/features/monitoring/pages/MonitoringOperationsPage'));
const MonitoringAlertPoliciesPage = lazy(() => import('@/features/monitoring/pages/MonitoringAlertPoliciesPage'));
const MonitoringAlertPolicyFormPage = lazy(() => import('@/features/monitoring/pages/MonitoringAlertPolicyFormPage'));
const MonitoringAlertDetailsPage = lazy(() => import('@/features/monitoring/pages/MonitoringAlertDetailsPage'));
const MonitoringDevicesPage = lazy(() => import('@/features/monitoring/pages/MonitoringDevicesPage'));
const MonitoringDeviceDetailsPage = lazy(() => import('@/features/monitoring/pages/MonitoringDeviceDetailsPage'));
const ProductivityAnalyticsPage = lazy(() => import('@/features/monitoring/pages/ProductivityAnalyticsPage'));
const ProductivityApplicationsPage = lazy(() => import('@/features/monitoring/pages/ProductivityApplicationsPage'));
const ProductivityCoveragePage = lazy(() => import('@/features/monitoring/pages/ProductivityCoveragePage'));
const ProductivityTrendsPage = lazy(() => import('@/features/monitoring/pages/ProductivityTrendsPage'));
const ProductivityEmployeeDetailsPage = lazy(() => import('@/features/monitoring/pages/ProductivityEmployeeDetailsPage'));
const ProductivityWebsitesPage = lazy(() => import('@/features/monitoring/pages/ProductivityWebsitesPage'));
const ReportsPage = lazy(() => import('@/features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('@/features/settings/pages/SettingsPage'));
const NotificationCenterPage = lazy(() => import('@/features/notifications/pages/NotificationCenterPage'));
const NotificationPreferencesPage = lazy(() => import('@/features/notifications/pages/NotificationPreferencesPage'));
const DownloadsPage = lazy(() => import('@/features/downloads/pages/DownloadsPage'));
const ComingSoonPage = lazy(() => import('@/pages/ComingSoonPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

interface AppRoute {
  path: string;
  element: ReactElement;
  permission: Permission;
  roles?: RoleName[];
}

interface ComingSoonRoute extends Omit<AppRoute, 'element'> {
  title: string;
  moduleName: string;
  description: string;
  plannedPhase?: string;
  availabilityMessage?: string;
}

const adminRoles = mutableRoles(TENANT_ADMIN_ROLES);
const superAdminRoles = mutableRoles(PLATFORM_ROLES);
const hrRoles = mutableRoles(TENANT_ADMIN_ROLES);
const workforceRoles = mutableRoles(TENANT_WORKFORCE_ROLES);
const attendanceRoles = mutableRoles(TENANT_ATTENDANCE_ROLES);
const managerRoles = mutableRoles(TENANT_MANAGER_ROLES);
const tenantRoles = mutableRoles(TENANT_ROLES);
const sharedRoles = mutableRoles(SHARED_ROLES);

function lazyElement(element: ReactElement) {
  return <Suspense fallback={<LoadingSkeleton rows={8} />}>{element}</Suspense>;
}

function protectedElement(element: ReactElement, permission: Permission, roles?: RoleName[]) {
  return lazyElement(<RoleGuard permission={permission} roles={roles}>{element}</RoleGuard>);
}

function comingSoon(route: ComingSoonRoute) {
  return {
    path: route.path,
    element: protectedElement(
      <ComingSoonPage title={route.title} moduleName={route.moduleName} description={route.description} plannedPhase={route.plannedPhase} availabilityMessage={route.availabilityMessage} />,
      route.permission,
      route.roles,
    ),
  };
}

function LegacyShiftDetailsRedirect() {
  const { id } = useParams();
  return <Navigate to={`/scheduling/shifts/${id ?? ''}`} replace />;
}

function LegacyShiftEditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/scheduling/shifts/${id ?? ''}/edit`} replace />;
}

const comingSoonRoutes: ComingSoonRoute[] = [
  { path: 'billing/payments', title: 'Payments', moduleName: 'Billing', description: 'Backend payment creation, TEST-mode Razorpay order preparation, checkout signature confirmation, verified webhook payment-truth processing, and activation of eligible subscriptions from CAPTURED payment truth are implemented. Payment management and browser checkout remain unavailable in this UI.', availabilityMessage: 'Payment lists, details, provider history, browser checkout, and refund actions are not available here yet. Provider payment fetch or polling, active capture operations, LIVE Razorpay order execution, settlement, and renewal orchestration are also not implemented.', plannedPhase: 'Platform Billing', permission: 'settings:view', roles: superAdminRoles },
  { path: 'billing/invoices', title: 'Invoices', moduleName: 'Billing', description: 'Subscription invoice management is planned for a future billing release.', availabilityMessage: 'Invoice generation, records, downloads, payment marking, and numbering runtime are not available yet.', plannedPhase: 'Platform Billing', permission: 'settings:view', roles: superAdminRoles },
  { path: 'billing/gst-invoices', title: 'GST Invoices', moduleName: 'Billing', description: 'GST invoice and tax-record management is planned for a future billing release.', availabilityMessage: 'GST invoice generation, tax calculations, and compliance workflows are not available yet.', plannedPhase: 'Platform Billing', permission: 'settings:view', roles: superAdminRoles },
  { path: 'billing/renewals', title: 'Renewals', moduleName: 'Billing', description: 'Subscription renewal management is planned for a future billing release.', availabilityMessage: 'Renewal tracking, orchestration, dunning, and collection are not available yet.', plannedPhase: 'Platform Billing', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform-communication/email-configuration', title: 'Email Configuration', moduleName: 'Platform Communication', description: 'Configure the platform email delivery service for SaaS communications.', plannedPhase: 'Platform Communication', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform-communication/email-templates', title: 'Email Templates', moduleName: 'Platform Communication', description: 'Manage reusable platform email templates for tenant and billing communications.', plannedPhase: 'Platform Communication', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform-communication/email-delivery-logs', title: 'Email Delivery Logs', moduleName: 'Platform Communication', description: 'Review platform email delivery outcomes and failures.', plannedPhase: 'Platform Communication', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform/access/users', title: 'Platform Users', moduleName: 'User & Access', description: 'Manage identities authorized to administer the SaaS platform.', plannedPhase: 'Platform Access', permission: 'people:manage', roles: superAdminRoles },
  { path: 'platform/access/roles-permissions', title: 'Roles & Permissions', moduleName: 'User & Access', description: 'Manage platform administration roles and permission boundaries.', plannedPhase: 'Platform Access', permission: 'people:manage', roles: superAdminRoles },
  { path: 'platform/access/audit-logs', title: 'Audit Logs', moduleName: 'User & Access', description: 'Review security and administration activity across the SaaS platform.', plannedPhase: 'Platform Access', permission: 'people:manage', roles: superAdminRoles },
  { path: 'platform/reports/revenue', title: 'Revenue Reports', moduleName: 'Reports', description: 'Analyze SaaS revenue when subscription billing data is available.', plannedPhase: 'Platform Reports', permission: 'reports:view', roles: superAdminRoles },
  { path: 'platform/reports/subscriptions', title: 'Subscription Reports', moduleName: 'Reports', description: 'Analyze subscription lifecycle, plan adoption, and renewals.', plannedPhase: 'Platform Reports', permission: 'reports:view', roles: superAdminRoles },
  { path: 'platform/reports/usage', title: 'Usage Reports', moduleName: 'Reports', description: 'Analyze tenant seat, feature, and storage usage when metering is available.', plannedPhase: 'Platform Reports', permission: 'reports:view', roles: superAdminRoles },
  { path: 'platform/reports/tenants', title: 'Tenant Reports', moduleName: 'Reports', description: 'Analyze tenant growth, lifecycle, and platform adoption.', plannedPhase: 'Platform Reports', permission: 'reports:view', roles: superAdminRoles },
  { path: 'platform/settings', title: 'Platform Settings', moduleName: 'Settings', description: 'Configure SaaS-wide defaults and platform administration preferences.', plannedPhase: 'Platform Settings', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform/settings/branding', title: 'Branding', moduleName: 'Settings', description: 'Configure platform identity, logos, and public-facing brand settings.', plannedPhase: 'Platform Settings', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform/settings/security', title: 'Security', moduleName: 'Settings', description: 'Configure platform-wide security controls and administrative safeguards.', plannedPhase: 'Platform Settings', permission: 'settings:view', roles: superAdminRoles },
  { path: 'platform/settings/storage-limits', title: 'Storage / Limits', moduleName: 'Settings', description: 'Configure default tenant allowances, plan-linked storage policies, upload-size rules, and platform storage limits.', plannedPhase: 'Platform Settings', permission: 'settings:view', roles: superAdminRoles },
  { path: 'organization/teams', title: 'Teams', moduleName: 'Organization', description: 'Team grouping will be introduced after department and reporting-line workflows are finalized.', plannedPhase: 'Organization Expansion', permission: 'organization:manage', roles: hrRoles },
  { path: 'organization/work-locations', title: 'Work Locations', moduleName: 'Organization', description: 'Office and field work locations will be connected in a future organization phase.', plannedPhase: 'Organization Expansion', permission: 'organization:manage', roles: hrRoles },
  { path: 'employees/documents', title: 'Employee Documents', moduleName: 'Employees', description: 'Document tracking is reserved for the employee records expansion phase.', plannedPhase: 'Employee Lifecycle', permission: 'employees:view', roles: workforceRoles },
  { path: 'employees/onboarding', title: 'Onboarding', moduleName: 'Employees', description: 'Onboarding workflows will be connected after employee lifecycle setup.', plannedPhase: 'Employee Lifecycle', permission: 'employees:view', roles: hrRoles },
  { path: 'employees/exit-management', title: 'Exit Management', moduleName: 'Employees', description: 'Exit workflows will be added when offboarding rules are introduced.', plannedPhase: 'Employee Lifecycle', permission: 'employees:view', roles: hrRoles },
  { path: 'employees/assets', title: 'Assets', moduleName: 'Employees', description: 'Asset assignment will be connected in a future HR operations phase.', plannedPhase: 'Employee Lifecycle', permission: 'employees:view', roles: ['COMPANY_ADMIN', 'HR', 'MANAGER'] },
  { path: 'attendance/my-attendance', title: 'My Attendance', moduleName: 'Attendance', description: 'Self-service attendance views will be connected in a later attendance phase.', plannedPhase: 'Attendance Self Service', permission: 'attendance:view', roles: attendanceRoles },
  { path: 'attendance/missed-punch-out-review', title: 'Missed Punch-Out Review', moduleName: 'Attendance', description: 'Review queues for missed punch-outs will be added after the review workflow is finalized.', plannedPhase: 'Attendance Review', permission: 'attendance:manage', roles: hrRoles },
  { path: 'attendance/auto-closed-review', title: 'Auto Closed Review', moduleName: 'Attendance', description: 'Auto-closed attendance review will be connected after approval workflows are finalized.', plannedPhase: 'Attendance Review', permission: 'attendance:manage', roles: hrRoles },
  { path: 'attendance/overtime-rules', title: 'Overtime Rules', moduleName: 'Attendance', description: 'Overtime rules are planned for a later attendance policy phase.', plannedPhase: 'Attendance Policy', permission: 'attendance:manage', roles: hrRoles },
  { path: 'monitoring/productivity/employees', title: 'Employee Productivity', moduleName: 'Productivity', description: 'Employee productivity list and comparison workflows will be connected after drill-down navigation is finalized.', plannedPhase: 'Productivity', permission: 'monitoring:view', roles: managerRoles },
  { path: 'crm/leads', title: 'Leads', moduleName: 'CRM', description: 'Lead tracking will be introduced when the CRM module begins.', plannedPhase: 'CRM', permission: 'settings:view', roles: managerRoles },
  { path: 'crm/contacts', title: 'Contacts', moduleName: 'CRM', description: 'CRM contacts will be introduced when the CRM module begins.', plannedPhase: 'CRM', permission: 'settings:view', roles: managerRoles },
  { path: 'crm/companies', title: 'Companies', moduleName: 'CRM', description: 'CRM company records will be introduced when the CRM module begins.', plannedPhase: 'CRM', permission: 'settings:view', roles: managerRoles },
  { path: 'crm/sales-pipeline', title: 'Sales Pipeline', moduleName: 'CRM', description: 'Pipeline tracking will be introduced when sales workflows are scoped.', plannedPhase: 'CRM', permission: 'settings:view', roles: managerRoles },
  { path: 'crm/follow-up', title: 'Follow Up', moduleName: 'CRM', description: 'Follow-up workflows will arrive with CRM activity management.', plannedPhase: 'CRM', permission: 'settings:view', roles: managerRoles },
  { path: 'crm/quotations', title: 'Quotations', moduleName: 'CRM', description: 'Quotation management will be added in a future CRM phase.', plannedPhase: 'CRM', permission: 'settings:view', roles: managerRoles },
  { path: 'projects/projects', title: 'Projects', moduleName: 'Projects & Tasks', description: 'Project workspaces will be introduced in the task management module.', plannedPhase: 'Task Management', permission: 'dashboard:view', roles: workforceRoles },
  { path: 'projects/tasks', title: 'Tasks', moduleName: 'Projects & Tasks', description: 'Task management will be introduced after monitoring is frozen.', plannedPhase: 'Task Management', permission: 'dashboard:view', roles: workforceRoles },
  { path: 'projects/kanban', title: 'Boards', moduleName: 'Projects & Tasks', description: 'Kanban planning will be part of the task management module.', plannedPhase: 'Task Management', permission: 'dashboard:view', roles: workforceRoles },
  { path: 'projects/calendar', title: 'Project Calendar', moduleName: 'Projects & Tasks', description: 'Project calendar planning will be introduced with task management.', plannedPhase: 'Task Management', permission: 'dashboard:view', roles: workforceRoles },
  { path: 'hrms/payroll', title: 'Payroll', moduleName: 'HRMS', description: 'Payroll is reserved for a later HRMS phase and is not implemented in this navigation cleanup.', plannedPhase: 'HRMS', permission: 'employees:view', roles: hrRoles },
  { path: 'hrms/reimbursement', title: 'Reimbursement', moduleName: 'HRMS', description: 'Reimbursement workflows will be added in a future HRMS phase.', plannedPhase: 'HRMS', permission: 'employees:view', roles: hrRoles },
  { path: 'hrms/recruitment', title: 'Recruitment', moduleName: 'HRMS', description: 'Recruitment workflows will be added in a future HRMS phase.', plannedPhase: 'HRMS', permission: 'employees:view', roles: hrRoles },
  { path: 'erp/customers', title: 'Customers', moduleName: 'ERP Lite', description: 'Customer records will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'erp/customer-groups', title: 'Customer Groups', moduleName: 'ERP Lite', description: 'Customer grouping will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'erp/vendors', title: 'Vendors', moduleName: 'ERP Lite', description: 'Vendor management will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'erp/purchase-orders', title: 'Purchase Orders', moduleName: 'ERP Lite', description: 'Purchase order workflows will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'erp/inventory', title: 'Inventory', moduleName: 'ERP Lite', description: 'Inventory management will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'erp/finance', title: 'Finance', moduleName: 'ERP Lite', description: 'Finance views will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'erp/invoicing', title: 'Invoicing', moduleName: 'ERP Lite', description: 'Invoicing will be added when ERP Lite begins.', plannedPhase: 'ERP Lite', permission: 'settings:view', roles: adminRoles },
  { path: 'communication/whatsapp', title: 'WhatsApp', moduleName: 'Communication Hub', description: 'WhatsApp workflows are reserved for a future communication phase.', plannedPhase: 'Communication Hub', permission: 'settings:view', roles: adminRoles },
  { path: 'communication/email', title: 'Email', moduleName: 'Communication Hub', description: 'Email workflows are reserved for a future communication phase.', plannedPhase: 'Communication Hub', permission: 'settings:view', roles: adminRoles },
  { path: 'communication/call-tracking', title: 'Call Tracking', moduleName: 'Communication Hub', description: 'Call tracking is reserved for a future communication phase.', plannedPhase: 'Communication Hub', permission: 'settings:view', roles: adminRoles },
  { path: 'ai/productivity', title: 'AI Productivity', moduleName: 'AI Analytics', description: 'AI productivity analysis is intentionally deferred.', plannedPhase: 'AI Analytics', permission: 'settings:view', roles: adminRoles },
  { path: 'ai/hr-analytics', title: 'AI HR Analytics', moduleName: 'AI Analytics', description: 'AI HR analytics are intentionally deferred.', plannedPhase: 'AI Analytics', permission: 'settings:view', roles: adminRoles },
  { path: 'ai/sales-analytics', title: 'AI Sales Analytics', moduleName: 'AI Analytics', description: 'AI sales analytics are intentionally deferred.', plannedPhase: 'AI Analytics', permission: 'settings:view', roles: adminRoles },
  { path: 'ai/assistant', title: 'AI Assistant', moduleName: 'AI Analytics', description: 'AI assistant workflows are intentionally deferred.', plannedPhase: 'AI Analytics', permission: 'settings:view', roles: adminRoles },
  { path: 'reports/attendance', title: 'Attendance Reports', moduleName: 'Reports', description: 'Attendance reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: tenantRoles },
  { path: 'reports/employees', title: 'Employee Reports', moduleName: 'Reports', description: 'Employee reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: tenantRoles },
  { path: 'reports/leave', title: 'Leave Reports', moduleName: 'Reports', description: 'Leave reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: tenantRoles },
  { path: 'reports/monitoring', title: 'Monitoring Reports', moduleName: 'Reports', description: 'Monitoring reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: tenantRoles },
  { path: 'reports/productivity', title: 'Productivity Reports', moduleName: 'Reports', description: 'Productivity reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: tenantRoles },
  { path: 'reports/scheduling', title: 'Scheduling Reports', moduleName: 'Reports', description: 'Analyze scheduling, roster, weekly-off, and holiday data.', plannedPhase: 'Reports', permission: 'reports:view', roles: tenantRoles },
  { path: 'reports/ceo-dashboard', title: 'CEO Dashboard', moduleName: 'Reports', description: 'Executive reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: ['COMPANY_ADMIN'] },
  { path: 'reports/hr-dashboard', title: 'HR Dashboard', moduleName: 'Reports', description: 'HR reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: hrRoles },
  { path: 'reports/sales-dashboard', title: 'Sales Dashboard', moduleName: 'Reports', description: 'Sales reporting will be connected after CRM reporting APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: managerRoles },
  { path: 'reports/manager-dashboard', title: 'Manager Dashboard', moduleName: 'Reports', description: 'Manager reporting will be connected after report APIs are introduced.', plannedPhase: 'Reports', permission: 'reports:view', roles: managerRoles },
  { path: 'settings/company-profile', title: 'Company Profile', moduleName: 'Settings', description: 'Company profile settings will be connected after settings APIs are introduced.', plannedPhase: 'Settings', permission: 'settings:view', roles: hrRoles },
  { path: 'settings/desktop-agent', title: 'Desktop Agent', moduleName: 'Settings', description: 'Desktop agent configuration will be connected after agent policy APIs are introduced.', plannedPhase: 'Settings', permission: 'settings:view', roles: hrRoles },
  { path: 'settings/general', title: 'General Settings', moduleName: 'Settings', description: 'General workspace settings will be added in a later administration phase.', plannedPhase: 'Settings', permission: 'settings:view', roles: tenantRoles },
];

export const router = createBrowserRouter([
  {
    element: <PublicRoute />,
    children: [{ path: '/login', element: lazyElement(<LoginPage />) }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: protectedElement(<DashboardPage />, 'dashboard:view', sharedRoles) },
          { path: 'organization/companies', element: protectedElement(<CompaniesPage />, 'companies:manage', superAdminRoles) },
          { path: 'organization/companies/create', element: protectedElement(<CompanyCreatePage />, 'companies:manage', superAdminRoles) },
          { path: 'organization/companies/:id', element: protectedElement(<CompanyDetailsPage />, 'companies:manage', superAdminRoles) },
          { path: 'organization/companies/:id/edit', element: protectedElement(<CompanyEditPage />, 'companies:manage', superAdminRoles) },
          { path: 'saas/plans', element: protectedElement(<PlansPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/plans/create', element: protectedElement(<PlanFormPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/plans/:id/edit', element: protectedElement(<PlanFormPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/plans/:id', element: protectedElement(<PlanDetailsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/subscriptions', element: protectedElement(<SubscriptionsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/subscriptions/new', element: protectedElement(<SubscriptionCreatePage />, 'settings:view', superAdminRoles) },
          { path: 'saas/subscriptions/:id', element: protectedElement(<SubscriptionDetailsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/subscriptions/:id/amend', element: protectedElement(<SubscriptionAmendPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/trials', element: protectedElement(<TrialsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/trials/new', element: protectedElement(<TrialCreatePage />, 'settings:view', superAdminRoles) },
          { path: 'saas/trials/:id/convert', element: protectedElement(<TrialConvertPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/trials/:id', element: protectedElement(<TrialDetailsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/usage-seats', element: protectedElement(<UsageSeatsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/usage-seats/:companyId', element: protectedElement(<CompanySeatDetailsPage />, 'settings:view', superAdminRoles) },
          { path: 'saas/storage', element: protectedElement(<StorageUsagePage />, 'settings:view', superAdminRoles) },
          { path: 'saas/storage/:companyId', element: protectedElement(<CompanyStorageDetailsPage />, 'settings:view', superAdminRoles) },
          { path: 'billing/settings', element: protectedElement(<BillingSettingsPage />, 'settings:view', superAdminRoles) },
          { path: 'organization/branches', element: protectedElement(<BranchesPage />, 'branches:view', hrRoles) },
          { path: 'organization/branches/create', element: protectedElement(<BranchCreatePage />, 'branches:manage', hrRoles) },
          { path: 'organization/branches/:id', element: protectedElement(<BranchDetailsPage />, 'branches:view', hrRoles) },
          { path: 'organization/branches/:id/edit', element: protectedElement(<BranchEditPage />, 'branches:manage', hrRoles) },
          { path: 'organization/departments', element: protectedElement(<DepartmentsPage />, 'departments:view', hrRoles) },
          { path: 'organization/departments/create', element: protectedElement(<DepartmentCreatePage />, 'departments:manage', hrRoles) },
          { path: 'organization/departments/:id', element: protectedElement(<DepartmentDetailsPage />, 'departments:view', hrRoles) },
          { path: 'organization/departments/:id/edit', element: protectedElement(<DepartmentEditPage />, 'departments:manage', hrRoles) },
          { path: 'organization/designations', element: protectedElement(<DesignationsPage />, 'designations:view', hrRoles) },
          { path: 'organization/designations/create', element: protectedElement(<DesignationCreatePage />, 'designations:manage', hrRoles) },
          { path: 'organization/designations/:id', element: protectedElement(<DesignationDetailsPage />, 'designations:view', hrRoles) },
          { path: 'organization/designations/:id/edit', element: protectedElement(<DesignationEditPage />, 'designations:manage', hrRoles) },
          { path: 'organization/shifts', element: protectedElement(<Navigate to="/scheduling/shifts" replace />, 'shifts:view', hrRoles) },
          { path: 'organization/shifts/create', element: protectedElement(<Navigate to="/scheduling/shifts/create" replace />, 'shifts:manage', hrRoles) },
          { path: 'organization/shifts/:id', element: protectedElement(<LegacyShiftDetailsRedirect />, 'shifts:view', hrRoles) },
          { path: 'organization/shifts/:id/edit', element: protectedElement(<LegacyShiftEditRedirect />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shifts', element: protectedElement(<ShiftsPage />, 'shifts:view', hrRoles) },
          { path: 'scheduling/shifts/create', element: protectedElement(<ShiftCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shifts/:id', element: protectedElement(<ShiftDetailsPage />, 'shifts:view', hrRoles) },
          { path: 'scheduling/shifts/:id/edit', element: protectedElement(<ShiftEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-assignments', element: protectedElement(<ShiftAssignmentsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-assignments/create', element: protectedElement(<ShiftAssignmentCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-assignments/employee/:employeeId/history', element: protectedElement(<ShiftAssignmentHistoryPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-assignments/:id', element: protectedElement(<ShiftAssignmentDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-assignments/:id/edit', element: protectedElement(<ShiftAssignmentEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-roster', element: protectedElement(<ShiftRostersPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-roster/create', element: protectedElement(<ShiftRosterCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-roster/:id/edit', element: protectedElement(<ShiftRosterEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-roster/:id/calendar', element: protectedElement(<ShiftRosterDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/shift-roster/:id', element: protectedElement(<ShiftRosterDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/roster-templates', element: protectedElement(<RosterTemplatesPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/roster-templates/create', element: protectedElement(<RosterTemplateCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/roster-templates/:id/edit', element: protectedElement(<RosterTemplateEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/roster-templates/:id', element: protectedElement(<RosterTemplateDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/rotation-patterns', element: protectedElement(<RotationPatternsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/rotation-patterns/create', element: protectedElement(<RotationPatternCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/rotation-patterns/:id/edit', element: protectedElement(<RotationPatternEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/rotation-patterns/:id', element: protectedElement(<RotationPatternDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/weekly-off-rules', element: protectedElement(<WeeklyOffRulesPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/weekly-off-rules/create', element: protectedElement(<WeeklyOffRuleCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/weekly-off-rules/:id/edit', element: protectedElement(<WeeklyOffRuleEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/weekly-off-rules/:id', element: protectedElement(<WeeklyOffRuleDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar', element: protectedElement(<HolidayCalendarsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar/create', element: protectedElement(<HolidayCalendarCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar/:id/edit', element: protectedElement(<HolidayCalendarEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar/:id/holidays/create', element: protectedElement(<HolidayCreatePage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar/:id/holidays/:holidayId/edit', element: protectedElement(<HolidayEditPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar/:id/holidays/:holidayId', element: protectedElement(<HolidayDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'scheduling/holiday-calendar/:id', element: protectedElement(<HolidayCalendarDetailsPage />, 'shifts:manage', hrRoles) },
          { path: 'people/employees', element: protectedElement(<EmployeesPage />, 'employees:view', workforceRoles) },
          { path: 'people/employees/create', element: protectedElement(<EmployeeCreatePage />, 'employees:manage', hrRoles) },
          { path: 'people/employees/:id', element: protectedElement(<EmployeeDetailsPage />, 'employees:view', workforceRoles) },
          { path: 'people/employees/:id/edit', element: protectedElement(<EmployeeEditPage />, 'employees:manage', hrRoles) },
          { path: 'people/users', element: protectedElement(<Navigate to="/settings/users" replace />, 'people:manage', adminRoles) },
          { path: 'people/roles', element: protectedElement(<Navigate to="/settings/roles" replace />, 'people:manage', adminRoles) },
          { path: 'people/permissions', element: protectedElement(<Navigate to="/settings/permissions" replace />, 'people:manage', adminRoles) },
          { path: 'settings/users', element: protectedElement(<UsersPage />, 'people:manage', adminRoles) },
          { path: 'settings/roles', element: protectedElement(<RolesPage />, 'people:manage', adminRoles) },
          { path: 'settings/permissions', element: protectedElement(<PermissionsPage />, 'people:manage', adminRoles) },
          { path: 'settings/notifications', element: protectedElement(<Navigate to="/notifications/preferences" replace />, 'settings:view', sharedRoles) },
          { path: 'notifications', element: protectedElement(<NotificationCenterPage />, 'monitoring:view', sharedRoles) },
          { path: 'notifications/preferences', element: protectedElement(<NotificationPreferencesPage />, 'settings:view', sharedRoles) },
          { path: 'downloads', element: protectedElement(<DownloadsPage />, 'dashboard:view', sharedRoles) },
          { path: 'attendance', element: protectedElement(<AttendancePage />, 'attendance:view', attendanceRoles) },
          { path: 'attendance/create', element: lazyElement(<NotFoundPage />) },
          { path: 'attendance/corrections', element: protectedElement(<AttendanceCorrectionsPage />, 'attendance:view', attendanceRoles) },
          { path: 'attendance/corrections/create', element: protectedElement(<AttendanceCorrectionCreatePage />, 'attendance:view', attendanceRoles) },
          { path: 'attendance/corrections/:id', element: protectedElement(<AttendanceCorrectionDetailsPage />, 'attendance:view', attendanceRoles) },
          { path: 'attendance/policies', element: protectedElement(<AttendancePoliciesPage />, 'attendance:manage', hrRoles) },
          { path: 'attendance/break-policies', element: protectedElement(<BreakPoliciesPage />, 'attendance:manage', hrRoles) },
          { path: 'attendance/holiday-calendar', element: protectedElement(<Navigate to="/scheduling/holiday-calendar" replace />, 'shifts:manage', hrRoles) },
          { path: 'attendance/:id', element: protectedElement(<AttendanceDetailsPage />, 'attendance:view', attendanceRoles) },
          { path: 'leave/types', element: protectedElement(<LeaveTypesPage />, 'leave:manage', hrRoles) },
          { path: 'leave/types/create', element: protectedElement(<LeaveTypeCreatePage />, 'leave:manage', hrRoles) },
          { path: 'leave/types/:id/edit', element: protectedElement(<LeaveTypeEditPage />, 'leave:manage', hrRoles) },
          { path: 'leave/requests', element: protectedElement(<LeaveRequestsPage />, 'leave:view', attendanceRoles) },
          { path: 'leave/requests/create', element: protectedElement(<LeaveRequestCreatePage />, 'leave:view', attendanceRoles) },
          { path: 'leave/requests/:id', element: protectedElement(<LeaveRequestDetailsPage />, 'leave:view', attendanceRoles) },
          { path: 'leave/balances', element: protectedElement(<LeaveBalancesPage />, 'leave:view', attendanceRoles) },
          { path: 'monitoring/live-status', element: protectedElement(<LiveStatusPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/timeline', element: protectedElement(<MonitoringTimelinePage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/activity-timeline', element: protectedElement(<Navigate to="/monitoring/timeline" replace />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/activity', element: protectedElement(<MonitoringActivityPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/screenshots', element: protectedElement(<MonitoringScreenshotsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/applications', element: protectedElement(<MonitoringAppsUrlsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/websites', element: protectedElement(<MonitoringAppsUrlsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/apps-urls', element: protectedElement(<Navigate to="/monitoring/applications" replace />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/devices', element: protectedElement(<MonitoringDevicesOverviewPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/devices/inventory', element: protectedElement(<MonitoringDevicesPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/devices/:deviceId', element: protectedElement(<MonitoringDeviceDetailsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/idle-time', element: protectedElement(<MonitoringIdleAnalyticsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/alerts', element: protectedElement(<MonitoringAlertsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/alerts/:alertId', element: protectedElement(<MonitoringAlertDetailsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/alert-policies', element: protectedElement(<MonitoringAlertPoliciesPage />, 'monitoring:view', adminRoles) },
          { path: 'monitoring/alert-policies/create', element: protectedElement(<MonitoringAlertPolicyFormPage />, 'monitoring:view', adminRoles) },
          { path: 'monitoring/alert-policies/:id/edit', element: protectedElement(<MonitoringAlertPolicyFormPage />, 'monitoring:view', adminRoles) },
          { path: 'monitoring/operations', element: protectedElement(<MonitoringOperationsPage />, 'monitoring:view', managerRoles) },
          { path: 'monitoring/productivity', element: protectedElement(<Navigate to="/monitoring/productivity/analytics" replace />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/productivity/analytics', element: protectedElement(<ProductivityAnalyticsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/productivity/coverage', element: protectedElement(<ProductivityCoveragePage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/productivity/trends', element: protectedElement(<ProductivityTrendsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/productivity/employees/:employeeId', element: protectedElement(<ProductivityEmployeeDetailsPage />, 'monitoring:view', tenantRoles) },
          { path: 'monitoring/productivity/applications', element: protectedElement(<ProductivityApplicationsPage />, 'monitoring:view', adminRoles) },
          { path: 'monitoring/productivity/websites', element: protectedElement(<ProductivityWebsitesPage />, 'monitoring:view', adminRoles) },
          { path: 'reports', element: protectedElement(<ReportsPage />, 'reports:view', tenantRoles) },
          { path: 'settings', element: protectedElement(<SettingsPage />, 'settings:view', tenantRoles) },
          ...comingSoonRoutes.map(comingSoon),
          { path: '*', element: lazyElement(<NotFoundPage />) },
        ],
      },
    ],
  },
]);
