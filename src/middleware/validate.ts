import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

type Part = 'body' | 'query' | 'params';

// Validate (and coerce) a request part against a Zod schema.
export const validate =
  (schema: ZodSchema, part: Part = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) return next(result.error);
    (req as unknown as Record<Part, unknown>)[part] = result.data;
    next();
  };
