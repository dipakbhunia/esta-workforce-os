import { Box, Chip, Drawer, IconButton, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { CheckCircle2, Clock3, X } from 'lucide-react';

const notifications = [
  { title: 'Attendance policy review', description: 'Demo Company policy changes are ready for approval.', tone: 'Pending' },
  { title: 'New employee onboarding', description: 'Aditi Sharma completed profile setup.', tone: 'People' },
  { title: 'System health', description: 'All foundation services are responding normally.', tone: 'OK' },
];

export function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 320, sm: 380 }, p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h3">Notifications</Typography>
            <Typography variant="body2" color="text.secondary">Dummy activity feed for the admin foundation.</Typography>
          </Box>
          <IconButton aria-label="Close notifications" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Stack>
        <List disablePadding>
          {notifications.map((notification) => (
            <ListItem key={notification.title} alignItems="flex-start" sx={{ px: 0, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" gap={1.5} alignItems="flex-start">
                {notification.tone === 'OK' ? <CheckCircle2 size={18} color="#16A34A" /> : <Clock3 size={18} color="#2563EB" />}
                <Box>
                  <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.25 }}>
                    <ListItemText primary={notification.title} primaryTypographyProps={{ fontWeight: 800 }} sx={{ m: 0 }} />
                    <Chip label={notification.tone} size="small" />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">{notification.description}</Typography>
                </Box>
              </Stack>
            </ListItem>
          ))}
        </List>
      </Box>
    </Drawer>
  );
}
