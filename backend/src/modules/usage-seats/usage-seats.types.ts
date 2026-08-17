import {
  CompanyStatus,
  EmployeeStatus,
  SubscriptionStatus,
  TrialStatus,
} from '@prisma/client';

export enum CommercialSeatSource {
  TRIAL = 'TRIAL',
  SUBSCRIPTION = 'SUBSCRIPTION',
  NONE = 'NONE',
}

export enum SeatCapacityState {
  AVAILABLE = 'AVAILABLE',
  AT_CAPACITY = 'AT_CAPACITY',
  OVER_LIMIT = 'OVER_LIMIT',
  NO_ACCESS = 'NO_ACCESS',
}

export interface CommercialSeatAccess {
  source: CommercialSeatSource;
  referenceId: string | null;
  commercialStatus: TrialStatus | SubscriptionStatus | null;
  plan: { id: string; code: string; name: string } | null;
  capacity: number | null;
  allocationAllowed: boolean;
}

export interface SeatCalculation {
  used: number;
  remaining: number | null;
  overBy: number | null;
  utilizationPercent: number | null;
  isOverLimit: boolean | null;
  capacityState: SeatCapacityState;
}

export interface CompanySeatSummary {
  company: {
    id: string;
    name: string;
    slug: string;
    status: CompanyStatus;
  };
  commercial: CommercialSeatAccess;
  seats: SeatCalculation;
  asOf: string;
}

export interface SeatConsumer {
  id: string;
  employeeCode: string;
  status: EmployeeStatus;
  name: string;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
}

export interface UsageSeatsMetrics {
  scope: 'ALL_COMPANIES' | 'FILTERED';
  effectiveTrialCompanies: number;
  activeSubscriptionCompanies: number;
  suspendedSubscriptionCompanies: number;
  noCommercialAccessCompanies: number;
  atCapacityCompanies: number;
  overLimitCompanies: number;
  totalTrialAllowance: number;
  totalSubscriptionCapacity: number;
  currentUsedWorkforceSeats: number;
}
