import Joi = require('joi');

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
  EMAIL_NOTIFICATIONS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_HOST: Joi.string().allow('', null).optional(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('', null).optional(),
  SMTP_PASSWORD: Joi.string().allow('', null).optional(),
  SMTP_FROM_EMAIL: Joi.string().email().allow('', null).optional(),
  SMTP_FROM_NAME: Joi.string().allow('', null).default('Esta Workforce OS'),
});
