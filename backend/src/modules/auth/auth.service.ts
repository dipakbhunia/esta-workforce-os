import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { CompanyStatus, Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'node:crypto';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../../database/prisma.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutResponseDto } from './dto/logout-response.dto';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const authUserInclude = {
  roles: {
    include: {
      role: true,
    },
  },
  company: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.UserInclude;

type UserWithAuthRelations = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(
    dto: LoginDto,
    context: RequestContext,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      include: authUserInclude,
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.assertUserCanAuthenticate(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const response = await this.issueTokenPair(user);
    await this.writeAuditLog(user, 'AUTH_LOGIN', context);
    return response;
  }

  async refresh(
    refreshToken: string,
    context: RequestContext,
  ): Promise<AuthResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);
    const tokenHash = this.hashToken(refreshToken);

    const revoked = await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        userId: payload.sub,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    if (revoked.count !== 1) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    const user = await this.findUserForAuthentication(payload.sub);
    this.assertUserCanAuthenticate(user);

    const response = await this.issueTokenPair(user);
    await this.writeAuditLog(user, 'AUTH_REFRESH', context);
    return response;
  }

  async logout(
    refreshToken: string,
    context: RequestContext,
  ): Promise<LogoutResponseDto> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const revoked = await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        userId: payload.sub,
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (revoked.count !== 1) {
      throw new UnauthorizedException('Refresh token is invalid or revoked');
    }

    const user = await this.findUserForAuthentication(payload.sub);
    await this.writeAuditLog(user, 'AUTH_LOGOUT', context);
    return { success: true };
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.findUserForAuthentication(userId);
    this.assertUserCanAuthenticate(user);
    return this.toAuthenticatedUser(user);
  }

  private async issueTokenPair(
    user: UserWithAuthRelations,
  ): Promise<AuthResponseDto> {
    const authenticatedUser = this.toAuthenticatedUser(user);
    const refreshTokenId = randomUUID();
    const basePayload = {
      sub: user.id,
      companyId: user.companyId,
      roles: authenticatedUser.roles,
    };

    const accessToken = await this.jwtService.signAsync(
      { ...basePayload, type: 'access' } satisfies JwtPayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ) as SignOptions['expiresIn'],
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        ...basePayload,
        type: 'refresh',
        jti: refreshTokenId,
      } satisfies JwtPayload,
      {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.getOrThrow<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ) as SignOptions['expiresIn'],
      },
    );
    const decoded = this.jwtService.decode<JwtPayload>(refreshToken);

    if (!decoded.exp) {
      throw new Error('Refresh token expiration was not generated');
    }

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      user: authenticatedUser,
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );

      if (payload.type !== 'refresh' || !payload.jti) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  private findUserForAuthentication(
    userId: string,
  ): Promise<UserWithAuthRelations> {
    return this.prisma.user
      .findUniqueOrThrow({
        where: { id: userId },
        include: authUserInclude,
      })
      .catch(() => {
        throw new UnauthorizedException('User account is unavailable');
      });
  }

  private assertUserCanAuthenticate(user: UserWithAuthRelations): void {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    if (
      user.company &&
      user.company.status !== CompanyStatus.ACTIVE &&
      user.company.status !== CompanyStatus.TRIAL
    ) {
      throw new UnauthorizedException('Company account is not active');
    }
  }

  private toAuthenticatedUser(
    user: UserWithAuthRelations,
  ): AuthenticatedUser {
    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles: user.roles.map(({ role }) => role.name),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async writeAuditLog(
    user: UserWithAuthRelations,
    action: string,
    context: RequestContext,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId: user.companyId,
        actorUserId: user.id,
        action,
        entityType: 'User',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  }
}
