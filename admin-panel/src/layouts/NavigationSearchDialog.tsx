import { Box, Chip, Dialog, DialogContent, Divider, IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText, Stack, TextField, Typography } from '@mui/material';
import { Search, X } from 'lucide-react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { navigation } from '@/routes/navigation';
import { buildNavigationSearchEntries, searchNavigationEntries, type NavigationSearchEntry } from '@/routes/navigation-search';

interface NavigationSearchDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NavigationSearchDialog({ open, onClose }: NavigationSearchDialogProps) {
  const navigate = useNavigate();
  const { permissions, roles } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const entries = useMemo(
    () => buildNavigationSearchEntries(navigation, permissions, roles),
    [permissions, roles],
  );
  const results = useMemo(() => searchNavigationEntries(entries, query).slice(0, 10), [entries, query]);

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

  function openEntry(entry: NavigationSearchEntry) {
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
