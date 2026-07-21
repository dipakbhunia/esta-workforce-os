import { contextBridge, ipcRenderer } from 'electron';
import type {
  AuthTokens,
  DesktopSettings,
  EstaDesktopApi,
  ScreenshotCaptureContext,
} from '../shared/contracts';
import { ipcChannels } from '../shared/ipc-channels';

const api: EstaDesktopApi = {
  tokens: {
    get: () => ipcRenderer.invoke(ipcChannels.tokensGet),
    set: (tokens: AuthTokens) =>
      ipcRenderer.invoke(ipcChannels.tokensSet, tokens),
    clear: () => ipcRenderer.invoke(ipcChannels.tokensClear),
  },
  device: {
    getInformation: () =>
      ipcRenderer.invoke(ipcChannels.deviceGetInformation),
  },
  settings: {
    get: () => ipcRenderer.invoke(ipcChannels.settingsGet),
    update: (settings: Partial<DesktopSettings>) =>
      ipcRenderer.invoke(ipcChannels.settingsUpdate, settings),
  },
  system: {
    getIdleTimeSeconds: () =>
      ipcRenderer.invoke(ipcChannels.systemGetIdleTimeSeconds),
    getForegroundWindow: () =>
      ipcRenderer.invoke(ipcChannels.systemGetForegroundWindow),
    isScreenLocked: () => ipcRenderer.invoke(ipcChannels.systemIsScreenLocked),
    onScreenLockChanged: (callback: (locked: boolean) => void) => {
      const listener = (_event: unknown, locked: boolean) => callback(locked);
      ipcRenderer.on(ipcChannels.systemScreenLockChanged, listener);
      return () => ipcRenderer.removeListener(ipcChannels.systemScreenLockChanged, listener);
    },
  },
  browserBridge: {
    getPairingInfo: () =>
      ipcRenderer.invoke(ipcChannels.browserBridgeGetPairingInfo),
    regeneratePairingToken: () =>
      ipcRenderer.invoke(ipcChannels.browserBridgeRegeneratePairingToken),
    getLatestState: () =>
      ipcRenderer.invoke(ipcChannels.browserBridgeGetLatestState),
  },
  inputActivity: {
    start: () => ipcRenderer.invoke(ipcChannels.inputActivityStart),
    stop: () => ipcRenderer.invoke(ipcChannels.inputActivityStop),
    snapshotAndReset: () =>
      ipcRenderer.invoke(ipcChannels.inputActivitySnapshotAndReset),
  },
  screenshots: {
    capture: (context: ScreenshotCaptureContext) =>
      ipcRenderer.invoke(ipcChannels.screenshotCapture, context),
    listQueue: () => ipcRenderer.invoke(ipcChannels.screenshotListQueue),
    readFile: (id: string) => ipcRenderer.invoke(ipcChannels.screenshotReadFile, id),
    markUploaded: (id: string) =>
      ipcRenderer.invoke(ipcChannels.screenshotMarkUploaded, id),
    markFailed: (id: string, retryAfterMs?: number) =>
      ipcRenderer.invoke(ipcChannels.screenshotMarkFailed, id, retryAfterMs),
  },
  app: {
    getVersion: () => ipcRenderer.invoke(ipcChannels.appGetVersion),
    setAuthenticated: (authenticated: boolean) =>
      ipcRenderer.invoke(ipcChannels.appSetAuthenticated, authenticated),
    showAndFocus: () => ipcRenderer.invoke(ipcChannels.appShowAndFocus),
    onSignOutRequested: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(ipcChannels.appSignOutRequested, listener);
      return () => ipcRenderer.removeListener(ipcChannels.appSignOutRequested, listener);
    },
  },
};

contextBridge.exposeInMainWorld('esta', api);
