import type { InputActivityProvider } from './input-activity-provider';
import { zeroInputActivitySnapshot } from './input-activity-provider';

export class UnsupportedInputActivityProvider implements InputActivityProvider {
  async start(): Promise<void> {
    // TODO: Add macOS/Linux numeric input counters through approved native APIs.
  }

  async stop(): Promise<void> {
    // Unsupported platforms intentionally report zero counters.
  }

  async snapshotAndReset() {
    return zeroInputActivitySnapshot();
  }
}

