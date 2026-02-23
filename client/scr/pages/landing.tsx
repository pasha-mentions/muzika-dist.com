import { useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Music, Gamepad2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import muzikaLogo from "@assets/Logo_new.png";

const Catch100Game = lazy(() => import("@/components/catch100-game"));

export default function Landing() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showGame, setShowGame] = useState(false);

  // Fetch 2026 releases count
  const { data: releasesData } = useQuery<{ count: number; year: number }>({
    queryKey: ['/api/public/releases-count-2026'],
    queryFn: async () => {
      const res = await fetch('/api/public/releases-count-2026');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 60000, // Cache for 1 minute
  });

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Missing credentials",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }

    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid credentials');
      }

      // Login successful - force page reload to reset auth state
      window.location.href = "/";
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleForgotPassword = () => {
    window.location.href = "/forgot-password";
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Background Video */}
      <div className="absolute inset-0 w-full h-full">
        <iframe
          className="absolute top-1/2 left-1/2 w-[100vw] h-[56.25vw] min-h-[100vh] min-w-[177.77vh] -translate-x-1/2 -translate-y-1/2"
          src="https://www.youtube.com/embed/PFHnsZGu7jo?autoplay=1&mute=1&loop=1&playlist=PFHnsZGu7jo&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1"
          title="Background video"
          allow="autoplay; encrypted-media"
          style={{ pointerEvents: 'none' }}
        />
      </div>

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-[#212121] opacity-90" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md px-2 sm:px-0 min-h-screen flex flex-col justify-center py-8 sm:py-16">
        {/* Logo and Welcome */}
        <div className="text-center mb-4 sm:mb-8">
          <div className="flex justify-center mb-4 sm:mb-6">
            <img 
              src={muzikaLogo} 
              alt="MUZIKA" 
              className="h-6 sm:h-8 w-auto"
            />
          </div>
          <h1 className="text-base sm:text-lg md:text-2xl font-semibold text-white px-2">
            Hi, creator! Less mess. More music.
          </h1>
          
          {/* 2026 Releases Counter */}
          {releasesData && releasesData.count > 0 && (
            <div className="mt-3 sm:mt-4 flex flex-col items-center gap-2 px-4">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <Music className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  <span className="text-xs sm:text-sm">
                    У 2026 році вийшло <span className="text-white font-semibold">{releasesData.count}</span> релізів
                  </span>
                </div>
                <span className="text-xs sm:text-sm text-zinc-500">
                  від незалежних артистів
                </span>
              </div>
              <button
                onClick={() => setShowGame(true)}
                className="flex items-center justify-center gap-2 mt-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 hover:bg-primary/20 hover:border-primary/50 transition-all duration-200 group"
              >
                <Gamepad2 className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm text-primary font-medium">Злови 100 платівок — отримай безкоштовний реліз!</span>
              </button>
            </div>
          )}
        </div>

        {/* Login Card */}
        <div className="bg-zinc-900/80 backdrop-blur-sm rounded-lg border border-zinc-800 p-5 sm:p-8 shadow-2xl">
          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin} className="space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="email" className="text-xs sm:text-sm text-zinc-200">
                Email or username
              </Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600 h-9 sm:h-10 text-sm"
                placeholder="Enter your email or username"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="password" className="text-xs sm:text-sm text-zinc-200">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600 h-9 sm:h-10 text-sm"
                placeholder="Enter your password"
              />
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                className="border-zinc-700 data-[state=checked]:bg-primary data-[state=checked]:border-primary h-4 w-4 sm:h-4 sm:w-4"
              />
              <Label
                htmlFor="remember"
                className="text-xs sm:text-sm text-zinc-300 cursor-pointer select-none"
              >
                Remember me
              </Label>
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-white font-medium h-9 sm:h-10 text-sm"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>

            {/* Forgot Password */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-xs sm:text-sm text-primary hover:text-primary/80 transition-colors"
              >
                Forgot the password?
              </button>
            </div>
          </form>

          {/* Telegram Registration */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-zinc-700">
            <p className="text-xs sm:text-sm text-zinc-400 text-center mb-2 sm:mb-3">
              Don't have an account?
            </p>
            <Button
              asChild
              variant="outline"
              className="w-full border-zinc-600 bg-zinc-800/50 hover:bg-zinc-700 text-white h-9 sm:h-10 text-sm"
            >
              <a 
                href="https://t.me/muzika_info" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-2" />
                Register via Telegram
              </a>
            </Button>
          </div>
        </div>

        {/* Footer - pushed to bottom */}
        <div className="mt-auto pt-4 text-center">
          <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-2 sm:mb-3 px-2">
            <a href="/legal/privacy" className="text-[10px] sm:text-xs text-zinc-400 hover:text-primary transition-colors">
              Privacy Policy
            </a>
            <a href="/legal/offer" className="text-[10px] sm:text-xs text-zinc-400 hover:text-primary transition-colors">
              Public Offer
            </a>
            <a href="/legal/terms" className="text-[10px] sm:text-xs text-zinc-400 hover:text-primary transition-colors">
              Terms & Conditions
            </a>
            <a href="/legal/refund" className="text-[10px] sm:text-xs text-zinc-400 hover:text-primary transition-colors">
              Refund Policy
            </a>
          </div>
          <div className="text-[10px] sm:text-xs text-zinc-500">
            © 2025 Muzika Distribution. All rights reserved.
          </div>
        </div>
      </div>

      {showGame && (
        <Suspense fallback={null}>
          <Catch100Game onClose={() => setShowGame(false)} />
        </Suspense>
      )}
    </div>
  );
}
