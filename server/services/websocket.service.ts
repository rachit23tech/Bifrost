import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { WSMessage } from '../../shared/types.js';

class WebSocketService {
  private wss: WebSocketServer | null = null;
  // Map linkId -> Set of WebSockets subscribed to that link's live feed
  private subscriptions: Map<number, Set<WebSocket>> = new Map();

  public init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('⚡ New WebSocket connection established');

      let currentSubscribedLinkId: number | null = null;

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'SUBSCRIBE_LINK' && typeof parsed.linkId === 'number') {
            // Unsubscribe from previous link if any
            if (currentSubscribedLinkId !== null) {
              this.unsubscribe(currentSubscribedLinkId, ws);
            }
            currentSubscribedLinkId = parsed.linkId;
            this.subscribe(parsed.linkId, ws);
            ws.send(JSON.stringify({ type: 'SUBSCRIBED', linkId: parsed.linkId }));
          }
        } catch (err) {
          console.error('Failed to process WS message:', err);
        }
      });

      ws.on('close', () => {
        if (currentSubscribedLinkId !== null) {
          this.unsubscribe(currentSubscribedLinkId, ws);
        }
      });

      ws.on('error', (err) => {
        console.error('WebSocket client error:', err);
      });
    });
  }

  private subscribe(linkId: number, ws: WebSocket) {
    if (!this.subscriptions.has(linkId)) {
      this.subscriptions.set(linkId, new Set());
    }
    this.subscriptions.get(linkId)!.add(ws);
  }

  private unsubscribe(linkId: number, ws: WebSocket) {
    const clients = this.subscriptions.get(linkId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.subscriptions.delete(linkId);
      }
    }
  }

  public broadcastToLink(linkId: number, message: WSMessage) {
    const clients = this.subscriptions.get(linkId);
    if (!clients || clients.size === 0) return;

    const payload = JSON.stringify(message);
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }

  public broadcastGlobal(message: WSMessage) {
    if (!this.wss) return;
    const payload = JSON.stringify(message);
    this.wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    });
  }
}

export const wsService = new WebSocketService();
