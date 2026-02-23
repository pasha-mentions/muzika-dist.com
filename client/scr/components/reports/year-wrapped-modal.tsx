import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Sparkles } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import html2canvas from "html2canvas";
import { MUZIKA_LOGO_BASE64 } from "./muzika-logo";

interface YearWrappedData {
  hasData: boolean;
  message?: string;
  artistName?: string;
  avatarUrl?: string;
  totalStreams?: number;
  premiumStreams?: number;
  releaseCount?: number;
  countryCount?: number;
  topPlatform?: { name: string; streams: number };
  topTrack?: { trackName: string; artist: string; streams: number; artworkUrl?: string };
  tiktokTopTrack?: { trackName: string; artist: string; streams: number };
  topCountry?: { name: string; streams: number };
  peakMonth?: { period: string; streams: number };
}

interface YearWrappedModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId?: string | null;
}

interface ArtistStatus {
  name: string;
  emoji: string;
  phrase: string;
  gradient: string;
  accentColor: string;
}

const getArtistStatus = (releaseCount: number, totalStreams: number): ArtistStatus => {
  if (releaseCount >= 5 && totalStreams >= 3000000) {
    return {
      name: "Ракета",
      emoji: "🚀",
      phrase: "Я знаю, ким я є в цій індустрії. 2026-й, летимо далі, воно того варте!",
      gradient: "linear-gradient(180deg, #1a1a1a 0%, #2d2d2d 30%, #1a1a1a 70%, #0a0a0a 100%)",
      accentColor: "#FFD700"
    };
  }
  
  if (releaseCount >= 5 && totalStreams >= 1000000) {
    return {
      name: "Маг",
      emoji: "🔮",
      phrase: "Моя музика стала частиною життя багатьох. 2026-й — давай ось так \"вжух\" і я повністю займаюся та заробляю творчістю.",
      gradient: "linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 30%, #2d1b4e 50%, #1a1a2e 70%, #0a0a0a 100%)",
      accentColor: "#a855f7"
    };
  }
  
  if (releaseCount >= 3 && totalStreams >= 500000) {
    return {
      name: "Творець року!",
      emoji: "💜",
      phrase: "Я гарно попрацював. У 2026-у обіцяю, що буду більше відпочивати щоб бути свіженьким на концертах!",
      gradient: "linear-gradient(180deg, #0a1628 0%, #1e3a5f 30%, #0ea5e9 50%, #1e3a5f 70%, #0a1628 100%)",
      accentColor: "#38bdf8"
    };
  }
  
  if (releaseCount >= 3 && totalStreams >= 100000) {
    return {
      name: "Фрілансер",
      emoji: "😎",
      phrase: "Моя музика живе, а отже мрія здійснюється, у 2026-у я почну творити та заробляти.",
      gradient: "linear-gradient(180deg, #1a0a1a 0%, #4a1942 30%, #6b2150 50%, #4a1942 70%, #1a0a1a 100%)",
      accentColor: "#f472b6"
    };
  }
  
  if (releaseCount >= 3 && totalStreams >= 50000) {
    return {
      name: "Магніт",
      emoji: "🧲",
      phrase: "Це було не просто, але я зміг і зрозумів власне звучання! 2026-й, вірю у наш перший мільйон слухачів!",
      gradient: "linear-gradient(180deg, #1a1a1a 0%, #3d3d3d 30%, #4a4a4a 50%, #3d3d3d 70%, #1a1a1a 100%)",
      accentColor: "#f59e0b"
    };
  }
  
  if (releaseCount >= 3 && totalStreams >= 15000) {
    return {
      name: "Творець",
      emoji: "💜",
      phrase: "Мене вже чують ⚡️ 2026 – моя можливість творити для мільйонів!",
      gradient: "linear-gradient(180deg, #1a0a2e 0%, #4a2c7a 30%, #7c3aed 50%, #4a2c7a 70%, #1a0a2e 100%)",
      accentColor: "#a855f7"
    };
  }
  
  if (releaseCount >= 2 && totalStreams >= 5000) {
    return {
      name: "Дослідник",
      emoji: "👀",
      phrase: "Дякую вам мої люди! У 2026-у я буду з вами частіше. Це тільки початок.",
      gradient: "linear-gradient(180deg, #0a1a1a 0%, #1e3a3a 30%, #0d4f4f 50%, #1e3a3a 70%, #0a1a1a 100%)",
      accentColor: "#14b8a6"
    };
  }
  
  return {
    name: "Іскра",
    emoji: "⚡️",
    phrase: "Хороший старт! У 2026 я дозволяю собі мислити масштабніше.",
    gradient: "linear-gradient(180deg, #1a0a2e 0%, #2d1b4e 30%, #3d2a5f 50%, #2d1b4e 70%, #1a0a2e 100%)",
    accentColor: "#8b5cf6"
  };
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString('uk-UA');
};

