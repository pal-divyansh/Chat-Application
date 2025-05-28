import { Express } from 'express';
import authRoutes from './auth';
import messageRoutes from './messages';
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';

export function registerRoutes(app: Express) {
  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messageRoutes);
  
  const router = Router();

  // Protected routes
  router.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'This is a protected route' });
  });

  return app;
}

export default Router(); 