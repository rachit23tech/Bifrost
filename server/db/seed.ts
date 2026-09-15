import bcrypt from 'bcryptjs';
import { db, initDatabase } from './index.js';
import { slugService } from '../services/slug.service.js';
import { abuseEngine } from '../services/abuse.service.js';
import { clickService } from '../services/click.service.js';

async function seed() {
  console.log('🌱 Initializing & Seeding Bifrost Database...');
  initDatabase();

  // Create demo user
  const passwordHash = await bcrypt.hash('password123', 10);
  db.prepare('INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (1, ?, ?)').run('demo@bifrost.io', passwordHash);

  // Link 1: Clean Auto-Allowed Link
  const slug1 = slugService.generateSlug();
  const url1 = 'https://github.com/facebook/react';
  const eval1 = abuseEngine.evaluateCreation(url1, 1);
  
  const link1Res = db.prepare(`
    INSERT OR REPLACE INTO links (id, slug, owner_id, destination_url, status, abuse_score)
    VALUES (1, ?, 1, ?, ?, ?)
  `).run(slug1, url1, eval1.status, eval1.score);

  // Seed clicks for Link 1
  const link1Id = 1;
  const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  ];
  const ips = ['172.56.21.89', '84.23.12.9', '103.45.12.44', '198.51.100.12'];
  const referrers = ['https://twitter.com/devs', 'https://news.ycombinator.com', 'direct', 'https://google.com'];

  for (let i = 0; i < 15; i++) {
    const ip = ips[i % ips.length];
    const ua = userAgents[i % userAgents.length];
    const ref = referrers[i % referrers.length];
    clickService.logClick({
      linkId: link1Id,
      slug: slug1,
      destinationUrl: url1,
      ip,
      userAgent: ua,
      referrer: ref
    });
  }

  // Link 2: Flagged Interstitial Link (Shortener Chaining)
  const slug2 = slugService.generateSlug();
  const url2 = 'https://bit.ly/suspicious-chain';
  const eval2 = abuseEngine.evaluateCreation(url2, 1);
  const link2Res = db.prepare(`
    INSERT OR REPLACE INTO links (id, slug, owner_id, destination_url, status, abuse_score)
    VALUES (2, ?, 1, ?, ?, ?)
  `).run(slug2, url2, eval2.status, eval2.score);

  if (eval2.signals.length > 0) {
    abuseEngine.saveSignals(2, eval2.signals);
  }

  // Link 3: Auto-Blocked Malware Link
  const slug3 = slugService.generateSlug();
  const url3 = 'http://malware-example.com/payload.exe';
  const eval3 = abuseEngine.evaluateCreation(url3, 1);
  db.prepare(`
    INSERT OR REPLACE INTO links (id, slug, owner_id, destination_url, status, abuse_score)
    VALUES (3, ?, 1, ?, ?, ?)
  `).run(slug3, url3, eval3.status, eval3.score);

  if (eval3.signals.length > 0) {
    abuseEngine.saveSignals(3, eval3.signals);
  }

  console.log(`
✅ Database Seed Complete!
- Demo User: demo@bifrost.io (password: password123)
- Link 1 (Active, 15 clicks): /${slug1} -> ${url1}
- Link 2 (Flagged, Interstitial): /${slug2} -> ${url2}
- Link 3 (Blocked): /${slug3} -> ${url3}
  `);
}

seed().catch(console.error);
