import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import muzikaLogo from "@assets/Logo_new.png";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast({
        title: t("forgotPassword.error"),
        description: t("forgotPassword.emailRequired"),
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to send reset email');
      }

      setIsSuccess(true);
    } catch (error: any) {
      toast({
        title: t("forgotPassword.error"),
        description: error.message || t("forgotPassword.errorDesc"),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    window.location.href = "/";
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
      <div className="relative z-10 w-full max-w-md">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img 
              src={muzikaLogo} 
              alt="MUZIKA" 
              className="h-8 w-auto"
            />
          </div>
          <h1 className="text-lg md:text-2xl font-semibold text-white">
            {t("forgotPassword.title")}
          </h1>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/80 backdrop-blur-sm rounded-lg border border-zinc-800 p-8 shadow-2xl">
          {isSuccess ? (
            /* Success State */
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-white">
                  {t("forgotPassword.successTitle")}
                </h2>
                <p className="text-zinc-400 text-sm">
                  {t("forgotPassword.successDesc")}
                </p>
              </div>
              <Button
                type="button"
                onClick={handleBackToLogin}
                variant="outline"
                className="w-full border-zinc-700 text-zinc-200 hover:bg-zinc-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t("forgotPassword.backToLogin")}
              </Button>
            </div>
          ) : (
            /* Form State */
            <>
              <p className="text-zinc-400 text-sm text-center mb-6">
                {t("forgotPassword.description")}
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-zinc-200">
                    {t("forgotPassword.emailLabel")}
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 focus-visible:ring-zinc-600 pl-10"
                      placeholder={t("forgotPassword.emailPlaceholder")}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-white font-medium"
                  size="lg"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("forgotPassword.sending")}
                    </>
                  ) : (
                    t("forgotPassword.submit")
                  )}
                </Button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="text-sm text-zinc-400 hover:text-zinc-300 transition-colors inline-flex items-center"
                  >
                    <ArrowLeft className="w-3 h-3 mr-1" />
                    {t("forgotPassword.backToLogin")}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
