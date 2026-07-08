import { app, ipcMain } from 'electron';
import type { AuthTokens, DesktopSettings, ForegroundWindowMetadata } from '../../shared/contracts';
import { ipcChannels } from '../../shared/ipc-channels';
import { DeviceIdentity } from '../device/device-identity';
import { JsonFileStore } from '../storage/json-file-store';
import { SecureTokenStore } from '../storage/secure-token-store';

export interface AppIpcActions {
  setAuthenticated(authenticated: boolean): void;
  showAndFocus(): void;
  applyStartupSetting(settings: DesktopSettings): void;
  getSystemIdleTimeSeconds(): number;
  getForegroundWindow(): ForegroundWindowMetadata | Promise<ForegroundWindowMetadata>;
}

export function registerIpcHandlers(
  tokens: SecureTokenStore,
  deviceIdentity: DeviceIdentity,
  settings: JsonFileStore<DesktopSettings>,
  actions: AppIpcActions,
): void {
  ipcMain.handle(ipcChannels.tokensGet, () => tokens.get());
  ipcMain.handle(ipcChannels.tokensSet, (_event: unknown, value: AuthTokens) =>
    tokens.set(value),
  );
  ipcMain.handle(ipcChannels.tokensClear, () => tokens.clear());
  ipcMain.handle(ipcChannels.deviceGetInformation, () =>
    deviceIdentity.getInformation(),
  );
  ipcMain.handle(ipcChannels.settingsGet, async () => {
    const value = await settings.read();
    actions.applyStartupSetting(value);
    return value;
  });
  ipcMain.handle(
    ipcChannels.settingsUpdate,
    async (_event: unknown, value: Partial<DesktopSettings>) => {
      const next = await settings.update(value);
      actions.applyStartupSetting(next);
      return next;
    },
  );
  ipcMain.handle(ipcChannels.appGetVersion, () => app.getVersion());
  ipcMain.handle(ipcChannels.appSetAuthenticated, (_event: unknown, authenticated: boolean) =>
    actions.setAuthenticated(authenticated),
  );
  ipcMain.handle(ipcChannels.appShowAndFocus, () => actions.showAndFocus());
  ipcMain.handle(ipcChannels.systemGetIdleTimeSeconds, () =>
    actions.getSystemIdleTimeSeconds(),
  );
  ipcMain.handle(ipcChannels.systemGetForegroundWindow, () =>
    actions.getForegroundWindow(),
  );
}


