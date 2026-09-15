# Bifrost — URL Shortener with Abuse Detection & Live Analytics

A URL shortening platform with a **rule-based abuse detection engine** (weighted risk scoring 0–100) and a **real-time click analytics dashboard** powered by WebSockets.

## Features

- **Abuse Detection Engine** — Every link is evaluated against 7+ weighted threat signals at creation time. Links are auto-allowed (score 0–30), flagged with a warning interstitial (30–70), or auto-blocked (70+).
- **Real-Time Analytics** — Click events push live to the dashboard via WebSocket. Pre-aggregated hourly buckets power the 24h trend chart and geo/device/referrer breakdowns.
- **Short Link Generation** — Base62 counter-based slug generation (or custom slugs). Handles expiration, click-time bot detection, and velocity spike protection.

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

- **Link Creation**: URL → Abuse Engine (7 weighted signals) → Score → Status assignment → DB insert
- **Redirect**: Slug lookup → Expiry check → Status gate (blocked/flagged/active) → Click logging + pre-aggregation → 302 redirect
- **Analytics**: Pre-aggregated hourly buckets → REST API + WebSocket live push

## Abuse Detection Signals

| Signal | Weight | Trigger |
|--------|--------|---------|
| Blocklisted domain | +80 | Domain matches known malware/phishing list |
| Credential @ trick | +50 | URL contains userinfo/@ obfuscation |
| IP literal hostname | +45 | Destination uses raw IP instead of domain |
| Shortener chaining | +40 | URL points to another URL shortener |
| Executable download | +40 | Path ends in .exe, .apk, .sh, etc. |
| Punycode homograph | +35 | Domain uses xn-- encoding |
| High creation velocity | +35 | 5+ links created in 60 seconds |

## Deployment (Render)

This project is configured for Render with the included `render.yaml`:

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect the GitHub repo — Render auto-detects `render.yaml`
4. Set `JWT_SECRET` in environment variables
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
│   ├── middleware/         # JWT auth
│   ├── routes/             # auth, links, analytics, redirect
│   └── services/           # abuse engine, click analytics, slug generator, websocket
├── shared/                 # Shared TypeScript types
├── tests/                  # Unit tests
├── render.yaml             # Render deployment config
└── package.json
```

## License

MIT
