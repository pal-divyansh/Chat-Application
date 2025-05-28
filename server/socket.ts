import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { User, Message } from '@shared/schema';
import { storage } from './storage';
import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from '../client/src/lib/encryption';

interface ServerToClientEvents {
  message: (message: Message) => void;
  userStatus: (data: { userId: string; status: string }) => void;
  typing: (data: { userId: string; isTyping: boolean }) => void;
  error: (data: { message: string }) => void;
}

interface ClientToServerEvents {
  message: (message: Omit<Message, '_id' | 'createdAt' | 'updatedAt'>) => void;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  typing: (data: { chatId: string; isTyping: boolean }) => void;
}

interface InterServerEvents {
  ping: () => void;
}

interface SocketData {
  user: User;
}

export function setupSocketHandlers(httpServer: HttpServer, sessionMiddleware: any): Server {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Apply session middleware
  io.engine.use(sessionMiddleware);

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
      const user = await storage.getUser(decoded.userId);
      
      if (!user) {
        return next(new Error('User not found'));
      }
      
      socket.data.user = user;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.data.user?.username);

    // Handle joining a chat
    socket.on('joinChat', (chatId) => {
      socket.join(chatId);
      console.log(`User ${socket.data.user?.username} joined chat ${chatId}`);
    });

    // Handle leaving a chat
    socket.on('leaveChat', (chatId) => {
      socket.leave(chatId);
      console.log(`User ${socket.data.user?.username} left chat ${chatId}`);
    });

    // Handle new messages
    socket.on('message', async (messageData) => {
      try {
        if (!socket.data.user?._id) {
          socket.emit('error', { message: 'Authentication required' });
          return;
        }

        const { chatId, content } = messageData;
        if (!chatId || !content) {
          socket.emit('error', { message: 'Missing chat or message content' });
          return;
        }

        const encryptedContent = encrypt(content);
        const message = await storage.createMessage({
          chatId,
          senderId: socket.data.user._id,
          content: encryptedContent,
          isRead: false
        });

        const decryptedMessage = {
          ...message,
          content: decrypt(message.content)
        };

        // Emit the message to all users in the chat
        io.to(chatId).emit('message', decryptedMessage);

        // Update user status
        await storage.updateUserStatus(socket.data.user._id, 'online');
      } catch (error) {
        console.error('Error handling message:', error);
        socket.emit('error', { message: 'Failed to process message' });
      }
    });

    // Handle typing status
    socket.on('typing', (data) => {
      socket.to(data.chatId).emit('typing', {
        userId: socket.data.user?._id || '',
        isTyping: data.isTyping
      });
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      if (socket.data.user?._id) {
        await storage.updateUserStatus(socket.data.user._id, 'offline');
        io.emit('userStatus', {
          userId: socket.data.user._id,
          status: 'offline'
        });
      }
      console.log('User disconnected:', socket.data.user?.username);
    });
  });

  return io;
} 