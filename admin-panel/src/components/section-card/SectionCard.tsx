import { Card, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function SectionCard({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2} sx={{ mb: 2 }}>
          <div>
            <Typography variant="h4">{title}</Typography>
            {description && <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>{description}</Typography>}
          </div>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}
