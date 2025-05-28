import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { User, Message } from '@shared/schema';
import { storage } from './storage';
import jwt from 'jsonwebtoken';

interface ServerToClientEvents {
  message: (message: Message) => void;
  userStatus: (data: { userId: string; status: string }) => void;
  typing: (data: { userId: string; isTyping: boolean }) => void;
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

export function initializeSocketServer(httpServer: HTTPServer): SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> {
  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Middleware to authenticate socket connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { _id: string };
      const user = await storage.getUser(decoded._id);
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
        const message = await storage.createMessage({
          ...messageData,
          senderId: socket.data.user?._id || '',
          isRead: false
        });

        // Emit the message to all users in the chat
        io.to(message.chatId).emit('message', message);

        // Update user status
        await storage.updateUserStatus(socket.data.user?._id || '', 'online');
      } catch (error) {
        console.error('Error handling message:', error);
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