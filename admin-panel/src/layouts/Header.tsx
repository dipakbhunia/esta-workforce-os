import { Avatar, Badge, Box, Button, Divider, IconButton, InputAdornment, Menu, MenuItem, Stack, TextField } from '@mui/material';
import { Bell, Building2, HelpCircle, Menu as MenuIcon, Moon, Search, UserCircle } from 'lucide-react';
import { useState } from 'react';
import { AppBreadcrumb } from '@/components/breadcrumb';
import { NotificationDrawer } from './NotificationDrawer';

export function Header({ onOpenMobileSidebar }: { onOpenMobileSidebar: () => void }) {
  const [profileAnchor, setProfileAnchor] = useState<HTMLElement | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
        <Button variant="outlined" startIcon={<Building2 size={17} />} sx={{ display: { xs: 'none', md: 'inline-flex' }, bgcolor: '#fff' }}>Demo Company</Button>
        <IconButton aria-label="Toggle theme placeholder"><Moon size={19} /></IconButton>
        <IconButton aria-label="Help"><HelpCircle size={19} /></IconButton>
        <IconButton aria-label="Open notifications" onClick={() => setNotificationsOpen(true)}><Badge color="error" variant="dot"><Bell size={19} /></Badge></IconButton>
        <Divider orientation="vertical" flexItem sx={{ my: 2 }} />
        <IconButton onClick={(event) => setProfileAnchor(event.currentTarget)} aria-label="Open profile menu">
          <Avatar sx={{ width: 34, height: 34, bgcolor: '#DBEAFE', color: '#1D4ED8', fontWeight: 800 }}>DA</Avatar>
        </IconButton>
        <Menu anchorEl={profileAnchor} open={Boolean(profileAnchor)} onClose={() => setProfileAnchor(null)}>
          <MenuItem><UserCircle size={17} style={{ marginRight: 8 }} /> Profile</MenuItem>
          <MenuItem>Account settings</MenuItem>
          <MenuItem>Sign out</MenuItem>
        </Menu>
      </Stack>
      <Box sx={{ px: { xs: 2, lg: 3 }, pb: 2 }}>
        <AppBreadcrumb items={['Admin', 'Workforce Control Center']} />
      </Box>
      <NotificationDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </Box>
  );
}
