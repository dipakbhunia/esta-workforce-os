import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingSkeleton } from '@/components/loading-skeleton';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { authenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingSkeleton rows={8} />;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
