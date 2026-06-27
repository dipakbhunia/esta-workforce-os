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
  { label: 'Dashboard', path: '/', icon: Gauge },
  {
    label: 'Organization',
    icon: Building2,
    children: [
      { label: 'Companies', path: '/organization/companies', icon: BriefcaseBusiness },
      { label: 'Branches', path: '/organization/branches', icon: MapPin },
      { label: 'Departments', path: '/organization/departments', icon: Network },
      { label: 'Designations', path: '/organization/designations', icon: Layers3 },
      { label: 'Shifts', path: '/organization/shifts', icon: Clock3 },
    ],
  },
  {
    label: 'People',
    icon: Users,
    children: [
      { label: 'Users', path: '/people/users', icon: UserCog },
      { label: 'Employees', path: '/people/employees', icon: Users },
      { label: 'Roles', path: '/people/roles', icon: ShieldCheck },
      { label: 'Permissions', path: '/people/permissions', icon: Split },
    ],
  },
  {
    label: 'Attendance',
    icon: CalendarCheck,
    children: [
      { label: 'Attendance', path: '/attendance', icon: CalendarCheck },
      { label: 'Attendance Policies', path: '/attendance/policies', icon: TimerReset },
      { label: 'Break Policies', path: '/attendance/break-policies', icon: BellRing },
    ],
  },
  {
    label: 'Leave',
    icon: FileText,
    children: [
      { label: 'Leave Types', path: '/leave/types', icon: FileText },
      { label: 'Leave Requests', path: '/leave/requests', icon: Activity },
    ],
  },
  {
    label: 'Monitoring',
    icon: MonitorDot,
    children: [
      { label: 'Live Status', path: '/monitoring/live-status', icon: MonitorDot },
      { label: 'Employee Monitoring', path: '/monitoring/employees', icon: Activity },
    ],
  },
  { label: 'Reports', path: '/reports', icon: BarChart3 },
  { label: 'Settings', path: '/settings', icon: Settings },
];
