export const ipcChannels = {
  tokensGet: 'tokens:get',
  tokensSet: 'tokens:set',
  tokensClear: 'tokens:clear',
  deviceGetInformation: 'device:get-information',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  appGetVersion: 'app:get-version',
} as const;