const formatMonth = (period: string): string => {
  const months: Record<string, string> = {
    '01': 'Січень', '02': 'Лютий', '03': 'Березень', '04': 'Квітень',
    '05': 'Травень', '06': 'Червень', '07': 'Липень', '08': 'Серпень',
    '09': 'Вересень', '10': 'Жовтень', '11': 'Листопад', '12': 'Грудень'
  };
  
  const parts = period.split(/[-\/]/);
  if (parts.length === 2) {
    const month = parts[0].padStart(2, '0');
    return months[month] || period;
  }
  return period;
};

const Snowflake = ({ style }: { style: React.CSSProperties }) => (
  <div 
    className="absolute text-white opacity-50 pointer-events-none select-none"
    style={style}
  >
    ❄
  </div>
);

const generateSnowflakes = () => {
  const snowflakes = [];
  for (let i = 0; i < 50; i++) {
    const left = Math.random() * 100;
    const animationDelay = Math.random() * 10;
    const animationDuration = 8 + Math.random() * 12;
    const fontSize = 8 + Math.random() * 16;
    const opacity = 0.2 + Math.random() * 0.5;
    
    snowflakes.push({
      id: i,
      style: {
        left: `${left}%`,
        top: `-20px`,
        fontSize: `${fontSize}px`,
        opacity,
        animation: `snowfall ${animationDuration}s linear ${animationDelay}s infinite`,
      }
    });
  }
  return snowflakes;
};

