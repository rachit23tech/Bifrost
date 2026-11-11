import http from 'http';

import { app } from './app.js';
import { wsService } from './services/websocket.service.js';

const server = http.createServer(app);

// WebSocket server shares the HTTP server, on the /ws path
wsService.init(server);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Bifrost running on http://localhost:${PORT}`);
});
