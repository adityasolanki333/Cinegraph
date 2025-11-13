import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { login, register, demoLogin } from "@/hooks/useAuth";
import { LogIn, UserPlus, Zap, CheckCircle2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleDemoLogin = async () => {
    setIsLoading(true);
    
    try {
      const result = await demoLogin();
      
      if (result.success) {
        setShowSuccess(true);
        
        toast({
          title: "Demo Login Successful!",
          description: "You can now add movies to your watchlist! (No cookies needed)",
        });
        
        setTimeout(() => {
          setLocation('/');
        }, 1500);
      } else {
        throw new Error(result.error || 'Demo login failed');
      }
    } catch (error) {
      console.error('Error with demo login:', error);
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Could not login. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        const result = await register(email, password, firstName, lastName);
        
        if (result.success) {
          setShowSuccess(true);
          
          toast({
            title: "Account created!",
            description: "Welcome to the movie recommendation platform!",
          });
          
          setTimeout(() => {
            setLocation('/');
          }, 1500);
        } else {
          throw new Error(result.error || 'Registration failed');
        }
      } else {
        const result = await login(email, password);
        
        if (result.success) {
          setShowSuccess(true);
          
          toast({
            title: "Welcome back!",
            description: "You've successfully logged in.",
          });
          
          setTimeout(() => {
            setLocation('/');
          }, 1500);
        } else {
          throw new Error(result.error || 'Login failed');
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-green-500/20 to-blue-500/20 backdrop-blur-md"
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="flex flex-col items-center gap-6 bg-card/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl border border-border"
            >
              <motion.div
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", damping: 15, stiffness: 200, delay: 0.1 }}
                className="relative"
              >
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                  className="absolute inset-0 bg-green-500/30 rounded-full blur-xl"
                />
                <CheckCircle2 className="w-20 h-20 text-green-500 relative" data-testid="icon-success" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center space-y-2"
              >
                <p className="text-2xl font-bold text-foreground" data-testid="text-success-message">
                  Login Successful!
                </p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-muted-foreground flex items-center gap-2 justify-center"
                  data-testid="text-redirect-message"
                >
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  >
                    ⚡
                  </motion.span>
                  Redirecting you now...
                </motion.p>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {isSignUp ? "Create Account" : "Welcome Back"}
          </CardTitle>
          <CardDescription>
            {isSignUp 
              ? "Sign up to start building your personal movie watchlist" 
              : "Sign in to access your movie recommendations and watchlist"
            }
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                data-testid="input-password"
              />
            </div>
            
            {isSignUp && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="Enter your first name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    data-testid="input-firstname"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Enter your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    data-testid="input-lastname"
                  />
                </div>
              </>
            )}
            
            <Button type="submit" className="w-full" disabled={isLoading} data-testid={isSignUp ? "button-signup" : "button-signin"}>
              {isLoading ? (
                "Please wait..."
              ) : isSignUp ? (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create Account
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4 mr-2" />
                  Sign In
                </>
              )}
            </Button>
          </form>
          
          <div className="mt-4">
            <Separator className="my-4" />
            <Button
              variant="outline"
              className="w-full"
              onClick={handleDemoLogin}
              disabled={isLoading}
              data-testid="button-demo-login"
            >
              <Zap className="h-4 w-4 mr-2" />
              Try Demo Login
            </Button>
          </div>
          
          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm"
              data-testid="button-toggle-signup"
            >
              {isSignUp 
                ? "Already have an account? Sign in" 
                : "Don't have an account? Sign up"
              }
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}