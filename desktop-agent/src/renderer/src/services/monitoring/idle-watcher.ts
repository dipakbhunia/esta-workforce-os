export type ActivityIdleState = 'ACTIVE' | 'IDLE';

export interface IdleSnapshot {
  capturedAt: string;
  idleSeconds: number;
  state: ActivityIdleState;
}

export class IdleWatcher {
  constructor(private readonly idleThresholdSeconds = 60) {}

  async snapshot(): Promise<IdleSnapshot> {
    const idleSeconds = await window.esta.system.getIdleTimeSeconds();
    return {
      capturedAt: new Date().toISOString(),
      idleSeconds,
      state: idleSeconds >= this.idleThresholdSeconds ? 'IDLE' : 'ACTIVE',
    };
  }
}
