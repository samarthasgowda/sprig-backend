import http from 'http';
import { app } from './app';
import { initSocket } from './realtime/socket';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';

const server = http.createServer(app);
initSocket(server);

server.listen(env.PORT, () => {
  logger.info(`🌱 Sprig API listening on :${env.PORT}  ·  docs at /docs`);
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down…`);
  await prisma.$disconnect();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
