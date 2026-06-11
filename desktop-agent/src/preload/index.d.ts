import type { EstaDesktopApi } from '../shared/contracts';

declare global {
  interface Window {
    esta: EstaDesktopApi;
  }
}

export {};
