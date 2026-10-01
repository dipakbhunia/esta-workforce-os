import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { EmailDeliveryPolicy, getEmailEventPolicy, preferencesApply, registeredEmailEventPolicies } from './email-event-policy.registry';

describe('email event policy registry', () => {
  it('registers only the five monitoring event policies as preference controlled', () => {
    const policies = registeredEmailEventPolicies();
    assert.deepEqual(policies.map((policy) => policy.eventKey).sort(), Object.values(NotificationType).sort());
    assert.ok(policies.every((policy) => policy.deliveryPolicy === EmailDeliveryPolicy.PREFERENCE_CONTROLLED));
    assert.ok(policies.every(preferencesApply));
  });

  it('preserves monitoring channels and the established idempotency format', () => {
    const opened = getEmailEventPolicy(NotificationType.ALERT_OPENED);
    assert.deepEqual(opened.eligibleChannels, [NotificationChannel.IN_APP, NotificationChannel.EMAIL]);
    assert.equal(opened.buildIdempotencyKey({ sourceId: 'alert', userId: 'user', channel: NotificationChannel.EMAIL }),
      'alert:ALERT_OPENED:user:EMAIL');
    assert.deepEqual(getEmailEventPolicy(NotificationType.ALERT_ACKNOWLEDGED).eligibleChannels, [NotificationChannel.IN_APP]);
  });

  it('supports mandatory policy semantics without registering a mandatory event', () => {
    assert.equal(preferencesApply({ deliveryPolicy: EmailDeliveryPolicy.MANDATORY }), false);
    assert.throws(() => getEmailEventPolicy('UNKNOWN' as NotificationType), /Unsupported email event policy/);
  });
});
