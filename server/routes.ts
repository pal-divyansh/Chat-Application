import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMessageSchema, updateUserSchema, insertUserSchema } from "@shared/schema";
import { encrypt, decrypt } from "../client/src/lib/encryption";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import { Server as SocketIOServer } from "socket.io";
import type { Socket } from "socket.io";
import multer from 'multer';
import path from 'path';
import session from 'express-session'; // Import session type for middleware
import express, { Router } from 'express';
import { User, Message, InsertMessage, UpdateUser } from '@shared/schema';
import { authenticateToken } from './middleware/auth';
import jwt from 'jsonwebtoken';

// Set up multer storage
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    // Define the destination directory for uploads
    const uploadPath = path.join(__dirname, '../uploads/profile_pictures');
    // Create the directory if it doesn't exist (optional, but good practice)
    // You might want a more robust solution for production
    require('fs').mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Define the filename (e.g., user ID + original extension)
    // We'll likely want to use the user ID here later
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + fileExtension);
  },
});

const upload = multer({ storage: storageConfig });

const router = Router();

export function registerRoutes(app: Express, sessionMiddleware: any): Server {
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5174",
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Apply the session middleware to Socket.IO
  io.engine.use(sessionMiddleware);

  // Socket.IO connection handling
  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);
    console.log('Socket listening for events:', Object.keys(socket.listeners('*')));

    socket.on('join', (userId: string) => {
      socket.join(userId);
      console.log(`User ${userId} joined their room`);
    });

    socket.on('sendMessage', async (message: { chatId: string; content: string }) => {
      console.log(`[Socket] Entering sendMessage handler for socket ${socket.id}`);
      console.log(`[Socket] !!! Received sendMessage event from socket ${socket.id} !!!`);
      console.log(`[Socket] Received sendMessage event from ${socket.id}`, message);

      try {
        // The senderId should come from the authenticated user's session associated with the socket
        const senderId = (socket as any).request.session.userId; 
        const { chatId, content } = message;
        
        if (!senderId) {
          console.error(`[Socket] sendMessage failed: No senderId in session for socket ${socket.id}`);
          socket.emit('error', { message: 'Authentication required' });
          return;
        }

        if (!chatId || !content) {
          console.error(`[Socket] sendMessage failed: Missing chatId or content`, { chatId, content });
          socket.emit('error', { message: 'Missing chat or message content' });
          return;
        }

        console.log(`[Socket] Validated senderId and message data:`, {
          senderId,
          chatId,
          contentLength: content.length,
          socketId: socket.id
        });

        // Encrypt message content
        console.log(`[Socket] Encrypting message...`);
        const encryptedContent = encrypt(content);
        console.log(`[Socket] Message encrypted successfully`);
        
        // Save message to database
        console.log(`[Socket] Attempting to save message to database...`);
        try {
          console.log(`[Socket] Calling storage.createMessage with:`, { chatId, senderId, content: '<encrypted>', isRead: false });
          const createdMessage = await storage.createMessage({
            chatId: chatId,
            senderId: senderId,
            content: encryptedContent,
            isRead: false
          });
          console.log(`[Socket] Message saved successfully by storage:`, { messageId: createdMessage._id, chatId: createdMessage.chatId });

          // Decrypt message for sending
          const decryptedMessage = {
            ...createdMessage,
            content: decrypt(createdMessage.content) // Use createdMessage.content which is encrypted here
          };
          console.log(`[Socket] Message decrypted for emission`);

          // Emit the new message to all users in the chat room (identified by chatId)
          console.log(`[Socket] Emitting newMessage to chat room ${chatId}...`);
          io.to(chatId).emit('newMessage', decryptedMessage);

          console.log(`[Socket] Message emission complete`);
        } catch (dbError) {
          console.error(`[Socket] Database error while saving message:`, {
            error: dbError,
            message: dbError instanceof Error ? dbError.message : 'Unknown error',
            stack: dbError instanceof Error ? dbError.stack : undefined
          });
          socket.emit('error', { message: 'Failed to save message' }); // Emit error to client
        }

      } catch (error) {
        console.error(`[Socket] Error handling sendMessage event:`, error);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Simple session middleware to track current user
  app.use((req: any, res, next) => {
    if (!req.session) {
      req.session = {};
    }
    next();
  });

  // Auth middleware
  const auth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const token = req.cookies.token;
      if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
      const user = await storage.getUser(decoded.userId);
      
      if (!user) {
        return res.status(401).json({ message: 'User not found' });
      }

      req.user = user;
      next();
    } catch (error) {
      res.status(401).json({ message: 'Invalid token' });
    }
  };

  // Auth routes
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);

      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const isValidPassword = await bcrypt.compare(password, (user as any).password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/signup', async (req, res) => {
    try {
      const { username, password, firstName, lastName } = req.body;
      const existingUser = await storage.getUserByUsername(username);

      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userData = {
        username,
        firstName,
        lastName,
        status: 'offline',
        createdAt: new Date(),
        updatedAt: new Date(),
        password: hashedPassword
      };

      const user = await storage.createUser(userData as any); // Type assertion needed for password

      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      res.json({ user: { ...user, password: undefined } });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  router.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
  });

  // User routes
  router.get('/user', auth, (req, res) => {
    res.json({ user: { ...req.user, password: undefined } });
  });

  router.put('/user', auth, async (req, res) => {
    try {
      const { firstName, lastName, bio, status } = req.body;
      const updatedUser = await storage.updateUser(req.user._id, {
        firstName,
        lastName,
        bio,
        status
      });

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ user: { ...updatedUser, password: undefined } });
    } catch (error) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Message routes
  router.post('/messages', authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { content, chatId } = req.body;
      const message = await storage.createMessage({
        content,
        chatId,
        senderId: req.user._id,
        isRead: false
      });
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create message' });
    }
  });

  router.get('/messages/:chatId', authenticateToken, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const messages = await storage.getMessagesByChatId(req.params.chatId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  return httpServer;
}

export default router;
