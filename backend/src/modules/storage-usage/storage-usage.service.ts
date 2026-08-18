import { Injectable } from '@nestjs/common';
import {
  CommercialStorageSource,
  CompanyStorageSummary,
  StorageCalculation,
  StorageCapacityState,
  StorageMeasurementState,
  StorageUsageRecord,
} from './storage-usage.types';

@Injectable()
export class StorageUsageService {
  calculate(input: {
    source: CommercialStorageSource;
    measuredStorageBytes: string;
    unmeasuredObjectCount: number;
    configuredLimitBytes: string | null;
  }): StorageCalculation {
    const measured = this.parseBytes(
      input.measuredStorageBytes,
      'Measured storage',
    );
    const configuredLimit = input.configuredLimitBytes === null
      ? null
      : this.parseBytes(input.configuredLimitBytes, 'Configured storage limit');
    const measurementState = input.unmeasuredObjectCount > 0
      ? StorageMeasurementState.UNMEASURABLE
      : StorageMeasurementState.MEASURED;

    if (input.source === CommercialStorageSource.NONE) {
      return {
        measuredStorageBytes: measured.toString(),
        measurementState,
        configuredLimitBytes: null,
        remainingBytes: null,
        overByBytes: null,
        utilizationPercent: null,
        capacityState: StorageCapacityState.NO_ACCESS,
      };
    }

    if (measurementState === StorageMeasurementState.UNMEASURABLE) {
      return {
        measuredStorageBytes: measured.toString(),
        measurementState,
        configuredLimitBytes: configuredLimit?.toString() ?? null,
        remainingBytes: null,
        overByBytes: null,
        utilizationPercent: null,
        capacityState: StorageCapacityState.UNMEASURABLE,
      };
    }

    if (configuredLimit === null) {
      return {
        measuredStorageBytes: measured.toString(),
        measurementState,
        configuredLimitBytes: null,
        remainingBytes: null,
        overByBytes: null,
        utilizationPercent: null,
        capacityState: StorageCapacityState.UNCONFIGURED,
      };
    }

    const capacityState = measured < configuredLimit
      ? StorageCapacityState.AVAILABLE
      : measured === configuredLimit
        ? StorageCapacityState.AT_LIMIT
        : StorageCapacityState.OVER_LIMIT;

    return {
      measuredStorageBytes: measured.toString(),
      measurementState,
      configuredLimitBytes: configuredLimit.toString(),
      remainingBytes: (measured < configuredLimit
        ? configuredLimit - measured
        : 0n).toString(),
      overByBytes: (measured > configuredLimit
        ? measured - configuredLimit
        : 0n).toString(),
      utilizationPercent: configuredLimit === 0n
        ? null
        : this.percentage(measured, configuredLimit),
      capacityState,
    };
  }

  toCompanySummary(
    record: StorageUsageRecord,
    calculatedAt: Date,
  ): CompanyStorageSummary {
    const calculation = this.calculate({
      source: record.source,
      measuredStorageBytes: record.measuredStorageBytes,
      unmeasuredObjectCount: record.unmeasuredObjectCount,
      configuredLimitBytes: record.configuredLimitBytes,
    });

    return {
      company: {
        id: record.companyId,
        name: record.companyName,
        slug: record.companySlug,
        status: record.companyStatus,
      },
      commercial: {
        source: record.source,
        referenceId: record.referenceId,
        commercialStatus: record.commercialStatus,
        plan: record.planId && record.planCode && record.planName
          ? {
              id: record.planId,
              code: record.planCode,
              name: record.planName,
            }
          : null,
      },
      storage: {
        ...calculation,
        measuredObjectCount: record.measuredObjectCount,
        unmeasuredObjectCount: record.unmeasuredObjectCount,
        allocationAllowed: record.allocationAllowed,
        earliestScreenshotAt:
          record.earliestScreenshotAt?.toISOString() ?? null,
        latestScreenshotAt:
          record.latestScreenshotAt?.toISOString() ?? null,
        calculatedAt: calculatedAt.toISOString(),
      },
    };
  }

  private parseBytes(value: string, field: string): bigint {
    if (!/^\d+$/.test(value)) {
      throw new TypeError(`${field} must be a non-negative decimal string`);
    }
    return BigInt(value);
  }

  private percentage(part: bigint, total: bigint): string {
    const numerator = part * 10_000n;
    const quotient = numerator / total;
    const remainder = numerator % total;
    const rounded = remainder * 2n >= total ? quotient + 1n : quotient;
    const whole = rounded / 100n;
    const fraction = String(rounded % 100n).padStart(2, '0').replace(/0+$/, '');
    return fraction ? `${whole}.${fraction}` : whole.toString();
  }
}
