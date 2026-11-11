import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase } from '../server/db/index.js';
import { abuseEngine } from '../server/services/abuse.service.js';

initDatabase();

const signalTypes = (url: string) => abuseEngine.evaluateCreation(url).signals.map((s) => s.type);

test('a clean URL scores 0 and is active', () => {
  const result = abuseEngine.evaluateCreation('https://github.com/facebook/react');
  assert.equal(result.score, 0);
  assert.equal(result.status, 'active');
});

test('an @ in the path or query is not treated as credential obfuscation', () => {
  for (const url of [
    'https://medium.com/@someone/a-post-123',
    'https://www.google.com/maps/@18.5204,73.8567,12z',
    'https://example.com/share?email=a@b.com'
  ]) {
    const result = abuseEngine.evaluateCreation(url);
    assert.equal(result.status, 'active', url);
    assert.deepEqual(result.signals, [], url);
  }
});

test('userinfo before the host is flagged', () => {
  const result = abuseEngine.evaluateCreation('https://paypal.com@evil.example/login');
  assert.ok(result.signals.some((s) => s.type === 'userinfo_obscuration'));
  assert.equal(result.status, 'flagged');
});

test('non-web schemes are blocked', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd']) {
    const result = abuseEngine.evaluateCreation(url);
    assert.equal(result.status, 'blocked', url);
    assert.deepEqual(result.signals.map((s) => s.type), ['unsupported_scheme'], url);
  }
});

test('an unparseable URL is blocked', () => {
  assert.equal(abuseEngine.evaluateCreation('not a url').status, 'blocked');
});

test('IP-literal host is flagged', () => {
  const result = abuseEngine.evaluateCreation('http://192.168.1.50/admin');
  assert.deepEqual(signalTypes('http://192.168.1.50/admin'), ['ip_literal_url']);
  assert.equal(result.status, 'flagged');
});

test('shortener chaining is flagged', () => {
  assert.equal(abuseEngine.evaluateCreation('https://bit.ly/abc').status, 'flagged');
});

test('blocklisted domain, including subdomains, is blocked', () => {
  assert.equal(abuseEngine.evaluateCreation('http://malware-example.com/x').status, 'blocked');
  assert.equal(abuseEngine.evaluateCreation('http://cdn.malware-example.com/x').status, 'blocked');
});

test('signals add up and the score is capped at 100', () => {
  const result = abuseEngine.evaluateCreation('http://malware-example.com/payload.exe');
  assert.deepEqual(result.signals.map((s) => s.type), ['blocklisted_domain', 'executable_file_download']);
  assert.equal(result.score, 100);
});

test('bot user agents are detected at click time', () => {
  assert.equal(abuseEngine.evaluateClick(1, 'curl/8.4.0', 'abc').isBot, true);
  assert.equal(abuseEngine.evaluateClick(1, 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', 'abc').isBot, false);
});
