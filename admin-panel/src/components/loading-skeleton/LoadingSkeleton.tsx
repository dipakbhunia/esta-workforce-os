import { Card, CardContent, Skeleton, Stack } from '@mui/material';

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardContent>
        <Stack gap={1.25}>
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} height={42} variant="rounded" />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
