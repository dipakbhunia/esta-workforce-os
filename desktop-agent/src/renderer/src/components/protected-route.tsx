import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered">Loading desktop agent...</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
