import { Express } from 'express';
import authRoutes from './auth';
import messageRoutes from './messages';

export function registerRoutes(app: Express) {
  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messageRoutes);
  
  return app;
} 