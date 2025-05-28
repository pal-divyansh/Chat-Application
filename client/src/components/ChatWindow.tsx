import { useState, useRef, useEffect } from 'react';
import { useMessages } from '../hooks/useMessages';
import { useAuth } from '../hooks/useAuth';
import { format } from 'date-fns';

interface ChatWindowProps {
  chatId: string;
  recipientName: string;
}

export function ChatWindow({ chatId, recipientName }: ChatWindowProps) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  console.log('ChatWindow chatId:', chatId);
  const { messages, isLoading, error, sendMessage } = useMessages(chatId);
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    try {
      await sendMessage.mutateAsync(message);
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center">Loading messages...</div>;
  }

  if (error) {
    return <div className="flex-1 flex items-center justify-center text-red-500">Error loading messages</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages?.map((msg) => (
          <div
            key={msg._id}
            className={`flex ${msg.sender._id === user?._id ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.sender._id === user?._id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {msg.sender._id !== user?._id && (
                <div className="text-xs text-gray-500 mb-1">{msg.sender.username}</div>
              )}
              <div>{msg.content}</div>
              <div className="text-xs mt-1 opacity-70">
                {format(new Date(msg.createdAt), 'HH:mm')}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={!message.trim() || sendMessage.isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
} 