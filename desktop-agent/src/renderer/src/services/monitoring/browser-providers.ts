export interface BrowserTab {
  browserName: string;
  title?: string;
  url?: string;
  domain?: string;
}

export interface BrowserProvider {
  readonly browserName: string;
  readonly executableNames: string[];
  readonly processNames: string[];
  readonly titlePatterns: RegExp[];
  isAvailable(): Promise<boolean>;
  getActiveTab(): Promise<BrowserTab | null>;
}

abstract class RegisteredBrowserProvider implements BrowserProvider {
  constructor(
    readonly browserName: string,
    readonly executableNames: string[],
    readonly processNames: string[],
    readonly titlePatterns: RegExp[],
  ) {}

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async getActiveTab(): Promise<BrowserTab | null> {
    return null;
  }
}

export class ChromeProvider extends RegisteredBrowserProvider {
  constructor() {
    super('Google Chrome', ['chrome', 'chrome.exe'], ['chrome'], [/google chrome/i, /\bchrome\b/i]);
  }
}

export class EdgeProvider extends RegisteredBrowserProvider {
  constructor() {
    super('Microsoft Edge', ['msedge', 'msedge.exe'], ['msedge'], [/microsoft edge/i, /\bedge\b/i]);
  }
}

export class FirefoxProvider extends RegisteredBrowserProvider {
  constructor() {
    super('Mozilla Firefox', ['firefox', 'firefox.exe'], ['firefox'], [/mozilla firefox/i, /\bfirefox\b/i]);
  }
}

export class BraveProvider extends RegisteredBrowserProvider {
  constructor() {
    super('Brave', ['brave', 'brave.exe', 'bravebrowser', 'bravebrowser.exe'], ['brave', 'bravebrowser'], [/brave/i]);
  }
}

export class OperaProvider extends RegisteredBrowserProvider {
  constructor() {
    super('Opera', ['opera', 'opera.exe', 'launcher', 'launcher.exe'], ['opera', 'launcher'], [/opera/i]);
  }
}

export class ElectronBrowserProvider extends RegisteredBrowserProvider {
  constructor() {
    super('Electron', ['electron', 'electron.exe'], ['electron'], [/electron/i]);
  }
}

export class BrowserProviderRegistry {
  private readonly providers: BrowserProvider[] = [
    new ChromeProvider(),
    new EdgeProvider(),
    new FirefoxProvider(),
    new BraveProvider(),
    new OperaProvider(),
    new ElectronBrowserProvider(),
  ];

  list(): BrowserProvider[] {
    return this.providers;
  }

  match(input: { executableName?: string | null; processName?: string | null; windowTitle?: string | null }): BrowserProvider | null {
    const executable = normalizeToken(input.executableName);
    const process = normalizeToken(input.processName);
    const title = input.windowTitle ?? '';

    return this.providers.find((provider) =>
      provider.executableNames.some((name) => normalizeToken(name) === executable) ||
      provider.processNames.some((name) => normalizeToken(name) === process) ||
      provider.titlePatterns.some((pattern) => pattern.test(title)),
    ) ?? null;
  }
}

function normalizeToken(value?: string | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\.exe$/, '');
}
