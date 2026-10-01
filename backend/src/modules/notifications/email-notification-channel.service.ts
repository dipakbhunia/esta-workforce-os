import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { MonitoringAlertSeverity, Notification } from '@prisma/client';

export interface EmailDeliveryResult {
  skipped: boolean;
  providerMessageId?: string | null;
  safeReason?: string;
}

export interface SafeEmailError { code: string; message: string }

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

@Injectable()
export class EmailNotificationChannel {
  private readonly logger = new Logger(EmailNotificationChannel.name);

  constructor(private readonly config: ConfigService) {}

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
    const transporter = nodemailer.createTransport(this.transportOptions());
    const response = await transporter.sendMail({
      from: this.fromAddress(),
      to: recipient,
      subject: notification.title,
      text: this.textTemplate(notification),
      html: this.htmlTemplate(notification),
    });
    return { skipped: false, providerMessageId: response.messageId ?? null };
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

  private textTemplate(notification: Notification): string {
    return [
      notification.title,
      '',
      notification.message,
      '',
      notification.severity ? `Severity: ${notification.severity}` : null,
      notification.detailsPath ? `Open: ${notification.detailsPath}` : null,
      '',
      'This notification contains alert summary metadata only. It does not include screenshots, typed text, secrets, or raw monitoring data.',
    ].filter(Boolean).join('\n');
  }

  private htmlTemplate(notification: Notification): string {
    const severityColor = notification.severity === MonitoringAlertSeverity.CRITICAL ? '#DC2626' : notification.severity === MonitoringAlertSeverity.WARNING ? '#F59E0B' : '#2563EB';
    return `
      <div style="font-family:Inter,Arial,sans-serif;max-width:640px;color:#111827">
        <div style="border:1px solid #E5E7EB;border-radius:14px;padding:20px;background:#FFFFFF">
          <p style="margin:0 0 8px;color:${severityColor};font-weight:700;letter-spacing:.04em;text-transform:uppercase;font-size:12px">${this.escape(notification.severity ?? 'ALERT')}</p>
          <h1 style="font-size:20px;margin:0 0 12px">${this.escape(notification.title)}</h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#374151">${this.escape(notification.message)}</p>
          ${notification.detailsPath ? `<p style="margin:0 0 16px"><a href="${this.escape(notification.detailsPath)}" style="color:#2563EB">Open alert details</a></p>` : ''}
          <p style="font-size:12px;color:#6B7280;margin:0">Summary metadata only. No screenshots, typed text, secrets, or raw monitoring data are included.</p>
        </div>
      </div>`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] ?? char));
  }
}
