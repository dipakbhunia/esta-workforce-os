import { Prisma, SmtpConfigurationLifecycle } from '@prisma/client';

export const smtpPlatformInvitationConfigurationSelect = {
  id: true,
  version: true,
  revision: true,
  lifecycle: true,
  host: true,
  port: true,
  securityMode: true,
  username: true,
  senderEmail: true,
  senderDisplayName: true,
  structurallyValidatedAt: true,
  connectionTestedAt: true,
  connectionTestSucceeded: true,
  connectionTestResultCode: true,
  firstActivatedAt: true,
  revokedAt: true,
} satisfies Prisma.SmtpConfigurationVersionSelect;

export type EligibleSmtpPlatformInvitationConfiguration = Prisma.SmtpConfigurationVersionGetPayload<{
  select: typeof smtpPlatformInvitationConfigurationSelect;
}>;

export type EligibleSmtpPlatformInvitationSelection =
  | { kind: 'UNAVAILABLE'; configuration: null }
  | { kind: 'AMBIGUOUS'; configuration: null }
  | { kind: 'UNIQUE'; configuration: EligibleSmtpPlatformInvitationConfiguration };

export async function selectEligibleSmtpPlatformInvitationConfiguration(
  tx: Prisma.TransactionClient,
): Promise<EligibleSmtpPlatformInvitationSelection> {
  const configurations = await tx.smtpConfigurationVersion.findMany({
    where: {
      lifecycle: SmtpConfigurationLifecycle.TESTED,
      revokedAt: null,
      firstActivatedAt: null,
      structurallyValidatedAt: { not: null },
      connectionTestedAt: { not: null },
      connectionTestSucceeded: true,
      connectionTestResultCode: 'SUCCESS',
    },
    select: smtpPlatformInvitationConfigurationSelect,
    orderBy: [{ version: 'desc' }, { id: 'desc' }],
    take: 2,
  });
  if (!configurations.length) return { kind: 'UNAVAILABLE', configuration: null };
  if (configurations.length > 1) return { kind: 'AMBIGUOUS', configuration: null };
  return { kind: 'UNIQUE', configuration: configurations[0] };
}
