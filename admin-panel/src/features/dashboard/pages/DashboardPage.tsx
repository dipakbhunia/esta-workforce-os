import { useAuth } from '@/features/auth';
import { hasAnyRole } from '@/features/auth/utils/permissions';
import { mutableRoles, PLATFORM_ROLES } from '@/features/auth/utils/route-policy';
import PlatformDashboardPage from './PlatformDashboardPage';
import TenantDashboardPage from './TenantDashboardPage';

export default function DashboardPage() {
  const { roles } = useAuth();

  return hasAnyRole(roles, mutableRoles(PLATFORM_ROLES))
    ? <PlatformDashboardPage />
    : <TenantDashboardPage />;
}
