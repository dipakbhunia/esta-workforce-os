import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import type { LucideIcon } from 'lucide-react';

export function StatCard({ label, value, helper, icon: Icon, tone = '#2563EB' }: { label: string; value: string; helper?: string; icon: LucideIcon; tone?: string }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2}>
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={700}>{label}</Typography>
            <Typography variant="h3" sx={{ mt: 1 }}>{value}</Typography>
            {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
          </Box>
          <Box sx={{ width: 42, height: 42, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: `${tone}18`, color: tone }}>
            <Icon size={21} strokeWidth={2.1} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
