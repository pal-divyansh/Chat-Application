import { Server as HttpServer, IncomingMessage } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Message } from './models/Message';
import { UserModel } from '@shared/schema';
import session from 'express-session';

type SessionData = {
  id?: string;
  userId?: string;
  // Add other session properties here if needed
};

declare module 'http' {
  interface IncomingMessage {
    session: SessionData & {
      save(callback: (err?: Error) => void): void;
    };
  }
}

// Extend the Socket type to include user information
declare module 'socket.io' {
  interface Socket {
    user?: any;
  }
}

export function setupWebSocket(server: HttpServer, sessionMiddleware: any) {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CLIENT_URL?.split(',') || 'http://localhost:5174',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
    },
    allowEIO3: true // Enable compatibility with Socket.IO v2 clients if needed
  });

  // Convert express session middleware to Socket.IO middleware
  const wrap = (middleware: any) => (socket: any, next: any) => 
    middleware(socket.request, {}, next);

  // Use session middleware for socket connections
  io.use(wrap(sessionMiddleware));

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      console.log('New socket connection attempt');
      const req = socket.request as IncomingMessage & { 
        session: SessionData & {
          save(callback: (err?: Error) => void): void;
        } 
      };
      
      console.log('Session data:', {
        sessionExists: !!req.session,
        userId: req.session?.userId,
        sessionId: req.session?.id
      });
      
      if (req.session?.userId) {
        // Attach user to socket for later use
        socket.user = { id: req.session.userId };
        console.log('Socket authenticated for user:', req.session.userId);
        return next();
      }
      console.log('Socket authentication failed: No session or userId');
      next(new Error('Authentication error'));
    } catch (err) {
      console.error('Socket authentication error:', err);
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    if (!socket.user) {
      console.log('Socket connection rejected: No user');
      return socket.disconnect(true);
    }
    
    const userId = socket.user.id;
    console.log(`User ${userId} connected with socket ${socket.id}`);
    
    // Log all events for debugging
    const originalEmit = socket.emit;
    socket.emit = function(event: string, ...args: any[]) {
      console.log(`Emitting event '${event}' to socket ${socket.id}:`, args[0]);
      return originalEmit.apply(socket, [event, ...args]);
    };
    
    // Log incoming events
    const originalOn = socket.on;
    socket.on = function(event: string, listener: (...args: any[]) => void) {
      console.log(`Socket ${socket.id} listening to event: ${event}`);
      return originalOn.call(socket, event, (...args: any[]) => {
        console.log(`Event '${event}' received on socket ${socket.id}:`, args[0]);
        return listener.apply(socket, args);
      });
    };

    // Handle joining a room (chat)
    socket.on('join', (userId: string) => {
      console.log(`User ${userId} joined`);
      socket.join(userId);
    });

    // Handle sending a new message
    socket.on('sendMessage', async (
      data: { chatId: string; content: string; senderId: string }, 
      callback?: (response: { status: string; message?: any; error?: string }) => void
    ) => {
      console.log('Processing sendMessage:', { data, socketId: socket.id });
      
      // Helper function to send error response
      const sendError = (error: string) => {
        console.error(error);
        if (callback) {
          callback({ status: 'error', error });
        } else {
          socket.emit('error', { message: error });
        }
      };

      // Helper function to send success response
      const sendSuccess = (message: any) => {
        if (callback) {
          callback({ status: 'success', message });
        }
      };

      try {
        // Validate input
        if (!data.chatId || !data.content || !data.senderId) {
          return sendError('Missing required fields');
        }

        console.log('Creating new message in DB...');
        const newMessage = new Message({
          chatId: data.chatId,
          sender: data.senderId,
          content: data.content,
          type: 'text',
          readBy: [data.senderId]
        });
        
        const savedMessage = await newMessage.save();
        console.log('Message saved to DB, populating sender...');
        
        try {
          // Find the user and manually populate the sender field
          const sender = await UserModel.findById(data.senderId, 'username profileImageUrl').lean();
          if (!sender) {
            throw new Error('Sender not found');
          }

          // Create a properly typed sender object
          const senderInfo = {
            _id: sender._id.toString(),
            username: sender.username,
            profileImageUrl: sender.profileImageUrl
          };

          // Convert the document to a plain object and add the sender
          const messageObj = savedMessage.toObject();
          messageObj.sender = senderInfo as any; // Type assertion to avoid type errors
          console.log('Sender populated successfully');
          
          console.log('Broadcasting message to room:', data.chatId);
          // Broadcast the message to all clients in the chat room including the sender
          io.to(data.chatId).emit('newMessage', messageObj);
          
          console.log('Sending success callback');
          sendSuccess(messageObj);
          
        } catch (populateError) {
          console.error('Error populating sender:', populateError);
          // Even if population fails, still send the message but with limited sender info
          const limitedMessage = savedMessage.toObject();
          limitedMessage.sender = { _id: data.senderId } as any;
          io.to(data.chatId).emit('newMessage', limitedMessage);
          sendSuccess(limitedMessage);
        }
      } catch (error) {
        console.error('Unexpected error in sendMessage handler:', error);
        sendError('Failed to process message');
      }
    });

    // Handle joining a specific chat room
    socket.on('joinChat', (chatId: string) => {
      console.log(`Socket ${socket.id} joining chat:`, chatId);
      socket.join(chatId);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}
