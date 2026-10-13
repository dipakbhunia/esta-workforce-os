import { Module } from '@nestjs/common';
import { SmtpConnectionTestAdapter } from '../platform-communication/smtp-connection-test.adapter';
import { SmtpCredentialEncryptionService } from '../platform-communication/smtp-credential-encryption.service';
import { SmtpDestinationPolicyService } from '../platform-communication/smtp-destination-policy.service';
import { SmtpRuntimeResolverService } from './smtp-runtime-resolver.service';
@Module({ providers: [SmtpRuntimeResolverService, SmtpCredentialEncryptionService, SmtpDestinationPolicyService, SmtpConnectionTestAdapter], exports: [SmtpRuntimeResolverService, SmtpCredentialEncryptionService, SmtpDestinationPolicyService, SmtpConnectionTestAdapter] })
export class SmtpRuntimeModule {}
