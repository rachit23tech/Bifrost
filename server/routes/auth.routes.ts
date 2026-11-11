import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { db } from '../db/index.js';
import { generateToken, authenticateToken, AuthRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Slows down password guessing: 10 attempts per IP every 15 minutes.
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Sign Up
router.post('/signup', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Valid email and password (min 6 chars) required' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare(`
      INSERT INTO users (email, password_hash)
      VALUES (?, ?)
    `).run(email, passwordHash);

    const userId = Number(result.lastInsertRowid);
    const token = generateToken({ id: userId, email });

    res.status(201).json({
      user: { id: userId, email },
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google sign-in. Please continue with Google.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      user: { id: user.id, email: user.email },
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Google Sign-In (ID token verification)
router.post('/google', authLimiter, async (req: Request, res: Response) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: 'Google sign-in is not configured on this server' });
    }

    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Missing Google credential' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'Invalid Google credential' });
    }

    if (!payload || !payload.email || !payload.email_verified) {
      return res.status(401).json({ error: 'Google account email could not be verified' });
    }

    const { email, sub: googleId } = payload;

    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId) as any;

    if (!user) {
      // No account linked to this Google id yet - fall back to matching by
      // email so someone who already has a password account doesn't end up
      // with a second, duplicate account.
      const existingByEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;

      if (existingByEmail) {
        db.prepare('UPDATE users SET google_id = ? WHERE id = ?').run(googleId, existingByEmail.id);
        user = { ...existingByEmail, google_id: googleId };
      } else {
        const result = db.prepare(`
          INSERT INTO users (email, password_hash, google_id)
          VALUES (?, NULL, ?)
        `).run(email, googleId);
        user = { id: Number(result.lastInsertRowid), email, google_id: googleId };
      }
    }

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      user: { id: user.id, email: user.email },
      token
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Get Current User Profile
router.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
