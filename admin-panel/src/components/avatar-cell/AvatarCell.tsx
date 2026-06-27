import { Avatar, Box, Typography } from '@mui/material';

export function AvatarCell({ name, email }: { name: string; email?: string }) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Avatar sx={{ width: 34, height: 34, bgcolor: '#E0ECFF', color: '#1D4ED8', fontWeight: 800, fontSize: 13 }}>
        {initials}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={750} noWrap>{name}</Typography>
        {email && <Typography variant="caption" color="text.secondary" noWrap>{email}</Typography>}
      </Box>
    </Box>
  );
}
