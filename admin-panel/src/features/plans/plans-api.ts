import { http } from '@/services/http';
import type { EntitlementCatalogItem, PaginatedPlans, Plan, PlanPayload, PlanStatus } from './plan.types';
export const getEntitlementCatalog = () => http.get<EntitlementCatalogItem[]>('/plans/entitlement-catalog');
export const getPlans = (params: { page: number; limit: number; search?: string; status?: PlanStatus; isPublic?: boolean }) => http.get<PaginatedPlans>('/plans', { params });
export const getPlan = (id: string) => http.get<Plan>(`/plans/${id}`);
export const createPlan = (payload: PlanPayload) => http.post<Plan>('/plans', payload);
export const updatePlan = (id: string, payload: Partial<PlanPayload>) => http.patch<Plan>(`/plans/${id}`, payload);
export const updatePlanStatus = (id: string, status: PlanStatus) => http.patch<Plan>(`/plans/${id}/status`, { status });
