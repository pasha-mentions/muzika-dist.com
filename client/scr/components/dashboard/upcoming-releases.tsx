import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, CheckCircle, ChevronRight, HelpCircle, Copy, ExternalLink, Share2, Download, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Release } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { useState, useEffect, useRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import ReleaseStatusTimeline from "./release-status-timeline";
import muzikaLogo from "@assets/logo_1768136198142.png";

interface PitchingSubmission {
  id: string;
  releaseId: string;
  status: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  mins: number;
  secs: number;
}

function calculateTimeLeft(releaseDate: Date): TimeLeft {
  const now = new Date();
  const diff = releaseDate.getTime() - now.getTime();
  
  if (diff <= 0) {
    return { days: 0, hours: 0, mins: 0, secs: 0 };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  
  return { days, hours, mins, secs };
}

function getReleaseTypeName(type: string, t: any): string {
  const types: Record<string, string> = {
    'single': t('releaseTypes.single', 'Single'),
    'ep': t('releaseTypes.ep', 'EP'),
    'album': t('releaseTypes.album', 'Album'),
    'music_video': t('releaseTypes.musicVideo', 'Music Video'),
  };
  return types[type] || type;
}

function LiveTimer({ releaseDate }: { releaseDate: Date }) {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(calculateTimeLeft(releaseDate));
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(releaseDate));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [releaseDate]);
  
  const timeUnits = [
    { value: timeLeft.days, label: t('dashboard.upcomingReleases.timer.days', 'Days') },
    { value: timeLeft.hours, label: t('dashboard.upcomingReleases.timer.hours', 'Hours') },
    { value: timeLeft.mins, label: t('dashboard.upcomingReleases.timer.mins', 'Mins') },
    { value: timeLeft.secs, label: t('dashboard.upcomingReleases.timer.secs', 'Secs') },
  ];
  
  return (
    <div className="flex gap-4 sm:gap-6">
      {timeUnits.map((unit, index) => (
        <div key={index} className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums">
            {unit.value}
          </div>
          <div className="text-xs text-muted-foreground">
            {unit.label}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  release: Release;
  artworkUrl: string | null;
  artworkFileId: string | null;
  daysLeft: number;
}

function ShareModal({ open, onClose, release, artworkUrl, artworkFileId, daysLeft }: ShareModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const imageRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const width = 1080;
      const height = 1920;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const wrapText = (text: string, maxWidth: number, fontSize: number): string[] => {
        ctx.font = `bold ${fontSize}px "Inter", system-ui, -apple-system, sans-serif`;
        const words = text.split(' ');
        const lines: string[] = [];
        let currentLine = '';
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word;
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
      };

      const drawTextWithSpacing = (text: string, x: number, y: number, spacing: number) => {
        ctx.textAlign = 'left';
        const chars = text.split('');
        let totalWidth = 0;
        const charWidths: number[] = [];
        for (const char of chars) {
          const w = ctx.measureText(char).width;
          charWidths.push(w);
          totalWidth += w;
        }
        totalWidth += spacing * (chars.length - 1);
        let currentX = x - totalWidth / 2;
        for (let i = 0; i < chars.length; i++) {
          ctx.fillText(chars[i], currentX, y);
          currentX += charWidths[i] + spacing;
        }
        ctx.textAlign = 'center';
      };

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0a0a0a');
      gradient.addColorStop(0.6, '#0f0f0f');
      gradient.addColorStop(0.85, '#1a0a20');
      gradient.addColorStop(1, '#2d1235');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const radialGradient = ctx.createRadialGradient(width / 2, height, 0, width / 2, height, height * 0.6);
      radialGradient.addColorStop(0, 'rgba(139, 92, 246, 0.15)');
      radialGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = radialGradient;
      ctx.fillRect(0, 0, width, height);

      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
        logoImg.src = muzikaLogo;
      });
      if (logoImg.complete && logoImg.naturalWidth > 0) {
        const logoHeight = 40;
        const logoWidth = (logoImg.naturalWidth / logoImg.naturalHeight) * logoHeight;
        ctx.globalAlpha = 0.9;
        ctx.drawImage(logoImg, 60, 110, logoWidth, logoHeight);
        ctx.globalAlpha = 1;
      }

      const fullResArtworkUrl = artworkFileId 
        ? `/api/files/${artworkFileId}` 
        : artworkUrl;
      
      if (fullResArtworkUrl) {
        const coverImg = new Image();
        coverImg.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          coverImg.onload = () => resolve();
          coverImg.onerror = () => resolve();
          coverImg.src = fullResArtworkUrl;
        });
        if (coverImg.complete && coverImg.naturalWidth > 0) {
          const coverSize = 576;
          const coverX = (width - coverSize) / 2;
          const coverY = 300;
          
          ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
          ctx.shadowBlur = 60;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          const radius = 40;
          ctx.beginPath();
          ctx.moveTo(coverX + radius, coverY);
          ctx.lineTo(coverX + coverSize - radius, coverY);
          ctx.quadraticCurveTo(coverX + coverSize, coverY, coverX + coverSize, coverY + radius);
          ctx.lineTo(coverX + coverSize, coverY + coverSize - radius);
          ctx.quadraticCurveTo(coverX + coverSize, coverY + coverSize, coverX + coverSize - radius, coverY + coverSize);
          ctx.lineTo(coverX + radius, coverY + coverSize);
          ctx.quadraticCurveTo(coverX, coverY + coverSize, coverX, coverY + coverSize - radius);
          ctx.lineTo(coverX, coverY + radius);
          ctx.quadraticCurveTo(coverX, coverY, coverX + radius, coverY);
          ctx.closePath();
          ctx.save();
          ctx.clip();
          ctx.drawImage(coverImg, coverX, coverY, coverSize, coverSize);
          ctx.restore();
          ctx.shadowBlur = 0;
        }
      }

      const titleLines = wrapText(release.title, width - 120, 72);
      const lineHeight = 85;
      const badgeHeight = 80;
      const footerY = height - 130;
      const footerMargin = 100;
      const badgeGap = 30;
      
      const contentHeight = titleLines.length * lineHeight + badgeGap + badgeHeight;
      const availableSpace = footerY - footerMargin - 900;
      const titleStartY = Math.min(960, 900 + (availableSpace - contentHeight) / 2) - ((titleLines.length - 1) * lineHeight) / 2;
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 72px "Inter", system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 10;
      
      titleLines.forEach((line, index) => {
        ctx.fillText(line, width / 2, titleStartY + index * lineHeight);
      });
      ctx.shadowBlur = 0;

      const badgeY = Math.min(titleStartY + titleLines.length * lineHeight + badgeGap, footerY - footerMargin - badgeHeight);
      const badgeText = `${daysLeft} ${daysText}`;
      ctx.font = 'bold 40px "Inter", system-ui, -apple-system, sans-serif';
      const badgeMetrics = ctx.measureText(badgeText);
      const badgePadding = 60;
      const badgeWidth = badgeMetrics.width + badgePadding * 2;
      const badgeX = (width - badgeWidth) / 2;
      
      const badgeGradient = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeWidth, badgeY + badgeHeight);
      badgeGradient.addColorStop(0, 'rgba(139, 92, 246, 0.3)');
      badgeGradient.addColorStop(1, 'rgba(168, 85, 247, 0.2)');
      
      ctx.beginPath();
      const badgeRadius = badgeHeight / 2;
      ctx.moveTo(badgeX + badgeRadius, badgeY);
      ctx.lineTo(badgeX + badgeWidth - badgeRadius, badgeY);
      ctx.arc(badgeX + badgeWidth - badgeRadius, badgeY + badgeRadius, badgeRadius, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(badgeX + badgeRadius, badgeY + badgeHeight);
      ctx.arc(badgeX + badgeRadius, badgeY + badgeRadius, badgeRadius, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = badgeGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(badgeText, width / 2, badgeY + badgeHeight / 2);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '32px "Inter", system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      drawTextWithSpacing('PRE-SAVE NOW', width / 2, height - 130, 6);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      
      const link = document.createElement('a');
      link.download = `${release.title}-presave.jpg`;
      link.href = dataUrl;
      link.click();
      
      toast({
        title: t('dashboard.upcomingReleases.share.download', 'Downloaded!'),
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to generate image:', error);
      toast({
        title: t('common.error', 'Error'),
        description: 'Failed to generate image',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const daysText = daysLeft === 1 
    ? t('dashboard.upcomingReleases.share.dayUntilRelease', 'day until release')
    : t('dashboard.upcomingReleases.share.daysUntilRelease', 'days until release');

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[400px] max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{t('dashboard.upcomingReleases.share.title', 'Share on social media')}</DialogTitle>
        </DialogHeader>
        
        <div className="p-4 overflow-y-auto">
          <div 
            ref={imageRef}
            className="relative rounded-lg overflow-hidden mx-auto"
            style={{
              width: '270px',
              height: '480px',
              background: 'linear-gradient(180deg, #0a0a0a 0%, #0f0f0f 60%, #1a0a20 85%, #2d1235 100%)',
            }}
          >
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 50% 100%, rgba(139, 92, 246, 0.15) 0%, transparent 60%)',
              }}
            />
            
            <div className="absolute top-7 left-4">
              <img 
                src={muzikaLogo} 
                alt="MUZIKA" 
                className="h-2.5 w-auto opacity-90"
                crossOrigin="anonymous"
              />
            </div>
            
            <div className="absolute inset-0 flex flex-col items-center px-6 pt-[76px]">
              <div 
                className="relative mb-4"
                style={{
                  filter: 'drop-shadow(0 0 24px rgba(139, 92, 246, 0.4))',
                }}
              >
                <div className="w-36 h-36 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
                  {artworkUrl ? (
                    <img
                      src={artworkUrl}
                      alt={release.title}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-900/50 to-black flex items-center justify-center">
                      <Music className="h-12 w-12 text-white/40" />
                    </div>
                  )}
                </div>
              </div>
              
              <h3 className="text-white text-lg font-bold text-center mb-3 drop-shadow-lg max-w-full px-2">
                {release.title}
              </h3>
              
              <div 
                className="px-4 py-2 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(168, 85, 247, 0.2) 100%)',
                  border: '1px solid rgba(139, 92, 246, 0.4)',
                  boxShadow: '0 0 16px rgba(139, 92, 246, 0.2)',
                }}
              >
                <span className="text-white font-semibold text-xs">
                  {daysLeft} {daysText}
                </span>
              </div>
            </div>
            
            <div className="absolute bottom-8 left-0 right-0 flex justify-center">
              <span className="text-white/40 text-[10px] tracking-widest uppercase">Pre-save now</span>
            </div>
          </div>
          
          <Button 
            onClick={handleDownload} 
            disabled={isDownloading}
            className="w-full mt-4"
          >
            <Download className="h-4 w-4 mr-2" />
            {t('dashboard.upcomingReleases.share.download', 'Download image')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReleaseCardProps {
  release: Release;
  hasPitching: boolean;
  onPitchClick: () => void;
}

function ReleaseCard({ release, hasPitching, onPitchClick }: ReleaseCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const artworkFileId = (release as any).artworkFileId;
  const artworkUrl = artworkFileId 
    ? `/api/files/thumbnail/${artworkFileId}` 
    : (release as any).artworkUrl || null;
  const multilink = release.multilink;
  const releaseDate = new Date(release.releaseDate!);
  const formattedDate = format(releaseDate, "MMM d, yyyy", { locale: uk });
  const formattedTime = format(releaseDate, "HH:mm") + " GMT+2";
  
  const daysLeft = Math.max(0, Math.floor((releaseDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)));
  
  const handleCopyLink = async () => {
    if (multilink) {
      await navigator.clipboard.writeText(multilink);
      toast({
        title: t('dashboard.upcomingReleases.checklist.copied', 'Copied!'),
        duration: 2000,
      });
    }
  };
  
  return (
    <>
      <ShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        release={release}
        artworkUrl={artworkUrl}
        artworkFileId={artworkFileId}
        daysLeft={daysLeft}
      />
      
      <Card className="overflow-hidden bg-card border-border">
        <CardContent className="p-0">
          <div className="flex flex-col lg:flex-row">
            <div className="p-4 sm:p-6 lg:border-r lg:border-border">
              <button
                onClick={() => setShareModalOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium mb-4 hover:bg-primary/90 transition-all animate-pulse cursor-pointer"
              >
                <Share2 className="h-4 w-4" />
                {t('dashboard.upcomingReleases.share.button', 'Share')}
              </button>
            
            <Link href={`/release/${release.id}`}>
              <div className="w-full max-w-[280px] sm:max-w-[200px] mx-auto lg:mx-0 aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-90 transition-opacity mb-4">
                {artworkUrl ? (
                  <img
                    src={artworkUrl}
                    alt={release.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </div>
            </Link>
            
            <div className="text-sm text-muted-foreground mb-1">
              {getReleaseTypeName(release.type, t)}
            </div>
            <Link href={`/release/${release.id}`}>
              <h3 className="text-xl sm:text-2xl font-bold text-foreground hover:text-primary transition-colors cursor-pointer mb-4">
                {release.title}
              </h3>
            </Link>
            
            <LiveTimer releaseDate={releaseDate} />
            
            <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
              <span>{formattedDate} • {formattedTime}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('dashboard.upcomingReleases.releaseTimeTooltip', 'Час релізу у вашому часовому поясі')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          
          <div className="hidden lg:flex flex-1 flex-col p-6">
            <h4 className="text-lg font-semibold text-foreground mb-2">
              {t('dashboard.upcomingReleases.checklist.title', 'Pre-release checklist')}
            </h4>
            <p className="text-sm text-muted-foreground mb-6">
              {t('dashboard.upcomingReleases.checklist.subtitle', 'Make sure your upcoming release reaches listeners far and wide.')}
            </p>
            
            <div className="space-y-3">
              <div 
                className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                onClick={onPitchClick}
              >
                <div className="flex items-center gap-3">
                  {hasPitching ? (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                  )}
                  <div>
                    <div className="font-medium text-foreground">
                      {t('dashboard.upcomingReleases.checklist.pitch', 'Pitch your new music')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {hasPitching 
                        ? t('dashboard.upcomingReleases.checklist.pitchDone', 'You have pitched your music')
                        : t('dashboard.upcomingReleases.checklist.pitchPending', 'Submit for editorial playlist consideration')
                      }
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              
              <div className={`flex items-center justify-between p-4 rounded-lg ${multilink ? 'bg-muted/50' : 'bg-muted/30 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  {multilink ? (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                  )}
                  <div>
                    <div className="font-medium text-foreground">
                      {t('dashboard.upcomingReleases.checklist.presave', 'Pre-save')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {multilink 
                        ? t('dashboard.upcomingReleases.checklist.presaveReady', 'Pre-save link is ready')
                        : t('dashboard.upcomingReleases.checklist.presavePending', 'Pre-save will be generated soon')
                      }
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {multilink ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={handleCopyLink}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        asChild
                      >
                        <a href={multilink} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    </>
                  ) : (
                    <div className="h-5 w-5" />
                  )}
                </div>
              </div>
            </div>
            
            <ReleaseStatusTimeline 
              release={{
                id: release.id,
                status: release.status,
                paymentStatus: release.paymentStatus || "PENDING",
                upc: release.upc,
                multilink: release.multilink,
                tracks: (release as any).tracks,
                createdAt: release.createdAt,
                paidAt: release.paidAt,
                codesAssignedAt: (release as any).codesAssignedAt,
              }}
            />
          </div>
          
          <div className="lg:hidden p-4 pt-0">
            <div className="space-y-3 mb-4">
              {hasPitching ? (
                <div className="flex items-center gap-2 text-sm text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  <span>{t('dashboard.upcomingReleases.pitchingSubmitted', 'Подано на пітчинг')}</span>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onPitchClick}
                  className="w-full"
                >
                  {t('dashboard.upcomingReleases.submitPitching', 'Подати на пітчинг')}
                </Button>
              )}
              
              {multilink ? (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    asChild
                  >
                    <a href={multilink} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('dashboard.upcomingReleases.checklist.presave', 'Pre-save')}
                    </a>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0"
                    onClick={handleCopyLink}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground" />
                  <span>{t('dashboard.upcomingReleases.checklist.presavePending', 'Pre-save will be generated soon')}</span>
                </div>
              )}
            </div>
            
            <ReleaseStatusTimeline 
              release={{
                id: release.id,
                status: release.status,
                paymentStatus: release.paymentStatus || "PENDING",
                upc: release.upc,
                multilink: release.multilink,
                tracks: (release as any).tracks,
                createdAt: release.createdAt,
                paidAt: release.paidAt,
                codesAssignedAt: (release as any).codesAssignedAt,
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}

export default function UpcomingReleases() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const currentOrgId = user?.organizations?.[0]?.id;

  const { data: upcomingReleases = [], isLoading } = useQuery<Release[]>({
    queryKey: ["/api/organizations", currentOrgId, "upcoming-releases"],
    enabled: !!currentOrgId,
    retry: false,
  });

  const { data: pitchingSubmissions = [] } = useQuery<PitchingSubmission[]>({
    queryKey: ["/api/pitching/submissions"],
    retry: false,
  });

  const isPitched = (releaseId: string) => {
    return pitchingSubmissions.some(sub => sub.releaseId === releaseId);
  };

  if (isLoading) {
    return (
      <Card className="bg-card">
        <CardContent className="p-6">
          <div className="space-y-4 animate-pulse">
            <div className="h-8 w-32 bg-muted rounded-full"></div>
            <div className="h-48 bg-muted rounded-lg"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!upcomingReleases || upcomingReleases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {upcomingReleases.map((release) => (
        <ReleaseCard
          key={release.id}
          release={release}
          hasPitching={isPitched(release.id)}
          onPitchClick={() => setLocation(`/pitching?releaseId=${release.id}`)}
        />
      ))}
    </div>
  );
}
