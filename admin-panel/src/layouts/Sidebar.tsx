import { Box, Collapse, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography } from '@mui/material';
import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { navigation } from '@/routes/navigation';
import type { NavGroup, NavItem } from '@/types/navigation';

export const SIDEBAR_WIDTH = 284;
export const SIDEBAR_COLLAPSED_WIDTH = 84;

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  const { permissions, roles } = useAuth();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Organization: true, Employees: true, Attendance: true, Settings: true });
  const allowedNavigation = useMemo(() => filterNavigation(navigation, permissions, roles), [permissions, roles]);
  const activePath = useMemo(() => findActivePath(allowedNavigation, location.pathname), [allowedNavigation, location.pathname]);
  const activeGroup = useMemo(() => allowedNavigation.find((group) => group.children?.some((item) => item.path === activePath)), [activePath, allowedNavigation]);

  return (
    <Box sx={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH, transition: 'width 180ms ease', height: '100%', bgcolor: '#fff', borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ height: 72, px: 2 }}>
        <Stack direction="row" alignItems="center" gap={1.25} sx={{ minWidth: 0 }}>
          <Box sx={{ width: 38, height: 38, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: '#EFF6FF', color: 'primary.main' }}>
            <Sparkles size={20} />
          </Box>
          {!collapsed && <Typography fontWeight={850} noWrap>Esta Workforce</Typography>}
        </Stack>
        <IconButton size="small" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </IconButton>
      </Stack>
      <List sx={{ px: 1.25, py: 1, overflowY: 'auto' }}>
        {allowedNavigation.map((group) => {
          const Icon = group.icon;
          const isGroupActive = activeGroup?.label === group.label || Boolean(group.path && group.path === activePath);
          if (!group.children && group.path) {
            return (
              <Tooltip title={collapsed ? group.label : ''} placement="right" key={group.label}>
                <ListItemButton component={NavLink} to={group.path} sx={navItemSx(isGroupActive, collapsed)}>
                  <ListItemIcon sx={iconSx(isGroupActive)}><Icon size={19} /></ListItemIcon>
                  {!collapsed && <ListItemText primary={group.label} primaryTypographyProps={{ fontWeight: 750, fontSize: 14 }} />}
                </ListItemButton>
              </Tooltip>
            );
          }
          const open = openGroups[group.label] ?? false;
          return (
            <Box key={group.label}>
              <Tooltip title={collapsed ? group.label : ''} placement="right">
                <ListItemButton onClick={() => !collapsed && setOpenGroups((current) => ({ ...current, [group.label]: !open }))} sx={navItemSx(Boolean(isGroupActive), collapsed)}>
                  <ListItemIcon sx={iconSx(Boolean(isGroupActive))}><Icon size={19} /></ListItemIcon>
                  {!collapsed && <ListItemText primary={group.label} primaryTypographyProps={{ fontWeight: 800, fontSize: 13, color: 'text.secondary' }} />}
                  {!collapsed && <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 160ms ease' }} />}
                </ListItemButton>
              </Tooltip>
              {!collapsed && (
                <Collapse in={open} timeout={180} unmountOnExit>
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                    {group.children?.map((item) => {
                      const ItemIcon = item.icon;
                      const active = item.path === activePath;
                      return (
                        <ListItemButton key={item.path} component={NavLink} to={item.path} sx={{ ...navItemSx(active, false), ml: 1.5, minHeight: 38 }}>
                          <ListItemIcon sx={iconSx(active)}>{ItemIcon && <ItemIcon size={17} />}</ListItemIcon>
                          <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: active ? 800 : 650, fontSize: 13 }} />
                        </ListItemButton>
                      );
                    })}
                  </motion.div>
                </Collapse>
              )}
            </Box>
          );
        })}
      </List>
    </Box>
  );
}

function filterNavigation(groups: NavGroup[], permissions: string[], roles: string[]) {
  return groups.reduce<NavGroup[]>((visibleGroups, group) => {
    const children = group.children?.filter((item) => isAllowed(item, permissions, roles));
    const allowedGroup = isAllowed(group, permissions, roles);

    if (group.children && children?.length) {
      visibleGroups.push({ ...group, children });
      return visibleGroups;
    }

    if (!group.children && allowedGroup) {
      visibleGroups.push(group);
    }

    return visibleGroups;
  }, []);
}

function isAllowed(item: NavGroup | NavItem, permissions: string[], roles: string[]) {
  const permissionAllowed = !item.permission || permissions.includes(item.permission);
  const roleAllowed = !item.roles?.length || item.roles.some((role) => roles.includes(role));
  return permissionAllowed && roleAllowed;
}

function findActivePath(groups: NavGroup[], pathname: string) {
  const paths = groups.flatMap((group) => [
    ...(group.path ? [group.path] : []),
    ...(group.children?.map((item) => item.path) ?? []),
  ]);

  return paths
    .filter((path) => pathname === path || pathname.startsWith(`${path}/`))
    .sort((left, right) => right.length - left.length)[0];
}

function navItemSx(active: boolean, collapsed: boolean) {
  return {
    minHeight: 42,
    my: 0.25,
    px: collapsed ? 1.25 : 1.5,
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 2.25,
    color: active ? 'primary.main' : 'text.secondary',
    bgcolor: active ? '#EFF6FF' : 'transparent',
    '&:hover': { bgcolor: active ? '#EFF6FF' : '#F8FAFC', color: active ? 'primary.main' : 'text.primary' },
  };
}

function iconSx(active: boolean) {
  return { minWidth: 34, color: active ? 'primary.main' : 'inherit' };
}
