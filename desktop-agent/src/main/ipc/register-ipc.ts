import { app, ipcMain } from 'electron';
import type { AuthTokens, DesktopSettings } from '../../shared/contracts';
import { ipcChannels } from '../../shared/ipc-channels';
import { DeviceIdentity } from '../device/device-identity';
import { JsonFileStore } from '../storage/json-file-store';
import { SecureTokenStore } from '../storage/secure-token-store';

export function registerIpcHandlers(
  tokens: SecureTokenStore,
  deviceIdentity: DeviceIdentity,
  settings: JsonFileStore<DesktopSettings>,
): void {
  ipcMain.handle(ipcChannels.tokensGet, () => tokens.get());
  ipcMain.handle(ipcChannels.tokensSet, (_, value: AuthTokens) =>
    tokens.set(value),
  );
  ipcMain.handle(ipcChannels.tokensClear, () => tokens.clear());
  ipcMain.handle(ipcChannels.deviceGetInformation, () =>
    deviceIdentity.getInformation(),
  );
  ipcMain.handle(ipcChannels.settingsGet, () => settings.read());
  ipcMain.handle(
    ipcChannels.settingsUpdate,
    (_, value: Partial<DesktopSettings>) => settings.update(value),
  );
  ipcMain.handle(ipcChannels.appGetVersion, () => app.getVersion());
}
