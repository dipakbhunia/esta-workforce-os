import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeHostnameFromUrl } from '../shared/hostname.js';

test('accepts and normalizes public hostnames from URLs', () => {
  assert.equal(normalizeHostnameFromUrl('https://github.com/openai'), 'github.com');
  assert.equal(normalizeHostnameFromUrl('https://chatgpt.com/'), 'chatgpt.com');
  assert.equal(normalizeHostnameFromUrl('https://docs.google.com/document/d/123'), 'docs.google.com');
  assert.equal(normalizeHostnameFromUrl('https://subdomain.example.co.in/a?b=c#hash'), 'subdomain.example.co.in');
  assert.equal(normalizeHostnameFromUrl('www.github.com/path'), 'github.com');
});

test('rejects browser-internal, local, extension, and invalid URLs', () => {
  assert.equal(normalizeHostnameFromUrl('chrome://settings'), null);
  assert.equal(normalizeHostnameFromUrl('edge://extensions'), null);
  assert.equal(normalizeHostnameFromUrl('brave://settings'), null);
  assert.equal(normalizeHostnameFromUrl('opera://settings'), null);
  assert.equal(normalizeHostnameFromUrl('about:blank'), null);
  assert.equal(normalizeHostnameFromUrl('file:///C:/test.html'), null);
  assert.equal(normalizeHostnameFromUrl('view-source:https://github.com'), null);
  assert.equal(normalizeHostnameFromUrl('chrome-extension://abc/options.html'), null);
  assert.equal(normalizeHostnameFromUrl('http://localhost:3000'), null);
  assert.equal(normalizeHostnameFromUrl('http://127.0.0.1:3000'), null);
  assert.equal(normalizeHostnameFromUrl('not a host'), null);
});

test('rejects credentials and strips paths, queries, and fragments', () => {
  assert.equal(normalizeHostnameFromUrl('https://user:pass@github.com/private'), null);
  assert.equal(normalizeHostnameFromUrl('https://docs.google.com/document/d/123?token=abc#section'), 'docs.google.com');
});
