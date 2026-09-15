URL Shortener — Project Overview
Concept

A URL shortener with two differentiators layered on top of the classic "design bit.ly" problem:

Confidence-scored abuse detection — rule-based scoring engine that auto-allows, flags, or blocks links based on weighted risk signals.
Real-time click analytics — live-updating dashboard (WebSocket push) showing clicks, geo, device, and referrer breakdowns as they happen.

Goal: a project that maps directly onto a canonical system design interview question, with enough original complexity (rules engine + real-time pipeline) to defend line-by-line.

Schema (rough)
users
  id, email, password_hash, created_at

links
  id, slug, owner_id, destination_url, status (active/flagged/blocked),
  abuse_score (0-100), created_at, expires_at (nullable)

clicks
  id, link_id, ip_hash, country, device, referrer, clicked_at

abuse_signals
  id, link_id, signal_type, weight, detected_at
  -- e.g. 'high_velocity_creation', 'blocklisted_domain', 'suspicious_pattern'
Abuse Detection Logic

Weighted rule-based scoring (deliberately not ML — explainable, deterministic, defensible in interviews).

Score range	Action
0–30	Auto-allow
30–70	Allow, flagged for review, warning interstitial shown to clickers
70+	Auto-block, owner notified

Signals checked at creation: destination against a public blocklist, creation velocity per user/IP, suspicious URL patterns (IP-literal URLs, shortener chaining, punycode homograph tricks).

Signals checked at click time: click velocity spikes, bot-like user agents.

Real-Time Analytics
WebSocket push on each click → dashboard updates live (running count, country breakdown, device split).
Pre-aggregate into rolling hourly buckets (last 24h) rather than computing breakdowns from raw click rows on every request.
Key Technical Decisions (to make deliberately, defend in interviews)
Slug generation: base62 counter vs. random + collision check — pick one, know the tradeoff.
Abuse scoring: rule-based weighted sum, not ML — simple, explainable, no RAG/AI complexity.
Click write path: starting sync insert; mention async (queue-based) upgrade path as the "how would you scale this" answer.
Build Plan (~3 weeks)

Week 1 — Auth, link CRUD, slug generation, redirect endpoint, basic click logging.

Week 2 — Abuse detection layer (signals + scoring + interstitial), WebSocket click events.

Week 3 — Analytics dashboard (charts, live feed), polish, deploy, write-up of design decisions.