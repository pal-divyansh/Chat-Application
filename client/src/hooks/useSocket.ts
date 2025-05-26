import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './useAuth';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user?._id) return;

    // Initialize socket connection
    console.log('Attempting to connect to socket...');
    socketRef.current = io('http://localhost:3000', {
      withCredentials: true
    });

    socketRef.current.on('connect', () => {
      console.log('Socket connected!', socketRef.current?.id);
      // Join user's room
      socketRef.current?.emit('join', user._id.toString());
      console.log(`Attempting to join room for user: ${user._id.toString()}`);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        console.log('Disconnecting socket...');
        socketRef.current.disconnect();
      }
    };
  }, [user?._id]);

  const sendMessage = (message: { receiverId: string; content: string }) => {
    if (!socketRef.current || !user?._id) {
      console.log('Socket not connected or user not available. Cannot send message.');
      return;
    }

    console.log('Attempting to send message:', message);
    socketRef.current.emit('sendMessage', {
      senderId: user._id.toString(),
      ...message
    });
  };

  return {
    socket: socketRef.current,
    sendMessage
  };
} 