import type { DeviceInformation } from '@shared/contracts';
import type { RegisteredDevice } from '../../types/api';
import { apiClient } from './api-client';

export interface DeviceState {
  information: DeviceInformation;
  registration: RegisteredDevice;
}

export const deviceService = {
  async register(): Promise<DeviceState> {
    const information = await window.esta.device.getInformation();
    const registration = await apiClient.request<RegisteredDevice>(
      '/monitoring/devices/register',
      {
        method: 'POST',
        body: JSON.stringify({
          deviceIdentifier: information.identifier,
          deviceName: information.name,
          platform: information.platform,
          osVersion: information.osVersion,
          appVersion: information.appVersion,
        }),
      },
    );
    return { information, registration };
  },
};
