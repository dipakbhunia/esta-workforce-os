export const QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED =
  'QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED';

export const QA_BROWSER_ACCEPTANCE_RUNTIME = Object.freeze({
  authorization: 'SA-C2.4-Phase1-QA2C',
  databaseName: 'esta_sac24_qa2b_20261029',
  databaseUser: 'esta_sac24_qa2b_app',
  databaseHost: 'esta-sac24-qa2b-pg-20261029',
  databasePort: '5432',
  databaseEndpoint: 'esta-sac24-qa2b-pg-20261029:5432',
  databaseContainerId:
    '4ff63bfd26f2e9de22a4b329ab9965e4f854f1f08f89a2d2dd33a5b680d37e05',
  databaseNetworkId:
    'fb4443854cadaf60244b723f6a782aba501ec70717c334bf3487a0b602af494b',
  databaseSystemIdentifier: '7701956771624615970',
  publicAppOrigin: 'http://127.0.0.1:15175',
});

const authorizationSettings = [
  'QA_BROWSER_ACCEPTANCE_AUTHORIZATION',
  'QA_BROWSER_ACCEPTANCE_DATABASE_ENDPOINT',
  'QA_BROWSER_ACCEPTANCE_DATABASE_CONTAINER_ID',
  'QA_BROWSER_ACCEPTANCE_DATABASE_NETWORK_ID',
  'QA_BROWSER_ACCEPTANCE_DATABASE_SYSTEM_IDENTIFIER',
] as const;

const inheritedExternalAuthoritySettings = [
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM_EMAIL',
  'SMTP_CREDENTIAL_ENCRYPTION_CURRENT_KEY_ID',
  'SMTP_CREDENTIAL_ENCRYPTION_KEYS',
  'SMTP_TEST_ALLOWED_HOSTS',
  'PAYMENT_CREDENTIAL_ENCRYPTION_KEY',
  'PAYMENT_CREDENTIAL_ENCRYPTION_KEY_VERSION',
] as const;

function configured(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

export function qaBrowserAcceptanceSchedulerConfigurationError(
  value: Readonly<Record<string, unknown>>,
): string | null {
  if (value[QA_BROWSER_ACCEPTANCE_SCHEDULERS_DISABLED] !== true) {
    return authorizationSettings.some((key) => configured(value[key]))
      ? 'QA_SCHEDULER_SETTINGS_WITHOUT_ENABLEMENT'
      : null;
  }

  if (value.NODE_ENV !== 'test') return 'QA_SCHEDULER_REQUIRES_TEST_ENVIRONMENT';
  if (value.QA_BROWSER_ACCEPTANCE_AUTHORIZATION !== QA_BROWSER_ACCEPTANCE_RUNTIME.authorization) {
    return 'QA_SCHEDULER_AUTHORIZATION_MISMATCH';
  }
  if (value.QA_BROWSER_ACCEPTANCE_DATABASE_ENDPOINT !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseEndpoint
    || value.QA_BROWSER_ACCEPTANCE_DATABASE_CONTAINER_ID !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseContainerId
    || value.QA_BROWSER_ACCEPTANCE_DATABASE_NETWORK_ID !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseNetworkId
    || value.QA_BROWSER_ACCEPTANCE_DATABASE_SYSTEM_IDENTIFIER !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseSystemIdentifier) {
    return 'QA_SCHEDULER_CLUSTER_ATTESTATION_MISMATCH';
  }
  if (value.PUBLIC_APP_ORIGIN !== QA_BROWSER_ACCEPTANCE_RUNTIME.publicAppOrigin) {
    return 'QA_SCHEDULER_ORIGIN_MISMATCH';
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(String(value.DATABASE_URL ?? ''));
  } catch {
    return 'QA_SCHEDULER_DATABASE_IDENTITY_MISMATCH';
  }
  if (databaseUrl.protocol !== 'postgresql:'
    || databaseUrl.hostname !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseHost
    || databaseUrl.port !== QA_BROWSER_ACCEPTANCE_RUNTIME.databasePort
    || decodeURIComponent(databaseUrl.username) !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseUser
    || !databaseUrl.password
    || decodeURIComponent(databaseUrl.pathname.replace(/^\//, '')) !== QA_BROWSER_ACCEPTANCE_RUNTIME.databaseName
    || databaseUrl.search
    || databaseUrl.hash) {
    return 'QA_SCHEDULER_DATABASE_IDENTITY_MISMATCH';
  }

  if (value.EMAIL_NOTIFICATIONS_ENABLED === true
    || value.SMTP_DATABASE_AUTHORITY_MANAGEMENT_ENABLED === true
    || value.SMTP_EMAIL_VERIFICATION_BOOTSTRAP_ENABLED === true
    || value.SMTP_PLATFORM_INVITATION_BOOTSTRAP_ENABLED === true
    || value.SMTP_QA_CAPTURE_ENABLED === true) {
    return 'QA_SCHEDULER_EMAIL_GATE_CONFLICT';
  }
  if (inheritedExternalAuthoritySettings.some((key) => configured(value[key]))) {
    return 'QA_SCHEDULER_EXTERNAL_AUTHORITY_CONFLICT';
  }
  return null;
}
