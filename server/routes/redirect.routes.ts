import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { clickService } from '../services/click.service.js';
import { abuseEngine } from '../services/abuse.service.js';

const router = Router();

// Simple HTML escaper to prevent XSS in rendered pages
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

router.get('/:slug', (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const confirm = req.query.confirm === 'true' || req.query.confirm === '1';

    // 1. Look up link in SQLite DB
    const link = db.prepare('SELECT * FROM links WHERE slug = ?').get(slug) as any;

    if (!link) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head><title>404 - Bifrost</title><style>body{background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;margin:0;}</style></head>
        <body><div style="text-align:center;max-width:400px;">
          <h1 style="font-size:3rem;margin-bottom:0.5rem;color:#f43f5e;">404</h1>
          <p style="color:#94a3b8;">Short link <code>/${escapeHtml(slug)}</code> does not exist.</p>
        </div></body>
        </html>
      `);
    }

    // 2. Check Expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Link Expired - Bifrost</title><style>body{background:#0b0f19;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;height:100vh;align-items:center;justify-content:center;margin:0;}</style></head>
        <body><div style="text-align:center;max-width:400px;">
          <h1 style="font-size:2rem;color:#f59e0b;">Link Expired</h1>
          <p style="color:#94a3b8;">This short link has expired.</p>
        </div></body>
        </html>
      `);
    }

    // 3. Handle Auto-Blocked Status (70+ Risk Score)
    if (link.status === 'blocked') {
      const signals = db.prepare('SELECT * FROM abuse_signals WHERE link_id = ?').all(link.id) as any[];
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Link Blocked - Bifrost</title>
          <style>
            body { background: #090d16; color: #f87171; font-family: system-ui, sans-serif; display: flex; height: 100vh; align-items: center; justify-content: center; margin: 0; }
            .card { background: #161b26; border: 1px solid #7f1d1d; border-radius: 12px; padding: 2rem; max-width: 500px; width: 90%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            h2 { margin-top: 0; color: #ef4444; display: flex; align-items: center; gap: 8px; }
            .badge { background: #991b1b; color: #fecaca; padding: 4px 8px; border-radius: 6px; font-size: 0.85rem; font-weight: bold; }
            ul { background: #0f172a; padding: 12px 20px; border-radius: 8px; color: #cbd5e1; font-size: 0.9rem; text-align: left; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Link Blocked <span class="badge">Risk: ${link.abuse_score}/100</span></h2>
            <p style="color:#94a3b8;">This link was blocked due to security concerns.</p>
            <ul>
              ${signals.map(s => `<li><strong>${escapeHtml(s.signal_type)}</strong>: ${escapeHtml(s.description)}</li>`).join('')}
            </ul>
          </div>
        </body>
        </html>
      `);
    }

    // 4. Handle Flagged Status (30-70 Risk Score) -> Interstitial Page
    if (link.status === 'flagged' && !confirm) {
      const signals = db.prepare('SELECT * FROM abuse_signals WHERE link_id = ?').all(link.id) as any[];
      const redirectUrl = `/${slug}?confirm=true`;

      // Check if client expects JSON
      if (req.headers.accept?.includes('application/json')) {
        return res.status(200).json({
          status: 'flagged',
          abuseScore: link.abuse_score,
          destinationUrl: link.destination_url,
          signals,
          proceedUrl: redirectUrl
        });
      }

      // Render Interstitial HTML warning page
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Caution - Bifrost</title>
          <style>
            body { background: #0b0f19; color: #e2e8f0; font-family: system-ui, sans-serif; display: flex; height: 100vh; align-items: center; justify-content: center; margin: 0; }
            .card { background: #1e293b; border: 1px solid #f59e0b; border-radius: 16px; padding: 2.5rem; max-width: 520px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
            h2 { margin: 0 0 0.5rem 0; color: #fbbf24; }
            .score-pill { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.85rem; display: inline-block; margin-bottom: 1rem; }
            .dest { background: #0f172a; padding: 12px; border-radius: 8px; font-family: monospace; word-break: break-all; color: #38bdf8; margin: 1rem 0; border: 1px solid #334155; }
            .signals { background: #0f172a; border-radius: 8px; padding: 12px 16px; margin-bottom: 1.5rem; text-align: left; font-size: 0.85rem; color: #94a3b8; }
            .btn-group { display: flex; gap: 12px; justify-content: flex-end; }
            .btn { text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; }
            .btn-cancel { background: #334155; color: #e2e8f0; }
            .btn-proceed { background: #f59e0b; color: #0b0f19; }
            .btn-proceed:hover { background: #d97706; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>This link has been flagged</h2>
            <div class="score-pill">Risk Score: ${link.abuse_score}/100</div>
            <p style="color:#cbd5e1;font-size:0.95rem;margin:0;">
              Review the destination before continuing.
            </p>
            <div class="dest">${escapeHtml(link.destination_url)}</div>
            <div class="signals">
              <strong style="color:#e2e8f0;">Detected signals:</strong>
              <ul style="margin: 6px 0 0 0; padding-left: 20px;">
                ${signals.map(s => `<li>${escapeHtml(s.description)}</li>`).join('')}
              </ul>
            </div>
            <div class="btn-group">
              <a href="/" class="btn btn-cancel">Go Back</a>
              <a href="${redirectUrl}" class="btn btn-proceed">Continue &rarr;</a>
            </div>
          </div>
        </body>
        </html>
      `);
    }

    // 5. Active Link or Confirmed Flagged Link -> Log Click & 302 Redirect
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referrer = (req.headers['referer'] || req.headers['referrer'] || 'direct') as string;

    // Check click-time bot/velocity
    const clickCheck = abuseEngine.evaluateClick(link.id, userAgent, clientIp);
    if (!clickCheck.isBot) {
      clickService.logClick({
        linkId: link.id,
        slug: link.slug,
        destinationUrl: link.destination_url,
        ip: clientIp,
        userAgent,
        referrer
      });
    }

    return res.redirect(302, link.destination_url);
  } catch (err: any) {
    res.status(500).send('Internal server error during redirection');
  }
});

export default router;
