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
  inputTrackingEnabled:
    import.meta.env.VITE_INPUT_TRACKING_ENABLED?.trim().toLowerCase() !== 'false',
  inputMouseMoveEnabled:
    import.meta.env.VITE_INPUT_MOUSE_MOVE_ENABLED?.trim().toLowerCase() !== 'false',
  inputScrollEnabled:
    import.meta.env.VITE_INPUT_SCROLL_ENABLED?.trim().toLowerCase() !== 'false',
  inputMouseMoveThrottleMs: Number(
    import.meta.env.VITE_INPUT_MOUSE_MOVE_THROTTLE_MS || 500,
  ),
} as const;
