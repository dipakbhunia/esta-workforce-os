import type { ForegroundWindowMetadata } from '@shared/contracts';
import { BrowserProviderRegistry, type BrowserProvider, type BrowserTab } from './browser-providers';

export interface BrowserMetadata {
  isBrowser: boolean;
  browserName?: string;
  url?: string;
  domain?: string;
  title?: string;
  providerAvailable: boolean;
  urlAvailable: boolean;
}

export class BrowserWatcher {
  private readonly registry = new BrowserProviderRegistry();

  async detect(snapshot: ForegroundWindowMetadata): Promise<BrowserMetadata> {
    const provider = this.registry.match(snapshot);
    if (!provider) {
      return { isBrowser: false, providerAvailable: false, urlAvailable: false };
    }

    const activeTab = await this.getActiveTab(provider);
    const urlAvailable = Boolean(activeTab?.url && activeTab.domain);
    return {
      isBrowser: true,
      browserName: activeTab?.browserName ?? provider.browserName,
      title: activeTab?.title ?? snapshot.windowTitle ?? undefined,
      url: activeTab?.url,
      domain: activeTab?.domain,
      providerAvailable: await provider.isAvailable(),
      urlAvailable,
    };
  }

  private async getActiveTab(provider: BrowserProvider): Promise<BrowserTab | null> {
    if (!(await provider.isAvailable())) return null;
    // Providers are registered for future extension/native integration only.
    // No scraping, unsupported browser automation, or fake URLs are used.
    return provider.getActiveTab();
  }
}
