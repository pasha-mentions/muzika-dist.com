import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { SiMeta, SiYoutube } from "react-icons/si";
import { History, ChevronRight, Clock, Zap, Megaphone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { GiftMarker } from "@/components/holiday/GiftMarker";
import { useHasPaidRelease } from "@/hooks/useHasPaidRelease";
import { PaidReleaseModal } from "@/components/PaidReleaseModal";
import { motion } from "framer-motion";

export default function Ads() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPaidRelease, isLoading } = useHasPaidRelease();
  const [showPaidReleaseModal, setShowPaidReleaseModal] = useState(false);

  const handleMetaSelect = () => {
    if (!isLoading && !hasPaidRelease) {
      setShowPaidReleaseModal(true);
      return;
    }
    toast({
      title: t('ads.comingSoonTitle', 'Незабаром'),
      description: t('ads.comingSoonDescription', 'Реклама в Meta (Instagram & Facebook) буде доступна найближчим часом.'),
    });
  };

  const handleYoutubeSelect = () => {
    if (!isLoading && !hasPaidRelease) {
      setShowPaidReleaseModal(true);
      return;
    }
    navigate("/ads/youtube");
  };

  const handleYoutubeHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoading && !hasPaidRelease) {
      setShowPaidReleaseModal(true);
      return;
    }
    navigate("/ads/youtube/history");
  };

  return (
    <div className="py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header — original desktop centered, compact mobile */}
        <div className="mb-8 text-center relative hidden sm:block">
          <GiftMarker placementId="ads-header" className="absolute top-0 right-0" />
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {t('ads.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('ads.description')}
          </p>
        </div>
        <div className="mb-4 relative sm:hidden">
          <GiftMarker placementId="ads-header" className="absolute top-0 right-0" />
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Megaphone className="w-5 h-5 text-primary" />
              <h1 className="text-lg font-bold text-foreground">
                {t('ads.title')}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('ads.description')}
            </p>
          </motion.div>
        </div>

        {/* Desktop: original centered card grid */}
        <div className="hidden sm:grid md:grid-cols-2 gap-4 mb-12 max-w-2xl mx-auto">
          <Card 
            className="cursor-pointer hover:shadow-lg hover:border-primary transition-all duration-200 border-2 group"
            onClick={handleMetaSelect}
          >
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <SiMeta className="w-8 h-8 text-white" />
              </div>
              
              <h2 className="text-xl font-bold">Meta</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('ads.metaDescription')}
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg hover:border-primary transition-all duration-200 border-2 group"
            onClick={handleYoutubeSelect}
          >
            <CardContent className="p-6 text-center">
              <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <SiYoutube className="w-8 h-8 text-white" />
              </div>
              
              <h2 className="text-xl font-bold">YouTube</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {t('ads.youtubeDescription')}
              </p>
              
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleYoutubeHistory}
              >
                <History className="w-3 h-3 mr-1" />
                {t('ads.campaignHistory')}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Mobile: elegant horizontal cards */}
        <div className="space-y-3 sm:hidden">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            onClick={handleYoutubeSelect}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleYoutubeSelect(); }}
            className="w-full flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/50 transition-all hover:shadow-lg group text-left cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <SiYoutube className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-foreground">
                  YouTube Ads
                </span>
                <span className="text-[10px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5" />
                  {t('ads.available', 'Доступно')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {t('ads.youtubeDescription')}
              </p>
              <button
                onClick={handleYoutubeHistory}
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <History className="w-3 h-3" />
                {t('ads.campaignHistory')}
              </button>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            onClick={handleMetaSelect}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleMetaSelect(); }}
            className="w-full flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-blue-500/30 transition-all hover:shadow-lg group text-left cursor-pointer opacity-80 hover:opacity-100"
          >
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform shadow-md">
              <SiMeta className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-sm text-foreground">
                  Meta Ads
                </span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  {t('ads.comingSoon', 'Скоро')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {t('ads.metaDescription')}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] bg-pink-500/10 text-pink-400 px-1.5 py-0.5 rounded-full">
                  Instagram
                </span>
                <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full">
                  Facebook
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </motion.div>
        </div>
      </div>

      <PaidReleaseModal 
        open={showPaidReleaseModal} 
        onOpenChange={setShowPaidReleaseModal} 
      />
    </div>
  );
}
