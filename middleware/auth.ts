import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';
import * as jwtModule from 'jsonwebtoken';

const jwt: any = jwtModule;
const logger = createLogger('AuthMiddleware');

interface UserPayload {
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
      return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      logger.error('JWT_SECRET not configured');
      res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as UserPayload;
    req.user = decoded;

    next();
  } catch (error: any) {
    logger.warn('Token verification failed', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

export function generateToken(userId: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiry: string = (process.env.JWT_EXPIRY as string) || '7d';

  logger.info('generateToken called', { 
    userId, 
    hasSecret: !!jwtSecret,
    secretLength: jwtSecret?.length || 0 
  });

  if (!jwtSecret) {
    logger.error('JWT_SECRET not configured in generateToken');
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign({ userId }, jwtSecret, {
    expiresIn: jwtExpiry,
  });
}

export function verifyToken(token: string): UserPayload {
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.verify(token, jwtSecret) as UserPayload;
}
