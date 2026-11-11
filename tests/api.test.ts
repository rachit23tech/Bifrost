import './setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import { app } from '../server/app.js';
import { db } from '../server/db/index.js';
import { wsService } from '../server/services/websocket.service.js';
import WebSocket from 'ws';

let server: http.Server;
let base: string;

before(async () => {
  server = http.createServer(app);
  wsService.init(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  },
  body: JSON.stringify(body)
});

async function signup(email: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/signup`, json({ email, password: 'secret123' }));
  assert.equal(res.status, 201);
  return (await res.json()).token;
}

test('create a link, follow it, and the click is recorded without the raw IP', async () => {
  const created = await fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com/page' }));
  assert.equal(created.status, 201);
  const { link } = await created.json();
  assert.match(link.slug, /^[0-9a-zA-Z]{7}$/);
  assert.equal(link.status, 'active');

  const redirect = await fetch(`${base}/${link.slug}`, {
    redirect: 'manual',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' }
  });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://example.com/page');

  const clicks = db.prepare('SELECT ip_hash FROM clicks WHERE link_id = ?').all(link.id) as { ip_hash: string }[];
  assert.equal(clicks.length, 1);
  assert.match(clicks[0].ip_hash, /^[0-9a-f]{16}$/);
});

test('bot traffic is redirected but not counted', async () => {
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com/bot' }))).json();
  const res = await fetch(`${base}/${link.slug}`, { redirect: 'manual', headers: { 'User-Agent': 'curl/8.4.0' } });
  assert.equal(res.status, 302);
  const row = db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE link_id = ?').get(link.id) as { n: number };
  assert.equal(row.n, 0);
});

test('rejects bad destination URLs', async () => {
  for (const destinationUrl of ['javascript:alert(1)', 'not a url', 'https://example.com/' + 'a'.repeat(2100)]) {
    const res = await fetch(`${base}/api/links`, json({ destinationUrl }));
    assert.equal(res.status, 400, destinationUrl.slice(0, 30));
  }
});

test('custom slugs: invalid and reserved are rejected, duplicates conflict', async () => {
  const make = (customSlug: string) =>
    fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com', customSlug }));

  assert.equal((await make('a b')).status, 400);
  assert.equal((await make('api')).status, 400);
  assert.equal((await make('my-docs')).status, 201);
  assert.equal((await make('my-docs')).status, 409);
});

test('a flagged link shows the interstitial instead of redirecting', async () => {
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'https://bit.ly/abc' }))).json();
  assert.equal(link.status, 'flagged');
  const res = await fetch(`${base}/${link.slug}`, { redirect: 'manual' });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /flagged/i);
});

test('a blocked link returns 403', async () => {
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'http://malware-example.com/a.exe' }))).json();
  const res = await fetch(`${base}/${link.slug}`, { redirect: 'manual' });
  assert.equal(res.status, 403);
});

test('analytics for an owned link are visible only to the owner', async () => {
  const owner = await signup('owner@example.com');
  const stranger = await signup('stranger@example.com');
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com/mine' }, owner))).json();

  const auth = (token?: string) => (token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  for (const path of [`/api/analytics/${link.id}`, `/api/analytics/${link.id}/recent-clicks`, `/api/links/${link.id}`]) {
    assert.equal((await fetch(base + path)).status, 403, `anonymous ${path}`);
    assert.equal((await fetch(base + path, auth(stranger))).status, 403, `stranger ${path}`);
    assert.equal((await fetch(base + path, auth(owner))).status, 200, `owner ${path}`);
  }
});

test('deleting a link removes its clicks (foreign keys are enforced)', async () => {
  const owner = await signup('deleter@example.com');
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com/del' }, owner))).json();
  await fetch(`${base}/${link.slug}`, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' } });

  const del = await fetch(`${base}/api/links/${link.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${owner}` } });
  assert.equal(del.status, 200);
  const row = db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE link_id = ?').get(link.id) as { n: number };
  assert.equal(row.n, 0);
});

/** Opens a WebSocket, subscribes to a link, and resolves with the next message after the ack. */
function subscribe(linkId: number, token?: string) {
  const ws = new WebSocket(base.replace('http', 'ws') + '/ws');
  const messages: any[] = [];
  const waiters: Array<(m: any) => void> = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(msg); else messages.push(msg);
  });
  const next = () => new Promise<any>((resolve) => {
    const queued = messages.shift();
    if (queued) resolve(queued); else waiters.push(resolve);
  });
  const opened = new Promise<void>((resolve) => ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'SUBSCRIBE_LINK', linkId, token }));
    resolve();
  }));
  return { ws, next, opened };
}

test('a subscribed dashboard receives live click events', async () => {
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com/live' }))).json();
  const sub = subscribe(link.id);
  await sub.opened;
  assert.equal((await sub.next()).type, 'SUBSCRIBED');

  await fetch(`${base}/${link.slug}`, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120' } });

  const click = await sub.next();
  assert.equal(click.type, 'CLICK_EVENT');
  assert.equal(click.payload.totalClicks, 1);
  assert.match(click.payload.ipHash, /^[0-9a-f]{16}$/);
  const stats = await sub.next();
  assert.equal(stats.type, 'STATS_UPDATE');
  assert.equal(stats.payload.last24hClicks, 1);
  sub.ws.close();
});

test('the live feed of an owned link requires the owner token', async () => {
  const owner = await signup('ws-owner@example.com');
  const { link } = await (await fetch(`${base}/api/links`, json({ destinationUrl: 'https://example.com/private' }, owner))).json();

  const anon = subscribe(link.id);
  await anon.opened;
  assert.equal((await anon.next()).type, 'ERROR');
  anon.ws.close();

  const mine = subscribe(link.id, owner);
  await mine.opened;
  assert.equal((await mine.next()).type, 'SUBSCRIBED');
  mine.ws.close();
});

test('login is rate limited', async () => {
  let last = 0;
  for (let i = 0; i < 12; i++) {
    last = (await fetch(`${base}/api/auth/login`, json({ email: 'nobody@example.com', password: 'wrong-pass' }))).status;
  }
  assert.equal(last, 429);
});
