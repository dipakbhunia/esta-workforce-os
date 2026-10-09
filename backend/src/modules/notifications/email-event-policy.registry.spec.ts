import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { EmailDeliveryPolicy, getEmailEventPolicy, preferencesApply, registeredEmailEventPolicies } from './email-event-policy.registry';

describe('email event policy registry', () => {
  it('registers monitoring policies as preference controlled and security events as mandatory', () => {
    const policies = registeredEmailEventPolicies();
    assert.deepEqual(policies.map((policy) => policy.eventKey).sort(), Object.values(NotificationType).sort());
    const monitoring = policies.filter((policy) => ![
      NotificationType.PASSWORD_CHANGED,
      NotificationType.ACCOUNT_STATUS_CHANGED,
        NotificationType.ACCOUNT_INVITATION,
        NotificationType.PASSWORD_RESET_REQUESTED,
      NotificationType.LEAVE_APPROVED,
      NotificationType.LEAVE_REJECTED,
      NotificationType.LEAVE_APPLIED,
      NotificationType.LEAVE_CANCELLED,
      NotificationType.ATTENDANCE_CORRECTION_APPROVED,
      NotificationType.ATTENDANCE_CORRECTION_REJECTED,
      NotificationType.ATTENDANCE_CORRECTION_APPLIED,
      NotificationType.PAYMENT_CAPTURED,
      NotificationType.PAYMENT_FAILED,
      NotificationType.INVOICE_ISSUED,
    ].includes(policy.eventKey));
    assert.ok(monitoring.every((policy) => policy.deliveryPolicy === EmailDeliveryPolicy.PREFERENCE_CONTROLLED));
    assert.ok(monitoring.every(preferencesApply));
    const passwordChanged = getEmailEventPolicy(NotificationType.PASSWORD_CHANGED);
    assert.equal(passwordChanged.deliveryPolicy, EmailDeliveryPolicy.MANDATORY);
    assert.equal(preferencesApply(passwordChanged), false);
    assert.equal(passwordChanged.preferenceEvaluator, 'NONE');
    assert.deepEqual(passwordChanged.eligibleChannels, [NotificationChannel.EMAIL]);
    assert.equal(passwordChanged.quietHours, 'NONE');
    assert.equal(passwordChanged.buildIdempotencyKey({ sourceId: 'mutation', userId: 'target', channel: NotificationChannel.EMAIL }),
      'mutation:PASSWORD_CHANGED:target:EMAIL');
    const accountStatus = getEmailEventPolicy(NotificationType.ACCOUNT_STATUS_CHANGED);
    assert.equal(accountStatus.category, 'SECURITY');
    assert.equal(accountStatus.deliveryPolicy, EmailDeliveryPolicy.MANDATORY);
    assert.equal(preferencesApply(accountStatus), false);
    assert.equal(accountStatus.preferenceEvaluator, 'NONE');
    assert.deepEqual(accountStatus.eligibleChannels, [NotificationChannel.EMAIL]);
    assert.equal(accountStatus.quietHours, 'NONE');
    assert.equal(accountStatus.buildIdempotencyKey({ sourceId: 'mutation', userId: 'target', channel: NotificationChannel.EMAIL }),
      'mutation:ACCOUNT_STATUS_CHANGED:target:EMAIL');
  });

  it('registers commercial events as mandatory billing-contact email with no quiet hours', () => {
    for (const type of [NotificationType.PAYMENT_CAPTURED, NotificationType.PAYMENT_FAILED, NotificationType.INVOICE_ISSUED]) {
      const policy = getEmailEventPolicy(type);
      assert.equal(policy.category, 'COMMERCIAL');
      assert.equal(policy.deliveryPolicy, EmailDeliveryPolicy.MANDATORY);
      assert.equal(policy.recipientResolver, 'COMMERCIAL_BILLING_CONTACT');
      assert.equal(policy.preferenceEvaluator, 'NONE');
      assert.equal(policy.quietHours, 'NONE');
      assert.deepEqual(policy.eligibleChannels, [NotificationChannel.EMAIL]);
    }
  });

  it('registers Leave decisions as preference-controlled workflow email only', () => {
    for (const type of [NotificationType.LEAVE_APPROVED, NotificationType.LEAVE_REJECTED]) {
      const policy = getEmailEventPolicy(type);
      assert.equal(policy.category, 'WORKFLOW');
      assert.equal(policy.deliveryPolicy, EmailDeliveryPolicy.PREFERENCE_CONTROLLED);
      assert.equal(policy.preferenceEvaluator, 'USER_EMAIL_ENABLED');
      assert.equal(policy.recipientResolver, 'WORKFLOW_APPLICANT');
      assert.equal(policy.quietHours, 'NON_CRITICAL_EMAIL');
      assert.deepEqual(policy.eligibleChannels, [NotificationChannel.EMAIL]);
      assert.equal(policy.buildIdempotencyKey({ sourceId: 'history', userId: 'applicant', channel: NotificationChannel.EMAIL }),
        `history:${type}:applicant:EMAIL`);
    }
  });

  it('registers Leave applied as assigned-approver preference-controlled workflow email only', () => {
    const policy = getEmailEventPolicy(NotificationType.LEAVE_APPLIED);
    assert.equal(policy.category, 'WORKFLOW');
    assert.equal(policy.deliveryPolicy, EmailDeliveryPolicy.PREFERENCE_CONTROLLED);
    assert.equal(policy.preferenceEvaluator, 'USER_EMAIL_ENABLED');
    assert.equal(policy.recipientResolver, 'WORKFLOW_ASSIGNED_APPROVER');
    assert.equal(policy.renderer, 'LEAVE_APPLIED_WORKFLOW');
    assert.equal(policy.quietHours, 'NON_CRITICAL_EMAIL');
    assert.deepEqual(policy.eligibleChannels, [NotificationChannel.EMAIL]);
    assert.equal(policy.buildIdempotencyKey({ sourceId: 'history', userId: 'approver', channel: NotificationChannel.EMAIL }),
      'history:LEAVE_APPLIED:approver:EMAIL');
  });

  it('registers Leave cancelled as exact-participant preference-controlled workflow email only', () => {
    const policy = getEmailEventPolicy(NotificationType.LEAVE_CANCELLED);
    assert.equal(policy.category, 'WORKFLOW');
    assert.equal(policy.deliveryPolicy, EmailDeliveryPolicy.PREFERENCE_CONTROLLED);
    assert.equal(policy.preferenceEvaluator, 'USER_EMAIL_ENABLED');
    assert.equal(policy.recipientResolver, 'WORKFLOW_EXACT_PARTICIPANT');
    assert.equal(policy.renderer, 'LEAVE_CANCELLED_WORKFLOW');
    assert.equal(policy.quietHours, 'NON_CRITICAL_EMAIL');
    assert.deepEqual(policy.eligibleChannels, [NotificationChannel.EMAIL]);
    assert.equal(policy.buildIdempotencyKey({ sourceId: 'history', userId: 'participant', channel: NotificationChannel.EMAIL }),
      'history:LEAVE_CANCELLED:participant:EMAIL');
  });

  it('registers Attendance correction decisions as preference-controlled workflow email only', () => {
    for (const type of [NotificationType.ATTENDANCE_CORRECTION_APPROVED, NotificationType.ATTENDANCE_CORRECTION_REJECTED]) {
      const policy = getEmailEventPolicy(type);
      assert.equal(policy.category, 'WORKFLOW');
      assert.equal(policy.deliveryPolicy, EmailDeliveryPolicy.PREFERENCE_CONTROLLED);
      assert.equal(policy.preferenceEvaluator, 'USER_EMAIL_ENABLED');
      assert.equal(policy.recipientResolver, 'WORKFLOW_APPLICANT');
      assert.equal(policy.quietHours, 'NON_CRITICAL_EMAIL');
      assert.deepEqual(policy.eligibleChannels, [NotificationChannel.EMAIL]);
      assert.equal(policy.buildIdempotencyKey({ sourceId: 'audit', userId: 'employee', channel: NotificationChannel.EMAIL }),
        `audit:${type}:employee:EMAIL`);
    }
  });

  it('registers Attendance correction applied for the persisted assigned approver', () => {
    const policy = getEmailEventPolicy(NotificationType.ATTENDANCE_CORRECTION_APPLIED);
    assert.equal(policy.category, 'WORKFLOW');
    assert.equal(policy.deliveryPolicy, EmailDeliveryPolicy.PREFERENCE_CONTROLLED);
    assert.equal(policy.recipientResolver, 'WORKFLOW_ASSIGNED_APPROVER');
    assert.equal(policy.preferenceEvaluator, 'USER_EMAIL_ENABLED');
    assert.equal(policy.renderer, 'ATTENDANCE_CORRECTION_APPLIED_WORKFLOW');
    assert.equal(policy.quietHours, 'NON_CRITICAL_EMAIL');
    assert.deepEqual(policy.eligibleChannels, [NotificationChannel.EMAIL]);
  });

  it('preserves monitoring channels and the established idempotency format', () => {
    const opened = getEmailEventPolicy(NotificationType.ALERT_OPENED);
    assert.deepEqual(opened.eligibleChannels, [NotificationChannel.IN_APP, NotificationChannel.EMAIL]);
    assert.equal(opened.buildIdempotencyKey({ sourceId: 'alert', userId: 'user', channel: NotificationChannel.EMAIL }),
      'alert:ALERT_OPENED:user:EMAIL');
    assert.deepEqual(getEmailEventPolicy(NotificationType.ALERT_ACKNOWLEDGED).eligibleChannels, [NotificationChannel.IN_APP]);
  });

  it('rejects unknown policies', () => {
    assert.equal(preferencesApply({ deliveryPolicy: EmailDeliveryPolicy.MANDATORY }), false);
    assert.throws(() => getEmailEventPolicy('UNKNOWN' as NotificationType), /Unsupported email event policy/);
  });
});
