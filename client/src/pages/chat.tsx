import { useState } from "react";
import Sidebar from "@/components/chat/sidebar";
import ChatWindow from "@/components/chat/chat-window";
import ProfileModal from "@/components/chat/profile-modal";
import type { User } from "@shared/schema";

export default function Chat() {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  return (
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <div className="fixed inset-0 animated-bg"></div>
      
      <div className="relative z-10 min-h-screen flex">
        <Sidebar 
          selectedUser={selectedUser}
          onSelectUser={setSelectedUser}
          onShowProfile={() => setShowProfile(true)}
        />
        <ChatWindow selectedUser={selectedUser} />
      </div>
      
      <ProfileModal 
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </div>
  );
}
