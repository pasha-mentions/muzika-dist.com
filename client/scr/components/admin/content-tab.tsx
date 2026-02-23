import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  Music,
  Loader2,
  Download,
  Play,
  Pause,
  Video,
  Smartphone,
  Square,
  Monitor,
  RectangleHorizontal,
  Palette,
  Type,
  Image as ImageIcon,
  Sparkles,
  RotateCcw,
  Building2,
  ChevronsUpDown,
  Check,
  Volume2,
  VolumeX,
  Maximize,
  Upload,
  Link,
  Unlink,
  Sun,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FaSpotify, FaApple, FaYoutube, FaTiktok, FaDeezer, FaAmazon } from "react-icons/fa";
import { SiTidal, SiShazam } from "react-icons/si";
import { cn } from "@/lib/utils";

interface ContentRelease {
  id: string;
  title: string;
  artworkFileId: string | null;
  artistName: string;
  organizationName: string;
  tracks: Array<{
    id: string;
    title: string;
    audioFileId: string | null;
    tiktokClipStart: number | null;
  }>;
}

type VideoFormat = "vertical" | "square" | "portrait" | "landscape";
type BackgroundType = "blurred" | "solid" | "gradient" | "video";
type AnimationTemplate = "glow-player" | "promo-card";
type PromoLayout = "cover" | "fullscreen" | "textonly";
type ElementPosition = "top" | "center" | "bottom";

interface VideoBackground {
  id: string;
  name: string;
  thumbnailUrl: string;
  proxyUrl: string;
}

interface VideoSettings {
  format: VideoFormat;
  backgroundType: BackgroundType;
  solidColor: string;
  gradientColor1: string;
  gradientColor2: string;
  videoBackgroundFileId: string;
  tagline: string;
  taglineColor: string;
  promoTitle: string;
  promoTitleColor: string;
  template: AnimationTemplate;
  promoLayout: PromoLayout;
  duration: number;
  storeIcons: string[];
  storeIconStyle: string;
  audioStart: number;
  videoDarken: boolean;
  textPosition: ElementPosition;
  iconsPosition: ElementPosition;
  syncTextIconEffects: boolean;
  textShadowColor: string;
  textShadowIntensity: number;
  textGlow: boolean;
  textGlowColor: string;
  iconShadowColor: string;
  iconShadowIntensity: number;
  iconGlow: boolean;
  iconGlowColor: string;
}

const FORMAT_DIMENSIONS: Record<VideoFormat, { width: number; height: number; label: string; description: string }> = {
  vertical: { width: 1080, height: 1920, label: "Vertical", description: "9:16 · Reels, TikTok, Stories" },
  square: { width: 1080, height: 1080, label: "Square", description: "1:1" },
  portrait: { width: 1080, height: 1440, label: "3:4", description: "Instagram Feed" },
  landscape: { width: 1920, height: 1080, label: "Landscape", description: "16:9 · YouTube" },
};

const STORE_OPTIONS = [
  { id: "spotify", label: "Spotify", Icon: FaSpotify },
  { id: "apple", label: "Apple Music", Icon: FaApple },
  { id: "youtube", label: "YouTube Music", Icon: FaYoutube },
  { id: "tiktok", label: "TikTok", Icon: FaTiktok },
  { id: "deezer", label: "Deezer", Icon: FaDeezer },
  { id: "tidal", label: "Tidal", Icon: SiTidal },
  { id: "amazon", label: "Amazon Music", Icon: FaAmazon },
  { id: "shazam", label: "Shazam", Icon: SiShazam },
];

const DEFAULT_SETTINGS: VideoSettings = {
  format: "vertical",
  backgroundType: "blurred",
  solidColor: "#000000",
  gradientColor1: "#1a1a2e",
  gradientColor2: "#16213e",
  videoBackgroundFileId: "",
  tagline: "NEW MUSIC",
  taglineColor: "#ffffff",
  promoTitle: "",
  promoTitleColor: "#ffffff",
  template: "glow-player",
  promoLayout: "cover",
  duration: 30,
  storeIcons: ["spotify", "apple", "youtube"],
  storeIconStyle: "#ffffff",
  audioStart: 0,
  videoDarken: true,
  textPosition: "bottom",
  iconsPosition: "bottom",
  syncTextIconEffects: true,
  textShadowColor: "#000000",
  textShadowIntensity: 50,
  textGlow: false,
  textGlowColor: "#ffffff",
  iconShadowColor: "#000000",
  iconShadowIntensity: 0,
  iconGlow: false,
  iconGlowColor: "#ffffff",
};

function normalizeColor(val: string): string {
  if (val === "black") return "#000000";
  if (val === "white") return "#ffffff";
  return val;
}

function getTextShadowStyle(color: string, intensity: number, glow: boolean, glowColor: string): string {
  const parts: string[] = [];
  if (intensity > 0) {
    const blur = Math.round(intensity * 0.4);
    const spread = Math.round(intensity * 0.2);
    parts.push(`0 2px ${blur}px ${color}`);
    if (spread > 5) parts.push(`0 0 ${spread}px ${color}`);
  }
  if (glow) {
    parts.push(`0 0 20px ${glowColor}`, `0 0 40px ${glowColor}`, `0 0 60px ${glowColor}40`);
  }
  return parts.length > 0 ? parts.join(", ") : "none";
}

function getIconFilterStyle(color: string, intensity: number, glow: boolean, glowColor: string): string {
  const parts: string[] = [];
  if (intensity > 0) {
    const blur = Math.round(intensity * 0.3);
    parts.push(`drop-shadow(0 2px ${blur}px ${color})`);
  }
  if (glow) {
    parts.push(`drop-shadow(0 0 8px ${glowColor})`, `drop-shadow(0 0 16px ${glowColor})`);
  }
  return parts.length > 0 ? parts.join(" ") : "none";
}

