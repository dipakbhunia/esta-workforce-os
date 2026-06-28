import { useQuery } from '@tanstack/react-query';
import { getShifts } from '../services/shifts-api';

export function useShifts() {
  return useQuery({
    queryKey: ['shifts', { selector: true }],
    queryFn: () => getShifts({ page: 1, limit: 100 }),
  });
}
