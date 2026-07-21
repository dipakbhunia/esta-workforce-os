import { app, ipcMain } from 'electron';
import type {
  AuthTokens,
  BrowserBridgePairingInfo,
  BrowserBridgeState,
  DesktopSettings,
  ForegroundWindowMetadata,
  InputActivitySnapshot,
  ScreenshotCaptureContext,
} from '../../shared/contracts';
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
  isScreenLocked(): boolean;
  getBrowserBridgePairingInfo(): BrowserBridgePairingInfo | null;
  regenerateBrowserBridgePairingToken(): BrowserBridgePairingInfo | null;
  getLatestBrowserBridgeState(): BrowserBridgeState | null;
  startInputActivity(): Promise<void>;
  stopInputActivity(): Promise<void>;
  snapshotAndResetInputActivity(): Promise<InputActivitySnapshot>;
  captureScreenshot(context: ScreenshotCaptureContext): Promise<unknown>;
  listScreenshotQueue(): Promise<unknown>;
  readScreenshotFile(id: string): Promise<unknown>;
  markScreenshotUploaded(id: string): Promise<void>;
  markScreenshotFailed(id: string, retryAfterMs?: number): Promise<void>;
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
  ipcMain.handle(ipcChannels.systemIsScreenLocked, () => actions.isScreenLocked());
  ipcMain.handle(ipcChannels.browserBridgeGetPairingInfo, () =>
    actions.getBrowserBridgePairingInfo(),
  );
  ipcMain.handle(ipcChannels.browserBridgeRegeneratePairingToken, () =>
    actions.regenerateBrowserBridgePairingToken(),
  );
  ipcMain.handle(ipcChannels.browserBridgeGetLatestState, () =>
    actions.getLatestBrowserBridgeState(),
  );
  ipcMain.handle(ipcChannels.inputActivityStart, () => actions.startInputActivity());
  ipcMain.handle(ipcChannels.inputActivityStop, () => actions.stopInputActivity());
  ipcMain.handle(ipcChannels.inputActivitySnapshotAndReset, () =>
    actions.snapshotAndResetInputActivity(),
  );
  ipcMain.handle(ipcChannels.screenshotCapture, (_event: unknown, context: ScreenshotCaptureContext) =>
    actions.captureScreenshot(context),
  );
  ipcMain.handle(ipcChannels.screenshotListQueue, () =>
    actions.listScreenshotQueue(),
  );
  ipcMain.handle(ipcChannels.screenshotReadFile, (_event: unknown, id: string) =>
    actions.readScreenshotFile(id),
  );
  ipcMain.handle(ipcChannels.screenshotMarkUploaded, (_event: unknown, id: string) =>
    actions.markScreenshotUploaded(id),
  );
  ipcMain.handle(ipcChannels.screenshotMarkFailed, (_event: unknown, id: string, retryAfterMs?: number) =>
    actions.markScreenshotFailed(id, retryAfterMs),
  );
}


