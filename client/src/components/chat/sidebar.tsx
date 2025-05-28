import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, User, LogOut } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User as UserType } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps {
  selectedUser: UserType | null;
  onSelectUser: (user: UserType) => void;
  onShowProfile: () => void;
}

export default function Sidebar({ selectedUser, onSelectUser, onShowProfile }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users = [], isLoading } = useQuery<UserType[]>({
    queryKey: ["/api/chats"],
    refetchInterval: 5000, // Refresh every 5 seconds for real-time updates
  });

  const filteredUsers = users.filter(user =>
    user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { logout } = useAuth();

  const handleLogout = async () => {
    logout.mutate();
  };

  const getDisplayName = (user: UserType) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ''} ${user.lastName || ''}`.trim();
    }
    return user.username || 'User';
  };

  const getInitials = (user: UserType) => {
    const name = getDisplayName(user);
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="w-80 glass-effect border-r border-border/20 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">ChatFlow</h2>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowProfile}
              className="hover:bg-accent"
            >
              <User className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="hover:bg-accent"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-accent border-border/50 focus:border-primary"
          />
        </div>
      </div>
      
      {/* User List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            {searchQuery ? "No users found" : "No other users found"}
          </div>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user._id.toString()}
              onClick={() => onSelectUser(user)}
              className={`p-4 hover:bg-accent cursor-pointer border-b border-border/10 transition-colors ${
                selectedUser?._id?.toString() === user._id.toString() ? 'bg-accent' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Avatar className="w-12 h-12">
                    <AvatarImage 
                      src={user.profileImageUrl || undefined} 
                      alt={getDisplayName(user)} 
                    />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`absolute bottom-0 right-0 w-3 h-3 border-2 border-background rounded-full ${
                    user.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate text-foreground">
                    {getDisplayName(user)}
                  </h3>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
