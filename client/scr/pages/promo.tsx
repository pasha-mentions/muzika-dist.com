import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Target, ListMusic, ChevronRight } from "lucide-react";
import { SiSpotify, SiApple, SiYoutube } from "react-icons/si";
import { useHasPaidRelease } from "@/hooks/useHasPaidRelease";
import { PaidReleaseModal } from "@/components/PaidReleaseModal";

export default function Promo() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { hasPaidRelease, isLoading } = useHasPaidRelease();
  const [showPaidReleaseModal, setShowPaidReleaseModal] = useState(false);

  const handlePitchingClick = () => {
    if (!isLoading && !hasPaidRelease) {
      setShowPaidReleaseModal(true);
      return;
    }
    navigate('/pitching');
  };

  const handlePlaylistsClick = () => {
    if (!isLoading && !hasPaidRelease) {
      setShowPaidReleaseModal(true);
      return;
    }
    navigate('/playlists');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8">
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">{t('promo.title')}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t('promo.subtitle')}</p>
        </div>

        <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
          <button
            onClick={handlePitchingClick}
            className="w-full flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/50 transition-all hover:shadow-lg group text-left"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm sm:text-base text-foreground">
                  {t('promo.officialPlaylists.title')}
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <SiSpotify className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1DB954]" />
                  <SiApple className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('promo.officialPlaylists.description')}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] sm:text-xs bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full">
                  {t('promo.officialPlaylists.officialTag')}
                </span>
                <span className="text-[10px] sm:text-xs bg-gray-500/10 text-gray-400 px-1.5 py-0.5 rounded-full">
                  {t('promo.officialPlaylists.freeTag')}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>

          <button
            onClick={handlePlaylistsClick}
            className="w-full flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/50 transition-all hover:shadow-lg group text-left"
          >
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center flex-shrink-0">
              <ListMusic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm sm:text-base text-foreground">
                  {t('promo.localPlaylists.title')}
                </span>
                <div className="flex gap-1.5 flex-shrink-0">
                  <SiSpotify className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1DB954]" />
                  <SiYoutube className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FF0000]" />
                  <SiApple className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('promo.localPlaylists.description')}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] sm:text-xs bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full">
                  {t('promo.localPlaylists.curatedTag')}
                </span>
                <span className="text-[10px] sm:text-xs bg-pink-500/10 text-pink-400 px-1.5 py-0.5 rounded-full">
                  {t('promo.localPlaylists.paidTag')}
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </button>
        </div>
      </div>

      <PaidReleaseModal 
        open={showPaidReleaseModal} 
        onOpenChange={setShowPaidReleaseModal} 
      />
    </div>
  );
}
