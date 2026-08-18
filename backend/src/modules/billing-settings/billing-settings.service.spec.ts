import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InvoiceNumberResetPolicy,
  PaymentProviderMode,
  PaymentProviderType,
  RenewalMode,
  RoleName,
  UserStatus,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BillingSettingsController } from './billing-settings.controller';
import { BillingSettingsService } from './billing-settings.service';
import {
  CreateBillingProviderConfigurationDto,
  UpdateBillingSettingsDto,
} from './dto/billing-settings.dto';

const actor = {
  id: '00000000-0000-4000-8000-000000000001',
  companyId: null,
  email: 'superadmin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  status: UserStatus.ACTIVE,
  roles: [RoleName.SUPER_ADMIN],
};

const now = new Date('2026-08-18T12:00:00.000Z');
const initialSettings = {
  id: '00000000-0000-4000-8000-000000000010',
  scope: 'PLATFORM',
  invoicePrefix: 'INV',
  invoiceNumberResetPolicy: InvoiceNumberResetPolicy.NEVER,
  defaultPaymentTermsDays: 15,
  defaultInvoiceNotes: null,
  sellerLegalName: null,
  sellerBillingEmail: null,
  sellerAddressLine1: null,
  sellerAddressLine2: null,
  sellerCity: null,
  sellerState: null,
  sellerStateCode: null,
  sellerPostalCode: null,
  sellerCountry: null,
  gstEnabled: false,
  gstin: null,
  gstLegalName: null,
  gstRegisteredState: null,
  gstRegisteredStateCode: null,
  renewalMode: RenewalMode.MANUAL,
  renewalLeadDays: 0,
  renewalGracePeriodDays: 0,
  renewalReminderDays: [] as number[],
  updatedById: null,
  createdAt: now,
  updatedAt: now,
};

const razorpay = {
  id: '00000000-0000-4000-8000-000000000020',
  provider: PaymentProviderType.RAZORPAY,
  mode: PaymentProviderMode.TEST,
  displayName: 'Razorpay primary',
  accountReference: 'account-public-reference',
  enabled: false,
  isDefault: false,
  updatedById: actor.id,
  createdAt: now,
  updatedAt: now,
};

function harness(
  settingsSeed = initialSettings,
  providerSeed: Array<typeof razorpay> = [],
) {
  let settings = { ...settingsSeed };
  const providers = providerSeed.map((value) => ({ ...value }));
  const audits: Array<{ action: string; metadata: unknown }> = [];
  const events: string[] = [];
  let transactions = 0;

  const providerStore = {
    findMany: async () => providers,
    findUnique: async ({ where }: { where: { id: string } }) =>
      providers.find((value) => value.id === where.id) ?? null,
    findFirst: async ({ where }: { where: { enabled?: boolean; isDefault?: boolean } }) =>
      providers.find(
        (value) =>
          (where.enabled === undefined || value.enabled === where.enabled) &&
          (where.isDefault === undefined || value.isDefault === where.isDefault),
      ) ?? null,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const created = { ...razorpay, ...data, id: razorpay.id } as typeof razorpay;
      providers.push(created);
      return created;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      events.push(`update:${where.id}`);
      const index = providers.findIndex((value) => value.id === where.id);
      providers[index] = { ...providers[index], ...data } as typeof razorpay;
      return providers[index];
    },
    updateMany: async ({ data }: { data: Record<string, unknown> }) => {
      events.push('clear-default');
      for (let index = 0; index < providers.length; index += 1) {
        if (providers[index].isDefault) {
          providers[index] = { ...providers[index], ...data } as typeof razorpay;
        }
      }
      return { count: providers.length };
    },
  };

  const tx = {
    billingSettings: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        settings = { ...settings, ...data } as typeof initialSettings;
        return settings;
      },
    },
    billingProviderConfiguration: providerStore,
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata: unknown } }) => {
        audits.push({ action: data.action, metadata: data.metadata });
        return { id: String(audits.length) };
      },
    },
    $queryRaw: async () => {
      events.push('lock-settings');
      return [{ id: settings.id }];
    },
  };

  const prisma = {
    billingSettings: {
      upsert: async () => settings,
    },
    billingProviderConfiguration: providerStore,
    $transaction: async (callback: (client: typeof tx) => unknown) => {
      transactions += 1;
      return callback(tx);
    },
  };

  return {
    service: new BillingSettingsService(prisma as never),
    settings: () => settings,
    providers: () => providers,
    audits,
    events,
    transactions: () => transactions,
  };
}

