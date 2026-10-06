import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertSafeEmailDetailsPath,
  buildMonitoringAlertDetailsPath,
  buildLeaveRequestDetailsPath,
  escapeEmailHtml,
} from './email-content-safety';

describe('email content safety', () => {
  const id = '11111111-1111-4111-8111-111111111111';

  it('escapes hostile HTML once while leaving its plain-text source unchanged', () => {
    const hostile = `<script data-value="a&b" title='x'>alert(1)</script>`;
    assert.equal(
      escapeEmailHtml(hostile),
      '&lt;script data-value=&quot;a&amp;b&quot; title=&#39;x&#39;&gt;alert(1)&lt;/script&gt;',
    );
    assert.match(escapeEmailHtml('&lt;'), /&amp;lt;/);
    assert.equal(hostile, `<script data-value="a&b" title='x'>alert(1)</script>`);
  });

  it('builds and accepts only the canonical Leave request path', () => {
    const path = `/leave/requests/${id}`;
    assert.equal(buildLeaveRequestDetailsPath(id.toUpperCase()), path);
    assert.equal(assertSafeEmailDetailsPath(path), path);
    assert.throws(() => buildLeaveRequestDetailsPath('not-a-uuid'));
    assert.throws(() => assertSafeEmailDetailsPath(`/leave/requests/${id}/edit`));
  });

  it('builds and accepts only the canonical Monitoring alert path', () => {
    const path = `/monitoring/alerts/${id}`;
    assert.equal(buildMonitoringAlertDetailsPath(id.toUpperCase()), path);
    assert.equal(assertSafeEmailDetailsPath(path), path);
  });

  it('rejects malformed identifiers and unsafe path forms', () => {
    assert.throws(() => buildMonitoringAlertDetailsPath('not-a-uuid'));
    for (const value of [
      `https://example.test/monitoring/alerts/${id}`,
      `//example.test/${id}`,
      'javascript:alert(1)',
      'data:text/html,test',
      `/monitoring/alerts/${id}?next=https://example.test`,
      `/monitoring/alerts/${id}#fragment`,
      `/monitoring\\alerts\\${id}`,
      `/monitoring/alerts/../${id}`,
      `/monitoring/alerts/%2e%2e%2f${id}`,
      `/users/${id}`,
    ]) assert.throws(() => assertSafeEmailDetailsPath(value));
  });
});
