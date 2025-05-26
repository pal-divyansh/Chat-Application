import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, UserPlus, LogIn } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Landing() {
  const [loginUsername, setLoginUsername] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async (username: string) => {
      return await apiRequest("POST", "/api/login", { username });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome back!",
        description: "You've successfully logged in.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Username not found. Try signing up instead.",
        variant: "destructive",
      });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { username: string; firstName?: string; lastName?: string }) => {
      return await apiRequest("POST", "/api/signup", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome!",
        description: "Account created successfully. You're now logged in.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Signup failed",
        description: error.message || "Username already exists. Try logging in instead.",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginUsername.trim().length < 2) {
      toast({
        title: "Invalid username",
        description: "Username must be at least 2 characters long.",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate(loginUsername.trim());
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (signupUsername.trim().length < 2) {
      toast({
        title: "Invalid username",
        description: "Username must be at least 2 characters long.",
        variant: "destructive",
      });
      return;
    }
    signupMutation.mutate({
      username: signupUsername.trim(),
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
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
          <CardHeader className="text-center pb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-purple-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
              <MessageCircle className="text-white text-2xl w-8 h-8" />
            </div>
            <CardTitle className="text-3xl font-bold text-foreground">Welcome to ChatFlow</CardTitle>
            <p className="text-muted-foreground">Connect and chat with people instantly</p>
          </CardHeader>
          
          <CardContent className="p-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" className="flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Login
                </TabsTrigger>
                <TabsTrigger value="signup" className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4" />
                  Sign Up
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Input
                      type="text"
                      placeholder="Enter your username"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      className="bg-accent border-border/50 focus:border-primary text-lg py-3"
                      disabled={loginMutation.isPending}
                      autoFocus
                    />
                  </div>
                  
                  <Button 
                    type="submit"
                    disabled={!loginUsername.trim() || loginMutation.isPending}
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary py-3 rounded-xl font-semibold transition-all transform hover:scale-[1.02]"
                  >
                    {loginMutation.isPending ? "Logging in..." : "Login"}
                  </Button>
                </form>
                
                <div className="mt-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    Already have an account? Enter your username to continue.
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <Input
                      type="text"
                      placeholder="Choose a username"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      className="bg-accent border-border/50 focus:border-primary text-lg py-3"
                      disabled={signupMutation.isPending}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="text"
                      placeholder="First name (optional)"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="bg-accent border-border/50 focus:border-primary"
                      disabled={signupMutation.isPending}
                    />
                    <Input
                      type="text"
                      placeholder="Last name (optional)"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="bg-accent border-border/50 focus:border-primary"
                      disabled={signupMutation.isPending}
                    />
                  </div>
                  
                  <Button 
                    type="submit"
                    disabled={!signupUsername.trim() || signupMutation.isPending}
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 py-3 rounded-xl font-semibold transition-all transform hover:scale-[1.02]"
                  >
                    {signupMutation.isPending ? "Creating account..." : "Create Account"}
                  </Button>
                </form>
                
                <div className="mt-4 text-center">
                  <p className="text-muted-foreground text-sm">
                    New to ChatFlow? Create your account and start chatting!
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
