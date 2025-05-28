import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

interface User {
  _id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  profileImageUrl?: string;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const currentUser = user as User | null;

  const connectSocket = useCallback(() => {
    if (!currentUser?._id) return;

    // Initialize socket connection
    console.log('Initializing socket connection...');
    
    // Clear any existing socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // Create new socket connection
    socketRef.current = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      auth: {
        token: document.cookie
          .split('; ')
          .find(row => row.startsWith('sessionId='))
          ?.split('=')[1]
      }
    });

    // Socket event handlers
    socketRef.current.on('connect', () => {
      console.log('Socket connected successfully');
      reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
      
      // Join user's room after connection
      if (currentUser?._id) {
        console.log('Joining user room:', currentUser._id);
        socketRef.current?.emit('join', { userId: currentUser._id });
      }
    });

    socketRef.current.on('connect_error', (error) => {
      reconnectAttempts.current++;
      console.error('Socket connection error:', {
        message: error.message,
        attempt: reconnectAttempts.current,
        maxAttempts: maxReconnectAttempts
      });

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
      }
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // The disconnection was initiated by the server, you need to reconnect manually
        console.log('Server disconnected, attempting to reconnect...');
        setTimeout(() => {
          if (socketRef.current) {
            socketRef.current.connect();
          }
        }, 1000);
      }
    });

    socketRef.current.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        console.log('Cleaning up socket connection...');
        socketRef.current.off('connect');
        socketRef.current.off('connect_error');
        socketRef.current.off('disconnect');
        socketRef.current.off('error');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user?._id]);

  // Reconnect when user changes
  useEffect(() => {
    if (currentUser?._id) {
      console.log('User authenticated, connecting socket...');
      connectSocket();
    }
    
    return () => {
      if (socketRef.current) {
        console.log('User changed, cleaning up socket...');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUser?._id, connectSocket]);

  return socketRef.current;
}