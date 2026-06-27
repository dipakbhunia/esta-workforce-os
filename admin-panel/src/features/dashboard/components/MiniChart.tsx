import { Box } from '@mui/material';

export function MiniChart({ variant = 'bar' }: { variant?: 'bar' | 'pie' }) {
  if (variant === 'pie') {
    return <Box aria-label="Dummy employee status pie chart" sx={{ width: 180, height: 180, mx: 'auto', borderRadius: '50%', background: 'conic-gradient(#2563EB 0 44%, #16A34A 44% 66%, #F59E0B 66% 82%, #DC2626 82% 100%)' }} />;
  }
  return (
    <Box aria-label="Dummy attendance trend chart" sx={{ height: 180, display: 'flex', alignItems: 'end', gap: 1.2 }}>
      {[48, 64, 52, 78, 68, 88, 74, 92, 81, 96, 89, 98].map((height, index) => (
        <Box key={index} sx={{ flex: 1, height: `${height}%`, borderRadius: '8px 8px 3px 3px', bgcolor: index > 8 ? 'primary.main' : '#DBEAFE' }} />
      ))}
    </Box>
  );
}
