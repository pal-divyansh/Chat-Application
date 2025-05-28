import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Phone, Video, MoreVertical, Paperclip, Smile, Send, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { useMessages } from "@/hooks/useMessages";
import { format } from "date-fns";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";

interface User {
  _id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  status?: string;
  profileImageUrl?: string;
}

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

interface ChatWindowProps {
  selectedUser: User | null;
}

export default function ChatWindow({ selectedUser }: ChatWindowProps) {
  const [messageInput, setMessageInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user: currentUser } = useAuth() as { user: User | null };
  const socket = useSocket();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // Generate a chatId from the current user and selected user IDs
  const chatId = currentUser && selectedUser 
    ? [currentUser._id, selectedUser._id].sort().join('_')
    : null;

  // Use the useMessages hook with the generated chatId
  const { 
    messages, 
    isLoading: isLoadingMessages, 
    error,
    addMessage 
  } = useMessages(chatId || '');

  // Join chat room when chatId changes
  useEffect(() => {
    if (!socket || !chatId) return;
    
    console.log('Joining chat room:', chatId);
    socket.emit('joinChat', chatId);
    
    const handleNewMessage = (message: Message) => {
      console.log('New message received:', message);
      addMessage(message);
    };
    
    socket.on('newMessage', handleNewMessage);
    
    return () => {
      console.log('Leaving chat room:', chatId);
      socket.off('newMessage', handleNewMessage);
    };
  }, [socket, chatId, addMessage]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = () => {
    if (messageInput.trim() && selectedUser && socket && currentUser && chatId) {
      const messageData = {
        chatId,
        content: messageInput.trim(),
        senderId: currentUser._id
      };
      
      console.log('Sending message:', messageData);
      
      // Emit the message to the server
      socket.emit('sendMessage', messageData, (response: { status: string; message?: any; error?: string }) => {
        if (response.status === 'error') {
          console.error('Error sending message:', response.error);
          alert('Failed to send message. Please try again.');
        } else {
          console.log('Message sent successfully:', response.message);
        }
      });
      
      // Clear the input field
      setMessageInput("");
      setShowEmojiPicker(false);
    } else {
      console.log('Cannot send message - missing data:', {
        hasMessage: !!messageInput.trim(),
        hasSelectedUser: !!selectedUser,
        hasSocket: !!socket,
        hasCurrentUser: !!currentUser,
        hasChatId: !!chatId,
      });
      if (socket && !socket.connected) {
        console.log('Socket is available but not connected.');
      }
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
  };

  const handleSmileClick = () => {
    setShowEmojiPicker(!showEmojiPicker);
  };

  const handleMessageSelect = (messageId: string) => {
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
    if (selectedMessageIds.size === 0 || !chatId) return;

    const messageIdsToDelete = Array.from(selectedMessageIds);

    try {
      const response = await fetch('/api/messages', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messageIds: messageIdsToDelete, chatId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Failed to delete messages:', errorData);
        alert(`Failed to delete messages: ${errorData.message || response.statusText}`);
        return;
      }

      console.log('Messages deleted successfully from server.');
      setSelectedMessageIds(new Set());

    } catch (error) {
      console.error('Error during message deletion API call:', error);
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

  // Group messages by date
  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    
    messages.forEach(message => {
      const date = format(new Date(message.createdAt), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });
    
    return groups;
  };

  // Check if messages are from the same sender and close in time
  const shouldGroupWithPrevious = (current: Message, previous: Message | undefined, index: number) => {
    if (!previous || index === 0) return false;
    
    const timeDiff = new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime();
    const minutesDiff = timeDiff / (1000 * 60);
    
    return (
      current.sender._id === previous.sender._id &&
      minutesDiff < 5 // Group messages from same sender within 5 minutes
    );
  };

  // Render a single message
  const renderMessage = (message: Message, index: number, messages: Message[]) => {
    const isOwnMessage = message.sender._id === currentUser?._id;
    const isSelected = message._id ? selectedMessageIds.has(message._id) : false;
    const previousMessage = index > 0 ? messages[index - 1] : undefined;
    const nextMessage = index < messages.length - 1 ? messages[index + 1] : undefined;
    
    // Determine if we should show avatar and time
    const showAvatar = !isOwnMessage && !(previousMessage?.sender._id === message.sender._id && 
      (new Date(message.createdAt).getTime() - new Date(previousMessage.createdAt).getTime()) < 5 * 60 * 1000);
      
    const showTime = !nextMessage || 
      nextMessage.sender._id !== message.sender._id || 
      (new Date(nextMessage.createdAt).getTime() - new Date(message.createdAt).getTime()) > 5 * 60 * 1000;

    return (
      <div
        key={message._id}
        className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-1.5 px-3`}
      >
        {/* Sender's avatar (only show for received messages) */}
        <div className={`flex-shrink-0 self-end mr-2 ${isOwnMessage ? 'order-2' : 'order-1'}`}>
          {showAvatar && !isOwnMessage ? (
            <Avatar className="w-8 h-8 border-2 border-border">
              <AvatarImage 
                src={message.sender.profileImageUrl} 
                alt={message.sender.username} 
                className="object-cover"
              />
              <AvatarFallback className="bg-muted text-foreground text-xs">
                {message.sender.username.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div className="w-8"></div>
          )}
        </div>
        
        {/* Message bubble */}
        <div className={`flex flex-col max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'}`}>
          {showAvatar && !isOwnMessage && (
            <span className="text-xs text-muted-foreground px-2 mb-0.5">
              {message.sender.username}
            </span>
          )}
          
          <div className="flex items-end group">
            <div
              className={`relative px-4 py-2 rounded-2xl ${
                isOwnMessage 
                  ? 'bg-primary text-primary-foreground rounded-br-sm' 
                  : 'bg-muted text-foreground rounded-bl-sm'
              } ${isSelected ? 'ring-2 ring-ring ring-offset-1' : ''}`}
              onClick={() => handleMessageSelect(message._id)}
            >
              <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
              
              {/* Message time and status */}
              <div className={`flex items-center justify-end mt-1 space-x-1 ${
                isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
              }`}>
                <span className="text-[10px] leading-none">
                  {format(new Date(message.createdAt), 'h:mm a')}
                </span>
                {isOwnMessage && (
                  <span className="text-xs">
                    {message.readBy?.length > 1 ? '✓✓' : '✓'}
                  </span>
                )}
              </div>
              
              {/* Message tail */}
              <div className={`absolute -bottom-[1px] w-3 h-3 ${
                isOwnMessage 
                  ? 'right-0 translate-x-[1px] bg-primary' 
                  : 'left-0 -translate-x-[1px] bg-muted'
              }`} style={{
                clipPath: isOwnMessage 
                  ? 'polygon(100% 0, 0 100%, 100% 100%)' 
                  : 'polygon(0 0, 0 100%, 100% 100%)'
              }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Messages Area JSX
  const renderMessages = () => {
    if (isLoadingMessages) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="animate-pulse flex flex-col items-center">
              <div className="w-10 h-10 rounded-full bg-muted mb-2"></div>
              <div className="h-4 w-24 bg-muted rounded mb-1"></div>
              <div className="h-3 w-32 bg-muted rounded"></div>
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-red-500">
            Error loading messages. Please try again.
          </div>
        </div>
      );
    }

    if (!messages || messages.length === 0) {
      return (
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p className="text-lg font-medium mb-1">No messages yet</p>
            <p className="text-sm">Send a message to start the conversation!</p>
          </div>
        </div>
      );
    }

    // Group messages by date and render each group
    const messageGroups = groupMessagesByDate(messages);
    
    return Object.entries(messageGroups).map(([date, dateMessages]) => (
      <div key={date} className="mb-4">
        {/* Date separator */}
        <div className="flex items-center justify-center my-4">
          <div className="bg-accent text-xs text-muted-foreground px-3 py-1 rounded-full">
            {format(new Date(date), 'MMMM d, yyyy')}
          </div>
        </div>
        
        {/* Messages for this date */}
        <div className="px-2">
          {dateMessages.map((message, index) => renderMessage(message, index, dateMessages))}
        </div>
      </div>
    ));
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
        {renderMessages()}
        
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
