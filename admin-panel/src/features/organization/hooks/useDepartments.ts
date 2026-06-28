import { useQuery } from '@tanstack/react-query';
import { getDepartments } from '../services/departments-api';

export function useDepartments() {
  return useQuery({
    queryKey: ['departments', { selector: true }],
    queryFn: () => getDepartments({ page: 1, limit: 100 }),
  });
}
