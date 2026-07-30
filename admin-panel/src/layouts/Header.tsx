import { Avatar, Badge, Box, Button, Divider, IconButton, InputAdornment, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, Download, LogOut, Menu as MenuIcon, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { getNotificationUnreadCount } from '@/features/notifications/services/notifications-api';
import { NavigationSearchDialog } from '@/layouts/NavigationSearchDialog';
import { NotificationDrawer } from '@/layouts/NotificationDrawer';

export function Header({ onOpenMobileSidebar }: { onOpenMobileSidebar: () => void }) {
  const { logout, roles, user } = useAuth();
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchOpenerRef = useRef<HTMLElement | null>(null);
  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Admin User';
  const initials = useMemo(() => fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), [fullName]);
  const primaryRole = roles[0]?.replaceAll('_', ' ') ?? 'ADMIN';
  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => getNotificationUnreadCount().then((response) => response.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  const unread = unreadQuery.data?.unread ?? 0;
  const companyLabel = user?.companyId ? 'Company workspace' : 'Global workspace';

  useEffect(() => {
    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen((current) => {
          if (!current) searchOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          return !current;
        });
      }
    }

    window.addEventListener('keydown', handleGlobalSearchShortcut);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcut);
  }, []);

  function openSearch(opener: HTMLElement) {
    searchOpenerRef.current = opener;
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
    const opener = searchOpenerRef.current;
    window.setTimeout(() => {
      if (opener?.isConnected) opener.focus();
    }, 0);
  }

  async function handleLogout() {
    setProfileAnchor(null);
    await logout();
  }

  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(245,247,251,0.9)', backdropFilter: 'blur(14px)', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" gap={{ xs: 1, md: 1.5 }} sx={{ minHeight: 64, px: { xs: 2, lg: 3 } }}>
        <IconButton sx={{ display: { lg: 'none' } }} onClick={onOpenMobileSidebar} aria-label="Open navigation">
          <MenuIcon size={20} />
        </IconButton>

        <Box sx={{ display: { xs: 'none', sm: 'block' }, width: { sm: 'clamp(300px, 42vw, 520px)', xl: 560 }, maxWidth: '100%' }}>
          <TextField
            size="small"
            value=""
            placeholder="Search navigation"
            aria-label="Search navigation"
            onClick={(event) => openSearch(event.currentTarget)}
            inputProps={{ readOnly: true }}
            InputProps={{
              readOnly: true,
              startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment>,
              endAdornment: <InputAdornment position="end"><Typography variant="caption" color="text.secondary">Ctrl K</Typography></InputAdornment>,
            }}
            sx={{ width: '100%', '& .MuiOutlinedInput-root': { bgcolor: '#fff', cursor: 'pointer' }, '& input': { cursor: 'pointer' } }}
          />
        </Box>
        <Tooltip title="Search navigation">
          <IconButton aria-label="Search navigation" onClick={(event) => openSearch(event.currentTarget)} sx={{ display: { xs: 'inline-flex', sm: 'none' }, bgcolor: '#fff' }}>
            <Search size={19} />
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        <Tooltip title="Download desktop apps">
          <span>
            <Button component={RouterLink} to="/downloads" variant="contained" startIcon={<Download size={17} />} sx={{ display: { xs: 'none', sm: 'inline-flex' }, whiteSpace: 'nowrap' }}>
              Download Apps
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Download apps">
          <IconButton component={RouterLink} to="/downloads" aria-label="Download Apps" sx={{ display: { xs: 'inline-flex', sm: 'none' }, bgcolor: '#DBEAFE', color: '#1D4ED8', '&:hover': { bgcolor: '#BFDBFE' } }}>
            <Download size={19} />
          </IconButton>
        </Tooltip>

        <IconButton aria-label={unread ? `Open notifications, ${unread} unread` : 'Open notifications'} onClick={() => setNotificationsOpen(true)}>
          <Badge color="error" badgeContent={unread || undefined}><Bell size={19} /></Badge>
        </IconButton>
        <Button variant="outlined" startIcon={<Building2 size={17} />} sx={{ display: { xs: 'none', xl: 'inline-flex' }, bgcolor: '#fff', whiteSpace: 'nowrap' }}>{companyLabel}</Button>
        <Divider orientation="vertical" flexItem sx={{ my: 2, display: { xs: 'none', md: 'block' } }} />
        <Stack direction="row" alignItems="center" gap={1} sx={{ display: { xs: 'none', md: 'flex' } }}>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="body2" fontWeight={800}>{fullName}</Typography>
            <Typography variant="caption" color="text.secondary">{primaryRole}</Typography>
          </Box>
        </Stack>
        <IconButton onClick={(event) => setProfileAnchor(event.currentTarget)} aria-label="Open profile menu">
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#DBEAFE', color: '#1D4ED8', fontWeight: 800 }}>{initials}</Avatar>
        </IconButton>
        <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={() => setProfileAnchor(null)}>
          <Box sx={{ px: 2, py: 1.5, minWidth: 240 }}>
            <Typography fontWeight={850}>{fullName}</Typography>
            <Typography variant="body2" color="text.secondary">{user?.email}</Typography>
            <Typography variant="caption" color="text.secondary">{primaryRole} - {companyLabel}</Typography>
          </Box>
          <Divider />
          <MenuItem onClick={handleLogout}><LogOut size={17} style={{ marginRight: 8 }} /> Logout</MenuItem>
        </Menu>
      </Stack>
      <NavigationSearchDialog open={searchOpen} onClose={closeSearch} />
      <NotificationDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </Box>
  );
}
