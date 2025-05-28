import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic } from "./vite";
import { connectDB } from "./db";
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socket';
import { storage } from './storage';
import { logger } from './utils/logger';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure CORS
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5174',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept',
    'Cache-Control',
    'X-Requested-With'
  ],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400 // 24 hours
}));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add session middleware with updated configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'chat-app-secret-key',
  resave: true,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined
  },
  name: 'sessionId'
});

app.use(sessionMiddleware);

// Serve static files from the uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Register API routes BEFORE Vite middleware
registerRoutes(app, sessionMiddleware);

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${path} - ${res.statusCode} - ${duration}ms`);
  });

  next();
});

// Start the server with Vite
async function startServer() {
  try {
    // First connect to the database
    console.log('Connecting to MongoDB...');
    await connectDB();
    
    // Set up WebSocket server with session middleware
    const io = new Server(httpServer, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:5174',
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
          'Content-Type', 
          'Authorization', 
          'Accept',
          'Cache-Control',
          'X-Requested-With'
        ],
        exposedHeaders: ['Set-Cookie'],
        maxAge: 86400 // 24 hours
      }
    });
    
    setupSocketHandlers(io, sessionMiddleware);
    
    // Then set up Vite
    await setupVite(app, httpServer);
    
    // Serve static files in production
    if (process.env.NODE_ENV === 'production') {
      serveStatic(app);
    }
    
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`WebSocket server running on ws://localhost:${PORT}`);
    });
    return httpServer;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});