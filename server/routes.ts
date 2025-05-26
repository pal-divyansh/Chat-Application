import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertMessageSchema, updateUserSchema, insertUserSchema } from "@shared/schema";
import { encrypt, decrypt } from "../client/src/lib/encryption";
import { nanoid } from "nanoid";

export async function registerRoutes(app: Express): Promise<Server> {
  // Simple session middleware to track current user
  app.use((req: any, res, next) => {
    if (!req.session) {
      req.session = {};
    }
    next();
  });

  // Login route - create or get user
  app.post('/api/login', async (req: any, res) => {
    try {
      const { username } = req.body;
      if (!username || username.trim().length < 2) {
        return res.status(400).json({ message: "Username must be at least 2 characters" });
      }

      let user = await storage.getUserByUsername(username.trim());
      if (!user) {
        user = await storage.createUser({
          id: nanoid(),
          username: username.trim(),
          status: "online",
        });
      }

      req.session.userId = user.id;
      res.json(user);
    } catch (error) {
      console.error("Error during login:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get current user
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "Not logged in" });
      }
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
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
  app.get('/api/users', requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const users = await storage.getAllUsers(userId);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch('/api/users/profile', requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const updates = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(userId, updates);
      res.json(user);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Message routes
  app.get('/api/messages/:userId', requireAuth, async (req: any, res) => {
    try {
      const currentUserId = req.session.userId;
      const { userId } = req.params;
      
      const messages = await storage.getMessagesBetweenUsers(currentUserId, userId);
      
      // Decrypt messages for display
      const decryptedMessages = messages.map(msg => ({
        ...msg,
        content: decrypt(msg.encryptedContent),
      }));
      
      // Mark messages as read
      await storage.markMessagesAsRead(userId, currentUserId);
      
      res.json(decryptedMessages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/messages', requireAuth, async (req: any, res) => {
    try {
      const senderId = req.session.userId;
      const messageData = insertMessageSchema.parse({
        ...req.body,
        senderId,
      });
      
      // Encrypt message content
      const encryptedContent = encrypt(messageData.content);
      
      const message = await storage.createMessage(messageData, encryptedContent);
      
      // Return message with decrypted content
      res.json({
        ...message,
        content: messageData.content,
      });
    } catch (error) {
      console.error("Error creating message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get('/api/conversations', requireAuth, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const users = await storage.getAllUsers(userId);
      
      // Get last message and unread count for each user
      const conversations = await Promise.all(
        users.map(async (user) => {
          const lastMessage = await storage.getLastMessageBetweenUsers(userId, user.id);
          const unreadCount = await storage.getUnreadMessageCount(userId, user.id);
          
          return {
            user,
            lastMessage: lastMessage ? {
              ...lastMessage,
              content: decrypt(lastMessage.encryptedContent),
            } : null,
            unreadCount,
          };
        })
      );
      
      // Sort by last message timestamp
      conversations.sort((a, b) => {
        if (!a.lastMessage && !b.lastMessage) return 0;
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        const aTime = a.lastMessage.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
        const bTime = b.lastMessage.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
        return bTime - aTime;
      });
      
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
