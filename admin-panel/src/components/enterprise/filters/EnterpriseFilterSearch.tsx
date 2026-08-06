import { CircularProgress, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface EnterpriseFilterSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  debounceMs?: number;
  loading?: boolean;
  disabled?: boolean;
}

export function EnterpriseFilterSearch({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search filters',
  debounceMs = 400,
  loading = false,
  disabled = false,
}: EnterpriseFilterSearchProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (draft !== value) {
        onChange(draft);
      }
    }, debounceMs);

    return () => window.clearTimeout(timeout);
  }, [debounceMs, draft, onChange, value]);

  const clearSearch = () => {
    setDraft('');
    if (value !== '') {
      onChange('');
    }
  };

  return (
    <TextField
      fullWidth
      size="small"
      value={draft}
      disabled={disabled}
      label={label}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (draft !== value) {
            onChange(draft);
          }
        }
      }}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search size={18} strokeWidth={2.1} />
          </InputAdornment>
        ),
        endAdornment: (
          <InputAdornment position="end">
            {loading ? <CircularProgress size={16} /> : null}
            {draft ? (
              <Tooltip title="Clear search">
                <IconButton aria-label="Clear search" size="small" edge="end" onClick={clearSearch}>
                  <X size={16} />
                </IconButton>
              </Tooltip>
            ) : null}
          </InputAdornment>
        ),
      }}
      sx={{
        maxWidth: { xs: '100%', lg: 720 },
        '& .MuiOutlinedInput-root': {
          minHeight: 44,
          bgcolor: 'background.paper',
        },
      }}
    />
  );
}
