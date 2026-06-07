import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { forbidden, unauthorized } from '../utils/AppError';

// Role-based access control. Use after `authenticate`.
export const authorize =
  (...roles: UserRole[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
