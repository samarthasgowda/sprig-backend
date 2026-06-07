import { Request, Response, NextFunction, RequestHandler } from 'express';

// Wrap async handlers so rejected promises reach the error middleware.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
