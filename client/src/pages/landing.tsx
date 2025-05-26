import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [username, setUsername] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (username: string) => {
      return await apiRequest("POST", "/api/login", { username });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome!",
        description: "You've successfully joined the chat.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to join chat. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim().length < 2) {
      toast({
        title: "Invalid username",
        description: "Username must be at least 2 characters long.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(username.trim());
  };

  return (
    <div className="min-h-screen relative">
      {/* Animated Background */}
      <div className="fixed inset-0 animated-bg"></div>
      
      {/* Floating decoration elements */}
      <div className="fixed top-10 right-10 w-20 h-20 bg-primary opacity-20 rounded-full animate-float"></div>
      <div className="fixed bottom-20 left-10 w-16 h-16 bg-purple-500 opacity-15 rounded-full animate-float delay-[2s]"></div>
      
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="glass-effect w-full max-w-md border-border/10">
          <CardContent className="p-8">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-primary to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
                <MessageCircle className="text-white text-2xl w-8 h-8" />
              </div>
              <h1 className="text-3xl font-bold mb-2 text-foreground">Welcome to ChatFlow</h1>
              <p className="text-muted-foreground">Enter a username to start chatting</p>
            </div>
            
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="text"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-accent border-border/50 focus:border-primary text-center text-lg py-3"
                disabled={loginMutation.isPending}
                autoFocus
              />
              
              <Button 
                type="submit"
                disabled={!username.trim() || loginMutation.isPending}
                className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary py-3 rounded-xl font-semibold transition-all transform hover:scale-[1.02]"
              >
                {loginMutation.isPending ? "Joining..." : "Join Chat"}
              </Button>
            </form>
            
            <div className="mt-6 text-center">
              <p className="text-muted-foreground text-sm">
                Choose any username to start chatting instantly
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