describe('BillingSettingsService', () => {
  it('declares every endpoint SUPER_ADMIN-only and denies a tenant role', () => {
    const roles = new Reflector().get<RoleName[]>('roles', BillingSettingsController);
    assert.deepEqual(roles, [RoleName.SUPER_ADMIN]);
    const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
    const context = {
      getHandler: () => BillingSettingsController.prototype.getSettings,
      getClass: () => BillingSettingsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { ...actor, roles: [RoleName.COMPANY_ADMIN] } }),
      }),
    };
    assert.throws(() => guard.canActivate(context as never), ForbiddenException);
    const allowed = {
      ...context,
      switchToHttp: () => ({ getRequest: () => ({ user: actor }) }),
    };
    assert.equal(guard.canActivate(allowed as never), true);
  });

  it('retrieves the durable platform singleton with safe defaults', async () => {
    const result = await harness().service.getSettings();
    assert.equal(result.scope, 'PLATFORM');
    assert.equal(result.invoicePrefix, 'INV');
    assert.equal(result.renewalMode, RenewalMode.MANUAL);
  });

  it('updates normalized settings, sorts reminders, and writes a focused audit', async () => {
    const value = harness();
    const result = await value.service.updateSettings(
      {
        invoicePrefix: 'ESTA',
        defaultPaymentTermsDays: 30,
        renewalReminderDays: [1, 30, 7],
      },
      actor,
    );
    assert.equal(result.invoicePrefix, 'ESTA');
    assert.deepEqual(result.renewalReminderDays, [30, 7, 1]);
    assert.equal(result.updatedById, actor.id);
    assert.deepEqual(value.audits.map((entry) => entry.action), [
      'BILLING_SETTINGS_UPDATED',
    ]);
    assert.deepEqual(value.audits[0].metadata, {
      changedFields: [
        'defaultPaymentTermsDays',
        'invoicePrefix',
        'renewalReminderDays',
      ],
    });
  });

  it('requires GSTIN and a legal name whenever GST is enabled', async () => {
    const value = harness();
    await assert.rejects(
      () => value.service.updateSettings({ gstEnabled: true }, actor),
      BadRequestException,
    );
    const updated = await value.service.updateSettings(
      {
        gstEnabled: true,
        gstin: '27ABCDE1234F1Z5',
        gstLegalName: 'Esta Legal',
      },
      actor,
    );
    assert.equal(updated.gstEnabled, true);
  });

  it('persists and reloads every settings category across consecutive updates', async () => {
    const value = harness();
    await value.service.updateSettings(
      {
        invoicePrefix: 'ESTA',
        invoiceNumberResetPolicy: InvoiceNumberResetPolicy.CALENDAR_YEAR,
        defaultPaymentTermsDays: 30,
        defaultInvoiceNotes: 'First invoice note',
        sellerLegalName: 'Esta Workforce Private Limited',
        sellerBillingEmail: 'billing@example.com',
        sellerAddressLine1: '100 Business Park',
        sellerAddressLine2: 'Floor 4',
        sellerCity: 'Mumbai',
        sellerState: 'Maharashtra',
        sellerStateCode: 'MH',
        sellerPostalCode: '400001',
        sellerCountry: 'India',
        gstEnabled: true,
        gstin: '27ABCDE1234F1Z5',
        gstLegalName: 'Esta Workforce Private Limited',
        gstRegisteredState: 'Maharashtra',
        gstRegisteredStateCode: 'MH',
        renewalMode: RenewalMode.AUTOMATIC,
        renewalLeadDays: 14,
        renewalGracePeriodDays: 5,
        renewalReminderDays: [1, 30, 7],
      },
      actor,
    );

    const firstReload = await value.service.getSettings();
    assert.equal(firstReload.invoicePrefix, 'ESTA');
    assert.equal(
      firstReload.invoiceNumberResetPolicy,
      InvoiceNumberResetPolicy.CALENDAR_YEAR,
    );
    assert.equal(firstReload.defaultPaymentTermsDays, 30);
    assert.equal(firstReload.defaultInvoiceNotes, 'First invoice note');
    assert.equal(firstReload.sellerLegalName, 'Esta Workforce Private Limited');
    assert.equal(firstReload.sellerBillingEmail, 'billing@example.com');
    assert.equal(firstReload.sellerAddressLine1, '100 Business Park');
    assert.equal(firstReload.sellerAddressLine2, 'Floor 4');
    assert.equal(firstReload.sellerCity, 'Mumbai');
    assert.equal(firstReload.sellerState, 'Maharashtra');
    assert.equal(firstReload.sellerStateCode, 'MH');
    assert.equal(firstReload.sellerPostalCode, '400001');
    assert.equal(firstReload.sellerCountry, 'India');
    assert.equal(firstReload.gstEnabled, true);
    assert.equal(firstReload.gstin, '27ABCDE1234F1Z5');
    assert.equal(firstReload.gstLegalName, 'Esta Workforce Private Limited');
    assert.equal(firstReload.gstRegisteredState, 'Maharashtra');
    assert.equal(firstReload.gstRegisteredStateCode, 'MH');
    assert.equal(firstReload.renewalMode, RenewalMode.AUTOMATIC);
    assert.equal(firstReload.renewalLeadDays, 14);
    assert.equal(firstReload.renewalGracePeriodDays, 5);
    assert.deepEqual(firstReload.renewalReminderDays, [30, 7, 1]);

    await value.service.updateSettings(
      {
        invoicePrefix: 'ESTA_UPDATED',
        defaultInvoiceNotes: 'Updated invoice note',
        sellerLegalName: 'Esta Workforce OS Private Limited',
        renewalGracePeriodDays: 10,
      },
      actor,
    );

    const secondReload = await value.service.getSettings();
    assert.equal(secondReload.invoicePrefix, 'ESTA_UPDATED');
    assert.equal(secondReload.defaultInvoiceNotes, 'Updated invoice note');
    assert.equal(secondReload.sellerLegalName, 'Esta Workforce OS Private Limited');
    assert.equal(secondReload.sellerBillingEmail, 'billing@example.com');
    assert.equal(secondReload.gstin, '27ABCDE1234F1Z5');
    assert.equal(secondReload.renewalGracePeriodDays, 10);
    assert.equal(value.audits.length, 2);
  });

  it('validates invoice, GST, reminder, and provider inputs conservatively', async () => {
    const invalidSettings = plainToInstance(UpdateBillingSettingsDto, {
      invoicePrefix: 'bad prefix',
      defaultPaymentTermsDays: 999,
      gstin: 'INVALID',
      renewalReminderDays: [7, 7],
    });
    assert.ok((await validate(invalidSettings)).length >= 4);
    const nullRequiredSetting = plainToInstance(UpdateBillingSettingsDto, {
      invoicePrefix: null,
    });
    assert.ok((await validate(nullRequiredSetting)).length >= 1);
    const invalidProvider = plainToInstance(CreateBillingProviderConfigurationDto, {
      provider: 'UNKNOWN',
      mode: 'PRODUCTION',
    });
    assert.ok((await validate(invalidProvider)).length >= 2);

    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await assert.rejects(
      () =>
        pipe.transform(
          {
            provider: PaymentProviderType.RAZORPAY,
            mode: PaymentProviderMode.TEST,
            secretKey: 'must-not-be-accepted',
          },
          { type: 'body', metatype: CreateBillingProviderConfigurationDto },
        ),
      BadRequestException,
    );
  });

  it('creates only safe, disabled provider metadata and audits creation', async () => {
    const value = harness();
    const result = await value.service.createProvider(
      {
        provider: PaymentProviderType.RAZORPAY,
        mode: PaymentProviderMode.TEST,
        displayName: 'Razorpay primary',
        accountReference: 'public-account-reference',
      },
      actor,
    );
    assert.equal(result.enabled, false);
    assert.equal(result.isDefault, false);
    assert.equal('secretKey' in result, false);
    assert.equal('webhookSecret' in result, false);
    assert.deepEqual(value.audits.map((entry) => entry.action), [
      'BILLING_PROVIDER_CONFIGURATION_CREATED',
    ]);
  });

  it('enables and disables providers, clearing default state on disable', async () => {
    const enable = harness(initialSettings, [razorpay]);
    assert.equal((await enable.service.enableProvider(razorpay.id, actor)).enabled, true);
    assert.deepEqual(enable.audits.map((entry) => entry.action), [
      'BILLING_PROVIDER_ENABLED',
    ]);

    const currentDefault = { ...razorpay, enabled: true, isDefault: true };
    const disable = harness(initialSettings, [currentDefault]);
    const result = await disable.service.disableProvider(razorpay.id, actor);
    assert.equal(result.enabled, false);
    assert.equal(result.isDefault, false);
    assert.deepEqual(disable.audits.map((entry) => entry.action), [
      'BILLING_PROVIDER_DISABLED',
      'BILLING_DEFAULT_PROVIDER_CHANGED',
    ]);
  });

  it('rejects selecting a disabled provider as default', async () => {
    const value = harness(initialSettings, [razorpay]);
    await assert.rejects(
      () => value.service.setDefaultProvider(razorpay.id, actor),
      /disabled payment provider cannot be the default/i,
    );
    assert.equal(value.providers()[0].isDefault, false);
  });

  it('changes the default inside a locked transaction before clearing the old default', async () => {
    const previous = {
      ...razorpay,
      id: '00000000-0000-4000-8000-000000000021',
      provider: 'FUTURE_PROVIDER' as PaymentProviderType,
      enabled: true,
      isDefault: true,
    };
    const selected = { ...razorpay, enabled: true };
    const value = harness(initialSettings, [previous, selected]);
    const result = await value.service.setDefaultProvider(selected.id, actor);
    assert.equal(result.isDefault, true);
    assert.equal(value.providers().find((item) => item.id === previous.id)?.isDefault, false);
    assert.deepEqual(value.events.slice(0, 3), [
      'lock-settings',
      'clear-default',
      `update:${selected.id}`,
    ]);
    assert.equal(value.transactions(), 1);
    assert.deepEqual(value.audits.map((entry) => entry.action), [
      'BILLING_DEFAULT_PROVIDER_CHANGED',
    ]);
  });
});
