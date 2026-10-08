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
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  DATABASE_URL: Joi.string().uri().required(),
  PORT: Joi.number().port().default(3000),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  PUBLIC_APP_ORIGIN: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
  IDENTITY_ACTION_TOKEN_SECRET: Joi.string().min(32).allow('').optional(),
  IDENTITY_INVITATION_TTL_HOURS: Joi.number().integer().min(1).max(168).default(48),
  IDENTITY_PASSWORD_RESET_TTL_MINUTES: Joi.number().integer().min(5).max(1440).default(30),
  IDENTITY_RECOVERY_EMAIL_LIMIT_PER_HOUR: Joi.number().integer().min(1).max(20).default(5),
  IDENTITY_RECOVERY_IP_LIMIT_PER_HOUR: Joi.number().integer().min(1).max(100).default(20),
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
  const production = value.NODE_ENV === 'production';
  const configuredOrigin = typeof value.PUBLIC_APP_ORIGIN === 'string' ? value.PUBLIC_APP_ORIGIN : '';
  if (!configuredOrigin) {
    if (production) return helpers.error('object.productionAppOriginRequired');
    value.PUBLIC_APP_ORIGIN = 'http://localhost:5173';
    return value;
  }
  try {
    const origin = new URL(configuredOrigin);
    const exactOrigin = origin.origin === configuredOrigin.replace(/\/$/, '');
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !exactOrigin) {
      return helpers.error('object.invalidAppOrigin');
    }
    if (production && origin.protocol !== 'https:') return helpers.error('object.productionAppOriginHttps');
    if (!production && origin.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(origin.hostname)) {
      return helpers.error('object.invalidAppOrigin');
    }
  } catch {
    return helpers.error('object.invalidAppOrigin');
  }
  return value;
}).messages({
  'object.paymentCredentialPair': 'Payment credential encryption key and version must be configured together',
  'any.invalid': 'Payment credential encryption key must be canonical base64 encoding of exactly 32 bytes',
  'object.productionAppOriginRequired': 'PUBLIC_APP_ORIGIN is required in production',
  'object.productionAppOriginHttps': 'PUBLIC_APP_ORIGIN must use HTTPS in production',
  'object.invalidAppOrigin': 'PUBLIC_APP_ORIGIN must be an exact trusted origin without credentials, path, query, or fragment',
});
