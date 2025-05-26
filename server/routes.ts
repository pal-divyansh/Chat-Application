import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertMessageSchema, updateUserSchema } from "@shared/schema";
import { encrypt, decrypt } from "../client/src/lib/encryption";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // User routes
  app.get('/api/users', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const users = await storage.getAllUsers(userId);
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  app.patch('/api/users/profile', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const updates = updateUserSchema.parse(req.body);
      const user = await storage.updateUser(userId, updates);
      res.json(user);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Message routes
  app.get('/api/messages/:userId', isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = req.user.claims.sub;
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

  app.post('/api/messages', isAuthenticated, async (req: any, res) => {
    try {
      const senderId = req.user.claims.sub;
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

  app.get('/api/conversations', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
        return new Date(b.lastMessage.timestamp).getTime() - new Date(a.lastMessage.timestamp).getTime();
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
