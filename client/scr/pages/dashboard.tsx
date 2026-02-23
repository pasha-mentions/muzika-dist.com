import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import StatsGrid from "@/components/release/stats-grid";
import RecentReleases from "@/components/release/recent-releases";
import UpcomingReleases from "@/components/dashboard/upcoming-releases";
import OnboardingChecklist from "@/components/dashboard/onboarding-checklist";
import PlatformNews from "@/components/dashboard/platform-news";
import RoyaltiesCard from "@/components/dashboard/royalties-card";
import TotalStreamsCard from "@/components/dashboard/total-streams-card";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GiftMarker } from "@/components/holiday/GiftMarker";
import PromotionalBanner from "@/components/promotional-banner";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading, isCurator } = useAuth();
  const [, navigate] = useLocation();

  // Redirect curators to their dashboard
  useEffect(() => {
    if (!isLoading && isAuthenticated && isCurator) {
      navigate("/curator");
    }
  }, [isLoading, isAuthenticated, isCurator, navigate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: t('toast.unauthorized'),
        description: t('toast.unauthorizedDesc'),
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast, t]);

  useEffect(() => {
    const showPitchingPrompt = sessionStorage.getItem('showPitchingPrompt');
    if (showPitchingPrompt === 'true') {
      sessionStorage.removeItem('showPitchingPrompt');
      
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        if (audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
      }
      
      toast({
        title: "Вітаємо з успішно створеним релізом! 🎉",
        description: (
          <div className="flex flex-col gap-3 mt-1">
            <p>Хочеш потрапити в офіційні плейлисти Spotify та Apple Music?</p>
            <Button
              variant="default"
              size="sm"
              className="w-full bg-primary hover:bg-primary/90"
              onClick={() => {
                navigate("/pitching");
              }}
            >
              Перейти до пітчингу
            </Button>
          </div>
        ),
        duration: Infinity,
        className: "w-[400px] max-w-[90vw] rounded-xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 to-background shadow-lg [&_[toast-close]]:opacity-100",
      });
    }
  }, [toast, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Two-column layout: Main content + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content - Takes 2 columns on desktop */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mobile only promotional banner */}
            <div className="md:hidden">
              <PromotionalBanner className="justify-center" />
            </div>
            {/* Stats Grid - Compact */}
            <div className="relative">
              <StatsGrid />
              <GiftMarker placementId="dashboard-stats" className="absolute top-2 right-2" />
            </div>

            {/* Upcoming Releases */}
            <UpcomingReleases />

            {/* Recent Releases */}
            <RecentReleases />
          </div>

          {/* Sidebar: Onboarding, Royalties, Streams, News */}
          <div className="space-y-4">
            <OnboardingChecklist />
            <RoyaltiesCard />
            <TotalStreamsCard />
            <PlatformNews />
          </div>
        </div>
      </div>
    </div>
  );
}
