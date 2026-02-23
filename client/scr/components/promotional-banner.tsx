import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink } from "lucide-react";

interface Banner {
  id: string;
  textEn: string;
  textUk: string;
  textPl: string;
  linkUrl: string;
  linkTarget: string;
  displayOrder: number;
  isActive: boolean;
}

interface PromotionalBannerProps {
  className?: string;
}

export default function PromotionalBanner({ className = "" }: PromotionalBannerProps) {
  const { i18n } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data: banners = [] } = useQuery<Banner[]>({
    queryKey: ["/api/promotional-banners"],
    refetchInterval: 60000,
  });

  // Reset index when banners array shrinks to prevent out-of-bounds
  useEffect(() => {
    if (banners.length > 0 && currentIndex >= banners.length) {
      setCurrentIndex(0);
    }
  }, [banners.length, currentIndex]);

  // Rotate banners every 4 seconds
  useEffect(() => {
    if (banners.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % banners.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const currentBanner = banners[currentIndex];
  if (!currentBanner) return null;

  const getText = (banner: Banner): string => {
    const lang = i18n.language;
    if (lang === "uk") return banner.textUk;
    if (lang === "pl") return banner.textPl;
    return banner.textEn;
  };

  return (
    <div className={`w-full ${className}`}>
      <AnimatePresence mode="wait">
        <motion.a
          key={currentBanner.id}
          href={currentBanner.linkUrl}
          target={currentBanner.linkTarget}
          rel={currentBanner.linkTarget === "_blank" ? "noopener noreferrer" : undefined}
          className="flex items-center justify-start gap-1.5 w-full px-3 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 border border-purple-500/20 text-purple-700 dark:text-purple-300 transition-colors cursor-pointer"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          <span className="flex-1 text-left">{getText(currentBanner)}</span>
          {currentBanner.linkTarget === "_blank" && (
            <ExternalLink className="h-3 w-3 flex-shrink-0" />
          )}
        </motion.a>
      </AnimatePresence>
    </div>
  );
}
