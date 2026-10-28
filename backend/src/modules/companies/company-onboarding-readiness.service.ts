import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AccountActionTokenPurpose,
  CompanyStatus,
  Prisma,
  RoleName,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CommercialAccessService } from '../usage-seats/commercial-access.service';
import { CommercialSeatSource } from '../usage-seats/usage-seats.types';
import {
  CompanyOnboardingReadinessCategory as Category,
  CompanyOnboardingReadinessItemDto,
  CompanyOnboardingReadinessItemId as ItemId,
  CompanyOnboardingReadinessResponseDto,
  CompanyOnboardingReadinessStatus as Status,
} from './dto/company-onboarding-readiness.dto';

const CONTRACT_VERSION = '1';
const PROFILE_REQUIRED_FIELDS = ['billingName', 'addressLine1', 'city', 'postalCode', 'country'] as const;

type ReadinessItemInput = Omit<CompanyOnboardingReadinessItemDto, 'remediation'> & {
  remediation?: CompanyOnboardingReadinessItemDto['remediation'];
};

@Injectable()
export class CompanyOnboardingReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commercialAccess: CommercialAccessService,
  ) {}

  async evaluate(companyId: string): Promise<CompanyOnboardingReadinessResponseDto> {
    const decisionAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          status: true,
          primaryEmail: true,
          phone: true,
          country: true,
          address: true,
        },
      });
      if (!company) throw new NotFoundException('Company not found');

      const activeAdmin = await tx.user.findFirst({
        where: {
          companyId,
          status: UserStatus.ACTIVE,
          deletedAt: null,
          roles: { some: { role: { companyId, systemName: RoleName.COMPANY_ADMIN, deletedAt: null } } },
        },
        select: { id: true },
      });

      const pendingInvitation = activeAdmin ? null : await tx.accountActionToken.findFirst({
        where: {
          companyId,
          purpose: AccountActionTokenPurpose.INVITATION,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: decisionAt },
          user: {
            companyId,
            status: UserStatus.INACTIVE,
            deletedAt: null,
            roles: { some: { role: { companyId, systemName: RoleName.COMPANY_ADMIN, deletedAt: null } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      const [commercial, billingProfile] = await Promise.all([
        this.commercialAccess.resolve(companyId, tx, decisionAt),
        tx.companyBillingProfile.findUnique({
          where: { companyId },
          select: {
            billingName: true,
            addressLine1: true,
            city: true,
            postalCode: true,
            country: true,
            billingContact: {
              select: { companyId: true, status: true, deletedAt: true },
            },
          },
        }),
      ]);

      const items = [
        this.companyProfileItem(company),
        this.lifecycleItem(company.status),
        this.adminAccessItem(companyId, Boolean(activeAdmin), Boolean(pendingInvitation)),
        this.invitationItem(companyId, Boolean(activeAdmin), Boolean(pendingInvitation)),
        this.commercialItem(commercial.source, commercial.commercialStatus),
        this.billingProfileItem(billingProfile),
        this.billingContactItem(billingProfile, companyId),
        this.contactDetailsItem(company),
      ];

      return {
        companyId,
        contractVersion: CONTRACT_VERSION,
        evaluatedAt: decisionAt.toISOString(),
        overallStatus: CompanyOnboardingReadinessService.aggregate(items),
        blockingCount: items.filter((item) => item.blocking && item.status !== Status.READY).length,
        items,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  /** Mandatory evidence precedence is BLOCKED > UNAVAILABLE > INCOMPLETE > READY. */
  static aggregate(items: CompanyOnboardingReadinessItemDto[]): Status {
    const mandatory = items.filter((item) => item.blocking);
    if (mandatory.length === 0) return Status.UNAVAILABLE;
    if (mandatory.some((item) => item.status === Status.BLOCKED)) return Status.BLOCKED;
    if (mandatory.some((item) => item.status === Status.UNAVAILABLE || item.status === Status.NOT_APPLICABLE)) return Status.UNAVAILABLE;
    if (mandatory.some((item) => item.status === Status.INCOMPLETE)) return Status.INCOMPLETE;
    return mandatory.every((item) => item.status === Status.READY) ? Status.READY : Status.UNAVAILABLE;
  }

  private item(input: ReadinessItemInput): CompanyOnboardingReadinessItemDto {
    return { ...input, remediation: input.remediation ?? null };
  }

  private companyProfileItem(company: { name: string; slug: string; timezone: string }) {
    const complete = [company.name, company.slug, company.timezone].every((value) => value.trim().length > 0);
    return this.item({
      id: ItemId.COMPANY_PROFILE,
      category: Category.ADMINISTRATIVE,
      label: 'Company profile',
      status: complete ? Status.READY : Status.BLOCKED,
      blocking: true,
      reasonCode: complete ? 'COMPANY_PROFILE_AVAILABLE' : 'COMPANY_PROFILE_INVALID',
      explanation: complete ? 'The required company identity is available.' : 'Required company identity evidence is incomplete.',
    });
  }

  private lifecycleItem(status: CompanyStatus) {
    const operational = status === CompanyStatus.ACTIVE || status === CompanyStatus.TRIAL;
    return this.item({
      id: ItemId.OPERATIONAL_LIFECYCLE,
      category: Category.OPERATIONAL,
      label: 'Operational lifecycle',
      status: operational ? Status.READY : Status.INCOMPLETE,
      blocking: false,
      reasonCode: `COMPANY_STATUS_${status}`,
      explanation: operational
        ? 'The company lifecycle permits normal operation.'
        : `The company is ${status.toLowerCase()}; this warning does not change administrative onboarding readiness.`,
    });
  }

  private adminAccessItem(companyId: string, active: boolean, pending: boolean) {
    return this.item({
      id: ItemId.TENANT_ADMIN_ACCESS,
      category: Category.ADMINISTRATIVE,
      label: 'Company administrator access',
      status: active ? Status.READY : pending ? Status.INCOMPLETE : Status.BLOCKED,
      blocking: true,
      reasonCode: active ? 'ACTIVE_COMPANY_ADMIN_AVAILABLE' : pending ? 'ADMIN_INVITATION_PENDING' : 'COMPANY_ADMIN_AUTHORITY_MISSING',
      explanation: active
        ? 'At least one active, eligible Company Admin belongs to this company.'
        : pending
          ? 'An eligible Company Admin invitation is pending activation.'
          : 'No active Company Admin or valid pending Company Admin invitation is available.',
      remediation: { kind: 'NAVIGATE', label: 'Review company', route: `/organization/companies/${companyId}` },
    });
  }

  private invitationItem(companyId: string, active: boolean, pending: boolean) {
    return this.item({
      id: ItemId.ADMIN_INVITATION,
      category: Category.ADMINISTRATIVE,
      label: 'Administrator invitation',
      status: active ? Status.NOT_APPLICABLE : pending ? Status.INCOMPLETE : Status.BLOCKED,
      blocking: false,
      reasonCode: active ? 'ACTIVE_ADMIN_SUPERSEDES_INVITATION' : pending ? 'VALID_INVITATION_PENDING' : 'VALID_INVITATION_MISSING',
      explanation: active
        ? 'An active Company Admin already satisfies administrative handoff.'
        : pending
          ? 'A valid invitation exists and awaits activation.'
          : 'No valid pending Company Admin invitation was found.',
      remediation: active ? null : { kind: 'NAVIGATE', label: 'Review company', route: `/organization/companies/${companyId}` },
    });
  }

  private commercialItem(source: CommercialSeatSource, commercialStatus: string | null) {
    const ready = source !== CommercialSeatSource.NONE && commercialStatus !== SubscriptionStatus.SUSPENDED;
    return this.item({
      id: ItemId.COMMERCIAL_ACCESS,
      category: Category.COMMERCIAL,
      label: 'Commercial access',
      status: ready ? Status.READY : source === CommercialSeatSource.NONE ? Status.INCOMPLETE : Status.BLOCKED,
      blocking: false,
      reasonCode: source === CommercialSeatSource.NONE ? 'COMMERCIAL_AUTHORITY_MISSING' : `${source}_${commercialStatus}`,
      explanation: source === CommercialSeatSource.NONE
        ? 'No effective trial or period-valid subscription is available.'
        : commercialStatus === SubscriptionStatus.SUSPENDED
          ? 'The period-valid subscription is suspended.'
          : `Commercial access is supplied by an effective ${source.toLowerCase()}.`,
    });
  }

  private billingProfileItem(profile: Record<string, unknown> | null) {
    if (!profile) return this.item({
      id: ItemId.BILLING_PROFILE,
      category: Category.BILLING,
      label: 'Billing profile',
      status: Status.INCOMPLETE,
      blocking: false,
      reasonCode: 'BILLING_PROFILE_MISSING',
      explanation: 'A billing profile is required before invoice issuance, but not for administrative onboarding.',
    });
    const complete = PROFILE_REQUIRED_FIELDS.every((field) => typeof profile[field] === 'string' && String(profile[field]).trim().length > 0);
    return this.item({
      id: ItemId.BILLING_PROFILE,
      category: Category.BILLING,
      label: 'Billing profile',
      status: complete ? Status.READY : Status.INCOMPLETE,
      blocking: false,
      reasonCode: complete ? 'BILLING_PROFILE_COMPLETE' : 'BILLING_PROFILE_INCOMPLETE',
      explanation: complete ? 'Invoice-required billing profile fields are complete.' : 'Invoice-required billing profile fields are incomplete.',
    });
  }

  private billingContactItem(profile: { billingContact: { companyId: string | null; status: UserStatus; deletedAt: Date | null } | null } | null, companyId: string) {
    if (!profile) return this.item({
      id: ItemId.BILLING_CONTACT,
      category: Category.BILLING,
      label: 'Billing contact',
      status: Status.NOT_APPLICABLE,
      blocking: false,
      reasonCode: 'BILLING_PROFILE_MISSING',
      explanation: 'Billing contact configuration is not applicable until a billing profile exists.',
    });
    const eligible = profile.billingContact?.companyId === companyId
      && profile.billingContact.status === UserStatus.ACTIVE
      && profile.billingContact.deletedAt === null;
    return this.item({
      id: ItemId.BILLING_CONTACT,
      category: Category.BILLING,
      label: 'Billing contact',
      status: eligible ? Status.READY : Status.INCOMPLETE,
      blocking: false,
      reasonCode: eligible ? 'BILLING_CONTACT_ELIGIBLE' : 'BILLING_CONTACT_MISSING_OR_INELIGIBLE',
      explanation: eligible ? 'An active same-company billing contact is configured.' : 'No active same-company billing contact is configured.',
    });
  }

  private contactDetailsItem(company: { primaryEmail: string | null; phone: string | null; country: string | null; address: string | null }) {
    const complete = [company.primaryEmail, company.phone, company.country, company.address]
      .every((value) => typeof value === 'string' && value.trim().length > 0);
    return this.item({
      id: ItemId.COMPANY_CONTACT_DETAILS,
      category: Category.PROFILE,
      label: 'Company contact details',
      status: complete ? Status.READY : Status.INCOMPLETE,
      blocking: false,
      reasonCode: complete ? 'COMPANY_CONTACT_DETAILS_COMPLETE' : 'COMPANY_CONTACT_DETAILS_INCOMPLETE',
      explanation: complete ? 'Optional company contact details are complete.' : 'One or more optional company contact details are missing.',
    });
  }
}
