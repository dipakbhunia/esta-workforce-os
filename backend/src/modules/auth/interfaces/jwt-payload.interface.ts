import { RoleName } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  companyId: string | null;
  roles: RoleName[];
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}
