import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { EmptyState } from '@/components/empty-state';
import { useAuth } from '../hooks/useAuth';
import type { Permission, RoleName } from '../types/auth.types';
import { hasAnyRole, hasPermission } from '../utils/permissions';

interface RoleGuardProps {
  children: ReactNode;
  roles?: RoleName[];
  permission?: Permission;
  fallback?: 'empty' | 'redirect' | null;
}

export function RoleGuard({ children, roles, permission, fallback = 'empty' }: RoleGuardProps) {
  const { roles: userRoles, permissions } = useAuth();
  const allowed = hasAnyRole(userRoles, roles) && hasPermission(permissions, permission);

  if (allowed) return <>{children}</>;
  if (fallback === 'redirect') return <Navigate to="/" replace />;
  if (fallback === 'empty') {
    return <EmptyState title="Access restricted" description="Your role does not include access to this admin area." />;
  }
  return null;
}
