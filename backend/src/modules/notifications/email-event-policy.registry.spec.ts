import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { EmailDeliveryPolicy, getEmailEventPolicy, preferencesApply, registeredEmailEventPolicies } from './email-event-policy.registry';

describe('email event policy registry', () => {
  it('registers monitoring policies as preference controlled and password changes as mandatory', () => {
    const policies = registeredEmailEventPolicies();
    assert.deepEqual(policies.map((policy) => policy.eventKey).sort(), Object.values(NotificationType).sort());
    const monitoring = policies.filter((policy) => policy.eventKey !== NotificationType.PASSWORD_CHANGED);
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
