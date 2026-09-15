import { Router, Response } from 'express';
import { db } from '../db/index.js';
import { optionalAuthenticateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { slugService } from '../services/slug.service.js';
import { abuseEngine } from '../services/abuse.service.js';

const router = Router();

// Create Short Link
router.post('/', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const { destinationUrl, customSlug, expiresAt } = req.body;

    if (!destinationUrl) {
      return res.status(400).json({ error: 'destinationUrl is required' });
    }

    let slug = customSlug ? customSlug.trim() : null;

    if (slug) {
      // Validate custom slug uniqueness
      const existing = db.prepare('SELECT id FROM links WHERE slug = ?').get(slug);
      if (existing) {
        return res.status(409).json({ error: `Slug '${slug}' is already taken` });
      }
    } else {
      // Generate Base62 Counter-based Slug
      slug = slugService.generateSlug();
    }

    // 1. Evaluate Abuse Risk (0 - 100)
    const userId = req.user?.id;
    const clientIp = req.ip || '127.0.0.1';
    const evalResult = abuseEngine.evaluateCreation(destinationUrl, userId, clientIp);

    // 2. Insert into links database table
    const result = db.prepare(`
      INSERT INTO links (slug, owner_id, destination_url, status, abuse_score, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      userId || null,
      destinationUrl,
      evalResult.status,
      evalResult.score,
      expiresAt || null
    );

    const linkId = Number(result.lastInsertRowid);

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
    res.status(500).json({ error: err.message || 'Internal server error' });
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
router.get('/:id', (req: AuthRequest, res: Response) => {
  try {
    const linkId = req.params.id;
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId) as any;

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
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
