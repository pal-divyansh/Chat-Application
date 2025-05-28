import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '@shared/schema';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export const generateToken = (user: User): string => {
  return jwt.sign(
    { 
      _id: user._id,
      username: user.username
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { _id: string; username: string };
    req.user = {
      _id: decoded._id,
      username: decoded.username
    } as User;
    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

export const validateUserAccess = (req: Request, res: Response, next: NextFunction) => {
  const requestedUserId = req.params.id;
  if (req.user?._id !== requestedUserId) {
    return res.status(403).json({ error: 'Not authorized to access this resource' });
  }
  next();
}; 