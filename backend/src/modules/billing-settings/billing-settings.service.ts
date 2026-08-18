import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingProviderConfiguration,
  BillingSettings,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CreateBillingProviderConfigurationDto,
  UpdateBillingProviderConfigurationDto,
  UpdateBillingSettingsDto,
} from './dto/billing-settings.dto';

const PLATFORM_SCOPE = 'PLATFORM';

@Injectable()
export class BillingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  getSettings(): Promise<BillingSettings> {
    return this.prisma.billingSettings.upsert({
      where: { scope: PLATFORM_SCOPE },
      update: {},
      create: { scope: PLATFORM_SCOPE },
    });
  }

  async updateSettings(
    dto: UpdateBillingSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<BillingSettings> {
    const changedFields = Object.keys(dto).sort();
    if (!changedFields.length) {
      throw new BadRequestException('No Billing Settings changes were provided');
    }

    const current = await this.getSettings();
    this.validateGstConfiguration(current, dto);
    const data: Prisma.BillingSettingsUncheckedUpdateInput = {
      ...dto,
      ...(dto.renewalReminderDays
        ? { renewalReminderDays: [...dto.renewalReminderDays].sort((a, b) => b - a) }
        : {}),
      updatedById: actor.id,
    };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingSettings.update({
        where: { scope: PLATFORM_SCOPE },
        data,
      });
      await this.audit(tx, actor.id, updated.id, 'BILLING_SETTINGS_UPDATED', {
        changedFields,
      });
      return updated;
    });
  }

  listProviders(): Promise<BillingProviderConfiguration[]> {
    return this.prisma.billingProviderConfiguration.findMany({
      orderBy: [{ isDefault: 'desc' }, { provider: 'asc' }],
    });
  }

  async createProvider(
    dto: CreateBillingProviderConfigurationDto,
    actor: AuthenticatedUser,
  ): Promise<BillingProviderConfiguration> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.billingProviderConfiguration.create({
          data: { ...dto, updatedById: actor.id },
        });
        await this.audit(
          tx,
          actor.id,
          created.id,
          'BILLING_PROVIDER_CONFIGURATION_CREATED',
          { provider: created.provider, mode: created.mode },
          'BillingProviderConfiguration',
        );
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This payment provider is already configured');
      }
      throw error;
    }
  }

  async updateProvider(
    id: string,
    dto: UpdateBillingProviderConfigurationDto,
    actor: AuthenticatedUser,
  ): Promise<BillingProviderConfiguration> {
    const changedFields = Object.keys(dto).sort();
    if (!changedFields.length) {
      throw new BadRequestException('No provider configuration changes were provided');
    }
    await this.getProvider(id);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingProviderConfiguration.update({
        where: { id },
        data: { ...dto, updatedById: actor.id },
      });
      await this.audit(
        tx,
        actor.id,
        id,
        'BILLING_PROVIDER_CONFIGURATION_UPDATED',
        { provider: updated.provider, changedFields },
        'BillingProviderConfiguration',
      );
      return updated;
    });
  }

  async enableProvider(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<BillingProviderConfiguration> {
    const current = await this.getProvider(id);
    if (current.enabled) throw new BadRequestException('Payment provider is already enabled');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.billingProviderConfiguration.update({
        where: { id },
        data: { enabled: true, updatedById: actor.id },
      });
      await this.audit(
        tx,
        actor.id,
        id,
        'BILLING_PROVIDER_ENABLED',
        { provider: updated.provider },
        'BillingProviderConfiguration',
      );
      return updated;
    });
  }

  async disableProvider(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<BillingProviderConfiguration> {
    await this.ensureSettings();
    return this.prisma.$transaction(async (tx) => {
      await this.lockProviderDefaults(tx);
      const current = await this.getProvider(id, tx);
      if (!current.enabled) {
        throw new BadRequestException('Payment provider is already disabled');
      }
      const updated = await tx.billingProviderConfiguration.update({
        where: { id },
        data: { enabled: false, isDefault: false, updatedById: actor.id },
      });
      await this.audit(
        tx,
        actor.id,
        id,
        'BILLING_PROVIDER_DISABLED',
        { provider: updated.provider, defaultCleared: current.isDefault },
        'BillingProviderConfiguration',
      );
      if (current.isDefault) {
        await this.audit(
          tx,
          actor.id,
          id,
          'BILLING_DEFAULT_PROVIDER_CHANGED',
          { fromProvider: current.provider, toProvider: null },
          'BillingProviderConfiguration',
        );
      }
      return updated;
    });
  }

  async setDefaultProvider(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<BillingProviderConfiguration> {
    await this.ensureSettings();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockProviderDefaults(tx);
        const selected = await this.getProvider(id, tx);
        if (!selected.enabled) {
          throw new BadRequestException('A disabled payment provider cannot be the default');
        }
        if (selected.isDefault) {
          throw new BadRequestException('Payment provider is already the default');
        }
        const previous = await tx.billingProviderConfiguration.findFirst({
          where: { enabled: true, isDefault: true },
        });
        await tx.billingProviderConfiguration.updateMany({
          where: { isDefault: true },
          data: { isDefault: false, updatedById: actor.id },
        });
        const updated = await tx.billingProviderConfiguration.update({
          where: { id },
          data: { isDefault: true, updatedById: actor.id },
        });
        await this.audit(
          tx,
          actor.id,
          id,
          'BILLING_DEFAULT_PROVIDER_CHANGED',
          {
            fromProvider: previous?.provider ?? null,
            toProvider: updated.provider,
          },
          'BillingProviderConfiguration',
        );
        return updated;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Another payment provider is already the default');
      }
      throw error;
    }
  }

  private ensureSettings(): Promise<BillingSettings> {
    return this.getSettings();
  }

  private async lockProviderDefaults(tx: Prisma.TransactionClient): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "BillingSettings" WHERE "scope" = ${PLATFORM_SCOPE} FOR UPDATE`,
    );
    if (!rows.length) throw new ConflictException('Platform Billing Settings are unavailable');
  }

  private async getProvider(
    id: string,
    client: Pick<PrismaService, 'billingProviderConfiguration'> | Prisma.TransactionClient = this.prisma,
  ): Promise<BillingProviderConfiguration> {
    const provider = await client.billingProviderConfiguration.findUnique({ where: { id } });
    if (!provider) throw new NotFoundException('Payment provider configuration not found');
    return provider;
  }

  private validateGstConfiguration(
    current: BillingSettings,
    dto: UpdateBillingSettingsDto,
  ): void {
    const enabled = dto.gstEnabled ?? current.gstEnabled;
    if (!enabled) return;
    const gstin = dto.gstin !== undefined ? dto.gstin : current.gstin;
    const gstLegalName =
      dto.gstLegalName !== undefined ? dto.gstLegalName : current.gstLegalName;
    const sellerLegalName =
      dto.sellerLegalName !== undefined
        ? dto.sellerLegalName
        : current.sellerLegalName;
    if (!gstin) throw new BadRequestException('GSTIN is required when GST is enabled');
    if (!gstLegalName && !sellerLegalName) {
      throw new BadRequestException(
        'A GST legal name or seller legal name is required when GST is enabled',
      );
    }
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    entityId: string,
    action: string,
    metadata: Prisma.InputJsonObject,
    entityType = 'BillingSettings',
  ) {
    return tx.auditLog.create({
      data: { actorUserId, action, entityType, entityId, metadata },
    });
  }
}
