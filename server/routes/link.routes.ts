import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { optionalAuthenticateToken, authenticateToken, canViewLink, AuthRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { MAX_URL_LENGTH } from '../config.js';
import { slugService, validateCustomSlug } from '../services/slug.service.js';
import { abuseEngine } from '../services/abuse.service.js';

const router = Router();

// 20 new links per minute per IP is plenty for a person and slows down a script.
const createLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// Random slugs can collide, with each other or with a custom slug someone
// already took. The UNIQUE constraint on links.slug is the source of truth, so
// insert and retry with a fresh slug if SQLite reports a conflict.
const MAX_SLUG_ATTEMPTS = 5;

function isSlugConflict(err: any): boolean {
  return err?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

// Create Short Link
router.post('/', createLimiter, optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { destinationUrl, customSlug, expiresAt } = req.body;

    if (!destinationUrl || typeof destinationUrl !== 'string') {
      return res.status(400).json({ error: 'destinationUrl is required' });
    }
    if (destinationUrl.length > MAX_URL_LENGTH) {
      return res.status(400).json({ error: `destinationUrl must be at most ${MAX_URL_LENGTH} characters` });
    }

    let parsed: URL;
    try {
      parsed = new URL(destinationUrl);
    } catch {
      return res.status(400).json({ error: 'destinationUrl is not a valid URL' });
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Only http and https URLs can be shortened' });
    }

    const custom = typeof customSlug === 'string' && customSlug.trim() ? customSlug.trim() : null;
    if (custom) {
      const slugError = validateCustomSlug(custom);
      if (slugError) {
        return res.status(400).json({ error: slugError });
      }
    }

    // 1. Evaluate Abuse Risk (0 - 100)
    const userId = req.user?.id;
    const clientIp = req.ip || '127.0.0.1';
    const evalResult = abuseEngine.evaluateCreation(destinationUrl, userId, clientIp);

    // 2. Insert into links database table
    const insert = db.prepare(`
      INSERT INTO links (slug, owner_id, destination_url, status, abuse_score, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    let linkId: number | null = null;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && linkId === null; attempt++) {
      const slug = custom ?? slugService.generateSlug();
      try {
        const result = insert.run(
          slug,
          userId || null,
          destinationUrl,
          evalResult.status,
          evalResult.score,
          expiresAt || null
        );
        linkId = Number(result.lastInsertRowid);
      } catch (err) {
        if (!isSlugConflict(err)) throw err;
        if (custom) {
          return res.status(409).json({ error: `Slug '${custom}' is already taken` });
        }
        // generated slug collided: loop and draw another
      }
    }

    if (linkId === null) {
      return res.status(503).json({ error: 'Could not allocate a short link, please retry' });
    }

    // 3. Persist detected risk signals
    if (evalResult.signals.length > 0) {
      abuseEngine.saveSignals(linkId, evalResult.signals);
    }

    const createdLink = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId) as any;

    res.status(201).json({
      link: {
        id: createdLink.id,
        slug: createdLink.slug,
        ownerId: createdLink.owner_id,
        destinationUrl: createdLink.destination_url,
        status: createdLink.status,
        abuseScore: createdLink.abuse_score,
        createdAt: createdLink.created_at,
        expiresAt: createdLink.expires_at,
        shortUrl: `${req.protocol}://${req.headers.host}/${createdLink.slug}`
      },
      evaluation: evalResult
    });
  } catch (err: any) {
    console.error('Failed to create link:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User's Links
router.get('/my-links', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const links = db.prepare(`
      SELECT l.*, COUNT(c.id) as click_count
      FROM links l
      LEFT JOIN clicks c ON l.id = c.link_id
      WHERE l.owner_id = ?
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `).all(userId);

    res.json({ links });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Get Link Details & Abuse Signals
router.get('/:id', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const linkId = req.params.id;
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId) as any;

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    if (!canViewLink(link, req.user)) {
      return res.status(403).json({ error: 'Not authorized to view this link' });
    }

    const signals = db.prepare('SELECT * FROM abuse_signals WHERE link_id = ?').all(linkId);
    const clickCount = db.prepare('SELECT COUNT(*) as count FROM clicks WHERE link_id = ?').get(linkId) as { count: number };

    res.json({
      link: {
        ...link,
        clickCount: clickCount.count
      },
      signals
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Delete Link
router.delete('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const linkId = req.params.id;
    const userId = req.user!.id;

    const link = db.prepare('SELECT owner_id FROM links WHERE id = ?').get(linkId) as any;
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }

    if (link.owner_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this link' });
    }

    db.prepare('DELETE FROM links WHERE id = ?').run(linkId);
    res.json({ success: true, message: 'Link deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
