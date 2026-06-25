export const ipcChannels = {
  tokensGet: 'tokens:get',
  tokensSet: 'tokens:set',
  tokensClear: 'tokens:clear',
  deviceGetInformation: 'device:get-information',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  appGetVersion: 'app:get-version',
  appSetAuthenticated: 'app:set-authenticated',
  appShowAndFocus: 'app:show-and-focus',
  appSignOutRequested: 'app:sign-out-requested',
} as const;