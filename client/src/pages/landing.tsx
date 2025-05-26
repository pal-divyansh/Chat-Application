import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
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
              <p className="text-muted-foreground">Connect and chat with friends securely</p>
            </div>
            
            <Button 
              onClick={handleLogin}
              className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary py-3 rounded-xl font-semibold transition-all transform hover:scale-[1.02]"
            >
              Sign In with Replit
            </Button>
            
            <div className="mt-6 text-center">
              <p className="text-muted-foreground text-sm">
                Sign in to start chatting with your friends and colleagues
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
