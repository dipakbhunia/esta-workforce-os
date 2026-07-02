import { Box } from '@mui/material';
import { SearchBox } from '@/components/search-box';

export function SearchFilter({ placeholder, value, onChange }: { placeholder?: string; value: string; onChange: (value: string) => void }) {
  return (
    <Box sx={{ width: { xs: '100%', md: 320 } }}>
      <SearchBox placeholder={placeholder} value={value} onChange={onChange} />
    </Box>
  );
}
