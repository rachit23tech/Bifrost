import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config.js';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

export function generateToken(payload: { id: number; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string };
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuthenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string };
      req.user = decoded;
    } catch {
      // Ignore token validation failure for optional auth
    }
  }
  next();
}

/** Verifies a raw JWT string. Returns the user it identifies, or null. */
export function verifyToken(token: string): { id: number; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: number; email: string };
  } catch {
    return null;
  }
}

/**
 * Who may read a link's details and analytics.
 * Links created while signed out have no owner and stay public. A link with an
 * owner is visible only to that owner.
 */
export function canViewLink(link: { owner_id: number | null }, user?: { id: number }): boolean {
  if (link.owner_id === null || link.owner_id === undefined) return true;
  return user?.id === link.owner_id;
}
