import { Download } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Permission, RoleName } from '@/features/auth';
import { hasAnyRole, hasPermission } from '@/features/auth/utils/permissions';
import { SHARED_ROLES, mutableRoles } from '@/features/auth/utils/route-policy';
import { getRouteMeta } from '@/routes/routeMeta';
import type { NavGroup, NavItem } from '@/types/navigation';

export interface NavigationSearchEntry {
  id: string;
  label: string;
  moduleName: string;
  path: string;
  icon?: LucideIcon;
  keywords: string[];
  context: string;
  comingSoon?: boolean;
  permission?: Permission;
  roles?: RoleName[];
}

export const implementedNavPaths = new Set([
  '/',
  '/organization/companies',
  '/saas/plans',
  '/saas/subscriptions',
  '/saas/trials',
  '/saas/usage-seats',
  '/saas/storage',
  '/organization/branches',
  '/organization/departments',
  '/organization/designations',
  '/scheduling/shifts',
  '/people/employees',
  '/attendance',
  '/attendance/corrections',
  '/attendance/policies',
  '/attendance/break-policies',
  '/leave/requests',
  '/leave/types',
  '/leave/balances',
  '/monitoring/live-status',
  '/monitoring/timeline',
  '/monitoring/activity',
  '/monitoring/screenshots',
  '/monitoring/applications',
  '/monitoring/websites',
  '/monitoring/devices',
  '/monitoring/idle-time',
  '/monitoring/alerts',
  '/monitoring/alert-policies',
  '/monitoring/operations',
  '/monitoring/productivity/analytics',
  '/monitoring/productivity/trends',
  '/monitoring/productivity/coverage',
  '/monitoring/productivity/applications',
  '/monitoring/productivity/websites',
  '/notifications',
  '/notifications/preferences',
  '/billing/settings',
  '/settings/users',
  '/settings/roles',
  '/settings/permissions',
]);

export const extraNavigationSearchEntries: NavigationSearchEntry[] = [
  {
    id: 'downloads',
    label: 'Download Apps',
    moduleName: 'Downloads',
    path: '/downloads',
    icon: Download,
    keywords: ['desktop agent', 'windows installer', 'macos', 'download apps', 'apps'],
    context: getRouteMeta('/downloads').breadcrumbs.join(' / '),
    permission: 'dashboard:view',
    roles: mutableRoles(SHARED_ROLES),
  },
];

export function buildNavigationSearchEntries(
  groups: NavGroup[],
  permissions: Permission[],
  roles: RoleName[],
  extras: NavigationSearchEntry[] = extraNavigationSearchEntries,
) {
  const entries = groups.flatMap((group) => navigationEntriesForGroup(group, permissions, roles));
  const allowedExtras = extras.filter((entry) => isNavigationSearchAllowed(entry, permissions, roles));

  return [...new Map([...entries, ...allowedExtras].map((entry) => [entry.path, entry])).values()];
}

export function searchNavigationEntries(entries: NavigationSearchEntry[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return entries.slice(0, 8);

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
    .map((result) => result.entry);
}

export function isNavigationSearchAllowed(
  item: Pick<NavGroup | NavItem | NavigationSearchEntry, 'permission' | 'roles'>,
  permissions: Permission[],
  roles: RoleName[],
) {
  return hasPermission(permissions, item.permission) && hasAnyRole(roles, item.roles);
}

function navigationEntriesForGroup(group: NavGroup, permissions: Permission[], roles: RoleName[]): NavigationSearchEntry[] {
  if (group.children?.length) {
    return group.children
      .filter((item) => isNavigationSearchAllowed(item, permissions, roles))
      .map((item) => ({
        id: item.path,
        label: item.label,
        moduleName: group.label,
        path: item.path,
        icon: item.icon ?? group.icon,
        comingSoon: !implementedNavPaths.has(item.path),
        keywords: keywordsFor(group.label, item.label, item.path),
        context: getRouteMeta(item.path).breadcrumbs.join(' / '),
      }));
  }

  if (group.path && isNavigationSearchAllowed(group, permissions, roles)) {
    return [{
      id: group.path,
      label: group.label,
      moduleName: group.label,
      path: group.path,
      icon: group.icon,
      comingSoon: !implementedNavPaths.has(group.path),
      keywords: keywordsFor(group.label, group.label, group.path),
      context: getRouteMeta(group.path).breadcrumbs.join(' / '),
    }];
  }

  return [];
}

function scoreEntry(entry: NavigationSearchEntry, query: string) {
  const label = normalize(entry.label);
  const moduleName = normalize(entry.moduleName);
  const haystack = [label, moduleName, ...entry.keywords.map(normalize)].join(' ');

  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (moduleName === query) return 70;
  if (moduleName.startsWith(query)) return 55;
  if (haystack.includes(query)) return 35;
  return 0;
}

function keywordsFor(moduleName: string, label: string, path: string) {
  const pathKeywords = path.split('/').filter(Boolean).map((part) => part.replaceAll('-', ' '));
  const aliases = [moduleName, label, ...pathKeywords, label.replaceAll('&', 'and')];
  if (label === 'Users') aliases.push('accounts', 'login identities');
  if (label === 'Shifts') aliases.push('scheduling', 'work schedule');
  if (label === 'Employee Directory') aliases.push('employees', 'staff');
  if (moduleName === 'CRM') aliases.push('sales');
  if (moduleName === 'Alerts & Notifications') aliases.push('notifications', 'alerts');
  return aliases;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
