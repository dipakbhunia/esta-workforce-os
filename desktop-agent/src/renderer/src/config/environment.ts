const rawApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000/api';

export const environment = {
  apiBaseUrl: rawApiBaseUrl.replace(/\/+$/, ''),
  heartbeatIntervalMs: Number(
    import.meta.env.VITE_HEARTBEAT_INTERVAL_MS || 60000,
  ),
  screenshotIntervalMs: Number(
    import.meta.env.VITE_SCREENSHOT_INTERVAL_MS || 10 * 60 * 1000,
  ),
  screenshotJitterMs: Number(
    import.meta.env.VITE_SCREENSHOT_JITTER_MS || 60 * 1000,
  ),
} as const;
