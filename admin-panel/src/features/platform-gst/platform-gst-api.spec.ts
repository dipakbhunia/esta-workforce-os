import { beforeEach, describe, expect, it, vi } from 'vitest';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get, post } }));
import * as api from './platform-gst-api';
describe('platform GST API', () => {
  beforeEach(() => { get.mockReset().mockResolvedValue({data:{}}); post.mockReset().mockResolvedValue({data:{}}); });
  it('uses exact GST-B endpoints and omits empty query values', async () => { await api.listGstTransactions({page:1,limit:20,currency:'',companyId:undefined}); await api.listGstPolicies({page:2,limit:10,status:'ACTIVE'}); await api.getGstTransaction('e'); await api.getGstPolicy('p'); expect(get).toHaveBeenNthCalledWith(1,'/platform/gst/transactions',{params:{page:1,limit:20}}); expect(get).toHaveBeenNthCalledWith(2,'/platform/gst/policies',{params:{page:2,limit:10,status:'ACTIVE'}}); expect(get).toHaveBeenNthCalledWith(3,'/platform/gst/transactions/e'); expect(get).toHaveBeenNthCalledWith(4,'/platform/gst/policies/p'); });
  it('passes the exact policy payload without adding a rate or enablement field', async () => { const request={policyCode:'GST_ZERO',status:'DRAFT' as const,currency:'INR' as const,treatment:'NON_TAXABLE' as const,totalRateBasisPoints:0,cgstRateBasisPoints:0,sgstRateBasisPoints:0,igstRateBasisPoints:0,effectiveFrom:'2090-01-01T00:00:00.000Z'}; await api.createGstPolicy(request); expect(post).toHaveBeenCalledWith('/platform/gst/policies',request); expect(post.mock.calls[0][1]).not.toHaveProperty('gstEnabled'); });
});
