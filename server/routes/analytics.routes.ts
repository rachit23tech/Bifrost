import { Router, Response } from 'express';
import { clickService } from '../services/click.service.js';
import { db } from '../db/index.js';
import { optionalAuthenticateToken, canViewLink, AuthRequest } from '../middleware/auth.js';

const router = Router();

// Get Analytics Breakdown for a Link
router.get('/:id', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const linkId = Number(req.params.id);
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId) as any;

    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    if (!canViewLink(link, req.user)) {
      return res.status(403).json({ error: 'Not authorized to view this link' });
    }

    const analytics = clickService.getLinkAnalytics(linkId);

    res.json({
      link: {
        id: link.id,
        slug: link.slug,
        destinationUrl: link.destination_url,
        status: link.status,
        abuseScore: link.abuse_score,
        createdAt: link.created_at
      },
      analytics
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Recent clicks feed (for live debug/audit)
router.get('/:id/recent-clicks', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const linkId = Number(req.params.id);
    const link = db.prepare('SELECT owner_id FROM links WHERE id = ?').get(linkId) as any;
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    if (!canViewLink(link, req.user)) {
      return res.status(403).json({ error: 'Not authorized to view this link' });
    }
    const recentClicks = db.prepare(`
      SELECT id, ip_hash, country, device, referrer, clicked_at
      FROM clicks
      WHERE link_id = ?
      ORDER BY clicked_at DESC
      LIMIT 50
    `).all(linkId);

    res.json({ clicks: recentClicks });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
