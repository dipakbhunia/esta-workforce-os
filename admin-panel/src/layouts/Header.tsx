import { Avatar, Badge, Box, Button, Divider, IconButton, InputAdornment, Menu, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Bell, Building2, HelpCircle, LogOut, Menu as MenuIcon, Moon, Search, UserCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppBreadcrumb } from '@/components/breadcrumb';
import { useAuth } from '@/features/auth';
import { NotificationDrawer } from './NotificationDrawer';

export function Header({ onOpenMobileSidebar }: { onOpenMobileSidebar: () => void }) {
  const { logout, roles, user } = useAuth();
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const fullName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Admin User';
  const initials = useMemo(() => fullName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(), [fullName]);
  const primaryRole = roles[0]?.replaceAll('_', ' ') ?? 'ADMIN';
  const companyLabel = user?.companyId ? 'Company workspace' : 'Global workspace';

  async function handleLogout() {
    setProfileAnchor(null);
    await logout();
  }

  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(245,247,251,0.88)', backdropFilter: 'blur(14px)', borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" gap={2} sx={{ minHeight: 72, px: { xs: 2, lg: 3 } }}>
        <IconButton sx={{ display: { lg: 'none' } }} onClick={onOpenMobileSidebar} aria-label="Open navigation">
          <MenuIcon size={20} />
        </IconButton>
        <TextField
          size="small"
          placeholder="Search employees, teams, policies..."
          aria-label="Global search"
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> }}
          sx={{ width: { xs: '100%', md: 420 }, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
        />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<Building2 size={17} />} sx={{ display: { xs: 'none', md: 'inline-flex' }, bgcolor: '#fff' }}>{companyLabel}</Button>
        <IconButton aria-label="Toggle theme placeholder"><Moon size={19} /></IconButton>
        <IconButton aria-label="Help"><HelpCircle size={19} /></IconButton>
        <IconButton aria-label="Open notifications" onClick={() => setNotificationsOpen(true)}><Badge color="error" variant="dot"><Bell size={19} /></Badge></IconButton>
        <Divider orientation="vertical" flexItem sx={{ my: 2 }} />
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
            <Typography variant="caption" color="text.secondary">{primaryRole} · {companyLabel}</Typography>
          </Box>
          <Divider />
          <MenuItem><UserCircle size={17} style={{ marginRight: 8 }} /> Profile</MenuItem>
          <MenuItem>Account settings</MenuItem>
          <MenuItem onClick={handleLogout}><LogOut size={17} style={{ marginRight: 8 }} /> Logout</MenuItem>
        </Menu>
      </Stack>
      <Box sx={{ px: { xs: 2, lg: 3 }, pb: 2 }}>
        <AppBreadcrumb items={['Admin', 'Workforce Control Center']} />
      </Box>
      <NotificationDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </Box>
  );
}
