import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmtpSecurityMode } from '@prisma/client';
import {
  QA_SMTP_CAPTURE_ADDRESS,
  QA_SMTP_CAPTURE_HOSTNAME,
  QA_SMTP_CAPTURE_PORT,
  loadQaSmtpCaptureRuntime,
} from '../../config/smtp-qa-capture-runtime';
import { ApprovedSmtpDestination, SmtpDestinationPolicyService } from './smtp-destination-policy.service';

const QA_CONFIGURATION_KEYS = [
  'NODE_ENV', 'DATABASE_URL', 'EMAIL_NOTIFICATIONS_ENABLED',
  'SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED', 'SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED',
  'SMTP_QA_CAPTURE_ENABLED', 'SMTP_QA_CAPTURE_TRUSTED_CA_PATH', 'NODE_EXTRA_CA_CERTS',
  'SMTP_QA_CAPTURE_HOSTNAME', 'SMTP_QA_CAPTURE_ADDRESS', 'SMTP_QA_CAPTURE_PORT',
  'SMTP_TEST_ALLOWED_HOSTS', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL',
] as const;

@Injectable()
export class QaSmtpCaptureDestinationPolicyService extends SmtpDestinationPolicyService {
  private readonly trustedCa: Buffer;

  constructor(config: ConfigService) {
    super(config);
    const environment = Object.fromEntries(QA_CONFIGURATION_KEYS.map((key) => [key, config.get(key)]));
    const runtime = loadQaSmtpCaptureRuntime(environment);
    if (runtime.error || !runtime.trustedCa) {
      throw new ServiceUnavailableException('QA SMTP capture configuration is invalid');
    }
    this.trustedCa = Buffer.from(runtime.trustedCa);
  }

  override async approve(host: string, port?: number,
    securityMode?: SmtpSecurityMode): Promise<ApprovedSmtpDestination> {
    const canonical = host.trim().toLowerCase().replace(/\.$/, '');
    if (canonical !== QA_SMTP_CAPTURE_HOSTNAME || port !== QA_SMTP_CAPTURE_PORT
      || securityMode !== SmtpSecurityMode.STARTTLS) {
      throw new ServiceUnavailableException('SMTP destination is not approved');
    }
    return { hostname: QA_SMTP_CAPTURE_HOSTNAME, address: QA_SMTP_CAPTURE_ADDRESS, family: 4,
      trustedCa: Buffer.from(this.trustedCa) };
  }
}
