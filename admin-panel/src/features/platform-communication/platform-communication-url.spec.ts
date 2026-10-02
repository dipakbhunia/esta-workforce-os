import { describe,expect,it } from 'vitest';
import { localDateTimeToIso,parseEmailDeliveryUrl,serializeEmailDeliveryUrl,validDateRange } from './platform-communication-url';
describe('email delivery URL state',()=>{
 it('hydrates supported values and preserves unrelated parameters',()=>{const p=new URLSearchParams('page=2&limit=50&status=FAILED&recipient=OPS%40EXAMPLE.COM&eventType=ALERT_OPENED&keep=yes');const r=parseEmailDeliveryUrl(p);expect(r.query).toMatchObject({page:2,limit:50,status:'FAILED',recipient:'ops@example.com',eventType:'ALERT_OPENED'});expect(r.normalized.get('keep')).toBe('yes')});
 it('normalizes malformed values and reversed ranges',()=>{const r=parseEmailDeliveryUrl(new URLSearchParams('page=x&limit=7&companyId=no&recipient=no&from=2026-01-02T00%3A00%3A00.000Z&to=2026-01-01T00%3A00%3A00.000Z'));expect(r.query).toEqual({page:1,limit:20});expect(r.shouldNormalize).toBe(true)});
 it('supports independent canonical from and to boundaries',()=>{const from='2026-01-01T00:00:00.000Z',to='2026-02-01T00:00:00.000Z';expect(parseEmailDeliveryUrl(new URLSearchParams({from})).query).toMatchObject({from});expect(parseEmailDeliveryUrl(new URLSearchParams({to})).query).toMatchObject({to})});
 it.each([
  ['2026-10-01T12:00:00+05:30','2026-10-01T06:30:00.000Z'],
  ['2026-10-01T12:00:00-04:00','2026-10-01T16:00:00.000Z'],
  ['2026-10-01T12:00:00Z','2026-10-01T12:00:00.000Z'],
  ['2026-10-01T12:00:00.12Z','2026-10-01T12:00:00.120Z'],
 ])('normalizes valid offset instant %s', (input, expected)=>expect(parseEmailDeliveryUrl(new URLSearchParams({from:input})).query.from).toBe(expected));
 it('retains a valid ordered pair and removes equal ranges',()=>{const from='2026-01-01T00:00:00Z',to='2026-01-02T00:00:00Z';expect(parseEmailDeliveryUrl(new URLSearchParams({from,to})).query).toMatchObject({from:'2026-01-01T00:00:00.000Z',to:'2026-01-02T00:00:00.000Z'});expect(parseEmailDeliveryUrl(new URLSearchParams({from,to:from})).query).toEqual({page:1,limit:20})});
 it.each(['2025-02-29T10:00:00Z','2026-13-01T00:00:00Z','2026-01-01T24:00:00Z','bad'])('rejects malformed or impossible instant %s',value=>expect(parseEmailDeliveryUrl(new URLSearchParams({from:value})).query.from).toBeUndefined());
 it('rejects impossible local times and invalid ranges',()=>{expect(localDateTimeToIso('2025-02-29T10:00')).toBeNull();expect(validDateRange('2026-02-01T10:00','2026-02-01T09:00')).toBe(false)});
 it('normalizes invalid UUID and email without losing unrelated params',()=>{const r=parseEmailDeliveryUrl(new URLSearchParams('companyId=no&recipient=no&keep=yes'));expect(r.query).toEqual({page:1,limit:20});expect(r.normalized.get('keep')).toBe('yes')});
 it('resets owned fields without removing unrelated state',()=>{const p=serializeEmailDeliveryUrl({page:1,limit:20},new URLSearchParams('status=FAILED&keep=yes'));expect(p.toString()).toContain('keep=yes');expect(p.has('status')).toBe(false)});
});
