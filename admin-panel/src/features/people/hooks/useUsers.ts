import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../services/users-api';

export function useUsers() {
  return useQuery({
    queryKey: ['users', { selector: true }],
    queryFn: () => getUsers({ page: 1, limit: 100, status: 'ACTIVE' }),
  });
}