export function YearWrappedModal({ open, onOpenChange, orgId }: YearWrappedModalProps) {
  const [snowflakes] = useState(() => generateSnowflakes());
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const apiUrl = orgId 
    ? `/api/reports/year-wrapped?orgId=${orgId}` 
    : "/api/reports/year-wrapped";

  const { data, isLoading, error } = useQuery<YearWrappedData>({
    queryKey: ["/api/reports/year-wrapped", orgId],
    queryFn: async () => {
      const res = await apiRequest("GET", apiUrl);
      return res.json();
    },
    enabled: open,
  });

  const handleDownload = async () => {
    if (!cardRef.current) return;
    
    setIsGenerating(true);
    const card = cardRef.current;
    const title = titleRef.current;
    const overlay = overlayRef.current;
    
    // Store original styles
    const originalTransform = card.style.transform;
    const originalTitleStyle = title ? { 
      backgroundImage: title.style.backgroundImage,
      webkitBackgroundClip: title.style.webkitBackgroundClip,
      backgroundClip: title.style.backgroundClip,
      color: title.style.color
    } : null;
    const originalOverlayDisplay = overlay?.style.display;
    
    try {
      // Temporarily modify styles for html2canvas compatibility
      card.style.transform = 'none';
      
      // Fix gradient text - html2canvas doesn't support bg-clip-text
      if (title) {
        title.style.backgroundImage = 'none';
        title.style.webkitBackgroundClip = 'unset';
        title.style.backgroundClip = 'unset';
        title.style.color = '#ffffff';
      }
      
      // Hide overlay that causes white bar
      if (overlay) {
        overlay.style.display = 'none';
      }
      
      // Wait for reflow
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const canvas = await html2canvas(card, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        scale: 3, // 360*3=1080, 640*3=1920
      });
      
      canvas.toBlob((blob) => {
        if (!blob) {
          setIsGenerating(false);
          return;
        }
        
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `muzika-wrapped-2025.png`;
        link.href = blobUrl;
        
        if (navigator.userAgent.match(/iPhone|iPad|iPod|Android/i)) {
          window.open(blobUrl, '_blank');
        } else {
          link.click();
        }
        
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        setIsGenerating(false);
      }, 'image/png');
    } catch (err) {
      console.error('Error generating screenshot:', err);
      setIsGenerating(false);
    } finally {
      // Restore all original styles
      card.style.transform = originalTransform;
      if (title && originalTitleStyle) {
        title.style.backgroundImage = originalTitleStyle.backgroundImage;
        title.style.webkitBackgroundClip = originalTitleStyle.webkitBackgroundClip;
        title.style.backgroundClip = originalTitleStyle.backgroundClip;
        title.style.color = originalTitleStyle.color;
      }
      if (overlay && originalOverlayDisplay !== undefined) {
        overlay.style.display = originalOverlayDisplay;
      }
    }
  };

  const today = new Date().toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const status = data?.hasData 
    ? getArtistStatus(data.releaseCount || 0, data.totalStreams || 0)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] max-h-[90vh] overflow-y-auto p-4 sm:p-4 p-2">
        <style>{`
          @keyframes snowfall {
            0% {
              transform: translateY(0) rotate(0deg);
              opacity: 0;
            }
            10% {
              opacity: 1;
            }
            90% {
              opacity: 1;
            }
            100% {
              transform: translateY(1920px) rotate(360deg);
              opacity: 0;
            }
          }
        `}</style>
        
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Магічний звіт 2025
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500">
            Помилка завантаження даних
          </div>
        )}

        {data && !data.hasData && (
          <div className="text-center py-8 text-muted-foreground">
            {data.message || "Немає даних за 2025 рік"}
          </div>
        )}

        {data && data.hasData && status && (
          <div className="flex flex-col items-center gap-2 sm:gap-4">
            <div className="flex justify-center shrink-0 h-[480px] sm:h-auto">
              <div 
                ref={cardRef}
                className="relative overflow-hidden rounded-xl scale-[0.75] sm:scale-100 origin-top"
                style={{
                  width: '360px',
                  height: '640px',
                  background: status.gradient,
                }}
              >
              {snowflakes.map((flake) => (
                <Snowflake key={flake.id} style={flake.style} />
              ))}
              
              <div ref={overlayRef} className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/30" />
              
              <div className="relative z-10 h-full flex flex-col p-4 pt-[6%] text-white">
                <div className="text-center mb-3">
                  <h1 
                    ref={titleRef}
                    className="text-4xl font-bold bg-clip-text text-transparent"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${status.accentColor}, #ffffff, ${status.accentColor})`
                    }}
                  >
                    2025
                  </h1>
                </div>

                <div className="flex items-center justify-center gap-3 mb-3">
                  {data.avatarUrl ? (
                    <img 
                      src={data.avatarUrl} 
                      alt="Avatar" 
                      className="w-12 h-12 rounded-full object-cover shadow-lg"
                      style={{ border: `2px solid ${status.accentColor}50` }}
                    />
                  ) : (
                    <div 
                      className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
                      style={{ 
                        background: `linear-gradient(135deg, ${status.accentColor}80, ${status.accentColor}40)`,
                        border: `2px solid ${status.accentColor}50`
                      }}
                    >
                      <span className="text-lg font-bold">
                        {data.artistName?.charAt(0) || '?'}
                      </span>
                    </div>
                  )}
                  <h2 className="text-lg font-bold">{data.artistName}</h2>
                </div>

                <div className="text-center mb-2">
                  <p className="text-[10px] opacity-60 font-bold">
                    <span className="mr-1">Статус року:</span>
                    <span className="mr-0.5">{status.emoji}</span>
                    <span>{status.name}</span>
                  </p>
                </div>

                <div 
                  className="rounded-xl p-3 mb-3 text-center italic text-[11px] leading-relaxed"
                  style={{ 
                    backgroundColor: `${status.accentColor}15`,
                    border: `1px solid ${status.accentColor}30`
                  }}
                >
                  "{status.phrase}"
                </div>

                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div 
                      className="backdrop-blur-md rounded-xl p-3"
                      style={{ 
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">
                        Мене чули
                      </p>
                      <p className="text-xl font-bold text-white">
                        {formatNumber(data.totalStreams || 0)} <span className="text-sm font-normal opacity-70">разів</span>
                      </p>
                    </div>

                    <div 
                      className="backdrop-blur-md rounded-xl p-3"
                      style={{ 
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">
                        Випущено
                      </p>
                      <p className="text-xl font-bold">{data.releaseCount || 0} <span className="text-sm font-normal opacity-70">релізів</span></p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {data.topCountry && (
                      <div 
                        className="backdrop-blur-md rounded-xl p-2.5"
                        style={{ 
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">
                          Де слухали?
                        </p>
                        <p className="text-sm font-semibold">
                          {data.topCountry.name}
                          {(data.countryCount && data.countryCount > 1) && (
                            <span className="font-normal opacity-70"> та ще {data.countryCount - 1} {data.countryCount - 1 === 1 ? 'країна' : (data.countryCount - 1 < 5 ? 'країни' : 'країн')}</span>
                          )}
                        </p>
                      </div>
                    )}

                    {data.topTrack && (
                      <div 
                        className="backdrop-blur-md rounded-xl p-2.5"
                        style={{ 
                          backgroundColor: 'rgba(236,72,153,0.15)',
                          border: '1px solid rgba(236,72,153,0.3)'
                        }}
                      >
                        <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: '#f472b6' }}>
                          Топ трек
                        </p>
                        <div className="flex items-center gap-2">
                          {data.topTrack.artworkUrl && (
                            <img 
                              src={data.topTrack.artworkUrl} 
                              alt="Cover" 
                              className="w-8 h-8 rounded-lg object-cover shadow-md"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-xs leading-tight">{data.topTrack.trackName}</p>
                            <p className="text-[9px] opacity-70">
                              {formatNumber(data.topTrack.streams)} стрімів
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {data.topPlatform && (
                      <div 
                        className="backdrop-blur-md rounded-xl p-2"
                        style={{ 
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">
                          Найбільше слухали на
                        </p>
                        <p className="text-xs font-semibold">{data.topPlatform.name}</p>
                      </div>
                    )}

                    {data.tiktokTopTrack && (
                      <div 
                        className="backdrop-blur-md rounded-xl p-2"
                        style={{ 
                          backgroundColor: 'rgba(255,255,255,0.1)',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                      >
                        <p className="text-[9px] uppercase tracking-wider mb-0.5 opacity-70">
                          TikTok хіт
                        </p>
                        <p className="font-semibold text-xs leading-tight">{data.tiktokTopTrack.trackName}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2 text-center">
                  <p className="text-[8px] opacity-50 mb-1">
                    підсумки сформовані платформою muzika-dist.com
                  </p>
                  <img 
                    src={MUZIKA_LOGO_BASE64} 
                    alt="Muzika" 
                    className="h-2.5 w-auto mx-auto opacity-60"
                  />
                </div>
              </div>
            </div>
            </div>

            <Button 
              onClick={handleDownload}
              disabled={isGenerating}
              className="w-full mt-4"
              style={{ 
                background: status ? `linear-gradient(135deg, ${status.accentColor}, ${status.accentColor}cc)` : undefined
              }}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Генерація...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Завантажити
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
