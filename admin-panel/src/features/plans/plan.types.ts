export type PlanStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type PlanBillingModel = 'PER_USER' | 'CUSTOM';
export interface Plan { id: string; code: string; name: string; description: string | null; status: PlanStatus; billingModel: PlanBillingModel; monthlyPricePerSeatMinor: number | null; currency: string; minSeats: number | null; maxSeats: number | null; sortOrder: number; isPublic: boolean; isRecommended: boolean; entitlements: string[]; limits: Record<string, number>; createdAt: string; updatedAt: string; archivedAt: string | null }
export interface PlanPayload { code: string; name: string; description: string | null; billingModel: PlanBillingModel; monthlyPricePerSeatMinor: number | null; currency: string; minSeats: number | null; maxSeats: number | null; sortOrder: number; isPublic: boolean; isRecommended: boolean; entitlements: string[]; limits: Record<string, number> }
export interface PaginatedPlans { data: Plan[]; meta: { page: number; limit: number; total: number; totalPages: number } }
export type EntitlementAvailability = 'AVAILABLE' | 'COMING_SOON';
export interface EntitlementCatalogItem { key: string; name: string; group: string; description: string; availability: EntitlementAvailability; assignable: boolean; trialEligible: boolean; sortOrder: number }
