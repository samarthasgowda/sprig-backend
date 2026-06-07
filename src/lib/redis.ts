import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

// Optional: created only when REDIS_URL is set. Used for caching and the
// Socket.io adapter so realtime works across multiple API instances.
export const redis = env.REDIS_URL ? new Redis(env.REDIS_URL) : null;

if (redis) redis.on('error', (e) => logger.error({ err: e }, 'redis error'));
