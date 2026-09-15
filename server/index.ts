import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

import { initDatabase } from './db/index.js';
import { wsService } from './services/websocket.service.js';
import authRoutes from './routes/auth.routes.js';
import linkRoutes from './routes/link.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import redirectRoutes from './routes/redirect.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Trust proxy for correct req.ip behind Render/Nginx
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite database
initDatabase();

// Initialize WebSocket server on /ws path
wsService.init(server);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);
app.use('/api/analytics', analyticsRoutes);

// Serves static client files if built for production
const possibleDistPaths = [
  path.resolve(process.cwd(), 'client/dist'),
  path.resolve(__dirname, '../client/dist'),
  path.resolve(__dirname, 'client/dist'),
  path.resolve(__dirname, '../dist'),
  path.resolve(process.cwd(), 'dist')
];

const clientDist = possibleDistPaths.find(p => fs.existsSync(path.join(p, 'index.html'))) || path.resolve(process.cwd(), 'client/dist');
console.log(`Serving static client files from: ${clientDist} (exists: ${fs.existsSync(clientDist)})`);

app.use(express.static(clientDist));

// Redirect Route for Short URLs (e.g. GET /:slug)
app.use('/', redirectRoutes);

// Fallback for SPA routing if dist exists
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send(`
    <!DOCTYPE html>
    <html>
      <head><title>Bifrost</title><style>body{background:#090d16;color:#e2e8f0;font-family:system-ui;display:flex;height:100vh;align-items:center;justify-content:center;margin:0;}</style></head>
      <body><div style="text-align:center;"><h2>Bifrost URL Shortener API is Running</h2><p style="color:#94a3b8;">Frontend build not found at ${clientDist}. Run <code>npm run build</code> to generate the client.</p></div></body>
    </html>
  `);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Bifrost running on http://localhost:${PORT}`);
});
