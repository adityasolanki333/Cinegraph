import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const demoMode = req.headers['x-demo-mode'] === 'true';
  
  if (demoMode) {
    req.userId = 'demo_user';
    next();
    return;
  }
  
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.userId = req.session.userId;
  next();
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const demoMode = req.headers['x-demo-mode'] === 'true';
  
  if (demoMode) {
    req.userId = 'demo_user';
  } else if (req.session.userId) {
    req.userId = req.session.userId;
  }

  next();
}
