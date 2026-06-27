import type { LucideIcon } from 'lucide-react';
import type { Permission, RoleName } from '@/features/auth';

export interface NavItem {
  label: string;
  path: string;
  icon?: LucideIcon;
  permission?: Permission;
  roles?: RoleName[];
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: NavItem[];
  permission?: Permission;
  roles?: RoleName[];
}
