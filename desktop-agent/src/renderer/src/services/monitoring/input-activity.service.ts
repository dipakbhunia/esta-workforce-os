import type { InputActivitySnapshot } from '@shared/contracts';

export const zeroInputActivitySnapshot = (): InputActivitySnapshot => ({
  keyboardCount: 0,
  mouseClickCount: 0,
  mouseMoveCount: 0,
  scrollCount: 0,
});

export class InputActivityService {
  async start(): Promise<void> {
    await window.esta.inputActivity.start();
    await window.esta.inputActivity.snapshotAndReset();
  }

  async stop(): Promise<void> {
    await window.esta.inputActivity.stop();
  }

  async snapshotAndReset(): Promise<InputActivitySnapshot> {
    try {
      return await window.esta.inputActivity.snapshotAndReset();
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug('[Esta Desktop] Input activity snapshot failed', error);
      }
      return zeroInputActivitySnapshot();
    }
  }
}

