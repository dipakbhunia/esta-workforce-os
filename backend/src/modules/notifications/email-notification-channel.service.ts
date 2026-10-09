import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { AccountActionTokenPurpose, MonitoringAlertSeverity, Notification, NotificationType, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { buildAccountActionToken } from '../../common/utils/account-action-token.util';
import { assertSafeEmailDetailsPath, escapeEmailHtml } from './email-content-safety';
import { emailRendererRegistry } from './email-renderer.registry';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';

export interface EmailDeliveryResult {
  skipped: boolean;
  providerMessageId?: string | null;
  safeReason?: string;
}

export interface SafeEmailError { code: string; message: string }

export interface PersistedEmailContent {
  type: Notification['type'];
  title: string;
  message: string;
  severity: MonitoringAlertSeverity | null;
  detailsPath: string | null;
}

const safeErrors: Record<string, string> = {
  SMTP_AUTH_FAILED: 'Email provider authentication failed.',
  SMTP_CONNECTION_FAILED: 'Email provider connection failed.',
  SMTP_DNS_FAILED: 'Email provider address could not be resolved.',
  SMTP_TLS_FAILED: 'Email provider secure connection failed.',
  SMTP_TIMEOUT: 'Email provider request timed out.',
  SMTP_RATE_LIMITED: 'Email provider temporarily rate limited delivery.',
  SMTP_REJECTED: 'Email provider rejected the delivery.',
  SMTP_DISABLED: 'Email delivery is disabled or not configured.',
  SMTP_UNKNOWN: 'Email delivery failed.',
};

export function safeEmailErrorEvidence(code: string | null | undefined): SafeEmailError {
  const safeCode = code && code in safeErrors ? code : 'SMTP_UNKNOWN';
  return { code: safeCode.slice(0, 64), message: (safeErrors[safeCode] ?? safeErrors.SMTP_UNKNOWN).slice(0, 160) };
}

export function renderEmailText(notification: PersistedEmailContent): string {
  const envelope = emailRendererRegistry.envelopeFor(notification.type);
  const detailsPath = notification.detailsPath ? assertSafeEmailDetailsPath(notification.detailsPath) : null;
  return [
    notification.title,
    '',
    notification.message,
    '',
    notification.severity ? `Severity: ${notification.severity}` : null,
    detailsPath ? `Open: ${detailsPath}` : null,
    '',
    envelope.textSafetyNotice,
  ].filter(Boolean).join('\n');
}

export function renderEmailHtml(notification: PersistedEmailContent): string {
  const envelope = emailRendererRegistry.envelopeFor(notification.type);
  const detailsPath = notification.detailsPath ? assertSafeEmailDetailsPath(notification.detailsPath) : null;
  const severityColor = notification.severity === MonitoringAlertSeverity.CRITICAL
    ? '#DC2626'
    : notification.severity === MonitoringAlertSeverity.WARNING
      ? '#F59E0B'
      : '#2563EB';
  return `
      <div style="font-family:Inter,Arial,sans-serif;max-width:640px;color:#111827">
        <div style="border:1px solid #E5E7EB;border-radius:14px;padding:20px;background:#FFFFFF">
          <p style="margin:0 0 8px;color:${severityColor};font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px">${escapeEmailHtml(notification.severity ?? 'ALERT')}</p>
          <h1 style="font-size:20px;margin:0 0 12px">${escapeEmailHtml(notification.title)}</h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#374151">${escapeEmailHtml(notification.message)}</p>
          ${detailsPath ? `<p style="margin:0 0 16px"><a href="${escapeEmailHtml(detailsPath)}" style="color:#2563EB">${escapeEmailHtml(envelope.detailsLabel)}</a></p>` : ''}
          <p style="font-size:12px;color:#6B7280;margin:0">${escapeEmailHtml(envelope.htmlSafetyNotice)}</p>
        </div>
      </div>`;
}

@Injectable()
export class EmailNotificationChannel {
  private readonly logger = new Logger(EmailNotificationChannel.name);

  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly commercialRecipients: CommercialBillingRecipientResolver = undefined as never) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED') === true && this.hasConfig();
  }

  capability() {
    return {
      enabled: this.config.get<boolean>('EMAIL_NOTIFICATIONS_ENABLED') === true,
      configured: this.hasConfig(),
      fromEmailConfigured: Boolean(this.config.get<string>('SMTP_FROM_EMAIL')),
    };
  }

  async send(notification: Notification, recipient: string): Promise<EmailDeliveryResult> {
    if (!this.isEnabled()) {
      return { skipped: true, safeReason: 'Email notifications are disabled or SMTP is incomplete' };
    }
    await this.assertCommercialRecipientAuthority(notification, recipient);
    const outbound = await this.withIdentityActionLink(notification, recipient);
    const transporter = nodemailer.createTransport(this.transportOptions());
    const response = await transporter.sendMail({
      from: this.fromAddress(),
      to: recipient,
      subject: outbound.title,
      text: renderEmailText(outbound),
      html: renderEmailHtml(outbound),
    });
    return { skipped: false, providerMessageId: response.messageId ?? null };
  }

  private async assertCommercialRecipientAuthority(notification: Notification, recipient: string): Promise<void> {
    if (notification.type !== NotificationType.PAYMENT_CAPTURED && notification.type !== NotificationType.PAYMENT_FAILED && notification.type !== NotificationType.INVOICE_ISSUED) return;
    if (!notification.companyId) throw new Error('Commercial notification company authority is missing');
    const current = await this.commercialRecipients.resolve(notification.companyId);
    if (!current || current.userId !== notification.userId || current.companyId !== notification.companyId || current.email !== recipient.trim().toLowerCase()) throw new Error('Commercial billing recipient is no longer eligible for delivery');
  }

  private async withIdentityActionLink(notification: Notification, recipient: string): Promise<Notification> {
    if (!notification.accountActionTokenId) return notification;
    const expectedPurpose = notification.type === NotificationType.ACCOUNT_INVITATION
      ? AccountActionTokenPurpose.INVITATION
      : notification.type === NotificationType.PASSWORD_RESET_REQUESTED
        ? AccountActionTokenPurpose.PASSWORD_RESET
        : null;
    if (!expectedPurpose) throw new Error('Identity notification authority mismatch');
    const expectedStatus = expectedPurpose === AccountActionTokenPurpose.INVITATION ? UserStatus.INACTIVE : UserStatus.ACTIVE;
    const token = await this.prisma.accountActionToken.findFirst({
      where: { id: notification.accountActionTokenId, purpose: expectedPurpose, consumedAt: null, invalidatedAt: null, expiresAt: { gt: new Date() } },
      include: { user: { select: { id: true, companyId: true, email: true, status: true, deletedAt: true } } },
    });
    const persisted = await this.prisma.notification.findUnique({
      where: { id: notification.id },
      include: { deliveries: { where: { channel: 'EMAIL', recipient }, select: { id: true } } },
    });
    if (!token || !persisted || token.purpose !== expectedPurpose || token.userId !== token.user.id || token.consumedAt || token.invalidatedAt || token.expiresAt <= new Date() || token.user.deletedAt || token.user.status !== expectedStatus || token.userId !== persisted.userId || token.companyId !== token.user.companyId || token.companyId !== persisted.companyId || persisted.userId !== notification.userId || persisted.companyId !== notification.companyId || persisted.type !== notification.type || persisted.accountActionTokenId !== token.id || token.user.email.trim().toLowerCase() !== recipient.trim().toLowerCase() || persisted.deliveries.length !== 1) {
      throw new Error('Account action token is no longer eligible for delivery');
    }
    const secret = this.config.get<string>('IDENTITY_ACTION_TOKEN_SECRET') || this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
    const value = buildAccountActionToken(token, secret);
    const origin = this.config.getOrThrow<string>('PUBLIC_APP_ORIGIN').replace(/\/$/, '');
    const path = token.purpose === AccountActionTokenPurpose.INVITATION ? '/activate-account' : '/reset-password';
    const link = `${origin}${path}?token=${encodeURIComponent(value)}`;
    return { ...notification, message: `${notification.message}\n\nSecure link: ${link}` };
  }

  sanitizeError(error: unknown): SafeEmailError {
    const maybe = error as { code?: string; responseCode?: number };
    const rawCode = String(maybe?.code ?? '').toUpperCase();
    const responseCode = Number(maybe?.responseCode);
    let code = 'SMTP_UNKNOWN';
    if (rawCode === 'EAUTH' || responseCode === 535) code = 'SMTP_AUTH_FAILED';
    else if (['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(rawCode)) code = 'SMTP_TIMEOUT';
    else if (['ENOTFOUND', 'EAI_AGAIN'].includes(rawCode)) code = 'SMTP_DNS_FAILED';
    else if (['ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(rawCode)) code = 'SMTP_CONNECTION_FAILED';
    else if (rawCode.includes('TLS') || rawCode.includes('CERT')) code = 'SMTP_TLS_FAILED';
    else if ([421, 429, 450, 451, 452].includes(responseCode)) code = 'SMTP_RATE_LIMITED';
    else if (responseCode >= 500 || rawCode === 'EENVELOPE' || rawCode === 'EMESSAGE') code = 'SMTP_REJECTED';
    return safeEmailErrorEvidence(code);
  }

  private hasConfig(): boolean {
    return Boolean(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<number>('SMTP_PORT') &&
      this.config.get<string>('SMTP_FROM_EMAIL'),
    );
  }

  private transportOptions(): SMTPTransport.Options {
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    return {
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT'),
      secure: this.config.get<boolean>('SMTP_SECURE') === true,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
    };
  }

  private fromAddress(): string {
    const name = this.config.get<string>('SMTP_FROM_NAME') || 'Esta Workforce OS';
    const email = this.config.get<string>('SMTP_FROM_EMAIL') || 'notifications@esta.local';
    return `"${name.replace(/"/g, '')}" <${email}>`;
  }

}
