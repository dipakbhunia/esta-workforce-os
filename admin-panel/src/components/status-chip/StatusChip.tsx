import { Chip } from '@mui/material';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const toneMap: Record<StatusTone, { bg: string; color: string }> = {
  success: { bg: '#DCFCE7', color: '#166534' },
  warning: { bg: '#FEF3C7', color: '#92400E' },
  danger: { bg: '#FEE2E2', color: '#991B1B' },
  neutral: { bg: '#F3F4F6', color: '#374151' },
  info: { bg: '#DBEAFE', color: '#1E40AF' },
};

export function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const colors = toneMap[tone];
  return (
    <Chip
      size="small"
      label={label}
      sx={{ bgcolor: colors.bg, color: colors.color, border: '0', height: 24 }}
    />
  );
}
