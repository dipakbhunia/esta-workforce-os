import Joi = require('joi');

const paymentCredentialKey = Joi.string().allow('').custom((value: string, helpers) => {
  if (!value) return value;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return helpers.error('any.invalid');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== 32 || decoded.toString('base64') !== value) return helpers.error('any.invalid');
  return value;
});

export const environmentValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().uri().required(),
  PORT: Joi.number().port().default(3000),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  ALERT_DEVICE_OFFLINE_MINUTES: Joi.number().integer().min(1).default(10),
  ALERT_MISSING_HEARTBEAT_MINUTES: Joi.number().integer().min(1).default(20),
  ALERT_EXCESSIVE_IDLE_MINUTES: Joi.number().integer().min(1).default(30),
  ALERT_SCREENSHOT_MISSING_MINUTES: Joi.number().integer().min(1).default(30),
  ALERT_EVALUATION_INTERVAL_MINUTES: Joi.number().integer().min(1).default(5),
  ALERT_EVALUATION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  ATTENDANCE_STALE_EVALUATION_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  ATTENDANCE_STALE_EVALUATION_INTERVAL_MINUTES: Joi.number().integer().min(1).default(5),
  EMAIL_NOTIFICATIONS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_HOST: Joi.string().allow('', null).optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('', null).optional(),
  SMTP_PASSWORD: Joi.string().allow('', null).optional(),
  SMTP_FROM_EMAIL: Joi.string().email().allow('', null).optional(),
  SMTP_FROM_NAME: Joi.string().allow('', null).default('Esta Workforce OS'),
  PAYMENT_CREDENTIAL_ENCRYPTION_KEY: paymentCredentialKey.optional(),
  PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION: Joi.string().trim().min(1).max(64).allow('').optional(),
}).custom((value: Record<string, unknown>, helpers) => {
  const key = typeof value.PAYMENT_CREDENTIAL_ENCRYPTION_KEY === 'string'
    ? value.PAYMENT_CREDENTIAL_ENCRYPTION_KEY.trim() : '';
  const version = typeof value.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION === 'string'
    ? value.PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION.trim() : '';
  if (Boolean(key) !== Boolean(version)) return helpers.error('object.paymentCredentialPair');
  return value;
}).messages({
  'object.paymentCredentialPair': 'Payment credential encryption key and version must be configured together',
  'any.invalid': 'Payment credential encryption key must be canonical base64 encoding of exactly 32 bytes',
});
