import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Message {
  _id: string;
  chatId: string;
  sender: {
    _id: string;
    username: string;
    profileImageUrl?: string;
  };
  content: string;
  type: 'text' | 'image' | 'file';
  createdAt: string;
  readBy: string[];
}

export function useMessages(chatId: string) {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading, error } = useQuery<Message[]>({
    queryKey: ['messages', chatId],
    queryFn: async () => {
      if (!chatId) return [];
      
      const response = await fetch(`${API_URL}/api/messages/${chatId}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!chatId,
    staleTime: 1000 * 60, // 1 minute
    refetchOnWindowFocus: false,
  });
  
  // Function to add a new message to the cache
  const addMessage = (newMessage: Message) => {
    if (!chatId) return;
    
    queryClient.setQueryData<Message[]>(['messages', chatId], (oldMessages = []) => {
      // Check if message already exists to prevent duplicates
      if (oldMessages.some(msg => msg._id === newMessage._id)) {
        return oldMessages;
      }
      return [...oldMessages, newMessage];
    });
  };

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      const response = await fetch(`${API_URL}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          chatId,
          content,
          type: 'text'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      return response.json();
    },
    onSuccess: (newMessage) => {
      addMessage(newMessage);
    }
  });

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    addMessage
  };
} 