import { randomUUID } from 'node:crypto';
import { arch, hostname, platform, release } from 'node:os';
import type { DeviceInformation } from '../../shared/contracts';
import { JsonFileStore } from '../storage/json-file-store';

interface DeviceIdentityState {
  identifier?: string;
}

export class DeviceIdentity {
  constructor(
    private readonly store: JsonFileStore<DeviceIdentityState>,
    private readonly appVersion: string,
  ) {}

  async getInformation(): Promise<DeviceInformation> {
    const state = await this.store.read();
    const identifier = state.identifier ?? randomUUID();
    if (!state.identifier) {
      await this.store.write({ identifier });
    }
    return {
      identifier,
      name: hostname(),
      platform: platform(),
      osVersion: release(),
      architecture: arch(),
      appVersion: this.appVersion,
    };
  }
}
