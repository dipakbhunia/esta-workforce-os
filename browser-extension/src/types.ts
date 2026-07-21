export interface PairingConfig {
  port: number;
  token: string;
}

export type SupportedBrowser = 'chrome' | 'edge' | 'brave' | 'opera';

export interface BridgeMessage {
  hostname: string;
  observedAt: string;
  browser: SupportedBrowser;
}

export interface ChromeLikeApi {
  tabs: {
    query(queryInfo: Record<string, unknown>, callback: (tabs: Array<{ id?: number; url?: string; active?: boolean; windowId?: number }>) => void): void;
    onActivated: { addListener(listener: () => void): void };
    onUpdated: { addListener(listener: () => void): void };
  };
  windows: {
    WINDOW_ID_NONE: number;
    onFocusChanged: { addListener(listener: (windowId: number) => void): void };
  };
  runtime: {
    onInstalled: { addListener(listener: () => void): void };
    onStartup: { addListener(listener: () => void): void };
  };
  storage: {
    local: {
      get(keys: string[] | Record<string, unknown>, callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
}

declare global {
  const chrome: ChromeLikeApi;
}
