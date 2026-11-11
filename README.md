# Bifrost — URL Shortener with Abuse Detection & Live Analytics

A URL shortening platform with a **rule-based abuse detection engine** (weighted risk scoring 0–100) and a **real-time click analytics dashboard** powered by WebSockets.

## Features

- **Abuse Detection Engine** — Every link is evaluated against 7 weighted rule-based signals at creation time. Links are auto-allowed (score 0–30), flagged with a warning interstitial (30–70), or auto-blocked (70+).
- **Real-Time Analytics** — Click events push live to the dashboard via WebSocket. Pre-aggregated hourly buckets power the 24h trend chart and geo/device/referrer breakdowns.
- **Short Link Generation** — Random 7-character base62 slugs from a cryptographic RNG (not guessable or enumerable), or validated custom slugs. Handles expiration, click-time bot detection, and velocity spike protection.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Chart.js, Lucide Icons |
| Backend | Express 4, TypeScript, WebSocket (ws) |
| Database | SQLite (better-sqlite3), WAL mode |
| Auth | JWT (jsonwebtoken), bcrypt |
| Build | Vite 6, tsx |

## Quick Start

```bash
# Clone
git clone https://github.com/rachit23tech/Bifrost.git
cd Bifrost

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Seed demo data (optional)
npm run db:seed

# Run (both server + client dev)
npm run dev:all
```

The client runs on `http://localhost:3000` and proxies API calls to the server on port 3001.

**Demo credentials** (after seeding): `demo@bifrost.io` / `password123`

## Architecture

```
Client (React/Vite)  ←→  Express API  ←→  SQLite
                          ↕
                     WebSocket Server
```

- **Link Creation**: Rate limit → URL validation (http/https only) → Abuse Engine (7 weighted signals) → Score → Status assignment → DB insert (retry on slug collision)
- **Redirect**: Slug lookup → Expiry check → Status gate (blocked/flagged/active) → Click logging + pre-aggregation → 302 redirect
- **Analytics**: Pre-aggregated hourly buckets → REST API + WebSocket live push

## Abuse Detection Signals

| Signal | Weight | Trigger |
|--------|--------|---------|
| Blocklisted domain | +80 | Domain matches the blocklist (a small hardcoded demo list, not a live threat feed) |
| Credential @ trick | +50 | URL has userinfo before the host (`https://bank.com@evil.example`) |
| IP literal hostname | +45 | Destination uses raw IP instead of domain |
| Shortener chaining | +40 | URL points to another URL shortener |
| Executable download | +40 | Path ends in .exe, .apk, .sh, etc. |
| Punycode homograph | +35 | Domain uses xn-- encoding |
| High creation velocity | +35 | 5+ links created in 60 seconds |

## Security & Privacy

- **Visitor IPs are never stored.** The IP is used for the country lookup, then only an HMAC-SHA256 hash (keyed with a server secret) is saved and shown in the dashboard.
- **Analytics are private.** A link created by a signed-in user exposes its details, analytics, and live WebSocket feed only to that user. Links created anonymously are public.
- **Rate limiting.** In-memory fixed-window limiter: 20 link creations per minute and 10 auth attempts per 15 minutes, per IP. Single-instance only; multiple instances would need a shared store.
- **Secrets.** The server refuses to start in production without `JWT_SECRET`.

## Tests

```bash
npm test          # unit + API tests (node:test), run against an in-memory SQLite database
npm run typecheck
```

The API tests start the real Express app on a random port and cover link creation, redirects, the flagged/blocked flows, access control, and rate limiting. CI runs both commands on every push (`.github/workflows/ci.yml`).

## Performance

Measured with `npm run bench` (autocannon, 50 connections, 10 s, server in its own process on a file-backed SQLite database). Numbers below are single runs on a Windows laptop with Node 24.11.1; run the script to get figures for your own machine.

| Scenario | Requests/sec | p50 | p99 |
|----------|-------------:|----:|----:|
| Redirect + click write, empty table | 2,066 | 17 ms | 74 ms |
| Redirect + click write, link with 500,000 prior clicks | 2,759 | 13 ms | 41 ms |
| Redirect only (bot traffic, no write) | 9,669 | 4 ms | 8 ms |

The first two rows differ only by run-to-run variation: throughput no longer depends on how many clicks a link already has. That was not true before. Prior to optimisation, the 500,000-click test managed **10 requests/sec with a p50 of 3.9 s** (measured on a 2-vCPU Linux container, where the fixed version reaches about 2,100): the per-visitor velocity check and a `COUNT(*)` ran on every redirect with no index, so each click scanned the whole `clicks` table. Three changes fixed it:

1. A composite index on `clicks (link_id, ip_hash, clicked_at)`.
2. Live-dashboard stats are computed only when a dashboard is subscribed to that link.
3. The click row and its hourly bucket are written in a single transaction.

## Known Limitations

- The abuse engine is a fixed set of rules; it does not consult a real threat-intelligence feed.
- SQLite and in-process rate limiting mean this runs as a single instance.
- The redirect path writes the click synchronously before responding, which is why a recorded click costs roughly 3.5-4.5x a plain redirect (see Performance).

## Deployment (Render)

This project is configured for Render with the included `render.yaml`:

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect the GitHub repo — Render auto-detects `render.yaml`
4. `JWT_SECRET` and `IP_HASH_SALT` are generated automatically by the blueprint
5. Deploy

The server serves both the API and the built React client from a single process.

## Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Navbar, ShortenerForm, AnalyticsDashboard, MyLinks, AuthModal
│   │   ├── App.jsx
│   │   └── index.css
│   └── index.html
├── server/                 # Express backend (TypeScript)
│   ├── db/                 # SQLite init + seed
│   ├── middleware/         # JWT auth, rate limiter
│   ├── routes/             # auth, links, analytics, redirect
│   └── services/           # abuse engine, click analytics, slug generator, websocket
├── shared/                 # Shared TypeScript types
├── tests/                  # Unit + API tests (node:test)
├── render.yaml             # Render deployment config
└── package.json
```

## License

MIT
