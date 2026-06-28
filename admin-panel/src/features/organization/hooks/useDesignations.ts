import { useQuery } from '@tanstack/react-query';
import { getDesignations } from '../services/designations-api';

export function useDesignations() {
  return useQuery({
    queryKey: ['designations', { selector: true }],
    queryFn: () => getDesignations({ page: 1, limit: 100 }),
  });
}
