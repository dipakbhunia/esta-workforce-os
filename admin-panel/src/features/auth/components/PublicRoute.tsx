import { Navigate, Outlet } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { useAuth } from '../hooks/useAuth';

export function PublicRoute({ allowAuthenticated = false }: { allowAuthenticated?: boolean }) {
  const { authenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSkeleton rows={8} />;
  }

  if (authenticated && !allowAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
