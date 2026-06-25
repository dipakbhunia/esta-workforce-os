import { createRequire } from 'node:module';
import { join } from 'node:path';
import type {
  BrowserWindow as BrowserWindowType,
  Event,
  Tray as TrayType,
} from 'electron';
const require = createRequire(import.meta.url);
const { app, BrowserWindow, Menu, nativeImage, shell, Tray } = require('electron') as typeof import('electron');
import type { DesktopSettings } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc-channels';
import { DeviceIdentity } from './device/device-identity';
import { registerIpcHandlers } from './ipc/register-ipc';
import { JsonFileStore } from './storage/json-file-store';
import { SecureTokenStore } from './storage/secure-token-store';

let mainWindow: BrowserWindowType | null = null;
let tray: TrayType | null = null;
let isAuthenticated = false;
let isQuitting = false;

const defaultSettings: DesktopSettings = {
  heartbeatIntervalMs: 60000,
  idleTimeoutMs: 5 * 60 * 1000,
  startWithWindows: true,
};

function createTray(): TrayType {
  if (tray) return tray;
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKklEQVR4AWNgGAXDAD79+vX/o6Oj8T8QGxv7T2QYBaNgFIyCUTAKRsEA1GANESUEkH8AAAAASUVORK5CYII=',
  );
  tray = new Tray(icon);
  tray.setToolTip('Esta Workforce OS');
  tray.on('click', showAndFocusWindow);
  updateTrayMenu();
  return tray;
}

function updateTrayMenu(): void {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Esta Workforce OS',
        click: showAndFocusWindow,
      },
      {
        label: 'Sign out',
        enabled: isAuthenticated,
        click: () => {
          showAndFocusWindow();
          mainWindow?.webContents.send(ipcChannels.appSignOutRequested);
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function showAndFocusWindow(): void {
  if (!mainWindow) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.flashFrame(true);
}

function setAuthenticated(authenticated: boolean): void {
  isAuthenticated = authenticated;
  createTray();
  updateTrayMenu();
}

function applyStartupSetting(settings: DesktopSettings): void {
  if (process.platform === 'win32') {
    app.setLoginItemSettings({
      openAtLogin: settings.startWithWindows,
      path: app.getPath('exe'),
    });
    return;
  }
  // TODO: Add macOS login item handling during packaging hardening.
}

function createWindow(): BrowserWindowType {
  const window = new BrowserWindow({
    width: 390,
    height: 690,
    minWidth: 360,
    maxWidth: 430,
    minHeight: 440,
    maxHeight: 760,
    resizable: true,
    show: false,
    backgroundColor: '#f4f4f2',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('close', (event: Event) => {
    if (isQuitting) return;
    if (isAuthenticated) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on('minimize' as never, (event: Event) => {
    if (!isAuthenticated) return;
    event.preventDefault();
    window.hide();
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const dataDirectory = app.getPath('userData');
  const tokenStore = new SecureTokenStore(
    new JsonFileStore(join(dataDirectory, 'auth.json'), {}),
  );
  const deviceIdentity = new DeviceIdentity(
    new JsonFileStore(join(dataDirectory, 'device.json'), {}),
  );
  const settings = new JsonFileStore<DesktopSettings>(
    join(dataDirectory, 'settings.json'),
    defaultSettings,
  );
  applyStartupSetting(await settings.read());
  createTray();
  registerIpcHandlers(tokenStore, deviceIdentity, settings, {
    setAuthenticated,
    showAndFocus: showAndFocusWindow,
    applyStartupSetting,
  });
  createWindow();

  app.on('activate', () => {
    showAndFocusWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (!isAuthenticated || isQuitting) app.quit();
});