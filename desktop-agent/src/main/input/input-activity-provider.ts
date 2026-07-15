import type { InputActivitySnapshot } from '../../shared/contracts';

export interface InputActivityProvider {
  start(): Promise<void>;
  stop(): Promise<void>;
  snapshotAndReset(): Promise<InputActivitySnapshot>;
}

export const zeroInputActivitySnapshot = (): InputActivitySnapshot => ({
  keyboardCount: 0,
  mouseClickCount: 0,
  mouseMoveCount: 0,
  scrollCount: 0,
});

export function addInputActivitySnapshot(
  target: InputActivitySnapshot,
  source: InputActivitySnapshot,
): void {
  target.keyboardCount += source.keyboardCount;
  target.mouseClickCount += source.mouseClickCount;
  target.mouseMoveCount += source.mouseMoveCount;
  target.scrollCount += source.scrollCount;
}

