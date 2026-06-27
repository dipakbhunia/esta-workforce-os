import { IconButton, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { Edit3, MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';

export function ActionMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <IconButton aria-label="Row actions" size="small" onClick={(event) => setAnchor(event.currentTarget)}>
        <MoreHorizontal size={18} />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => setAnchor(null)}>
          <ListItemIcon><Edit3 size={16} /></ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          setAnchor(null);
          setConfirmOpen(true);
        }}>
          <ListItemIcon><Trash2 size={16} /></ListItemIcon>
          <ListItemText>Archive</ListItemText>
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={confirmOpen}
        title="Archive this record?"
        description="This is a dummy confirmation flow for the admin foundation. No data will be changed."
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
