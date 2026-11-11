import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugService, validateCustomSlug } from '../server/services/slug.service.js';
import { hashIp } from '../server/utils/ip.js';
import { rateLimit } from '../server/middleware/rateLimit.js';

test('generated slugs are 7 base62 characters and do not repeat', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const slug = slugService.generateSlug();
    assert.match(slug, /^[0-9a-zA-Z]{7}$/);
    seen.add(slug);
  }
  assert.equal(seen.size, 1000);
});

test('custom slug validation', () => {
  assert.equal(validateCustomSlug('my-link_1'), null);
  assert.ok(validateCustomSlug('ab'), 'too short');
  assert.ok(validateCustomSlug('a'.repeat(33)), 'too long');
  assert.ok(validateCustomSlug('has space'));
  assert.ok(validateCustomSlug('../etc'));
  assert.ok(validateCustomSlug('api'), 'reserved');
  assert.ok(validateCustomSlug('API'), 'reserved, any case');
});

test('hashIp is stable, hides the address, and separates different IPs', () => {
  const a = hashIp('203.0.113.7');
  assert.equal(a, hashIp('203.0.113.7'));
  assert.notEqual(a, hashIp('203.0.113.8'));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.ok(!a.includes('203'));
});

// Minimal stand-ins for Express's req/res, enough for the limiter.
function call(limiter: ReturnType<typeof rateLimit>, ip: string) {
  const headers: Record<string, string> = {};
  let status = 200;
  let passed = false;
  const res: any = {
    setHeader: (k: string, v: string) => { headers[k] = v; },
    status: (code: number) => { status = code; return res; },
    json: () => res
  };
  limiter({ ip } as any, res, () => { passed = true; });
  return { status, passed, headers };
}

test('rate limiter allows max requests per window, then returns 429', () => {
  let now = 0;
  const limiter = rateLimit({ windowMs: 1000, max: 3, now: () => now });

  for (let i = 0; i < 3; i++) assert.equal(call(limiter, '1.1.1.1').passed, true);

  const blocked = call(limiter, '1.1.1.1');
  assert.equal(blocked.passed, false);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers['Retry-After'], '1');

  // A different client has its own budget.
  assert.equal(call(limiter, '2.2.2.2').passed, true);

  // After the window ends the first client is allowed again.
  now = 1000;
  assert.equal(call(limiter, '1.1.1.1').passed, true);
});
