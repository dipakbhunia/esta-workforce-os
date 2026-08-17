export type CommercialSeatSource = 'TRIAL' | 'SUBSCRIPTION' | 'NONE';
export type CommercialSeatStatus = 'ACTIVE' | 'SUSPENDED' | null;
export type SeatCapacityState = 'AVAILABLE' | 'AT_CAPACITY' | 'OVER_LIMIT' | 'NO_ACCESS';

export interface CompanySeatSummary {
  company: {
    id: string;
    name: string;
    slug: string;
    status: 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED';
  };
  commercial: {
    source: CommercialSeatSource;
    referenceId: string | null;
    commercialStatus: CommercialSeatStatus;
    plan: { id: string; code: string; name: string } | null;
    capacity: number | null;
    allocationAllowed: boolean;
  };
  seats: {
    used: number;
    remaining: number | null;
    overBy: number | null;
    utilizationPercent: number | null;
    isOverLimit: boolean | null;
    capacityState: SeatCapacityState;
  };
  asOf: string;
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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface UsageSeatsResponse {
  data: CompanySeatSummary[];
  meta: PaginationMeta;
  summary: UsageSeatsMetrics;
  asOf: string;
}

export interface SeatConsumer {
  id: string;
  employeeCode: string;
  status: 'ACTIVE';
  name: string;
  department: { id: string; name: string } | null;
  designation: { id: string; name: string } | null;
}

export interface CompanySeatDetails extends CompanySeatSummary {
  consumers: {
    data: SeatConsumer[];
    meta: PaginationMeta;
  };
}

export interface UsageSeatsListParams {
  page: number;
  limit: number;
  search?: string;
  source?: CommercialSeatSource;
  commercialStatus?: Exclude<CommercialSeatStatus, null>;
  capacityState?: SeatCapacityState;
  planId?: string;
  overLimit?: boolean;
}
