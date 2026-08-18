import { Box, Chip, Dialog, DialogContent, Divider, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, Stack, TextField, Typography } from '@mui/material';
import { Download, Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, type Permission, type RoleName } from '@/features/auth';
import { hasAnyRole, hasPermission } from '@/features/auth/utils/permissions';
import { navigation } from '@/routes/navigation';
import { getRouteMeta } from '@/routes/routeMeta';
import type { NavGroup, NavItem } from '@/types/navigation';

interface NavigationSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

interface SearchEntry {
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

const implementedNavPaths = new Set([
  '/',
  '/organization/companies',
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

const extraEntries: SearchEntry[] = [
  {
    id: 'downloads',
    label: 'Download Apps',
    moduleName: 'Downloads',
    path: '/downloads',
    icon: Download,
    keywords: ['desktop agent', 'windows installer', 'macos', 'download apps', 'apps'],
    context: getRouteMeta('/downloads').breadcrumbs.join(' / '),
    permission: 'dashboard:view',
    roles: ['COMPANY_ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'],
  },
];

export function NavigationSearchDialog({ open, onClose }: NavigationSearchDialogProps) {
  const navigate = useNavigate();
  const { permissions, roles } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const entries = useMemo(
    () => [...navigationEntries(navigation, permissions, roles), ...extraEntries.filter((entry) => isAllowed(entry, permissions, roles))],
    [permissions, roles],
  );
  const results = useMemo(() => searchEntries(entries, query).slice(0, 10), [entries, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function closeDialog() {
    setQuery('');
    setActiveIndex(0);
    onClose();
  }

  function openEntry(entry: SearchEntry) {
    navigate(entry.path);
    closeDialog();
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      openEntry(results[activeIndex]);
    }
  }

  return (
    <Dialog open={open} onClose={closeDialog} fullWidth maxWidth="sm" aria-labelledby="navigation-search-title" disableRestoreFocus>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ mb: 1 }}>
            <Typography id="navigation-search-title" variant="h3">Search navigation</Typography>
            <IconButton aria-label="Close navigation search" onClick={closeDialog} size="small">
              <X size={18} />
            </IconButton>
          </Stack>
          <TextField
            inputRef={inputRef}
            fullWidth
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, modules, settings..."
            aria-label="Search navigation pages"
            InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }}
          />
        </Box>
        <Divider />
        {results.length === 0 ? (
          <Stack alignItems="center" sx={{ px: 3, py: 5 }}>
            <Typography fontWeight={850}>No matching pages</Typography>
            <Typography variant="body2" color="text.secondary" textAlign="center">Try a module name, page name, or a shorter keyword.</Typography>
          </Stack>
        ) : (
          <List sx={{ py: 1, maxHeight: 'min(520px, 62vh)', overflowY: 'auto' }}>
            {results.map((entry, index) => {
              const Icon = entry.icon;
              const selected = index === activeIndex;
              return (
                <ListItemButton
                  key={entry.id}
                  selected={selected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => openEntry(entry)}
                  aria-label={`Open ${entry.label} in ${entry.moduleName}`}
                  sx={{ mx: 1, borderRadius: 2, py: 1.25 }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: selected ? 'primary.main' : 'text.secondary' }}>
                    {Icon && <Icon size={19} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={<Stack direction="row" alignItems="center" gap={1}><Typography fontWeight={850}>{entry.label}</Typography>{entry.comingSoon && <Chip size="small" label="Coming Soon" />}</Stack>}
                    secondary={entry.context}
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
        <Divider />
        <Stack direction="row" gap={1.5} sx={{ px: 2, py: 1.25 }}>
          <Typography variant="caption" color="text.secondary">Enter to open</Typography>
          <Typography variant="caption" color="text.secondary">Arrow keys to move</Typography>
          <Typography variant="caption" color="text.secondary">Esc to close</Typography>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

function navigationEntries(groups: NavGroup[], permissions: Permission[], roles: RoleName[]): SearchEntry[] {
  return groups.flatMap((group) => {
    if (group.children?.length) {
      return group.children.filter((item) => isAllowed(item, permissions, roles)).map((item) => ({
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

    if (group.path && isAllowed(group, permissions, roles)) {
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
  });
}

function searchEntries(entries: SearchEntry[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return entries.slice(0, 8);

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label))
    .map((result) => result.entry);
}

function scoreEntry(entry: SearchEntry, query: string) {
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
  const aliases = [
    moduleName,
    label,
    ...pathKeywords,
    label.replaceAll('&', 'and'),
  ];
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

function isAllowed(item: Pick<NavGroup | NavItem | SearchEntry, 'permission' | 'roles'>, permissions: Permission[], roles: RoleName[]) {
  return hasPermission(permissions, item.permission) && hasAnyRole(roles, item.roles);
}
