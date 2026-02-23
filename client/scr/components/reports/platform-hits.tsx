import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import { Music } from "lucide-react";
import { FaSpotify, FaYoutube, FaTiktok, FaFacebook, FaAmazon, FaDeezer, FaSoundcloud } from "react-icons/fa";
import { SiTidal, SiApplemusic } from "react-icons/si";
import type { StreamingReportRow } from "@shared/schema";

interface PlatformHitsProps {
  rows: StreamingReportRow[];
  displayCurrency?: 'EUR' | 'UAH';
}

// Platform logos/icons
const getPlatformIcon = (platform: string) => {
  const normalized = platform.toLowerCase();
  
  if (normalized.includes('spotify')) return <FaSpotify className="text-[#f050e0]" />;
  if (normalized.includes('youtube') || normalized.includes('you tube')) return <FaYoutube className="text-[#f050e0]" />;
  if (normalized.includes('apple')) return <SiApplemusic className="text-[#f050e0]" />;
  if (normalized.includes('deezer')) return <FaDeezer className="text-[#f050e0]" />;
  if (normalized.includes('tiktok')) return <FaTiktok className="text-[#f050e0]" />;
  if (normalized.includes('facebook')) return <FaFacebook className="text-[#f050e0]" />;
  if (normalized.includes('amazon')) return <FaAmazon className="text-[#f050e0]" />;
  if (normalized.includes('tidal')) return <SiTidal className="text-[#f050e0]" />;
  if (normalized.includes('soundcloud')) return <FaSoundcloud className="text-[#f050e0]" />;
  if (normalized.includes('tencent') || normalized.includes('qq')) return (
    <img 
      src="/qq-music-logo.png" 
      alt="QQ Music" 
      className="w-12 h-12 object-contain"
    />
  );
  
  return <Music className="text-[#f050e0]" />;
};

// Platform colors
const getPlatformColor = (platform: string): string => {
  const normalized = platform.toLowerCase();
  
  if (normalized.includes('spotify')) return 'from-green-500/10 to-green-600/10 border-green-500/20';
  if (normalized.includes('youtube') || normalized.includes('you tube')) return 'from-red-500/10 to-red-600/10 border-red-500/20';
  if (normalized.includes('apple')) return 'from-pink-500/10 to-pink-600/10 border-pink-500/20';
  if (normalized.includes('deezer')) return 'from-purple-500/10 to-purple-600/10 border-purple-500/20';
  if (normalized.includes('tiktok')) return 'from-cyan-500/10 to-cyan-600/10 border-cyan-500/20';
  if (normalized.includes('facebook')) return 'from-blue-500/10 to-blue-600/10 border-blue-500/20';
  if (normalized.includes('tencent') || normalized.includes('qq')) return 'from-yellow-500/10 to-yellow-600/10 border-yellow-500/20';
  
  return 'from-slate-500/10 to-slate-600/10 border-slate-500/20';
};

export function PlatformHits({ rows }: PlatformHitsProps) {
  const { t } = useTranslation();
  const platformHits = useMemo(() => {
    const platformMap = new Map<string, Map<string, number>>();
    
    rows.forEach(row => {
      const platform = row.partner?.trim();
      const track = row.trackName?.trim();
      
      if (!platform || !track) return;
      
      if (!platformMap.has(platform)) {
        platformMap.set(platform, new Map());
      }
      
      const trackMap = platformMap.get(platform)!;
      trackMap.set(track, (trackMap.get(track) || 0) + (row.streams || 0));
    });
    
    const hits: Array<{ platform: string; track: string; streams: number }> = [];
    
    platformMap.forEach((trackMap, platform) => {
      let topTrack = "";
      let maxStreams = 0;
      
      trackMap.forEach((streams, track) => {
        if (streams > maxStreams) {
          maxStreams = streams;
          topTrack = track;
        }
      });
      
      if (topTrack) {
        hits.push({ platform, track: topTrack, streams: maxStreams });
      }
    });
    
    return hits.sort((a, b) => b.streams - a.streams);
  }, [rows]);

  if (platformHits.length === 0) {
    return null;
  }

  const PlatformCard = ({ platform, track, streams }: { platform: string; track: string; streams: number }) => (
    <div 
      className={`p-4 rounded-lg bg-gradient-to-br border hover:scale-105 transition-transform ${getPlatformColor(platform)}`}
    >
      <div className="flex flex-col gap-2 text-center">
        <div className="flex justify-center items-center h-16 mb-1 text-5xl">
          {getPlatformIcon(platform)}
        </div>
        <span className="text-sm font-bold text-primary">{platform}</span>
        <span className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">{track}</span>
        <div className="mt-2 pt-2 border-t">
          <span className="text-2xl font-bold block">{streams.toLocaleString()}</span>
          <span className="text-xs text-muted-foreground">{t("reports.streams").toLowerCase()}</span>
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          {t("reports.platformHitsTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Mobile: Carousel with swipe */}
        <div className="md:hidden">
          <Carousel
            opts={{
              align: "start",
              loop: false,
            }}
            className="w-full"
          >
            <CarouselContent className="-ml-2 md:-ml-4">
              {platformHits.map(({ platform, track, streams }) => (
                <CarouselItem key={platform} className="pl-2 md:pl-4 basis-[85%] sm:basis-[70%]">
                  <PlatformCard platform={platform} track={track} streams={streams} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>

        {/* Desktop: Flex wrap */}
        <div className="hidden md:flex flex-wrap gap-3">
          {platformHits.map(({ platform, track, streams }) => (
            <div key={platform} className="flex-1 min-w-[200px] max-w-[280px]">
              <PlatformCard platform={platform} track={track} streams={streams} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
