import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { format } from "date-fns";
import type { User, Message } from "@shared/schema";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { Types } from 'mongoose';

interface ChatWindowProps {
  selectedUser: User | null;
}

export default function ChatWindow({ selectedUser }: ChatWindowProps) {
  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useAuth();
  const { socket, sendMessage } = useSocket();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // Fetch initial messages
  const { data: fetchedMessages, isLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUser?._id?.toString()],
    queryFn: async () => {
      if (!selectedUser) return [];
      const response = await fetch(`/api/messages/${selectedUser._id.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch messages');
      }
      const data: Message[] = await response.json();
      console.log('Fetched initial messages:', data);
      return data;
    },
    enabled: !!selectedUser,
  });

  // Update local messages when fetched messages change
  useEffect(() => {
    if (fetchedMessages) {
      console.log('Fetched messages updated, setting local state:', fetchedMessages);
      setLocalMessages(fetchedMessages);
    }
  }, [fetchedMessages]);

  // Listen for new messages
  useEffect(() => {
    if (!socket) {
      console.log('Socket not available in chat window useEffect.');
      return;
    }

    console.log('Setting up newMessage event listener.');

    const handleNewMessage = (message: any) => {
      console.log('newMessage event received:', message);

      // Check if the message is between the current user and the selected user
      const currentUserIdString = currentUser?._id?.toString();
      const selectedUserIdString = selectedUser?._id?.toString();

      const isMessageForThisChat =
        (message.senderId === currentUserIdString && message.receiverId === selectedUserIdString) ||
        (message.senderId === selectedUserIdString && message.receiverId === currentUserIdString);

      if (isMessageForThisChat) {
        console.log('Message is for the selected chat. Updating local messages.', message);

        // Create a clean message object with only necessary properties
        // Explicitly map properties to match the expected Message type structure
        const cleanMessage: Message = {
            _id: message._id ? message._id.toString() : undefined, // Convert ObjectId to string
            senderId: message.senderId,
            receiverId: message.receiverId,
            content: message.content, // Use the decrypted content
            isRead: message.isRead || false, // Default to false if undefined
            createdAt: message.createdAt ? new Date(message.createdAt) : new Date(), // Ensure Date object
            updatedAt: message.updatedAt ? new Date(message.updatedAt) : new Date(), // Ensure Date object
        };

        setLocalMessages(prev => [...prev, cleanMessage]);

      } else {
        console.log('Message is not for the selected chat. Ignoring.', message);
      }
    };

    socket.on('newMessage', handleNewMessage);

    return () => {
      console.log('Cleaning up newMessage event listener.');
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket, currentUser?._id, selectedUser?._id]);

  // Scroll to bottom when local messages change
  useEffect(() => {
    scrollToBottom();
  }, [localMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = () => {
    if (messageInput.trim() && selectedUser) {
      sendMessage({
        receiverId: selectedUser._id.toString(),
        content: messageInput.trim()
      });
      setMessageInput("");
      setShowEmojiPicker(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      console.log('Selected file:', files[0].name);
      // Implement file upload logic here later
    }
    event.target.value = '';
  };

  const handlePaperclipClick = () => {
    fileInputRef.current?.click();
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessageInput(prevMsgInput => prevMsgInput + emojiData.emoji);
    // Optionally hide the picker after selecting an emoji
    // setShowEmojiPicker(false);
  };

  const handleSmileClick = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleMessageSelect = (messageId: string | undefined) => {
    if (!messageId) return;

    setSelectedMessageIds(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(messageId)) {
        newSelected.delete(messageId);
      } else {
        newSelected.add(messageId);
      }
      return newSelected;
    });
  };

  const handleDeleteMessages = async () => {
    if (selectedMessageIds.size === 0) return;

    // In a real application, you would confirm with the user before deleting
    if (!window.confirm(`Are you sure you want to delete ${selectedMessageIds.size} message(s)?`)) {
      return; // User cancelled deletion
    }

    console.log('Attempting to delete messages with IDs:', selectedMessageIds); // Log message IDs to be deleted

    try {
      const response = await fetch('/api/messages', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: Array.from(selectedMessageIds) }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to delete messages:', errorData);
        // Optionally show an error message to the user
        alert(`Failed to delete messages: ${errorData.message || response.statusText}`);
        return;
      }

      // Upon successful deletion, update local state and clear selection
      console.log('Messages deleted successfully from server.');
      // Use functional update to ensure we have the latest state
      setLocalMessages(prevMessages =>
        prevMessages.filter(msg => msg._id && !selectedMessageIds.has(msg._id))
      );
      setSelectedMessageIds(new Set());

    } catch (error) {
      console.error('Error during message deletion API call:', error);
      // Optionally show an error message to the user
      alert('An error occurred while trying to delete messages.');
    }
  };

  const getDisplayName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    return user.username || 'User';
  };

  const getInitials = (user: User) => {
    const name = getDisplayName(user);
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (!selectedUser) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Smile className="w-12 h-12 text-primary" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">Welcome to ChatFlow</h3>
          <p className="text-muted-foreground">Select a user to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Chat Header */}
      <div className="glass-effect border-b border-border/20 p-4 flex-shrink-0 h-16">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Avatar className="w-10 h-10">
              <AvatarImage 
                src={selectedUser.profileImageUrl || undefined} 
                alt={getDisplayName(selectedUser)} 
              />
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(selectedUser)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="font-semibold text-foreground">{getDisplayName(selectedUser)}</h3>
              <div className="flex items-center space-x-1">
                <div className={`w-2 h-2 rounded-full ${
                  selectedUser.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                }`} />
                <p className="text-sm text-muted-foreground capitalize">
                  {selectedUser.status || 'offline'}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {selectedMessageIds.size > 0 && (
               <Button variant="ghost" size="icon" className="hover:bg-accent text-red-500" onClick={handleDeleteMessages}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="hover:bg-accent">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        {isLoading ? (
          <div className="text-center text-muted-foreground">Loading messages...</div>
        ) : localMessages.length === 0 ? (
          <div className="text-center text-muted-foreground">
            No messages yet. Start the conversation!
          </div>
        ) : (
          localMessages.map((message: Message) => {
            const isOwnMessage = message.senderId === currentUser?._id?.toString();
            const isSelected = message._id ? selectedMessageIds.has(message._id) : false;
            return (
              <div
                key={message._id?.toString() || Math.random().toString()}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`message-bubble rounded-2xl px-4 py-2 cursor-pointer ${
                    isOwnMessage
                      ? 'bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-br-md'
                      : 'bg-accent text-accent-foreground rounded-bl-md'
                  } ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => handleMessageSelect(message._id)}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <p className={`text-xs mt-1 ${
                    isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                  }`}>
                    {format(new Date(message.createdAt || new Date()), 'h:mm a')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        
        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="message-bubble bg-accent rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-100"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse delay-200"></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="border-t border-border/20 flex-shrink-0">
          <EmojiPicker onEmojiClick={handleEmojiClick} width="100%" />
        </div>
      )}
      
      {/* Message Input */}
      <div className="glass-effect border-t border-border/20 p-4 flex-shrink-0 h-20">
        <div className="flex items-center space-x-3">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <Button variant="ghost" size="icon" className="hover:bg-accent" onClick={handlePaperclipClick}>
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          </Button>
          <div className="flex-1 relative">
            <Input
              type="text"
              placeholder="Type a message..."
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="bg-accent border-border/50 focus:border-primary rounded-2xl pr-12"
            />
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-3 top-1/2 transform -translate-y-1/2 hover:bg-accent/50"
              onClick={handleSmileClick}
            >
              <Smile className="h-4 w-4" />
            </Button>
          </div>
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim()}
            className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary rounded-xl transition-all transform hover:scale-105"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
