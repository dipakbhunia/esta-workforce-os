import type { GstJurisdiction, GstPolicyQuery, GstPolicyStatus, GstTaxTreatment, GstTransactionQuery } from './platform-gst.types';
export const GST_DEFAULT_LIMIT = 20;
const owned = ['page', 'limit', 'companyId', 'treatment', 'jurisdiction', 'currency', 'policyVersionId', 'from', 'to'] as const;
const policyOwned = ['policyPage', 'policyLimit', 'policyStatus', 'policyCurrency', 'policyEffectiveAt'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export function parseGstUrl(input: URLSearchParams) {
  const page = integer(input.get('page')) ?? 1; const requested = integer(input.get('limit')); const limit = [10, 20, 50, 100].includes(requested ?? 0) ? requested! : GST_DEFAULT_LIMIT;
  const query: GstTransactionQuery = { page, limit };
  const companyId = input.get('companyId'); const policyVersionId = input.get('policyVersionId');
  if (companyId && uuid.test(companyId)) query.companyId = companyId;
  if (policyVersionId && uuid.test(policyVersionId)) query.policyVersionId = policyVersionId;
  const treatment = input.get('treatment'); if (treatment === 'TAXABLE' || treatment === 'NON_TAXABLE') query.treatment = treatment as GstTaxTreatment;
  const jurisdiction = input.get('jurisdiction'); if (jurisdiction === 'INTRA_STATE' || jurisdiction === 'INTER_STATE') query.jurisdiction = jurisdiction as GstJurisdiction;
  if (input.get('currency') === 'INR') query.currency = 'INR';
  const from = instant(input.get('from')); const to = instant(input.get('to')); if (from && to && from < to) Object.assign(query, { from, to });
  const normalized = serializeGstUrl(query, input); return { query, normalized, shouldNormalize: normalized.toString() !== input.toString() };
}
export function serializeGstUrl(query: GstTransactionQuery, current = new URLSearchParams()) { const output = new URLSearchParams(current); owned.forEach(key => output.delete(key)); output.set('page', String(query.page)); output.set('limit', String(query.limit)); owned.slice(2).forEach(key => { const value = query[key]; if (value) output.set(key, String(value)); }); return output; }
export function localToIso(value: string) { const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value); if(!match)return null; const [year,month,day,hour,minute]=match.slice(1,6).map(Number); const second=match[6]?Number(match[6]):0; const date=new Date(year,month-1,day,hour,minute,second,0); if([date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours(),date.getMinutes(),date.getSeconds()].some((part,index)=>part!==[year,month,day,hour,minute,second][index]))return null; return date.toISOString(); }
export function isoToLocal(value?: string) { if (!value) return ''; const date = new Date(value); if (!Number.isFinite(date.getTime())) return ''; const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
export function validDateRange(from: string, to: string) { if (!from && !to) return true; const a = localToIso(from); const b = localToIso(to); return Boolean(a && b && a < b); }
export function parseGstPolicyUrl(input: URLSearchParams) { const page=integer(input.get('policyPage'))??1; const requested=integer(input.get('policyLimit')); const limit=[10,20,50,100].includes(requested??0)?requested!:GST_DEFAULT_LIMIT; const query:GstPolicyQuery={page,limit}; const status=input.get('policyStatus'); if(status==='DRAFT'||status==='ACTIVE'||status==='RETIRED')query.status=status as GstPolicyStatus; if(input.get('policyCurrency')==='INR')query.currency='INR'; const effectiveAt=instant(input.get('policyEffectiveAt')); if(effectiveAt)query.effectiveAt=effectiveAt; const normalized=serializeGstPolicyUrl(query,input); return {query,normalized,shouldNormalize:normalized.toString()!==input.toString()}; }
export function serializeGstPolicyUrl(query:GstPolicyQuery,current=new URLSearchParams()){const output=new URLSearchParams(current);policyOwned.forEach(key=>output.delete(key));output.set('policyPage',String(query.page));output.set('policyLimit',String(query.limit));if(query.status)output.set('policyStatus',query.status);if(query.currency)output.set('policyCurrency',query.currency);if(query.effectiveAt)output.set('policyEffectiveAt',query.effectiveAt);return output;}
function integer(value: string | null) { if (!value || !/^\d+$/.test(value)) return null; const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null; }
function instant(value: string | null) { if (!value || !iso.test(value)) return null; const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : null; }
