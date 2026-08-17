import { useMemo } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { navigation } from '@/routes/navigation';
import type { NavGroup, NavItem } from '@/types/navigation';

export interface RouteMeta {
  title: string;
  breadcrumbs: string[];
  moduleName?: string;
  canonicalPath: string;
}

interface RoutePatternMeta extends RouteMeta {
  pattern: string;
}

const explicitRoutePatterns: RoutePatternMeta[] = [
  { pattern: '/', title: 'Workforce Control Center', breadcrumbs: ['Dashboard'], moduleName: 'Dashboard', canonicalPath: '/' },
  { pattern: '/downloads', title: 'Download Apps', breadcrumbs: ['Downloads', 'Download Apps'], moduleName: 'Downloads', canonicalPath: '/downloads' },
  { pattern: '/organization/companies/create', title: 'Create Company', breadcrumbs: ['SaaS Management', 'Companies', 'Create'], moduleName: 'SaaS Management', canonicalPath: '/organization/companies/create' },
  { pattern: '/organization/companies/:id/edit', title: 'Edit Company', breadcrumbs: ['SaaS Management', 'Companies', 'Edit'], moduleName: 'SaaS Management', canonicalPath: '/organization/companies/:id/edit' },
  { pattern: '/organization/companies/:id', title: 'Company Details', breadcrumbs: ['SaaS Management', 'Companies', 'Details'], moduleName: 'SaaS Management', canonicalPath: '/organization/companies/:id' },
  { pattern: '/saas/usage-seats/:companyId', title: 'Company Seat Details', breadcrumbs: ['SaaS Management', 'Usage & Seats', 'Details'], moduleName: 'SaaS Management', canonicalPath: '/saas/usage-seats/:companyId' },
  { pattern: '/organization/branches/create', title: 'Create Branch', breadcrumbs: ['Organization', 'Branches', 'Create'], moduleName: 'Organization', canonicalPath: '/organization/branches/create' },
  { pattern: '/organization/branches/:id/edit', title: 'Edit Branch', breadcrumbs: ['Organization', 'Branches', 'Edit'], moduleName: 'Organization', canonicalPath: '/organization/branches/:id/edit' },
  { pattern: '/organization/branches/:id', title: 'Branch Details', breadcrumbs: ['Organization', 'Branches', 'Details'], moduleName: 'Organization', canonicalPath: '/organization/branches/:id' },
  { pattern: '/organization/departments/create', title: 'Create Department', breadcrumbs: ['Organization', 'Departments', 'Create'], moduleName: 'Organization', canonicalPath: '/organization/departments/create' },
  { pattern: '/organization/departments/:id/edit', title: 'Edit Department', breadcrumbs: ['Organization', 'Departments', 'Edit'], moduleName: 'Organization', canonicalPath: '/organization/departments/:id/edit' },
  { pattern: '/organization/departments/:id', title: 'Department Details', breadcrumbs: ['Organization', 'Departments', 'Details'], moduleName: 'Organization', canonicalPath: '/organization/departments/:id' },
  { pattern: '/organization/designations/create', title: 'Create Designation', breadcrumbs: ['Organization', 'Designations', 'Create'], moduleName: 'Organization', canonicalPath: '/organization/designations/create' },
  { pattern: '/organization/designations/:id/edit', title: 'Edit Designation', breadcrumbs: ['Organization', 'Designations', 'Edit'], moduleName: 'Organization', canonicalPath: '/organization/designations/:id/edit' },
  { pattern: '/organization/designations/:id', title: 'Designation Details', breadcrumbs: ['Organization', 'Designations', 'Details'], moduleName: 'Organization', canonicalPath: '/organization/designations/:id' },
  { pattern: '/scheduling/shifts/create', title: 'Create Shift', breadcrumbs: ['Scheduling', 'Shifts', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shifts/create' },
  { pattern: '/scheduling/shifts/:id/edit', title: 'Edit Shift', breadcrumbs: ['Scheduling', 'Shifts', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shifts/:id/edit' },
  { pattern: '/scheduling/shifts/:id', title: 'Shift Details', breadcrumbs: ['Scheduling', 'Shifts', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shifts/:id' },
  { pattern: '/scheduling/shift-assignments/create', title: 'Create Shift Assignment', breadcrumbs: ['Scheduling', 'Shift Assignments', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-assignments/create' },
  { pattern: '/scheduling/shift-assignments/employee/:employeeId/history', title: 'Shift Assignment History', breadcrumbs: ['Scheduling', 'Shift Assignments', 'History'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-assignments/employee/:employeeId/history' },
  { pattern: '/scheduling/shift-assignments/:id/edit', title: 'Edit Shift Assignment', breadcrumbs: ['Scheduling', 'Shift Assignments', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-assignments/:id/edit' },
  { pattern: '/scheduling/shift-assignments/:id', title: 'Shift Assignment Details', breadcrumbs: ['Scheduling', 'Shift Assignments', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-assignments/:id' },
  { pattern: '/scheduling/shift-roster/create', title: 'Create Shift Roster', breadcrumbs: ['Scheduling', 'Shift Roster', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-roster/create' },
  { pattern: '/scheduling/shift-roster/:id/edit', title: 'Edit Shift Roster', breadcrumbs: ['Scheduling', 'Shift Roster', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-roster/:id/edit' },
  { pattern: '/scheduling/shift-roster/:id/calendar', title: 'Shift Roster Calendar', breadcrumbs: ['Scheduling', 'Shift Roster', 'Calendar'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-roster/:id/calendar' },
  { pattern: '/scheduling/shift-roster/:id', title: 'Shift Roster Details', breadcrumbs: ['Scheduling', 'Shift Roster', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/shift-roster/:id' },
  { pattern: '/scheduling/weekly-off-rules/create', title: 'Create Weekly Off Rule', breadcrumbs: ['Scheduling', 'Weekly Off Rules', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/weekly-off-rules/create' },
  { pattern: '/scheduling/weekly-off-rules/:id/edit', title: 'Edit Weekly Off Rule', breadcrumbs: ['Scheduling', 'Weekly Off Rules', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/weekly-off-rules/:id/edit' },
  { pattern: '/scheduling/weekly-off-rules/:id', title: 'Weekly Off Rule Details', breadcrumbs: ['Scheduling', 'Weekly Off Rules', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/weekly-off-rules/:id' },
  { pattern: '/scheduling/holiday-calendar/create', title: 'Create Holiday Calendar', breadcrumbs: ['Scheduling', 'Holiday Calendar', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/holiday-calendar/create' },
  { pattern: '/scheduling/holiday-calendar/:id/edit', title: 'Edit Holiday Calendar', breadcrumbs: ['Scheduling', 'Holiday Calendar', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/holiday-calendar/:id/edit' },
  { pattern: '/scheduling/holiday-calendar/:id/holidays/create', title: 'Add Holiday', breadcrumbs: ['Scheduling', 'Holiday Calendar', 'Add Holiday'], moduleName: 'Scheduling', canonicalPath: '/scheduling/holiday-calendar/:id/holidays/create' },
  { pattern: '/scheduling/holiday-calendar/:id/holidays/:holidayId/edit', title: 'Edit Holiday', breadcrumbs: ['Scheduling', 'Holiday Calendar', 'Edit Holiday'], moduleName: 'Scheduling', canonicalPath: '/scheduling/holiday-calendar/:id/holidays/:holidayId/edit' },
  { pattern: '/scheduling/holiday-calendar/:id/holidays/:holidayId', title: 'Holiday Details', breadcrumbs: ['Scheduling', 'Holiday Calendar', 'Holiday Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/holiday-calendar/:id/holidays/:holidayId' },
  { pattern: '/scheduling/holiday-calendar/:id', title: 'Holiday Calendar Details', breadcrumbs: ['Scheduling', 'Holiday Calendar', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/holiday-calendar/:id' },
  { pattern: '/scheduling/roster-templates', title: 'Roster Templates', breadcrumbs: ['Scheduling', 'Roster Templates'], moduleName: 'Scheduling', canonicalPath: '/scheduling/roster-templates' },
  { pattern: '/scheduling/roster-templates/create', title: 'Create Roster Template', breadcrumbs: ['Scheduling', 'Roster Templates', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/roster-templates/create' },
  { pattern: '/scheduling/roster-templates/:id/edit', title: 'Edit Roster Template', breadcrumbs: ['Scheduling', 'Roster Templates', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/roster-templates/:id/edit' },
  { pattern: '/scheduling/roster-templates/:id', title: 'Roster Template Details', breadcrumbs: ['Scheduling', 'Roster Templates', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/roster-templates/:id' },
  { pattern: '/scheduling/rotation-patterns', title: 'Rotation Patterns', breadcrumbs: ['Scheduling', 'Rotation Patterns'], moduleName: 'Scheduling', canonicalPath: '/scheduling/rotation-patterns' },
  { pattern: '/scheduling/rotation-patterns/create', title: 'Create Rotation Pattern', breadcrumbs: ['Scheduling', 'Rotation Patterns', 'Create'], moduleName: 'Scheduling', canonicalPath: '/scheduling/rotation-patterns/create' },
  { pattern: '/scheduling/rotation-patterns/:id/edit', title: 'Edit Rotation Pattern', breadcrumbs: ['Scheduling', 'Rotation Patterns', 'Edit'], moduleName: 'Scheduling', canonicalPath: '/scheduling/rotation-patterns/:id/edit' },
  { pattern: '/scheduling/rotation-patterns/:id', title: 'Rotation Pattern Details', breadcrumbs: ['Scheduling', 'Rotation Patterns', 'Details'], moduleName: 'Scheduling', canonicalPath: '/scheduling/rotation-patterns/:id' },
  { pattern: '/people/employees/create', title: 'Create Employee', breadcrumbs: ['Employees', 'Employee Directory', 'Create'], moduleName: 'Employees', canonicalPath: '/people/employees/create' },
  { pattern: '/people/employees/:id/edit', title: 'Edit Employee', breadcrumbs: ['Employees', 'Employee Directory', 'Edit'], moduleName: 'Employees', canonicalPath: '/people/employees/:id/edit' },
  { pattern: '/people/employees/:id', title: 'Employee Details', breadcrumbs: ['Employees', 'Employee Directory', 'Details'], moduleName: 'Employees', canonicalPath: '/people/employees/:id' },
  { pattern: '/attendance/corrections/create', title: 'Create Correction', breadcrumbs: ['Attendance', 'Corrections', 'Create'], moduleName: 'Attendance', canonicalPath: '/attendance/corrections/create' },
  { pattern: '/attendance/corrections/:id', title: 'Correction Details', breadcrumbs: ['Attendance', 'Corrections', 'Details'], moduleName: 'Attendance', canonicalPath: '/attendance/corrections/:id' },
  { pattern: '/attendance/:id', title: 'Attendance Details', breadcrumbs: ['Attendance', 'Details'], moduleName: 'Attendance', canonicalPath: '/attendance/:id' },
  { pattern: '/leave/types/create', title: 'Create Leave Type', breadcrumbs: ['Leave', 'Leave Types', 'Create'], moduleName: 'Leave', canonicalPath: '/leave/types/create' },
  { pattern: '/leave/types/:id/edit', title: 'Edit Leave Type', breadcrumbs: ['Leave', 'Leave Types', 'Edit'], moduleName: 'Leave', canonicalPath: '/leave/types/:id/edit' },
  { pattern: '/leave/requests/create', title: 'Create Leave Request', breadcrumbs: ['Leave', 'Leave Requests', 'Create'], moduleName: 'Leave', canonicalPath: '/leave/requests/create' },
  { pattern: '/leave/requests/:id', title: 'Leave Request Details', breadcrumbs: ['Leave', 'Leave Requests', 'Details'], moduleName: 'Leave', canonicalPath: '/leave/requests/:id' },
  { pattern: '/monitoring/devices/inventory', title: 'Device Inventory', breadcrumbs: ['Monitoring', 'Devices', 'Inventory'], moduleName: 'Monitoring', canonicalPath: '/monitoring/devices/inventory' },
  { pattern: '/monitoring/devices/:deviceId', title: 'Device Details', breadcrumbs: ['Monitoring', 'Devices', 'Details'], moduleName: 'Monitoring', canonicalPath: '/monitoring/devices/:deviceId' },
  { pattern: '/monitoring/alerts/:alertId', title: 'Alert Details', breadcrumbs: ['Alerts & Notifications', 'Alert Center', 'Details'], moduleName: 'Alerts & Notifications', canonicalPath: '/monitoring/alerts/:alertId' },
  { pattern: '/monitoring/alert-policies/create', title: 'Create Alert Policy', breadcrumbs: ['Alerts & Notifications', 'Alert Policies', 'Create'], moduleName: 'Alerts & Notifications', canonicalPath: '/monitoring/alert-policies/create' },
  { pattern: '/monitoring/alert-policies/:id/edit', title: 'Edit Alert Policy', breadcrumbs: ['Alerts & Notifications', 'Alert Policies', 'Edit'], moduleName: 'Alerts & Notifications', canonicalPath: '/monitoring/alert-policies/:id/edit' },
  { pattern: '/monitoring/productivity/employees/:employeeId', title: 'Employee Productivity', breadcrumbs: ['Productivity', 'Employee Productivity', 'Details'], moduleName: 'Productivity', canonicalPath: '/monitoring/productivity/employees/:employeeId' },
  { pattern: '/reports/scheduling', title: 'Scheduling Reports', breadcrumbs: ['Reports', 'Scheduling Reports'], moduleName: 'Reports', canonicalPath: '/reports/scheduling' },
];

const navigationRouteMetas = flattenNavigation(navigation);

export function useCurrentRouteMeta(): RouteMeta {
  const { pathname } = useLocation();

  return useMemo(() => getRouteMeta(pathname), [pathname]);
}

export function getRouteMeta(pathname: string): RouteMeta {
  const normalizedPath = normalizePath(pathname);
  const exactNavigationMeta = navigationRouteMetas.find((route) => normalizedPath === route.canonicalPath);
  if (exactNavigationMeta) {
    return exactNavigationMeta;
  }

  const explicit = [...explicitRoutePatterns]
    .sort((a, b) => specificity(b.pattern) - specificity(a.pattern))
    .find((route) => matchPath({ path: route.pattern, end: true }, normalizedPath));

  if (explicit) {
    return withoutPattern(explicit);
  }

  const navigationMeta = navigationRouteMetas
    .filter((route) => normalizedPath.startsWith(`${route.canonicalPath}/`))
    .sort((a, b) => b.canonicalPath.length - a.canonicalPath.length)[0];

  if (navigationMeta) {
    return navigationMeta;
  }

  return { title: 'Page', breadcrumbs: ['Workspace', 'Page'], moduleName: 'Workspace', canonicalPath: normalizedPath };
}

function flattenNavigation(groups: NavGroup[]): RouteMeta[] {
  return groups.flatMap((group) => {
    if (group.children?.length) {
      return group.children.map((item) => itemToRouteMeta(group, item));
    }
    if (group.path) {
      return [{ title: group.label, breadcrumbs: [group.label], moduleName: group.label, canonicalPath: normalizePath(group.path) }];
    }
    return [];
  });
}

function itemToRouteMeta(group: NavGroup, item: NavItem): RouteMeta {
  return {
    title: item.label,
    breadcrumbs: [group.label, item.label],
    moduleName: group.label,
    canonicalPath: normalizePath(item.path),
  };
}

function normalizePath(pathname: string) {
  if (pathname === '/') return pathname;
  return `/${pathname.replace(/^\/+|\/+$/g, '')}`;
}

function specificity(pattern: string) {
  return pattern.split('/').filter(Boolean).reduce((score, part) => score + (part.startsWith(':') ? 1 : 10), 0);
}

function withoutPattern({ pattern: _pattern, ...meta }: RoutePatternMeta): RouteMeta {
  return meta;
}
