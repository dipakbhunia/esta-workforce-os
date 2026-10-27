import { ConfigService } from '@nestjs/config';
import { SmtpDestinationPolicyService } from '../platform-communication/smtp-destination-policy.service';
import { QaSmtpCaptureDestinationPolicyService } from '../platform-communication/smtp-qa-capture-destination-policy.service';

export function createSmtpDestinationPolicy(config: ConfigService): SmtpDestinationPolicyService {
  if (config.get<boolean>('SMTP_QA_CAPTURE_ENABLED') === true) {
    return new QaSmtpCaptureDestinationPolicyService(config);
  }
  return new SmtpDestinationPolicyService(config);
}
