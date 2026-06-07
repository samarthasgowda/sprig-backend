import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { verifyAccessToken } from '../lib/jwt';
import { env } from '../config/env';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

let io: Server | null = null;

/**
 * Initialise Socket.io. Rooms:
 *   user:{id}      — every authenticated socket joins its own user room
 *   order:{id}     — clients tracking a specific order
 *   store:{id}     — a store dashboard listening for new/updated orders
 *   partner:{id}   — a delivery partner's channel
 *
 * For multi-instance deployments install `@socket.io/redis-adapter` so emits
 * fan out across nodes (loaded dynamically below when REDIS_URL is set).
 */
export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, { cors: { origin: env.CLIENT_URL, credentials: true } });

  if (redis) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAdapter } = require('@socket.io/redis-adapter');
      io.adapter(createAdapter(redis, redis.duplicate()));
      logger.info('Socket.io using Redis adapter');
    } catch {
      logger.warn('REDIS_URL set but @socket.io/redis-adapter not installed; running single-node');
    }
  }

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (token) {
        const p = verifyAccessToken(token);
        socket.data.user = { id: p.sub, role: p.role };
        socket.join(`user:${p.sub}`);
      }
      next();
    } catch {
      next(); // allow anonymous tracking; sensitive emits go to user/order rooms
    }
  });

  io.on('connection', (socket) => {
    socket.on('order:subscribe', (orderId: string) => socket.join(`order:${orderId}`));
    socket.on('store:subscribe', (storeId: string) => socket.join(`store:${storeId}`));
    socket.on('partner:subscribe', (partnerId: string) => socket.join(`partner:${partnerId}`));

    // Live partner location relayed to everyone tracking that order.
    socket.on('partner:location', (data: { orderId?: string; lat: number; lng: number }) => {
      if (data?.orderId) io?.to(`order:${data.orderId}`).emit('partner:location', data);
    });
  });

  return io;
}

export const getIO = () => io;
export const emitToOrder = (orderId: string, event: string, payload: unknown) =>
  io?.to(`order:${orderId}`).emit(event, payload);
export const emitToStore = (storeId: string, event: string, payload: unknown) =>
  io?.to(`store:${storeId}`).emit(event, payload);
export const emitToUser = (userId: string, event: string, payload: unknown) =>
  io?.to(`user:${userId}`).emit(event, payload);
