export type GstPolicyStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type GstTaxTreatment = 'TAXABLE' | 'NON_TAXABLE';
export type GstJurisdiction = 'INTRA_STATE' | 'INTER_STATE';

export interface PageMeta { page: number; limit: number; total: number; totalPages: number }
export interface PageResponse<T> { data: T[]; meta: PageMeta }

export interface GstPolicy {
  id: string; policyCode: string; version: number; status: GstPolicyStatus; currency: string;
  treatment: GstTaxTreatment; effectiveFrom: string; effectiveUntil: string | null;
  totalRateBasisPoints: number; cgstRateBasisPoints: number; sgstRateBasisPoints: number;
  igstRateBasisPoints: number; serviceClassification: string | null; roundingMode: string;
  calculationVersion: number; createdByUserId: string; createdAt: string; updatedAt: string;
}
export interface GstPolicyQuery { page: number; limit: number; status?: GstPolicyStatus; currency?: string; effectiveAt?: string }
export interface CreateGstPolicyRequest {
  policyCode: string; status: Exclude<GstPolicyStatus, 'RETIRED'>; currency: 'INR'; treatment: GstTaxTreatment;
  totalRateBasisPoints: number; cgstRateBasisPoints: number; sgstRateBasisPoints: number; igstRateBasisPoints: number;
  serviceClassification?: string; effectiveFrom: string; effectiveUntil?: string;
}
export interface GstComponent { type: 'CGST' | 'SGST' | 'IGST'; rateBasisPoints: number; taxableAmountMinor: string; taxAmountMinor: string; currency: string }
export interface GstEvidence {
  id: string; paymentId: string; companyId: string; sourceSubscriptionId: string; policyVersionId: string;
  treatment: GstTaxTreatment; calculationVersion: number; decisionAt: string; currency: string;
  taxableSubtotalMinor: string; totalTaxMinor: string; grossTotalMinor: string;
  jurisdictionClassification: GstJurisdiction; serviceClassification: string | null; roundingMode: string;
  sellerGstin: string | null; sellerLegalName: string; sellerRegisteredState: string | null; sellerRegisteredStateCode: string | null;
  buyerRegistrationStatus: string; buyerGstin: string | null; buyerBillingState: string | null; buyerBillingStateCode: string | null;
  placeOfSupplyState: string | null; placeOfSupplyStateCode: string | null; createdAt: string;
  company: { id: string; name: string }; policyVersion: { policyCode: string; version: number };
  components: GstComponent[];
  invoiceEvidence: null | { invoiceId: string; policyCode: string; policyVersion: number; taxableSubtotalMinor: string; totalTaxMinor: string; grossTotalMinor: string; createdAt: string };
}
export interface GstTransactionQuery { page: number; limit: number; companyId?: string; treatment?: GstTaxTreatment; jurisdiction?: GstJurisdiction; currency?: string; policyVersionId?: string; from?: string; to?: string }
