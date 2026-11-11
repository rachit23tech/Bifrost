/**
 * Load test for the redirect path (GET /:slug).
 *
 *   npm run bench                     # empty clicks table
 *   npm run bench -- --preload 500000 # link already has 500k recorded clicks
 *   npm run bench -- --bots           # bot user agent: redirect only, no click write
 *
 * Starts the real server as a separate process on a temporary SQLite file, so
 * the load generator and the server do not share an event loop.
 */
import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import autocannon from 'autocannon';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};

const PRELOAD = option('preload', 0);
const DURATION = option('duration', 10);
const CONNECTIONS = option('connections', 50);
const BOTS = flag('bots');
const PORT = 3999;
const SLUG = 'benchme';

const dbFile = path.join(os.tmpdir(), `bifrost-bench-${Date.now()}.db`);
process.env.DB_PATH = dbFile;

// Create the schema, one link, and optionally a history of clicks for it.
const { db, initDatabase } = await import('../server/db/index.js');
initDatabase();
db.prepare(`INSERT INTO links (slug, destination_url, status) VALUES (?, 'https://example.com/', 'active')`).run(SLUG);
if (PRELOAD > 0) {
  const insert = db.prepare(`
    INSERT INTO clicks (link_id, ip_hash, country, device, referrer, clicked_at)
    VALUES (1, ?, 'India', 'Desktop', 'Direct', ?)
  `);
  const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  db.transaction(() => {
    for (let i = 0; i < PRELOAD; i++) insert.run(i.toString(16).padStart(16, '0'), old);
  })();
}
db.close();

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: dbFile },
  stdio: 'ignore'
});

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/api/links/1`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('server did not start');
}

async function cleanup() {
  // Wait for the server process to exit before deleting its database. Windows
  // keeps the file locked until the process is really gone (EPERM otherwise).
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(dbFile + suffix, { force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // A leftover temp file is not worth failing the benchmark over.
    }
  }
}

try {
  await waitForServer();

  // Each request claims a different client IP. Otherwise the per-IP click
  // velocity check would classify the whole test as one bot after 30 requests
  // and stop recording clicks, and we would not be measuring the write path.
  let n = 0;
  const result = await autocannon({
    url: `http://127.0.0.1:${PORT}/${SLUG}`,
    connections: CONNECTIONS,
    duration: DURATION,
    requests: [{
      method: 'GET',
      setupRequest: (req: any) => {
        n++;
        req.headers = {
          'user-agent': BOTS ? 'curl/8.4.0' : 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
          'x-forwarded-for': `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
        };
        return req;
      }
    }]
  });

  const ok = result['3xx'];
  console.log(JSON.stringify({
    scenario: BOTS ? 'redirect only (bot UA, no click write)' : 'redirect + click write',
    preloadedClicks: PRELOAD,
    connections: CONNECTIONS,
    durationSec: DURATION,
    requestsPerSec: Math.round(result.requests.average),
    latencyMs: { p50: result.latency.p50, p97_5: result.latency.p97_5, p99: result.latency.p99 },
    redirects: ok,
    errors: result.errors + result.non2xx - ok
  }, null, 2));
} finally {
  await cleanup();
}
