// Operational errors thrown on purpose and translated to clean HTTP responses.
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, m, 'BAD_REQUEST', d);
export const unauthorized = (m = 'Unauthorized') => new AppError(401, m, 'UNAUTHORIZED');
export const forbidden = (m = 'Forbidden') => new AppError(403, m, 'FORBIDDEN');
export const notFound = (m = 'Not found') => new AppError(404, m, 'NOT_FOUND');
export const conflict = (m: string) => new AppError(409, m, 'CONFLICT');
