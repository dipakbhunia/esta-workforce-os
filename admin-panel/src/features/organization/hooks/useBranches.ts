import { useQuery } from '@tanstack/react-query';
import { getBranches } from '../services/branches-api';

export function useBranches() {
  return useQuery({
    queryKey: ['branches', { selector: true }],
    queryFn: () => getBranches({ page: 1, limit: 100 }),
  });
}