function MotionPreview({
  settings,
  artworkUrl,
  trackTitle,
  artistName,
  isPlaying,
}: {
  settings: VideoSettings;
  artworkUrl: string | null;
  trackTitle: string;
  artistName: string;
  isPlaying: boolean;
}) {
  const dims = FORMAT_DIMENSIONS[settings.format];
  const aspectRatio = dims.width / dims.height;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const container = containerRef.current.parentElement;
      if (!container) return;
      const maxW = container.clientWidth - 32;
      const maxH = 500;
      const scaleW = maxW / dims.width;
      const scaleH = maxH / dims.height;
      setScale(Math.min(scaleW, scaleH, 0.3));
    };
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [dims]);

  const previewW = dims.width * scale;
  const previewH = dims.height * scale;

  const getBackground = () => {
    if (settings.backgroundType === "solid") {
      return { background: settings.solidColor };
    }
    if (settings.backgroundType === "gradient") {
      return { background: `linear-gradient(135deg, ${settings.gradientColor1}, ${settings.gradientColor2})` };
    }
    if (settings.backgroundType === "video") {
      return { background: "#000" };
    }
    return { background: "#000" };
  };

  const isLandscape = settings.format === "landscape";
  const isSquare = settings.format === "square";
  const isPortrait = settings.format === "portrait";
  const isVertical = settings.format === "vertical";
  const isPromoLandscape = isLandscape && settings.template === "promo-card";
  const isVideoBg = settings.backgroundType === "video";

  const tagColor = normalizeColor(settings.taglineColor);
  const titleColor = normalizeColor(settings.promoTitleColor);
  const iconColor = normalizeColor(settings.storeIconStyle);

  const textShadowCSS = getTextShadowStyle(settings.textShadowColor, settings.textShadowIntensity, settings.textGlow, settings.textGlowColor);
  const iconFilterCSS = getIconFilterStyle(settings.iconShadowColor, settings.iconShadowIntensity, settings.iconGlow, settings.iconGlowColor);

  const getCoverSize = () => {
    if (isPromoLandscape) return Math.min(previewW, previewH) * 0.75;
    if (settings.template === "promo-card") return Math.min(previewW, previewH) * (isVertical ? 0.665 : 0.7);
    if (isVideoBg) {
      if (isLandscape) return Math.min(previewW, previewH) * 0.55;
      if (isSquare) return Math.min(previewW, previewH) * 0.38;
      if (isPortrait) return Math.min(previewW, previewH) * 0.4;
      return Math.min(previewW, previewH) * 0.45;
    }
    if (isLandscape) return Math.min(previewW, previewH) * 0.65;
    return Math.min(previewW, previewH) * 0.45;
  };
  const coverSize = getCoverSize();
  const iconSize = Math.max(12, previewW * 0.04);
  const taglineText = settings.tagline || "NEW MUSIC";
  const titleText = settings.promoTitle || trackTitle;

  const selectedStores = STORE_OPTIONS.filter((s) => settings.storeIcons.includes(s.id));

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl shadow-2xl border border-border/50 mx-auto"
      style={{
        width: previewW,
        height: previewH,
        ...getBackground(),
      }}
    >
      {settings.backgroundType === "blurred" && artworkUrl && (
        <div className="absolute inset-0">
          <img
            src={artworkUrl}
            alt=""
            className="w-full h-full object-cover"
            style={{ filter: "blur(40px) brightness(0.4) saturate(1.5)", transform: "scale(1.3)" }}
          />
        </div>
      )}
      {settings.backgroundType === "video" && settings.videoBackgroundFileId && (
        <div className="absolute inset-0">
          <video
            src={`/api/admin/content/video-backgrounds/proxy/${settings.videoBackgroundFileId}`}
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
            style={{ filter: settings.videoDarken ? "brightness(0.5)" : "none" }}
          />
        </div>
      )}

      {settings.template === "glow-player" ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ animation: isPlaying ? "zoomIn 1s ease-out forwards" : "none" }}
        >
          <div
            className={`flex items-center justify-center ${
              isLandscape ? "flex-row gap-[5%] px-[8%]" :
              "flex-col gap-[8%]"
            }`}
            style={{
              opacity: isPlaying && isVideoBg ? 1 : isVideoBg ? 0 : 1,
              transition: isVideoBg ? "opacity 0.8s ease-out" : "none",
              ...(isVideoBg && isSquare ? { gap: "4%", marginTop: `-${previewH * 0.08}px` } :
                isVideoBg && isPortrait ? { gap: "5%", marginTop: `-${previewH * 0.08}px` } :
                isVideoBg && isLandscape ? { marginTop: `-${previewH * 0.08}px` } :
                !isVideoBg && !isLandscape ? { marginTop: `-${previewH * 0.05}px` } : {}),
            }}
          >
            {artworkUrl && (
              <div className="relative" style={{ width: coverSize, height: coverSize, flexShrink: 0 }}>
                {!isVideoBg && (
                  <div
                    className="absolute inset-0 rounded-2xl"
                    style={{
                      background: `url(${artworkUrl}) center/cover`,
                      filter: "blur(30px) brightness(0.8) saturate(2)",
                      transform: "scale(1.3)",
                      opacity: 0.7,
                    }}
                  />
                )}
                <img
                  src={artworkUrl}
                  alt=""
                  className={`relative w-full h-full object-cover rounded-2xl shadow-2xl ${isPlaying ? "animate-pulse-slow" : ""}`}
                  style={{ animation: isPlaying ? "float 3s ease-in-out infinite" : "none" }}
                />
              </div>
            )}

            <div
              className={`relative rounded-2xl backdrop-blur-md bg-white/10 border border-white/20 flex flex-col ${isLandscape ? "items-start" : "items-center"} px-[5%] py-[3%]`}
              style={{
                width: isLandscape ? coverSize * 1.1 : isVideoBg && isSquare ? coverSize * 0.85 : coverSize * 0.9,
                gap: previewH * 0.01,
              }}
            >
              <p
                className={`font-bold truncate w-full ${isLandscape ? "text-left" : "text-center"}`}
                style={{
                  fontSize: Math.max(8, previewW * (isVideoBg && (isSquare || isPortrait) ? 0.03 : 0.035)),
                  color: "white",
                }}
              >
                {artistName}
              </p>
              <p
                className={`truncate w-full opacity-80 ${isLandscape ? "text-left" : "text-center"}`}
                style={{
                  fontSize: Math.max(7, previewW * (isVideoBg && (isSquare || isPortrait) ? 0.024 : 0.028)),
                  color: "white",
                }}
              >
                {titleText}
              </p>
              <div
                className="w-full rounded-full bg-white/30 mt-1"
                style={{ height: Math.max(2, previewH * 0.003) }}
              >
                <div
                  className="rounded-full bg-white h-full"
                  style={{
                    width: isPlaying ? "60%" : "0%",
                    transition: isPlaying ? `width ${settings.duration}s linear` : "none",
                  }}
                />
              </div>
              <div className="flex items-center justify-center gap-[10%] mt-1 w-full">
                <svg width={iconSize * 0.7} height={iconSize * 0.7} viewBox="0 0 24 24" fill="white" opacity={0.5}><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" transform="scale(-1,1) translate(-24,0)"/></svg>
                <svg width={iconSize * 0.6} height={iconSize * 0.6} viewBox="0 0 24 24" fill="white" opacity={0.5}><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
                <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="white">{isPlaying ? <><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></> : <path d="M8 5v14l11-7z"/>}</svg>
                <svg width={iconSize * 0.6} height={iconSize * 0.6} viewBox="0 0 24 24" fill="white" opacity={0.5}><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>
                <svg width={iconSize * 0.7} height={iconSize * 0.7} viewBox="0 0 24 24" fill="white" opacity={0.5}><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </div>
            </div>
          </div>

          {isVideoBg && !isSquare && !isPortrait && !isLandscape && selectedStores.length > 0 && (
            <div
              className="relative flex items-center justify-center flex-wrap"
              style={{
                gap: previewW * 0.05,
                marginTop: previewH * 0.1,
                filter: iconFilterCSS,
              }}
            >
              {selectedStores.map((store, idx) => (
                <div
                  key={store.id}
                  className="flex items-center"
                  style={{
                    gap: previewW * 0.01,
                    opacity: isPlaying ? 0.9 : 0,
                    transition: `opacity 0.5s ease-out`,
                    transitionDelay: isPlaying ? `${1.0 + idx * 0.3}s` : "0s",
                  }}
                >
                  <store.Icon
                    style={{
                      color: iconColor,
                      width: Math.max(10, previewW * 0.035),
                      height: Math.max(10, previewW * 0.035),
                    }}
                  />
                  <span
                    style={{
                      color: iconColor,
                      fontSize: Math.max(7, previewW * 0.025),
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {store.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {isVideoBg && !isSquare && !isPortrait && !isLandscape && (
            <p
              className="relative text-center"
              style={{
                color: iconColor,
                opacity: 0.5,
                fontSize: Math.max(5, previewW * 0.018),
                fontWeight: 400,
                fontStyle: "italic",
                marginTop: previewH * 0.12,
                letterSpacing: "0.03em",
                clipPath: isPlaying ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                transition: "clip-path 0.8s ease-out",
                transitionDelay: isPlaying ? `${1.0 + selectedStores.length * 0.3 + 0.3}s` : "0s",
              }}
            >
              Distributed by muzika.ua
            </p>
          )}

          {isVideoBg && (isSquare || isPortrait || isLandscape) && (
            <div
              className="absolute left-0 right-0 flex flex-col items-center"
              style={{ bottom: previewH * 0.04 }}
            >
              <p
                className="text-center"
                style={{
                  color: iconColor,
                  opacity: 0.5,
                  fontSize: Math.max(5, previewW * 0.018),
                  fontWeight: 400,
                  marginBottom: previewH * 0.015,
                  letterSpacing: "0.03em",
                  clipPath: isPlaying ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
                  transition: "clip-path 0.8s ease-out",
                  transitionDelay: isPlaying ? `${1.0 + selectedStores.length * 0.3 + 0.3}s` : "0s",
                }}
              >
                Distributed by muzika.ua
              </p>
              {selectedStores.length > 0 && (
                <div
                  className="flex items-center justify-center flex-wrap"
                  style={{
                    gap: previewW * (isLandscape ? 0.04 : 0.05),
                    filter: iconFilterCSS,
                  }}
                >
                  {selectedStores.map((store, idx) => (
                    <div
                      key={store.id}
                      className="flex items-center"
                      style={{
                        gap: previewW * 0.01,
                        opacity: isPlaying ? 0.9 : 0,
                        transition: `opacity 0.5s ease-out`,
                        transitionDelay: isPlaying ? `${1.0 + idx * 0.3}s` : "0s",
                      }}
                    >
                      <store.Icon
                        style={{
                          color: iconColor,
                          width: Math.max(10, previewW * 0.035),
                          height: Math.max(10, previewW * 0.035),
                        }}
                      />
                      <span
                        style={{
                          color: iconColor,
                          fontSize: Math.max(7, previewW * 0.025),
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                        }}
                      >
                        {store.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : settings.template === "promo-card" && (settings.promoLayout === "fullscreen" || settings.promoLayout === "textonly") && isLandscape ? (
        <div
          className="absolute inset-0"
          style={{ animation: isPlaying ? "zoomIn 1s ease-out forwards" : "none", padding: "6%" }}
        >
          {artworkUrl && settings.promoLayout !== "textonly" && (
            <div
              className="absolute flex items-center justify-center"
              style={{ left: "6%", top: "50%", transform: "translateY(-50%)" }}
            >
              <img
                src={artworkUrl}
                alt=""
                className="object-cover rounded-2xl shadow-2xl"
                style={{
                  width: coverSize * 0.6,
                  height: coverSize * 0.6,
                  animation: isPlaying ? "float 3s ease-in-out infinite" : "none",
                }}
              />
            </div>
          )}
          <div
            className="absolute flex flex-col justify-center"
            style={{
              left: artworkUrl && settings.promoLayout !== "textonly" ? "50%" : "6%",
              ...(settings.textPosition === "top" ? { top: settings.iconsPosition === "top" ? "2%" : "6%" } :
                 settings.textPosition === "center" ? {
                   top: "50%",
                   transform: settings.iconsPosition === "center" ? "translateY(-120%)" : "translateY(-50%)",
                 } :
                 { bottom: settings.iconsPosition === "bottom" ? "18%" : "6%" }),
            }}
          >
            {settings.taglineColor !== "none" && (
              <p
                className="font-semibold uppercase tracking-wider whitespace-nowrap"
                style={{
                  fontSize: Math.max(6, previewW * 0.018),
                  color: tagColor,
                  opacity: 0.85,
                  marginBottom: previewH * 0.015,
                  letterSpacing: "0.08em",
                  textShadow: textShadowCSS,
                }}
              >
                {taglineText}
              </p>
            )}
            {settings.promoTitleColor !== "none" && (
              <p
                className="font-bold leading-tight whitespace-nowrap overflow-hidden"
                style={{
                  fontSize: Math.max(10, previewW * 0.045),
                  color: titleColor,
                  textShadow: textShadowCSS,
                }}
              >
                {titleText}
              </p>
            )}
          </div>
          {selectedStores.length > 0 && (
            <div
              className="absolute grid"
              style={{
                left: artworkUrl && settings.promoLayout !== "textonly" ? "50%" : "6%",
                ...(settings.iconsPosition === "top" ? { top: settings.textPosition === "top" ? "18%" : "6%" } :
                   settings.iconsPosition === "center" ? {
                     top: "50%",
                     transform: settings.textPosition === "center" ? "translateY(60%)" : "translateY(-50%)",
                   } :
                   { bottom: "6%" }),
                gridTemplateColumns: `repeat(${Math.min(3, selectedStores.length)}, auto)`,
                gap: `${previewH * 0.015}px ${previewW * 0.015}px`,
                justifyContent: "start",
                alignItems: "center",
                filter: iconFilterCSS,
              }}
            >
              {selectedStores.map((store) => (
                <div
                  key={store.id}
                  className="flex items-center whitespace-nowrap"
                  style={{ gap: previewW * 0.008 }}
                >
                  <store.Icon
                    style={{
                      color: iconColor,
                      opacity: 0.9,
                      width: Math.max(10, previewW * 0.025),
                      height: Math.max(10, previewW * 0.025),
                    }}
                  />
                  <span
                    style={{
                      color: iconColor,
                      fontSize: Math.max(5, previewW * 0.015),
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {store.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : settings.template === "promo-card" && (settings.promoLayout === "fullscreen" || settings.promoLayout === "textonly") ? (
        <div
          className="absolute inset-0"
          style={{ animation: isPlaying ? "zoomIn 1s ease-out forwards" : "none" }}
        >
          {artworkUrl && settings.promoLayout !== "textonly" && (
            <div
              className="absolute left-0 right-0 flex items-center justify-center"
              style={{ top: "50%", transform: "translateY(-60%)" }}
            >
              <img
                src={artworkUrl}
                alt=""
                className="object-cover rounded-2xl shadow-2xl"
                style={{
                  width: coverSize * 0.85,
                  height: coverSize * 0.85,
                  animation: isPlaying ? "float 3s ease-in-out infinite" : "none",
                }}
              />
            </div>
          )}
          <div
            className="absolute left-0 right-0 w-full text-center"
            style={{
              ...(settings.textPosition === "top" ? {
                   top: settings.iconsPosition === "top" ? previewH * 0.02 : previewH * 0.06,
                 } :
                 settings.textPosition === "center" ? {
                   top: "50%",
                   transform: settings.iconsPosition === "center" ? "translateY(-120%)" : "translateY(-50%)",
                 } :
                 { bottom: settings.iconsPosition === "bottom" ? previewH * 0.18 : previewH * 0.06 }),
            }}
          >
            {settings.taglineColor !== "none" && (
              <p
                className="font-semibold uppercase tracking-wider"
                style={{
                  fontSize: Math.max(7, previewW * 0.022),
                  color: tagColor,
                  opacity: 0.85,
                  marginBottom: previewH * 0.01,
                  letterSpacing: "0.08em",
                  textShadow: textShadowCSS,
                }}
              >
                {taglineText}
              </p>
            )}
            {settings.promoTitleColor !== "none" && (
              <p
                className="font-black leading-none"
                style={{
                  fontSize: Math.max(14, previewW * 0.1),
                  color: titleColor,
                  textShadow: textShadowCSS,
                  letterSpacing: "-0.02em",
                }}
              >
                {titleText}
              </p>
            )}
          </div>
          {selectedStores.length > 0 && (
            <div
              className="absolute left-0 right-0 w-full flex items-center justify-center flex-wrap"
              style={{
                ...(settings.iconsPosition === "top" ? {
                     top: settings.textPosition === "top" ? previewH * 0.18 : previewH * 0.05,
                   } :
                   settings.iconsPosition === "center" ? {
                     top: "50%",
                     transform: settings.textPosition === "center" ? "translateY(60%)" : "translateY(-50%)",
                   } :
                   { bottom: previewH * 0.05 }),
                gap: previewW * 0.05,
                filter: iconFilterCSS,
              }}
            >
              {selectedStores.map((store) => (
                <div
                  key={store.id}
                  className="flex items-center"
                  style={{ gap: previewW * 0.012 }}
                >
                  <store.Icon
                    style={{
                      color: iconColor,
                      opacity: 0.9,
                      width: Math.max(10, previewW * 0.035),
                      height: Math.max(10, previewW * 0.035),
                    }}
                  />
                  <span
                    style={{
                      color: iconColor,
                      fontSize: Math.max(6, previewW * 0.022),
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {store.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : isPromoLandscape ? (
        <div
          className="absolute inset-0 flex flex-row items-center justify-center"
          style={{ animation: isPlaying ? "zoomIn 1s ease-out forwards" : "none", padding: "6%" }}
        >
          {artworkUrl && (
            <div className="relative flex-shrink-0" style={{ width: coverSize * 0.75, height: coverSize * 0.75 }}>
              <img
                src={artworkUrl}
                alt=""
                className="relative w-full h-full object-cover rounded-2xl shadow-2xl"
              />
            </div>
          )}
          <div className="flex flex-col justify-center flex-shrink-0" style={{ paddingLeft: "5%" }}>
            {settings.taglineColor !== "none" && (
              <p
                className="font-semibold uppercase tracking-wider"
                style={{
                  fontSize: Math.max(8, previewW * 0.022),
                  color: tagColor,
                  opacity: 0.85,
                  marginBottom: previewH * 0.02,
                  textShadow: textShadowCSS,
                }}
              >
                {taglineText}
              </p>
            )}
            {settings.promoTitleColor !== "none" && (
              <p
                className="font-bold leading-tight"
                style={{
                  fontSize: Math.max(12, previewW * 0.055),
                  color: titleColor,
                  marginBottom: previewH * 0.04,
                  textShadow: textShadowCSS,
                }}
              >
                {titleText}
              </p>
            )}
            {selectedStores.length > 0 && (
              <div className="flex items-center" style={{ gap: previewW * 0.02, filter: iconFilterCSS }}>
                {selectedStores.map((store) => (
                  <store.Icon
                    key={store.id}
                    style={{
                      color: iconColor,
                      opacity: 0.8,
                      width: Math.max(14, previewW * 0.035),
                      height: Math.max(14, previewW * 0.035),
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`absolute inset-0 flex flex-col ${isVertical ? "items-center justify-center" : ""}`} style={{ animation: isPlaying ? "zoomIn 1s ease-out forwards" : "none" }}>
          <div className={`${isVertical ? "" : "flex-1"} flex items-center justify-center p-[5%]`}>
            {artworkUrl && (
              <img
                src={artworkUrl}
                alt=""
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                style={{
                  width: coverSize,
                  height: coverSize,
                }}
              />
            )}
          </div>
          <div
            className={`${isVertical ? "text-center px-[5%] pt-[2%] pb-[2%]" : "px-[6%] pb-[6%]"}`}
            style={{ color: settings.promoTitleColor === "none" ? "transparent" : titleColor }}
          >
            {settings.taglineColor !== "none" && (
              <p
                className="font-semibold uppercase tracking-wider mb-1"
                style={{
                  fontSize: Math.max(7, previewW * 0.025),
                  color: tagColor,
                  opacity: 0.9,
                  textShadow: textShadowCSS,
                }}
              >
                {taglineText}
              </p>
            )}
            {settings.promoTitleColor !== "none" && (
              <p
                className="font-bold leading-tight"
                style={{
                  fontSize: Math.max(10, previewW * 0.06),
                  color: titleColor,
                  textShadow: textShadowCSS,
                }}
              >
                {titleText}
              </p>
            )}
          </div>
          {selectedStores.length > 0 && (
            <div
              className={`flex items-center ${isVertical ? "justify-center pb-[2%]" : "px-[6%] pb-[5%]"} gap-[3%]`}
              style={{ fontSize: Math.max(10, previewW * 0.035), filter: iconFilterCSS }}
            >
              {selectedStores.map((store) => (
                <store.Icon
                  key={store.id}
                  style={{
                    color: iconColor,
                    opacity: 0.8,
                    width: Math.max(12, previewW * 0.04),
                    height: Math.max(12, previewW * 0.04),
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AdminOrganization {
  id: string;
  name: string;
  type?: string;
}

export default function ContentTab() {
  const { toast } = useToast();
  const { isPlatformAdmin } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [orgOpen, setOrgOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<ContentRelease | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string>("");
  const [settings, setSettings] = useState<VideoSettings>({ ...DEFAULT_SETTINGS });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState("");

  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioLoading, setAudioLoading] = useState(true);
  const [audioError, setAudioError] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [dragOverBg, setDragOverBg] = useState(false);

  const { data: videoBackgrounds, refetch: refetchBgs } = useQuery<{ preset: VideoBackground[]; custom: VideoBackground[] }>({
    queryKey: ["/api/admin/content/video-backgrounds"],
    queryFn: async () => {
      const res = await fetch("/api/admin/content/video-backgrounds", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch video backgrounds");
      return res.json();
    },
  });

  const { data: orgs, isLoading: orgsLoading } = useQuery<AdminOrganization[]>({
    queryKey: ["/api/admin/organizations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/organizations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
    enabled: isPlatformAdmin,
  });

  const selectedOrg = useMemo(() => orgs?.find((o) => o.id === selectedOrgId), [orgs, selectedOrgId]);

  const { data: releases, isLoading: releasesLoading } = useQuery<ContentRelease[]>({
    queryKey: ["/api/admin/content/releases", selectedOrgId, isPlatformAdmin],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (isPlatformAdmin && selectedOrgId) params.append("orgId", selectedOrgId);
      params.append("limit", "50");
      const res = await fetch(`/api/admin/content/releases?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch releases");
      return res.json();
    },
    enabled: isPlatformAdmin ? !!selectedOrgId : true,
  });

  const selectedTrack = useMemo(() => {
    if (!selectedRelease || !selectedTrackId) return null;
    return selectedRelease.tracks.find((t) => t.id === selectedTrackId) || null;
  }, [selectedRelease, selectedTrackId]);

  const artworkUrl = selectedRelease?.artworkFileId
    ? `/api/files/download/${selectedRelease.artworkFileId}`
    : null;

  useEffect(() => {
    if (selectedRelease) {
      const firstTrack = selectedRelease.tracks[0];
      const tiktokStart = firstTrack?.tiktokClipStart;
      setSettings((s) => ({
        ...s,
        promoTitle: firstTrack?.title || selectedRelease.title,
        audioStart: tiktokStart && tiktokStart > 0 ? tiktokStart : 0,
      }));
      if (selectedRelease.tracks.length > 0 && !selectedTrackId) {
        setSelectedTrackId(firstTrack.id);
      }
    }
  }, [selectedRelease]);

  useEffect(() => {
    if (!selectedRelease || !selectedTrackId) {
      updateSetting("audioStart", 0);
      return;
    }
    const track = selectedRelease.tracks.find((t) => t.id === selectedTrackId);
    const tiktokStart = track?.tiktokClipStart;
    updateSetting("audioStart", tiktokStart && tiktokStart > 0 ? tiktokStart : 0);
  }, [selectedTrackId, selectedRelease]);

  const updateSetting = <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const handleUploadBg = async (file: File) => {
    const MAX_SIZE_MB = 200;
    const MAX_DURATION_S = 60;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      toast({ title: `Файл занадто великий. Максимум ${MAX_SIZE_MB} МБ`, variant: "destructive" });
      return;
    }

    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          URL.revokeObjectURL(video.src);
          resolve(video.duration);
        };
        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          reject(new Error("Cannot read video"));
        };
        video.src = URL.createObjectURL(file);
      });

      if (duration > MAX_DURATION_S) {
        toast({ title: `Відео занадто довге. Максимум ${MAX_DURATION_S} секунд`, variant: "destructive" });
        return;
      }
    } catch {
      toast({ title: "Не вдалося прочитати відео. Перевірте формат файлу", variant: "destructive" });
      return;
    }

    setUploadingBg(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/content/video-backgrounds/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const bg = await res.json();
      refetchBgs();
      updateSetting("videoBackgroundFileId", bg.id);
      toast({ title: "Фон завантажено" });
    } catch {
      toast({ title: "Помилка завантаження фону", variant: "destructive" });
    } finally {
      setUploadingBg(false);
    }
  };

  const handleDeleteBg = async (fileId: string) => {
    try {
      const res = await fetch(`/api/admin/content/video-backgrounds/${fileId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Delete failed");
      refetchBgs();
      if (settings.videoBackgroundFileId === fileId) {
        updateSetting("videoBackgroundFileId", "");
      }
      toast({ title: "Фон видалено" });
    } catch {
      toast({ title: "Помилка видалення", variant: "destructive" });
    }
  };

  const audioSrc = selectedTrack?.audioFileId
    ? `/api/files/download/${selectedTrack.audioFileId}`
    : null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;

    setAudioLoading(true);
    setAudioError(false);
    setAudioCurrentTime(0);
    setAudioDuration(0);
    setAudioPlaying(false);

    const onMeta = () => { setAudioDuration(audio.duration); setAudioLoading(false); setAudioError(false); };
    const onTime = () => { setAudioCurrentTime(audio.currentTime); };
    const onEnd = () => { setAudioPlaying(false); };
    const onErr = (e: Event) => { e.stopPropagation(); setAudioError(true); setAudioLoading(false); };
    const onCanPlay = () => { setAudioLoading(false); };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("error", onErr);
    audio.addEventListener("canplay", onCanPlay);

    audio.src = audioSrc;
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("error", onErr);
      audio.removeEventListener("canplay", onCanPlay);
      audio.pause();
    };
  }, [audioSrc]);

  useEffect(() => {
    const fileId = selectedTrack?.audioFileId;
    if (!fileId) { setWaveformData([]); return; }
    let cancelled = false;

    fetch(`/api/admin/content/waveform/${fileId}`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error("Waveform fetch failed");
        return res.json();
      })
      .then((data: { waveform: number[] }) => {
        if (!cancelled) setWaveformData(data.waveform);
      })
      .catch(() => {
        if (!cancelled) setWaveformData([]);
      });

    return () => { cancelled = true; };
  }, [selectedTrack?.audioFileId]);

  useEffect(() => {
    if (settings.promoLayout === 'textonly' && settings.backgroundType !== 'video') {
      updateSetting('backgroundType', 'video');
    }
  }, [settings.promoLayout, settings.backgroundType]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || waveformData.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const w = rect.width;
    const h = rect.height;
    const barW = w / waveformData.length;
    const gap = Math.max(0.5, barW * 0.15);
    const startPos = audioDuration > 0 ? settings.audioStart / audioDuration : 0;
    const currentPos = audioDuration > 0 ? audioCurrentTime / audioDuration : 0;

    waveformData.forEach((amp, i) => {
      const barPos = i / waveformData.length;
      const isPlayed = barPos >= startPos && barPos <= currentPos && audioCurrentTime > settings.audioStart;
      const barH = Math.max(2, amp * h * 0.92);
      const x = i * barW;
      const y = h - barH;

      ctx.fillStyle = isPlayed
        ? "rgba(168, 85, 247, 0.85)"
        : "rgba(160, 160, 180, 0.4)";
      ctx.beginPath();
      ctx.roundRect(x + gap / 2, y, Math.max(1, barW - gap), barH, 1);
      ctx.fill();
    });
  }, [waveformData, audioCurrentTime, audioDuration, settings.audioStart]);

  const formatTimestamp = (seconds: number): string => {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const timeline = timelineRef.current;
    if (!audio || !timeline || !audioDuration) return;

    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    const time = Math.floor(ratio * audioDuration);

    updateSetting("audioStart", time);
    audio.currentTime = time;
    audio.play().catch(() => {});
    setAudioPlaying(true);
  }, [audioDuration]);

  const toggleAudioPlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioError) return;
    if (audioPlaying) {
      audio.pause();
      setAudioPlaying(false);
    } else {
      audio.play().catch(() => {});
      setAudioPlaying(true);
    }
  }, [audioPlaying, audioError]);

  const toggleAudioMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audioMuted;
    setAudioMuted(!audioMuted);
  }, [audioMuted]);

  const toggleStoreIcon = (storeId: string) => {
    setSettings((s) => ({
      ...s,
      storeIcons: s.storeIcons.includes(storeId)
        ? s.storeIcons.filter((id) => id !== storeId)
        : [...s.storeIcons, storeId],
    }));
  };

  const handleRender = async () => {
    if (!selectedRelease || !selectedTrackId) {
      toast({ title: "Оберіть реліз та трек", variant: "destructive" });
      return;
    }
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStage("downloading");
    try {
      const startRes = await fetch("/api/admin/content/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          releaseId: selectedRelease.id,
          trackId: selectedTrackId,
          settings,
        }),
      });

      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Render failed");
      }

      const { jobId } = await startRes.json();
      if (!jobId) throw new Error("No job ID returned");

      while (true) {
        await new Promise((r) => setTimeout(r, 800));
        const pollRes = await fetch(`/api/admin/content/render/progress/${jobId}`, { credentials: "include" });
        if (!pollRes.ok) throw new Error("Failed to check progress");
        const job = await pollRes.json();

        setRenderProgress(job.percent);
        setRenderStage(job.stage);

        if (job.status === "error") {
          throw new Error(job.error || "Render failed");
        }

        if (job.status === "done") {
          const a = document.createElement("a");
          a.href = `/api/admin/content/render/download/${job.downloadId}`;
          a.download = job.filename || `${selectedRelease.title}_motion.mp4`;
          a.click();
          toast({ title: "Відео згенеровано та завантажено!" });
          break;
        }
      }
    } catch (error: any) {
      toast({ title: "Помилка рендерингу", description: error.message, variant: "destructive" });
    } finally {
      setIsRendering(false);
      setRenderProgress(0);
      setRenderStage("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Video className="w-5 h-5 text-purple-500" />
            Motion Video Generator
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Створюйте промо-відео на основі обкладинки, аудіо та метаданих релізу
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-6">
        {/* Left: Settings Panel */}
        <div className="space-y-4">
          {/* Organization & Release Selection */}
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Organization Dropdown — admin only */}
              {isPlatformAdmin && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Організація
                  </Label>
                  <Popover open={orgOpen} onOpenChange={setOrgOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={orgOpen}
                        className="w-full justify-between h-10 font-normal"
                      >
                        {selectedOrg ? selectedOrg.name : "Оберіть організацію..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Пошук організації..." />
                        <CommandList>
                          <CommandEmpty>Нічого не знайдено</CommandEmpty>
                          <CommandGroup>
                            {orgs?.map((org) => (
                              <CommandItem
                                key={org.id}
                                value={org.name}
                                onSelect={() => {
                                  setSelectedOrgId(org.id);
                                  setSelectedRelease(null);
                                  setSelectedTrackId("");
                                  setOrgOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedOrgId === org.id ? "opacity-100" : "opacity-0")} />
                                {org.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

              {/* Release Dropdown */}
              {(isPlatformAdmin ? !!selectedOrgId : true) && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Music className="w-4 h-4" /> Реліз
                  </Label>
                  {releasesLoading ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : releases && releases.length > 0 ? (
                    <Popover open={releaseOpen} onOpenChange={setReleaseOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={releaseOpen}
                          className="w-full justify-between h-10 font-normal"
                        >
                          {selectedRelease ? (
                            <span className="truncate">{selectedRelease.title} — {selectedRelease.artistName}</span>
                          ) : (
                            "Оберіть реліз..."
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Пошук релізу..." />
                          <CommandList>
                            <CommandEmpty>Нічого не знайдено</CommandEmpty>
                            <CommandGroup>
                              {releases.map((release) => (
                                <CommandItem
                                  key={release.id}
                                  value={`${release.title} ${release.artistName}`}
                                  onSelect={() => {
                                    setSelectedRelease(release);
                                    setSelectedTrackId(release.tracks[0]?.id || "");
                                    setSettings((s) => ({
                                      ...s,
                                      promoTitle: release.tracks[0]?.title || release.title,
                                    }));
                                    setReleaseOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4 shrink-0", selectedRelease?.id === release.id ? "opacity-100" : "opacity-0")} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm truncate">{release.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">{release.artistName} · {release.tracks.length} треків</p>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Немає релізів у цій організації
                    </p>
                  )}
                </div>
              )}

              {/* Track Selector */}
              {selectedRelease && selectedRelease.tracks.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Music className="w-4 h-4" /> Трек
                  </Label>
                  <Select value={selectedTrackId} onValueChange={setSelectedTrackId}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Обрати трек" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedRelease.tracks.map((track) => (
                        <SelectItem key={track.id} value={track.id}>
                          {track.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <audio ref={audioRef} preload="metadata" className="hidden" />
              {selectedTrack?.audioFileId && (
                <div className="pt-2 border-t">
                  <Label className="text-xs text-muted-foreground block mb-5">
                    Початок аудіо у відео — натисніть на шкалу щоб обрати момент
                  </Label>
                  {audioError ? (
                    <p className="text-xs text-destructive">Не вдалося завантажити аудіо</p>
                  ) : audioLoading ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={toggleAudioPlayback}
                      >
                        {audioPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>

                      <div
                        ref={timelineRef}
                        className="relative flex-1 h-10 rounded-md cursor-pointer group"
                        onClick={handleTimelineClick}
                      >
                        {waveformData.length > 0 ? (
                          <canvas
                            ref={waveformCanvasRef}
                            className="absolute inset-0 w-full h-full pointer-events-none"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-muted/50 rounded-md pointer-events-none" />
                        )}
                        {audioDuration > 0 && (
                          <>
                            <div
                              className="absolute top-0 w-0.5 h-full bg-primary rounded-full pointer-events-none z-10"
                              style={{ left: `${(settings.audioStart / audioDuration) * 100}%` }}
                            >
                              <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-primary whitespace-nowrap bg-background/80 px-1 rounded">
                                {formatTimestamp(settings.audioStart)}
                              </div>
                            </div>
                            {audioPlaying && audioCurrentTime > settings.audioStart && (
                              <div
                                className="absolute top-0 w-0.5 h-full bg-white/60 rounded-full pointer-events-none z-10"
                                style={{ left: `${(audioCurrentTime / audioDuration) * 100}%` }}
                              />
                            )}
                          </>
                        )}
                      </div>

                      <span className="text-xs text-muted-foreground flex-shrink-0 w-20 text-right tabular-nums">
                        {formatTimestamp(audioCurrentTime)} / {formatTimestamp(audioDuration)}
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 hidden sm:flex"
                        onClick={toggleAudioMute}
                      >
                        {audioMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings - only show when release selected */}
          {selectedRelease && (
            <>
              {/* Template */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Шаблон анімації
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => updateSetting("template", "glow-player")}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        settings.template === "glow-player"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-purple-400" />
                      </div>
                      <p className="text-xs font-medium">Glow Player</p>
                      <p className="text-[10px] text-muted-foreground">Обкладинка + плеєр</p>
                    </button>
                    <button
                      onClick={() => updateSetting("template", "promo-card")}
                      className={`p-3 rounded-xl border-2 text-center transition-all ${
                        settings.template === "promo-card"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-orange-500/30 to-yellow-500/30 flex items-center justify-center">
                        <ImageIcon className="w-5 h-5 text-orange-400" />
                      </div>
                      <p className="text-xs font-medium">Promo Card</p>
                      <p className="text-[10px] text-muted-foreground">Обкладинка + заголовок + іконки</p>
                    </button>
                  </div>
                </CardContent>
              </Card>

              {settings.template === "promo-card" && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-semibold flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" /> Макет Promo Card
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => updateSetting("promoLayout", "cover")}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          settings.promoLayout === "cover"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-500/30 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-blue-400" />
                        </div>
                        <p className="text-xs font-medium">Cover + Text</p>
                        <p className="text-[10px] text-muted-foreground">Обкладинка + заголовок</p>
                      </button>
                      <button
                        onClick={() => updateSetting("promoLayout", "fullscreen")}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          settings.promoLayout === "fullscreen"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-rose-500/30 to-amber-500/30 flex items-center justify-center">
                          <Maximize className="w-5 h-5 text-rose-400" />
                        </div>
                        <p className="text-xs font-medium">Full Screen</p>
                        <p className="text-[10px] text-muted-foreground">Повноекранний фон</p>
                      </button>
                      <button
                        onClick={() => {
                          updateSetting("promoLayout", "textonly");
                          updateSetting("backgroundType", "video");
                        }}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          settings.promoLayout === "textonly"
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-gradient-to-br from-emerald-500/30 to-teal-500/30 flex items-center justify-center">
                          <Type className="w-5 h-5 text-emerald-400" />
                        </div>
                        <p className="text-xs font-medium">Text Only</p>
                        <p className="text-[10px] text-muted-foreground">Лише текст</p>
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Format */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Monitor className="w-4 h-4" /> Формат відео
                  </Label>
                  <div className="grid grid-cols-4 gap-2">
                    {(Object.entries(FORMAT_DIMENSIONS) as [VideoFormat, typeof FORMAT_DIMENSIONS[VideoFormat]][]).map(
                      ([key, val]) => (
                        <button
                          key={key}
                          onClick={() => updateSetting("format", key)}
                          className={`p-2 rounded-lg border-2 text-center transition-all ${
                            settings.format === key
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="flex justify-center mb-1.5">
                            {key === "vertical" ? (
                              <Smartphone className="w-4 h-4" />
                            ) : key === "square" ? (
                              <Square className="w-4 h-4" />
                            ) : key === "portrait" ? (
                              <RectangleHorizontal className="w-4 h-4 rotate-90" />
                            ) : (
                              <Monitor className="w-4 h-4" />
                            )}
                          </div>
                          <p className="text-[10px] font-medium">{val.label}</p>
                          <p className="text-[9px] text-muted-foreground leading-tight">{val.description}</p>
                        </button>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Background */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Palette className="w-4 h-4" /> Фон
                  </Label>
                  {settings.template === "promo-card" && settings.promoLayout === "textonly" ? (
                    <p className="text-xs text-muted-foreground">Для цього макету доступний лише відеофон</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {(["blurred", "solid", "gradient", "video"] as BackgroundType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => updateSetting("backgroundType", type)}
                          className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all ${
                            settings.backgroundType === type
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          {type === "blurred" ? "Blurred Art" : type === "solid" ? "Solid" : type === "gradient" ? "Gradient" : "Video"}
                        </button>
                      ))}
                    </div>
                  )}
                  {settings.backgroundType === "solid" && (
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settings.solidColor}
                        onChange={(e) => updateSetting("solidColor", e.target.value)}
                        className="w-10 h-10 rounded-lg cursor-pointer border border-border"
                      />
                      <Input
                        value={settings.solidColor}
                        onChange={(e) => updateSetting("solidColor", e.target.value)}
                        className="flex-1 font-mono text-sm"
                        maxLength={7}
                      />
                    </div>
                  )}
                  {settings.backgroundType === "gradient" && (
                    <div className="space-y-2">
                      <div
                        className="h-12 rounded-lg border border-border"
                        style={{
                          background: `linear-gradient(135deg, ${settings.gradientColor1}, ${settings.gradientColor2})`,
                        }}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={settings.gradientColor1}
                            onChange={(e) => updateSetting("gradientColor1", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border border-border"
                          />
                          <Input
                            value={settings.gradientColor1}
                            onChange={(e) => updateSetting("gradientColor1", e.target.value)}
                            className="font-mono text-xs"
                            maxLength={7}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={settings.gradientColor2}
                            onChange={(e) => updateSetting("gradientColor2", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border border-border"
                          />
                          <Input
                            value={settings.gradientColor2}
                            onChange={(e) => updateSetting("gradientColor2", e.target.value)}
                            className="font-mono text-xs"
                            maxLength={7}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {settings.backgroundType === "video" && (
                    <div className="space-y-3">
                      {videoBackgrounds?.preset && videoBackgrounds.preset.length > 0 && !(settings.template === "promo-card" && settings.promoLayout === "textonly") && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">Готові фони</p>
                          <div className="grid grid-cols-3 gap-2">
                            {videoBackgrounds.preset.map((bg) => (
                              <button
                                key={bg.id}
                                onClick={() => updateSetting("videoBackgroundFileId", bg.id)}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video ${
                                  settings.videoBackgroundFileId === bg.id
                                    ? "border-primary ring-2 ring-primary/30"
                                    : "border-border hover:border-primary/40"
                                }`}
                              >
                                <video
                                  src={`${bg.proxyUrl}#t=0.5`}
                                  muted
                                  preload="metadata"
                                  className="w-full h-full object-cover pointer-events-none"
                                />
                                <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5">
                                  <p className="text-[9px] text-white truncate">{bg.name}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        {settings.backgroundType === "video" && (
                          <button
                            onClick={() => updateSetting("videoDarken", !settings.videoDarken)}
                            className="flex items-center gap-2 mb-3 w-full"
                          >
                            <div className={`relative w-8 h-[18px] rounded-full transition-colors ${settings.videoDarken ? "bg-primary" : "bg-muted-foreground/30"}`}>
                              <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${settings.videoDarken ? "left-[16px]" : "left-[2px]"}`} />
                            </div>
                            <span className="text-xs text-muted-foreground">Затемнити відео</span>
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground mb-2">Мої фони</p>
                        {videoBackgrounds?.custom && videoBackgrounds.custom.length > 0 && (
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            {videoBackgrounds.custom.map((bg) => (
                              <div
                                key={bg.id}
                                className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video group ${
                                  settings.videoBackgroundFileId === bg.id
                                    ? "border-primary ring-2 ring-primary/30"
                                    : "border-border hover:border-primary/40"
                                }`}
                              >
                                <button
                                  onClick={() => updateSetting("videoBackgroundFileId", bg.id)}
                                  className="w-full h-full"
                                >
                                  <video
                                    src={`${bg.proxyUrl}#t=0.5`}
                                    muted
                                    preload="metadata"
                                    className="w-full h-full object-cover pointer-events-none"
                                  />
                                  <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1.5 py-0.5">
                                    <p className="text-[9px] text-white truncate">{bg.name}</p>
                                  </div>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteBg(bg.id); }}
                                  className="absolute top-1 right-1 w-5 h-5 bg-red-500/80 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label
                          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-all w-full py-8 ${
                            uploadingBg ? "opacity-50 pointer-events-none" : ""
                          } ${
                            dragOverBg
                              ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                              : "border-border hover:border-primary/40"
                          }`}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBg(true); }}
                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBg(true); }}
                          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverBg(false); }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverBg(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file && (file.type === "video/mp4" || file.type === "video/quicktime" || file.type === "video/webm")) {
                              handleUploadBg(file);
                            } else if (file) {
                              toast({ title: "Підтримуються лише MP4, MOV та WebM файли", variant: "destructive" });
                            }
                          }}
                        >
                          <input
                            type="file"
                            accept="video/mp4,video/quicktime,video/webm"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUploadBg(file);
                              e.target.value = "";
                            }}
                          />
                          {uploadingBg ? (
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                              <span className="text-xs text-muted-foreground">
                                {dragOverBg ? "Відпустіть для завантаження" : "Перетягніть відео або натисніть"}
                              </span>
                            </>
                          )}
                        </label>
                        <p className="text-[9px] text-muted-foreground mt-1">MP4, MOV, WebM · до 200 МБ · до 1 хв</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Text Settings */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Type className="w-4 h-4" /> Текст
                  </Label>

                  {settings.template === "promo-card" && (
                    <>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Tagline (макс. 30 символів)
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            value={settings.tagline}
                            onChange={(e) => updateSetting("tagline", e.target.value.slice(0, 30))}
                            placeholder="NEW MUSIC"
                            className="flex-1"
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={settings.taglineColor === "none" ? "#ffffff" : settings.taglineColor}
                              onChange={(e) => {
                                updateSetting("taglineColor", e.target.value);
                                if (settings.syncTextIconEffects) {
                                  updateSetting("promoTitleColor", e.target.value);
                                  updateSetting("storeIconStyle", e.target.value);
                                }
                              }}
                              disabled={settings.taglineColor === "none"}
                              className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                            />
                            <button
                              onClick={() => updateSetting("taglineColor", settings.taglineColor === "none" ? "#ffffff" : "none")}
                              className={`px-2 py-1.5 text-[10px] font-medium rounded border transition-colors ${
                                settings.taglineColor === "none" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                              }`}
                            >
                              Ні
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">
                          Promo Title (макс. 70 символів)
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            value={settings.promoTitle}
                            onChange={(e) => updateSetting("promoTitle", e.target.value.slice(0, 70))}
                            placeholder={selectedTrack?.title || selectedRelease.title}
                            className="flex-1"
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="color"
                              value={settings.promoTitleColor === "none" ? "#ffffff" : settings.promoTitleColor}
                              onChange={(e) => {
                                updateSetting("promoTitleColor", e.target.value);
                                if (settings.syncTextIconEffects) {
                                  updateSetting("taglineColor", e.target.value);
                                  updateSetting("storeIconStyle", e.target.value);
                                }
                              }}
                              disabled={settings.promoTitleColor === "none"}
                              className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                            />
                            <button
                              onClick={() => updateSetting("promoTitleColor", settings.promoTitleColor === "none" ? "#ffffff" : "none")}
                              className={`px-2 py-1.5 text-[10px] font-medium rounded border transition-colors ${
                                settings.promoTitleColor === "none" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                              }`}
                            >
                              Ні
                            </button>
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Розташування тексту</Label>
                        <div className="flex border rounded-lg overflow-hidden">
                          {(["top", "center", "bottom"] as ElementPosition[]).map((pos) => (
                            <button
                              key={pos}
                              onClick={() => updateSetting("textPosition", pos)}
                              className={`flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
                                settings.textPosition === pos ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                              }`}
                            >
                              {pos === "top" ? "Зверху" : pos === "center" ? "По центру" : "Знизу"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {settings.template === "glow-player" && (
                    <p className="text-xs text-muted-foreground">
                      Шаблон Glow Player автоматично використовує назву треку та імʼя артиста
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Store Icons (Video background only) */}
              {(settings.backgroundType === "video" || settings.template === "promo-card") && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Стрімінг-платформи</Label>
                      <input
                        type="color"
                        value={settings.storeIconStyle}
                        onChange={(e) => {
                          updateSetting("storeIconStyle", e.target.value);
                          if (settings.syncTextIconEffects) {
                            updateSetting("taglineColor", e.target.value);
                            updateSetting("promoTitleColor", e.target.value);
                          }
                        }}
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {STORE_OPTIONS.map((store) => (
                        <button
                          key={store.id}
                          onClick={() => toggleStoreIcon(store.id)}
                          className={`p-2.5 rounded-lg border-2 flex flex-col items-center gap-1.5 transition-all ${
                            settings.storeIcons.includes(store.id)
                              ? "border-primary bg-primary/5"
                              : "border-border opacity-40 hover:opacity-70"
                          }`}
                        >
                          <store.Icon className="w-5 h-5" />
                          <span className="text-[9px] font-medium">{store.label}</span>
                        </button>
                      ))}
                    </div>
                    {settings.template === "promo-card" && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1.5 block">Розташування іконок</Label>
                        <div className="flex border rounded-lg overflow-hidden">
                          {(["top", "center", "bottom"] as ElementPosition[]).map((pos) => (
                            <button
                              key={pos}
                              onClick={() => updateSetting("iconsPosition", pos)}
                              className={`flex-1 px-3 py-1.5 text-[10px] font-medium transition-colors ${
                                settings.iconsPosition === pos ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                              }`}
                            >
                              {pos === "top" ? "Зверху" : pos === "center" ? "По центру" : "Знизу"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {settings.template === "promo-card" && (
                <Card>
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" />
                        Ефекти
                      </Label>
                      <button
                        onClick={() => {
                          const newSync = !settings.syncTextIconEffects;
                          updateSetting("syncTextIconEffects", newSync);
                          if (newSync) {
                            updateSetting("iconShadowColor", settings.textShadowColor);
                            updateSetting("iconShadowIntensity", settings.textShadowIntensity);
                            updateSetting("iconGlow", settings.textGlow);
                            updateSetting("iconGlowColor", settings.textGlowColor);
                            updateSetting("storeIconStyle", settings.taglineColor === "none" ? settings.promoTitleColor : settings.taglineColor);
                            if (settings.taglineColor !== "none") {
                              updateSetting("promoTitleColor", settings.taglineColor);
                            }
                          }
                        }}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                          settings.syncTextIconEffects
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {settings.syncTextIconEffects ? <Link className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                        {settings.syncTextIconEffects ? "Синхронізовано" : "Окремо"}
                      </button>
                    </div>

                    {settings.syncTextIconEffects ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1.5 block">Тінь</Label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={settings.textShadowColor}
                              onChange={(e) => {
                                updateSetting("textShadowColor", e.target.value);
                                updateSetting("iconShadowColor", e.target.value);
                              }}
                              className="w-8 h-8 rounded border cursor-pointer"
                            />
                            <Slider
                              value={[settings.textShadowIntensity]}
                              onValueChange={([v]) => {
                                updateSetting("textShadowIntensity", v);
                                updateSetting("iconShadowIntensity", v);
                              }}
                              max={100}
                              step={5}
                              className="flex-1"
                            />
                            <span className="text-[10px] text-muted-foreground w-8 text-right">{settings.textShadowIntensity}%</span>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <Label className="text-xs text-muted-foreground">Світіння (Glow)</Label>
                            <button
                              onClick={() => {
                                updateSetting("textGlow", !settings.textGlow);
                                updateSetting("iconGlow", !settings.textGlow);
                              }}
                              className="relative"
                            >
                              <div className={`w-8 h-[18px] rounded-full transition-colors ${settings.textGlow ? "bg-primary" : "bg-muted-foreground/30"}`}>
                                <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${settings.textGlow ? "left-[16px]" : "left-[2px]"}`} />
                              </div>
                            </button>
                          </div>
                          {settings.textGlow && (
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={settings.textGlowColor}
                                onChange={(e) => {
                                  updateSetting("textGlowColor", e.target.value);
                                  updateSetting("iconGlowColor", e.target.value);
                                }}
                                className="w-8 h-8 rounded border cursor-pointer"
                              />
                              <span className="text-xs text-muted-foreground">Колір світіння</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <Label className="text-xs font-medium flex items-center gap-1"><Type className="w-3 h-3" /> Текст</Label>
                          <div>
                            <Label className="text-[10px] text-muted-foreground mb-1 block">Тінь</Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={settings.textShadowColor}
                                onChange={(e) => updateSetting("textShadowColor", e.target.value)}
                                className="w-7 h-7 rounded border cursor-pointer"
                              />
                              <Slider
                                value={[settings.textShadowIntensity]}
                                onValueChange={([v]) => updateSetting("textShadowIntensity", v)}
                                max={100}
                                step={5}
                                className="flex-1"
                              />
                              <span className="text-[10px] text-muted-foreground w-8 text-right">{settings.textShadowIntensity}%</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <Label className="text-[10px] text-muted-foreground">Світіння</Label>
                              <button
                                onClick={() => updateSetting("textGlow", !settings.textGlow)}
                                className="relative"
                              >
                                <div className={`w-7 h-[16px] rounded-full transition-colors ${settings.textGlow ? "bg-primary" : "bg-muted-foreground/30"}`}>
                                  <div className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-transform ${settings.textGlow ? "left-[13px]" : "left-[2px]"}`} />
                                </div>
                              </button>
                            </div>
                            {settings.textGlow && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={settings.textGlowColor}
                                  onChange={(e) => updateSetting("textGlowColor", e.target.value)}
                                  className="w-7 h-7 rounded border cursor-pointer"
                                />
                                <span className="text-[10px] text-muted-foreground">Колір</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="border-t pt-3 space-y-3">
                          <Label className="text-xs font-medium flex items-center gap-1"><Sun className="w-3 h-3" /> Іконки</Label>
                          <div>
                            <Label className="text-[10px] text-muted-foreground mb-1 block">Тінь</Label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={settings.iconShadowColor}
                                onChange={(e) => updateSetting("iconShadowColor", e.target.value)}
                                className="w-7 h-7 rounded border cursor-pointer"
                              />
                              <Slider
                                value={[settings.iconShadowIntensity]}
                                onValueChange={([v]) => updateSetting("iconShadowIntensity", v)}
                                max={100}
                                step={5}
                                className="flex-1"
                              />
                              <span className="text-[10px] text-muted-foreground w-8 text-right">{settings.iconShadowIntensity}%</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <Label className="text-[10px] text-muted-foreground">Світіння</Label>
                              <button
                                onClick={() => updateSetting("iconGlow", !settings.iconGlow)}
                                className="relative"
                              >
                                <div className={`w-7 h-[16px] rounded-full transition-colors ${settings.iconGlow ? "bg-primary" : "bg-muted-foreground/30"}`}>
                                  <div className={`absolute top-[2px] w-[12px] h-[12px] rounded-full bg-white transition-transform ${settings.iconGlow ? "left-[13px]" : "left-[2px]"}`} />
                                </div>
                              </button>
                            </div>
                            {settings.iconGlow && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={settings.iconGlowColor}
                                  onChange={(e) => updateSetting("iconGlowColor", e.target.value)}
                                  className="w-7 h-7 rounded border cursor-pointer"
                                />
                                <span className="text-[10px] text-muted-foreground">Колір</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Duration */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <Label className="text-sm font-semibold">Тривалість</Label>
                  <div className="flex gap-2">
                    {[15, 30, 60].map((d) => (
                      <button
                        key={d}
                        onClick={() => updateSetting("duration", d)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          settings.duration === d
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        {d}с
                      </button>
                    ))}
                    {settings.format === "landscape" && audioDuration > 0 && (
                      <button
                        onClick={() => updateSetting("duration", Math.floor(audioDuration))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                          ![15, 30, 60].includes(settings.duration)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        Весь трек ({formatTimestamp(audioDuration)})
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>

            </>
          )}
        </div>

        {/* Right: Preview Panel */}
        <div className="lg:sticky lg:top-4 space-y-4" style={{ minWidth: 300 }}>
          <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Превʼю</Label>
                {selectedRelease && (
                  <Badge variant="secondary" className="text-[10px]">
                    {FORMAT_DIMENSIONS[settings.format].width}×{FORMAT_DIMENSIONS[settings.format].height}
                  </Badge>
                )}
              </div>

              {selectedRelease ? (
                <div className="flex flex-col items-center">
                  <MotionPreview
                    settings={settings}
                    artworkUrl={artworkUrl}
                    trackTitle={selectedTrack?.title || selectedRelease.title}
                    artistName={selectedRelease.artistName}
                    isPlaying={isPlaying}
                  />
                  <div className="flex gap-2 mt-4 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => {
                        const next = !isPlaying;
                        setIsPlaying(next);
                        const audio = audioRef.current;
                        if (audio && audioSrc && !audioError) {
                          if (next) {
                            audio.currentTime = settings.audioStart;
                            audio.play().catch(() => {});
                            setAudioPlaying(true);
                          } else {
                            audio.pause();
                            setAudioPlaying(false);
                          }
                        }
                      }}
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4 mr-1.5" /> Пауза
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1.5" /> Програти
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsPlaying(false);
                        const audio = audioRef.current;
                        if (audio) {
                          audio.pause();
                          audio.currentTime = settings.audioStart;
                          setAudioPlaying(false);
                        }
                        setTimeout(() => {
                          setIsPlaying(true);
                          const a = audioRef.current;
                          if (a && audioSrc && !audioError) {
                            a.currentTime = settings.audioStart;
                            a.play().catch(() => {});
                            setAudioPlaying(true);
                          }
                        }, 50);
                      }}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Video className="w-12 h-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Оберіть реліз для створення відео
                  </p>
                </div>
              )}

              {selectedRelease && (
                <div className="space-y-2">
                  <Button
                    className="w-full gap-2"
                    size="lg"
                    onClick={handleRender}
                    disabled={isRendering || !selectedTrackId}
                  >
                    {isRendering ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {renderStage === "downloading" && "Завантаження файлів..."}
                        {renderStage === "rendering" && `Рендеринг ${renderProgress}%`}
                        {renderStage === "encoding" && "Кодування відео..."}
                        {renderStage === "finalizing" && "Фіналізація..."}
                        {renderStage === "done" && "Готово!"}
                        {!["downloading", "rendering", "encoding", "finalizing", "done"].includes(renderStage) && "Генерація відео..."}
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" /> Згенерувати MP4
                      </>
                    )}
                  </Button>
                  {isRendering && (
                    <div className="space-y-1">
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                          style={{ width: `${renderProgress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        {renderProgress}%
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes zoomIn {
          from { transform: scale(0.85); opacity: 0.6; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
