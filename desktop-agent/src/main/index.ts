import { join } from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, powerMonitor, shell, Tray } from 'electron';
import type {
  BrowserWindow as BrowserWindowType,
  Event,
  Tray as TrayType,
} from 'electron';
import type { DesktopSettings } from '../shared/contracts';
import { ipcChannels } from '../shared/ipc-channels';
import { DeviceIdentity } from './device/device-identity';
import { registerIpcHandlers } from './ipc/register-ipc';
import { ForegroundWindowSampler } from './platform/foreground-window';
import { ScreenshotQueue } from './screenshot/screenshot-queue';
import { JsonFileStore } from './storage/json-file-store';
import { SecureTokenStore } from './storage/secure-token-store';

if (process.env.ELECTRON_RUN_AS_NODE) {
  throw new Error(
    'Electron main process cannot start while ELECTRON_RUN_AS_NODE is set. Run: Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue',
  );
}

if (!app) {
  throw new Error('Electron app API is unavailable. Make sure the app is launched by Electron, not plain Node.');
}

let mainWindow: BrowserWindowType | null = null;
let tray: TrayType | null = null;
let isAuthenticated = false;
let isQuitting = false;
let screenLocked = false;
const foregroundWindowSampler = new ForegroundWindowSampler();
let screenshotQueue: ScreenshotQueue | null = null;

function numberFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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
    app.getVersion(),
  );
  const settings = new JsonFileStore<DesktopSettings>(
    join(dataDirectory, 'settings.json'),
    defaultSettings,
  );
  screenshotQueue = new ScreenshotQueue(dataDirectory, () => screenLocked, {
    jpegQuality: numberFromEnv('VITE_SCREENSHOT_IMAGE_QUALITY', 72),
    maxCaptureWidth: numberFromEnv('VITE_SCREENSHOT_MAX_WIDTH', 1600),
    maxQueueItems: numberFromEnv('VITE_SCREENSHOT_QUEUE_MAX_ITEMS', 200),
    maxQueueBytes: numberFromEnv('VITE_SCREENSHOT_QUEUE_MAX_BYTES', 200 * 1024 * 1024),
  });
  applyStartupSetting(await settings.read());
  foregroundWindowSampler.start();
  powerMonitor.on('lock-screen', () => {
    screenLocked = true;
    mainWindow?.webContents.send(ipcChannels.systemScreenLockChanged, true);
  });
  powerMonitor.on('unlock-screen', () => {
    screenLocked = false;
    mainWindow?.webContents.send(ipcChannels.systemScreenLockChanged, false);
  });
  createTray();
  registerIpcHandlers(tokenStore, deviceIdentity, settings, {
    setAuthenticated,
    showAndFocus: showAndFocusWindow,
    applyStartupSetting,
    getSystemIdleTimeSeconds: () => powerMonitor.getSystemIdleTime(),
    getForegroundWindow: () => foregroundWindowSampler.getMetadata(),
    isScreenLocked: () => screenLocked,
    captureScreenshot: (context) => screenshotQueue?.capture(context) ?? Promise.resolve(null),
    listScreenshotQueue: () => screenshotQueue?.listQueue() ?? Promise.resolve([]),
    readScreenshotFile: (id) => {
      if (!screenshotQueue) throw new Error('Screenshot queue is unavailable');
      return screenshotQueue.readFilePayload(id);
    },
    markScreenshotUploaded: (id) => screenshotQueue?.markUploaded(id) ?? Promise.resolve(),
    markScreenshotFailed: (id, retryAfterMs) => screenshotQueue?.markFailed(id, retryAfterMs) ?? Promise.resolve(),
  });
  createWindow();

  app.on('activate', () => {
    showAndFocusWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  foregroundWindowSampler.stop();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (!isAuthenticated || isQuitting) app.quit();
});


