import { RoleName, UserStatus } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  companyId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: RoleName[];
}
