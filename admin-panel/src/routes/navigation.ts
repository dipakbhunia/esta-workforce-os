import {
  Activity,
  BarChart3,
  BellRing,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  Clock3,
  FileText,
  Gauge,
  Layers3,
  MapPin,
  MonitorDot,
  Network,
  Settings,
  ShieldCheck,
  Split,
  TimerReset,
  UserCog,
  Users,
} from 'lucide-react';
import type { NavGroup } from '@/types/navigation';

export const navigation: NavGroup[] = [
  { label: 'Dashboard', path: '/', icon: Gauge, permission: 'dashboard:view' },
  {
    label: 'Organization',
    icon: Building2,
    permission: 'organization:manage',
    children: [
      { label: 'Companies', path: '/organization/companies', icon: BriefcaseBusiness, permission: 'companies:manage' },
      { label: 'Branches', path: '/organization/branches', icon: MapPin, permission: 'branches:view' },
      { label: 'Departments', path: '/organization/departments', icon: Network, permission: 'departments:view' },
      { label: 'Designations', path: '/organization/designations', icon: Layers3, permission: 'designations:view' },
      { label: 'Shifts', path: '/organization/shifts', icon: Clock3, permission: 'shifts:view' },
    ],
  },
  {
    label: 'People',
    icon: Users,
    permission: 'employees:view',
    children: [
      { label: 'Users', path: '/people/users', icon: UserCog, permission: 'people:manage' },
      { label: 'Employees', path: '/people/employees', icon: Users, permission: 'employees:view' },
      { label: 'Roles', path: '/people/roles', icon: ShieldCheck, permission: 'people:manage' },
      { label: 'Permissions', path: '/people/permissions', icon: Split, permission: 'people:manage' },
    ],
  },
  {
    label: 'Attendance',
    icon: CalendarCheck,
    permission: 'attendance:view',
    children: [
      { label: 'Attendance', path: '/attendance', icon: CalendarCheck, permission: 'attendance:view' },
      { label: 'Attendance Policies', path: '/attendance/policies', icon: TimerReset, permission: 'attendance:manage' },
      { label: 'Break Policies', path: '/attendance/break-policies', icon: BellRing, permission: 'attendance:manage' },
    ],
  },
  {
    label: 'Leave',
    icon: FileText,
    permission: 'leave:view',
    children: [
      { label: 'Leave Types', path: '/leave/types', icon: FileText, permission: 'leave:manage' },
      { label: 'Leave Requests', path: '/leave/requests', icon: Activity, permission: 'leave:view' },
    ],
  },
  {
    label: 'Monitoring',
    icon: MonitorDot,
    permission: 'monitoring:view',
    children: [
      { label: 'Live Status', path: '/monitoring/live-status', icon: MonitorDot, permission: 'monitoring:view' },
      { label: 'Employee Monitoring', path: '/monitoring/employees', icon: Activity, permission: 'monitoring:view' },
    ],
  },
  { label: 'Reports', path: '/reports', icon: BarChart3, permission: 'reports:view' },
  { label: 'Settings', path: '/settings', icon: Settings, permission: 'settings:view' },
];
