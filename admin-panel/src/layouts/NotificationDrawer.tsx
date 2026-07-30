import { Alert, Box, Button, Chip, CircularProgress, Drawer, IconButton, List, ListItemButton, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCheck, Circle, ShieldAlert, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { getNotifications, markAllNotificationsRead, markNotificationRead } from '@/features/notifications/services/notifications-api';
import type { NotificationRecord } from '@/features/notifications/types/notification.types';

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function severityColor(notification: NotificationRecord) {
  if (notification.severity === 'CRITICAL') return '#DC2626';
  if (notification.severity === 'WARNING') return '#F59E0B';
  return '#2563EB';
}

export function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'drawer'],
    queryFn: () => getNotifications({ page: 1, limit: 8 }).then((response) => response.data),
    enabled: open,
    refetchOnWindowFocus: true,
  });
  const markReadMutation = useMutation({ mutationFn: markNotificationRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  const markAllMutation = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }) });
  const rows = notificationsQuery.data?.data ?? [];

  function openNotification(notification: NotificationRecord) {
    if (!notification.readAt) markReadMutation.mutate(notification.id);
    onClose();
    navigate(notification.detailsPath || '/notifications');
  }

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: { xs: 330, sm: 420 }, p: 3 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h3">Notifications</Typography>
            <Typography variant="body2" color="text.secondary">Latest alert lifecycle updates for you.</Typography>
          </Box>
          <IconButton aria-label="Close notifications" onClick={onClose}><X size={18} /></IconButton>
        </Stack>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Button size="small" onClick={() => { onClose(); navigate('/notifications'); }}>View all notifications</Button>
          <Tooltip title="Mark all notifications as read"><Button size="small" startIcon={<CheckCheck size={16} />} onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending}>Mark all read</Button></Tooltip>
        </Stack>
        {notificationsQuery.isLoading && <Stack alignItems="center" sx={{ py: 5 }}><CircularProgress size={28} /></Stack>}
        {notificationsQuery.isError && <Alert severity="error" action={<Button color="inherit" onClick={() => void notificationsQuery.refetch()}>Retry</Button>}>Unable to load notifications.</Alert>}
        {!notificationsQuery.isLoading && !notificationsQuery.isError && rows.length === 0 && <EmptyState title="No notifications" description="You are all caught up." />}
        <List disablePadding>
          {rows.map((notification) => (
            <ListItemButton key={notification.id} alignItems="flex-start" onClick={() => openNotification(notification)} sx={{ px: 0, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', gap: 1.5 }}>
              {notification.severity === 'CRITICAL' ? <ShieldAlert size={18} color={severityColor(notification)} /> : <AlertTriangle size={18} color={severityColor(notification)} />}
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }}>
                  {!notification.readAt && <Circle size={8} fill="#2563EB" color="#2563EB" aria-label="Unread" />}
                  <Typography fontWeight={notification.readAt ? 750 : 900} noWrap>{notification.title}</Typography>
                  <Chip label={notification.severity ?? 'INFO'} size="small" sx={{ ml: 'auto', color: severityColor(notification), borderColor: severityColor(notification) }} variant="outlined" />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{notification.message}</Typography>
                <Typography variant="caption" color="text.secondary">{relativeTime(notification.createdAt)}</Typography>
              </Box>
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Drawer>
  );
}
