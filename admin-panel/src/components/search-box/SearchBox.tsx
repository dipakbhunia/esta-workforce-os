import { InputAdornment, TextField } from '@mui/material';
import { Search } from 'lucide-react';

export function SearchBox({ placeholder = 'Search', value, onChange }: { placeholder?: string; value?: string; onChange?: (value: string) => void }) {
  return (
    <TextField
      size="small"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search size={18} strokeWidth={2.1} />
          </InputAdornment>
        ),
      }}
      sx={{ minWidth: { xs: '100%', sm: 280 }, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
    />
  );
}
