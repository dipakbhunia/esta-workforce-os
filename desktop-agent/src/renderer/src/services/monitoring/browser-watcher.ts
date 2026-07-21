import type { ForegroundWindowMetadata } from '@shared/contracts';
import { BrowserProviderRegistry, type BrowserProvider, type BrowserTab } from './browser-providers';

const extensionStateFreshMs = 2 * 60 * 1000;

export interface BrowserMetadata {
  isBrowser: boolean;
  browserName?: string;
  url?: string;
  domain?: string;
  title?: string;
  providerAvailable: boolean;
  urlAvailable: boolean;
  lookupStatus?: string;
  source?: 'extension' | 'ui_automation' | 'provider';
}

export class BrowserWatcher {
  private readonly registry = new BrowserProviderRegistry();

  async detect(snapshot: ForegroundWindowMetadata): Promise<BrowserMetadata> {
    const provider = this.registry.match(snapshot);
    if (!provider) {
      return { isBrowser: false, providerAvailable: false, urlAvailable: false };
    }

    const extensionState = await this.getExtensionState(provider);
    if (extensionState) {
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Browser hostname resolved from extension bridge', {
          browserName: provider.browserName,
          hostname: extensionState.hostname,
          observedAt: extensionState.observedAt,
        });
      }
      return {
        isBrowser: true,
        browserName: provider.browserName,
        title: snapshot.windowTitle ?? undefined,
        domain: extensionState.hostname,
        providerAvailable: true,
        urlAvailable: true,
        lookupStatus: 'extension_hostname_resolved',
        source: 'extension',
      };
    }

    const foregroundDomain = normalizeHostname(snapshot.browserDomain);
    if (import.meta.env.DEV) {
      console.debug('[Esta Desktop] Browser matched', {
        browserName: snapshot.browserName ?? provider.browserName,
        processName: snapshot.processName,
        executableName: snapshot.executableName,
        lookupStatus: snapshot.browserLookupStatus ?? 'provider_lookup_pending',
        hostname: foregroundDomain,
        urlAvailable: Boolean(snapshot.browserUrlAvailable && foregroundDomain),
      });
    }
    if (snapshot.browserUrlAvailable && foregroundDomain) {
      return {
        isBrowser: true,
        browserName: snapshot.browserName ?? provider.browserName,
        title: snapshot.browserWindowTitle ?? snapshot.windowTitle ?? undefined,
        domain: foregroundDomain,
        providerAvailable: snapshot.browserProviderAvailable === true,
        urlAvailable: true,
        lookupStatus: snapshot.browserLookupStatus ?? 'hostname_resolved',
        source: 'ui_automation',
      };
    }

    const activeTab = await this.getActiveTab(provider);
    const urlAvailable = Boolean(activeTab?.url && activeTab.domain);
    if (import.meta.env.DEV && !urlAvailable) {
      console.debug('[Esta Desktop] Browser hostname unavailable', {
        browserName: snapshot.browserName ?? provider.browserName,
        processName: snapshot.processName,
        executableName: snapshot.executableName,
        lookupStatus: snapshot.browserLookupStatus ?? 'provider_unavailable',
      });
    }
    return {
      isBrowser: true,
      browserName: activeTab?.browserName ?? provider.browserName,
      title: activeTab?.title ?? snapshot.windowTitle ?? undefined,
      url: activeTab?.url,
      domain: activeTab?.domain,
      providerAvailable: await provider.isAvailable(),
      urlAvailable,
      lookupStatus: snapshot.browserLookupStatus ?? (urlAvailable ? 'hostname_resolved' : 'hostname_unavailable'),
      source: urlAvailable ? 'provider' : undefined,
    };
  }

  private async getActiveTab(provider: BrowserProvider): Promise<BrowserTab | null> {
    if (!(await provider.isAvailable())) return null;
    // Providers are registered for future extension/native integration only.
    // No scraping, unsupported browser automation, or fake URLs are used.
    return provider.getActiveTab();
  }

  private async getExtensionState(provider: BrowserProvider) {
    const state = await window.esta.browserBridge.getLatestState();
    if (!state) return null;
    if (Date.now() - new Date(state.observedAt).getTime() > extensionStateFreshMs) {
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Extension hostname ignored in renderer because it is stale', {
          browser: state.browser,
          hostname: state.hostname,
          observedAt: state.observedAt,
        });
      }
      return null;
    }
    return provider.extensionBrowserKeys.includes(state.browser) ? state : null;
  }
}

function normalizeHostname(value?: string | null): string | undefined {
  const hostname = value?.trim().toLowerCase().replace(/\.$/, '');
  if (!hostname) return undefined;
  const withoutWww = hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(withoutWww)
    ? withoutWww
    : undefined;
}
