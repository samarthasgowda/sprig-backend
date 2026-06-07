import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './lib/logger';
import { apiLimiter } from './middleware/rateLimit';
import { notFoundHandler, errorHandler } from './middleware/error';
import { mountDocs } from './docs/swagger';
import routes from './routes';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
// Capture the raw body so payment webhooks can verify signatures.
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as express.Request).rawBody = buf; } }));
app.use(cookieParser());
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.use('/api/v1', apiLimiter, routes);
mountDocs(app);

app.use(notFoundHandler);
app.use(errorHandler);
