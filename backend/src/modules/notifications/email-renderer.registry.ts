import { NotificationType } from '@prisma/client';
import {
  AnyEmailRendererRegistration,
  EMAIL_COMPOSITION_LIMITS,
  EmailCompositionError,
  EmailCompositionResult,
  EmailEnvelopePresentation,
  EmailEventKey,
  EmailEventPayloadMap,
  EmailRendererRegistration,
} from './email-composition.types';
import { assertSafeEmailDetailsPath } from './email-content-safety';
import { monitoringEmailRendererRegistrations } from './monitoring-email.renderer';
import { passwordChangedEmailRendererRegistration } from './password-changed-email.renderer';
import { accountStatusChangedEmailRendererRegistration } from './account-status-changed-email.renderer';
import { leaveDecisionEmailRendererRegistrations } from './leave-decision-email.renderer';
import { attendanceCorrectionDecisionEmailRendererRegistrations } from './attendance-correction-decision-email.renderer';
import { leaveAppliedEmailRendererRegistration } from './leave-applied-email.renderer';
import { leaveCancelledEmailRendererRegistration } from './leave-cancelled-email.renderer';

export class EmailRendererRegistry {
  private readonly registrations = new Map<NotificationType, AnyEmailRendererRegistration>();

  constructor(entries: readonly AnyEmailRendererRegistration[]) {
    for (const entry of entries) {
      if (this.registrations.has(entry.event)) {
        throw new EmailCompositionError('DUPLICATE_RENDERER', `Duplicate email renderer for ${entry.event}`);
      }
      if (!entry.rendererVersion || entry.rendererVersion.length > EMAIL_COMPOSITION_LIMITS.rendererVersion) {
        throw new EmailCompositionError('INVALID_RENDER_RESULT', 'Email renderer version is invalid');
      }
      this.registrations.set(entry.event, entry);
    }
  }

  render<K extends EmailEventKey>(event: K, payload: EmailEventPayloadMap[K]): EmailCompositionResult;
  render(event: NotificationType, payload: unknown): EmailCompositionResult {
    const registration = this.registrations.get(event);
    if (!registration) {
      throw new EmailCompositionError('UNSUPPORTED_EVENT', `Unsupported email event: ${event}`);
    }
    const typed = registration as EmailRendererRegistration<EmailEventKey>;
    const validated = typed.validatePayload(payload);
    const result = typed.render(event as EmailEventKey, validated);
    return this.validateResult(result, registration.rendererVersion);
  }

  envelopeFor(event: NotificationType): EmailEnvelopePresentation {
    const registration = this.registrations.get(event);
    if (!registration) {
      throw new EmailCompositionError('UNSUPPORTED_EVENT', `Unsupported email event: ${event}`);
    }
    return registration.envelope;
  }

  private validateResult(result: EmailCompositionResult, rendererVersion: string): EmailCompositionResult {
    if (
      !result ||
      typeof result.subject !== 'string' ||
      result.subject.length === 0 ||
      typeof result.message !== 'string' ||
      result.message.length === 0 ||
      result.rendererVersion !== rendererVersion
    ) {
      throw new EmailCompositionError('INVALID_RENDER_RESULT', 'Email renderer returned invalid content');
    }
    return {
      ...result,
      safeDetailsPath: result.safeDetailsPath === null
        ? null
        : assertSafeEmailDetailsPath(result.safeDetailsPath),
    };
  }
}

export const emailRendererRegistry = new EmailRendererRegistry([
  ...monitoringEmailRendererRegistrations,
  passwordChangedEmailRendererRegistration,
  accountStatusChangedEmailRendererRegistration,
  ...leaveDecisionEmailRendererRegistrations,
  leaveAppliedEmailRendererRegistration,
  leaveCancelledEmailRendererRegistration,
  ...attendanceCorrectionDecisionEmailRendererRegistrations,
]);
