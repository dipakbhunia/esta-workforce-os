import { contextBridge, ipcRenderer } from 'electron';
import type {
  AuthTokens,
  DesktopSettings,
  EstaDesktopApi,
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
  app: {
    getVersion: () => ipcRenderer.invoke(ipcChannels.appGetVersion),
  },
};

contextBridge.exposeInMainWorld('esta', api);
