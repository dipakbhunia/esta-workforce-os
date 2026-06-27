import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon?: LucideIcon;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  path?: string;
  children?: NavItem[];
}
