import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SmtpConfigurationLifecycle, SmtpSecurityMode } from '@prisma/client';
import { acquireSharedSmtpAuthorityLock } from '../platform-communication/smtp-authority-lock';
import { SmtpCredentialEncryptionService } from '../platform-communication/smtp-credential-encryption.service';
import { SmtpRuntimeResolution } from './smtp-runtime.types';
@Injectable()
export class SmtpRuntimeResolverService {
  constructor(private readonly config: ConfigService, private readonly encryption: SmtpCredentialEncryptionService) {}
  async resolveForClaim(tx: Prisma.TransactionClient): Promise<SmtpRuntimeResolution> {
    await acquireSharedSmtpAuthorityLock(tx);
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "PlatformEmailSettings" WHERE "scope" = 'PLATFORM' FOR SHARE`);
    const settings = await tx.platformEmailSettings.findUnique({ where: { scope: 'PLATFORM' } });
    if (!settings?.databaseAuthorityEstablishedAt) return this.environment();
    if (!settings.enabled) return { state: 'PAUSED', authority: 'DATABASE', code: 'DATABASE_SMTP_DISABLED' };
    if (!settings.activeConfigurationVersionId) return { state: 'UNAVAILABLE', authority: 'DATABASE', code: 'DATABASE_SMTP_INVALID' };
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "SmtpConfigurationVersion" WHERE "id" = ${settings.activeConfigurationVersionId}::uuid FOR SHARE`);
    const row = await tx.smtpConfigurationVersion.findUnique({ where: { id: settings.activeConfigurationVersionId } });
    if (!row || row.lifecycle !== SmtpConfigurationLifecycle.TESTED || row.revokedAt || !row.firstActivatedAt) return { state: 'UNAVAILABLE', authority: 'DATABASE', code: 'DATABASE_SMTP_INVALID' };
    try {
      const password = this.encryption.decrypt(row.encryptedPassword, row.id, row.encryptionKeyId);
      if (!password) throw new Error('unavailable');
      return { state: 'USABLE', snapshot: Object.freeze({ authority: 'DATABASE', configurationVersionId: row.id, host: row.host, port: row.port, securityMode: row.securityMode, username: row.username, password, senderEmail: row.senderEmail, senderDisplayName: row.senderDisplayName }) };
    } catch { return { state: 'UNAVAILABLE', authority: 'DATABASE', code: 'DATABASE_SMTP_CREDENTIAL_UNAVAILABLE' }; }
  }
  private environment(): SmtpRuntimeResolution {
    const host = this.config.get<string>('SMTP_HOST'); const port = this.config.get<number>('SMTP_PORT'); const senderEmail = this.config.get<string>('SMTP_FROM_EMAIL');
    if (this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED') !== true || !host || !port || !senderEmail) return { state: 'PAUSED', authority: 'ENVIRONMENT', code: 'ENVIRONMENT_SMTP_DISABLED' };
    return { state: 'USABLE', snapshot: Object.freeze({ authority: 'ENVIRONMENT', configurationVersionId: null, host, port, securityMode: this.config.get<boolean>('SMTP_SECURE') === true ? SmtpSecurityMode.IMPLICIT_TLS : SmtpSecurityMode.STARTTLS, username: this.config.get<string>('SMTP_USER') ?? '', password: this.config.get<string>('SMTP_PASSWORD') ?? '', senderEmail, senderDisplayName: this.config.get<string>('SMTP_FROM_NAME') || 'Esta Workforce OS' }) };
  }
}
