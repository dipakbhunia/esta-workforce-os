import { useQuery } from '@tanstack/react-query';
import { getLeaveTypes } from '../services/leave-api';

export function useLeaveTypes(search = '') {
  return useQuery({
    queryKey: ['leave-types', 'selector', search],
    queryFn: () => getLeaveTypes({ page: 1, limit: 100, search: search || undefined }),
  });
}
