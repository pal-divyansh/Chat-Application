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
import express from 'express';
import { User, Message, InsertMessage, UpdateUser } from '@shared/schema';
import { authenticateToken } from './auth';

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

const router = express.Router();

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

  // Login route - existing users only
  app.post('/api/login', async (req: any, res) => {
    try {
      const { username, password } = req.body;
      if (!username || username.trim().length < 2) {
        return res.status(400).json({ message: "Username must be at least 2 characters" });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const user = await storage.getUserByUsername(username.trim());
      if (!user) {
        return res.status(404).json({ message: "Username not found. Please sign up first." });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid password" });
      }

      req.session.userId = user._id.toString();
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Signup route - new users only
  app.post('/api/signup', async (req: any, res) => {
    console.log('Signup request received:', req.body);
    
    // Set content type
    res.setHeader('Content-Type', 'application/json');
    
    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('Empty request body received');
      return res.status(400).json({ message: 'Request body cannot be empty' });
    }
    
    try {
      const { username, password, firstName, lastName } = req.body;
      if (!username || username.trim().length < 2) {
        return res.status(400).json({ message: "Username must be at least 2 characters" });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists. Please choose a different one or login." });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        username: username.trim(),
        password: hashedPassword,
        firstName: firstName?.trim() || '',
        lastName: lastName?.trim() || '',
        status: "online"
      });

      req.session.userId = user._id.toString();
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error during signup:", error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          // @ts-ignore
          code: error.code,
          // @ts-ignore
          keyPattern: error.keyPattern,
          // @ts-ignore
          keyValue: error.keyValue
        });
      }
      res.status(500).json({ 
        message: "Signup failed",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get current user
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      console.log('Auth user request received:', {
        sessionId: req.sessionID,
        hasUserId: !!req.session?.userId,
        userId: req.session?.userId
      });

      if (!req.session?.userId) {
        console.log('No user ID in session, returning 401');
        return res.status(401).json({ message: "Not logged in" });
      }

      const user = await storage.getUser(req.session.userId);
      console.log('User fetch result:', {
        found: !!user,
        userId: req.session.userId
      });

      if (!user) {
        console.log('User not found in database, returning 401');
        return res.status(401).json({ message: "User not found" });
      }

      // Remove sensitive data before sending
      const { password, ...userWithoutPassword } = user;
      console.log('Sending user data (without password)');
      
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Error fetching user:", error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      res.status(500).json({ 
        message: "Failed to fetch user",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Logout route
  app.post('/api/logout', (req: any, res) => {
    req.session.userId = null;
    res.json({ message: "Logged out" });
  });

  // Middleware to check if user is logged in
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not logged in" });
    }
    next();
  };

  // User routes
  router.get('/users', requireAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers(req.user?._id);
      res.json(users);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.get('/users/search', requireAuth, async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }
      const users = await storage.searchUsers(query, req.user?._id || '');
      res.json(users);
    } catch (error) {
      console.error('Error searching users:', error);
      res.status(500).json({ error: 'Failed to search users' });
    }
  });

  router.get('/users/:id', requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      console.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  router.put('/users/:id', requireAuth, async (req, res) => {
    try {
      if (req.params.id !== req.user?._id) {
        return res.status(403).json({ error: 'Not authorized to update this user' });
      }
      const updates: UpdateUser = req.body;
      const updatedUser = await storage.updateUser(req.params.id, updates);
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  // New endpoint for profile picture upload
  app.post('/api/upload/profile-picture', requireAuth, upload.single('profilePicture'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
      }

      // At this point, the file is saved in the uploads/profile_pictures directory
      // The file path is available in req.file.path

      // We need to update the user's profileImageUrl in the database
      const userId = req.session.userId;
      const profileImageUrl = `/uploads/profile_pictures/${req.file.filename}`; // Construct URL

      const updatedUser = await storage.updateUser(userId, { profileImageUrl });

      res.json({ message: 'Profile picture uploaded successfully', user: updatedUser });

    } catch (error) {
      console.error('Error uploading profile picture:', error);
      res.status(500).json({ message: 'Failed to upload profile picture' });
    }
  });

  // Message routes
  router.post('/messages', requireAuth, async (req, res) => {
    try {
      const messageData: InsertMessage = {
        ...req.body,
        senderId: req.user?._id
      };
      const message = await storage.createMessage(messageData);
      res.status(201).json(message);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Failed to create message' });
    }
  });

  router.get('/messages/:chatId', requireAuth, async (req, res) => {
    try {
      const messages = await storage.getMessagesByChatId(req.params.chatId);
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  router.put('/messages/:chatId/read', requireAuth, async (req, res) => {
    try {
      await storage.markMessagesInChatAsRead(req.params.chatId, req.user?._id || '');
      res.status(200).json({ message: 'Messages marked as read' });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({ error: 'Failed to mark messages as read' });
    }
  });

  router.delete('/messages/:messageId', requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteMessage(req.params.messageId, req.user?._id || '');
      if (!success) {
        return res.status(404).json({ error: 'Message not found or not authorized' });
      }
      res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  });

  router.delete('/messages', requireAuth, async (req, res) => {
    try {
      const { messageIds } = req.body;
      if (!Array.isArray(messageIds)) {
        return res.status(400).json({ error: 'messageIds must be an array' });
      }
      const deletedCount = await storage.deleteMessages(messageIds, req.user?._id || '');
      res.status(200).json({ deletedCount });
    } catch (error) {
      console.error('Error deleting messages:', error);
      res.status(500).json({ error: 'Failed to delete messages' });
    }
  });

  return httpServer;
}

export default router;
