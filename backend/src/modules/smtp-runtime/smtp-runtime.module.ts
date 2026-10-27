import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmtpConnectionTestAdapter } from '../platform-communication/smtp-connection-test.adapter';
import { SmtpCredentialEncryptionService } from '../platform-communication/smtp-credential-encryption.service';
import { SmtpDestinationPolicyService } from '../platform-communication/smtp-destination-policy.service';
import { SmtpRuntimeResolverService } from './smtp-runtime-resolver.service';
import { createSmtpDestinationPolicy } from './smtp-destination-policy.provider';

@Module({
  providers: [SmtpRuntimeResolverService, SmtpCredentialEncryptionService,
    { provide: SmtpDestinationPolicyService, inject: [ConfigService], useFactory: createSmtpDestinationPolicy },
    SmtpConnectionTestAdapter],
  exports: [SmtpRuntimeResolverService, SmtpCredentialEncryptionService,
    SmtpDestinationPolicyService, SmtpConnectionTestAdapter],
})
export class SmtpRuntimeModule {}
