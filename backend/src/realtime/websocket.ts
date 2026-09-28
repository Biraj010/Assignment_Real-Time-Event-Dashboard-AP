import type { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { Logger } from '../lib/logger.js';
import type { Broadcaster } from '../types/event.js';

const DEFAULT_HEARTBEAT_MS = 30_000;
const MAX_INBOUND_PAYLOAD_BYTES = 16 * 1024;

export interface WebSocketServerOptions {
  path?: string;
  logger: Logger;
  heartbeatIntervalMs?: number;
}

export interface RealtimeServer extends Broadcaster {
  clientCount(): number;
  close(): Promise<void>;
}

export const noopBroadcaster: Broadcaster = {
  broadcast: () => undefined,
};

export function createWebSocketServer(
  httpServer: HttpServer,
  { path = '/ws', logger, heartbeatIntervalMs = DEFAULT_HEARTBEAT_MS }: WebSocketServerOptions,
): RealtimeServer {
  const wss = new WebSocketServer({ server: httpServer, path, maxPayload: MAX_INBOUND_PAYLOAD_BYTES });
  const alive = new WeakMap<WebSocket, boolean>();

  const send = (client: WebSocket, data: string): void => {
    client.send(data, (err) => {
      if (err) {
        logger.debug({ err }, 'Failed to deliver WebSocket message');
      }
    });
  };

  wss.on('connection', (client, req) => {
    alive.set(client, true);
    logger.debug({ ip: req.socket.remoteAddress, clients: wss.clients.size }, 'WebSocket client connected');

    client.on('pong', () => alive.set(client, true));
    client.on('error', (err) => logger.warn({ err }, 'WebSocket client error'));
    client.on('close', () => {
      logger.debug({ clients: wss.clients.size }, 'WebSocket client disconnected');
    });

    send(client, JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
  });

  wss.on('error', (err) => logger.error({ err }, 'WebSocket server error'));

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (alive.get(client) === false) {
        logger.debug('Terminating unresponsive WebSocket client');
        client.terminate();
        continue;
      }
      alive.set(client, false);
      client.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  return {
    broadcast(message: unknown): void {
      const data = JSON.stringify(message);
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
          send(client, data);
        }
      }
    },

    clientCount(): number {
      return wss.clients.size;
    },

    close(): Promise<void> {
      clearInterval(heartbeat);
      for (const client of wss.clients) {
        client.terminate();
      }
      return new Promise((resolve, reject) => {
        wss.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
