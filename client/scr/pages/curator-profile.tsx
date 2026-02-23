import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getProxiedImageUrl } from "@/lib/utils";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, Music, ArrowLeft, Users, ListMusic, TrendingUp, HelpCircle, CheckCircle, Clock } from "lucide-react";
import { FaSpotify, FaYoutube, FaApple, FaInstagram, FaTiktok } from "react-icons/fa";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface FaqItem {
  question: string;
  answer: string;
}

interface CuratorProfile {
  id: string;
  name: string;
  curatorBio: string | null;
  curatorAboutMe: string | null;
  curatorGenres: string | null;
  curatorLanguages: string | null;
  curatorFaqItems: string | null;
  curatorCoverImageUrl: string | null;
  curatorBannerUrl: string | null;
  curatorSlug: string | null;
  spotifyUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  tiktokUrl: string | null;
}

interface CuratorPlaylist {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  followerCount: number | null;
  tracksCount: number | null;
  genre: string | null;
  imageUrl: string | null;
  playlistUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

interface CuratorStats {
  placedTracksCount: number;
  responseSpeed: 'super_fast' | 'fast' | 'slow' | null;
}

interface CuratorProfileResponse {
  curator: CuratorProfile;
  playlists: CuratorPlaylist[];
  stats: CuratorStats;
}

const PlatformIcon = ({ platform }: { platform: string }) => {
  const platformLower = platform.toLowerCase();
  
  if (platformLower.includes('spotify')) {
    return <FaSpotify className="w-5 h-5 text-[#1DB954]" />;
  }
  if (platformLower.includes('youtube')) {
    return <FaYoutube className="w-5 h-5 text-[#FF0000]" />;
  }
  if (platformLower.includes('apple')) {
    return <FaApple className="w-5 h-5 text-[#FC3C44]" />;
  }
  return <Music className="w-5 h-5 text-muted-foreground" />;
};

export default function CuratorProfilePage() {
  const { t } = useTranslation();
  const { curatorId } = useParams<{ curatorId: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<CuratorProfileResponse>({
    queryKey: ["/api/curator-profile", curatorId],
    queryFn: async () => {
      const res = await fetch(`/api/curator-profile/${curatorId}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Curator not found');
        throw new Error('Failed to fetch curator profile');
      }
      return res.json();
    },
    enabled: !!curatorId,
  });

  const { data: followerHistory } = useQuery<{ date: string; totalFollowers: number }[]>({
    queryKey: ["/api/curator-profile", curatorId, "follower-history"],
    queryFn: async () => {
      const res = await fetch(`/api/curator-profile/${curatorId}/follower-history?days=30`, {
        credentials: 'include',
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!curatorId,
  });

  // Check if the current user is viewing their own curator profile
  // Compare the loaded curator ID with any of user's organization IDs
  const isOwnProfile = user?.organizations?.some(org => org.id === data?.curator?.id) ?? false;
  
  const handleBack = () => {
    if (isOwnProfile) {
      navigate('/curator/settings/organization');
    } else {
      navigate('/playlists');
    }
  };

  const formatFollowers = (count: number | null) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const parseJsonArray = (value: string | null): string[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const parseFaqItems = (value: string | null): FaqItem[] => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item: any) => item.question && item.answer);
      }
      return [];
    } catch {
      return [];
    }
  };

  const LANGUAGE_NAMES: Record<string, string> = {
    en: "English",
    uk: "Ukrainian",
    pl: "Polish",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
  };

  const totalFollowers = data?.playlists?.reduce((sum, p) => sum + (p.followerCount || 0), 0) || 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
          <Card>
            <CardContent className="py-12 text-center">
              <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('curatorProfile.notFound')}</h3>
              <p className="text-muted-foreground">{t('curatorProfile.notFoundDescription')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { curator, playlists } = data;

  return (
    <div className="min-h-screen bg-background">
      {/* Cover Section */}
      <div className="relative">
        {curator.curatorBannerUrl ? (
          <div 
            className="h-48 md:h-64 bg-cover bg-center"
            style={{ backgroundImage: `url(${curator.curatorBannerUrl})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
        ) : (
          <div className="h-48 md:h-64 bg-gradient-to-br from-purple-600/30 via-pink-600/20 to-background" />
        )}
        
        {/* Back button */}
        <div className="absolute top-4 left-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className="bg-background/80 backdrop-blur-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Profile Header */}
        <div className="-mt-16 relative z-10 pb-8">
          <div className="flex flex-col md:flex-row gap-6 items-start">
            {/* Avatar */}
            <div className="w-32 h-32 rounded-2xl shadow-xl border-4 border-background overflow-hidden">
              {curator.curatorCoverImageUrl ? (
                <img 
                  src={curator.curatorCoverImageUrl} 
                  alt={curator.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">
                    {curator.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex-1 pt-4 md:pt-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">{curator.name}</h1>
              
              {/* Stats */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1.5">
                  <ListMusic className="w-4 h-4" />
                  <span>{playlists.length} {t('curatorProfile.playlists')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  <span>{formatFollowers(totalFollowers)} {t('curatorProfile.totalFollowers')}</span>
                </div>
                {data?.stats?.placedTracksCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>{data.stats.placedTracksCount} {t('curatorProfile.tracksPlaced')}</span>
                  </div>
                )}
                {data?.stats?.responseSpeed && (
                  <div className="flex items-center gap-1.5">
                    {data.stats.responseSpeed === 'super_fast' && (
                      <>
                        <Clock className="w-4 h-4 text-green-500" />
                        <span className="text-green-600">{t('curatorProfile.responseSpeedSuperFast')}</span>
                      </>
                    )}
                    {data.stats.responseSpeed === 'fast' && (
                      <>
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="text-blue-600">{t('curatorProfile.responseSpeedFast')}</span>
                      </>
                    )}
                    {data.stats.responseSpeed === 'slow' && (
                      <>
                        <Clock className="w-4 h-4 text-orange-500" />
                        <span className="text-orange-600">{t('curatorProfile.responseSpeedSlow')}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              
              {/* Social Links */}
              <div className="flex flex-wrap gap-2">
                {curator.spotifyUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={curator.spotifyUrl} target="_blank" rel="noopener noreferrer">
                      <FaSpotify className="w-4 h-4 mr-2 text-[#1DB954]" />
                      Spotify
                    </a>
                  </Button>
                )}
                {curator.instagramUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={curator.instagramUrl} target="_blank" rel="noopener noreferrer">
                      <FaInstagram className="w-4 h-4 mr-2 text-[#E4405F]" />
                      Instagram
                    </a>
                  </Button>
                )}
                {curator.youtubeUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={curator.youtubeUrl} target="_blank" rel="noopener noreferrer">
                      <FaYoutube className="w-4 h-4 mr-2 text-[#FF0000]" />
                      YouTube
                    </a>
                  </Button>
                )}
                {curator.tiktokUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={curator.tiktokUrl} target="_blank" rel="noopener noreferrer">
                      <FaTiktok className="w-4 h-4 mr-2" />
                      TikTok
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
          
          {/* Bio */}
          {curator.curatorBio && (
            <div className="mt-6">
              <p className="text-muted-foreground whitespace-pre-wrap">{curator.curatorBio}</p>
            </div>
          )}

          {/* About Me */}
          {curator.curatorAboutMe && (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-3">{t('curatorProfile.aboutMe')}</h3>
                <p className="text-muted-foreground whitespace-pre-wrap">{curator.curatorAboutMe}</p>
              </CardContent>
            </Card>
          )}

          {/* Follower Dynamics Chart + Genres/Languages */}
          {(followerHistory && followerHistory.length > 1) || parseJsonArray(curator.curatorGenres).length > 0 || parseJsonArray(curator.curatorLanguages).length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
              {/* Follower Dynamics Chart - takes 2 columns on large screens */}
              {followerHistory && followerHistory.length > 1 && (
                <Card className="lg:col-span-2">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">{t('curatorProfile.followerDynamics')}</h3>
                    </div>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={followerHistory}>
                          <defs>
                            <linearGradient id="followerGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis 
                            dataKey="date" 
                            tickFormatter={(value) => {
                              const date = new Date(value);
                              return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                            }}
                            stroke="#666"
                            fontSize={12}
                          />
                          <YAxis 
                            tickFormatter={(value) => {
                              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                              return value.toString();
                            }}
                            stroke="#666"
                            fontSize={12}
                          />
                          <Tooltip 
                            labelFormatter={(value) => {
                              const date = new Date(value);
                              return date.toLocaleDateString();
                            }}
                            formatter={(value: number) => [value.toLocaleString(), t('curatorProfile.followers')]}
                            contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="totalFollowers" 
                            stroke="#22d3ee" 
                            strokeWidth={2}
                            fill="url(#followerGradient)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Right column - Genres and Languages stacked */}
              {(parseJsonArray(curator.curatorGenres).length > 0 || parseJsonArray(curator.curatorLanguages).length > 0) && (
                <div className="flex flex-col gap-4">
                  {/* Genres */}
                  {parseJsonArray(curator.curatorGenres).length > 0 && (
                    <Card className="flex-1">
                      <CardContent className="pt-6">
                        <h3 className="font-semibold mb-3">{t('curatorProfile.genres')}</h3>
                        <div className="flex flex-wrap gap-2">
                          {parseJsonArray(curator.curatorGenres).map((genre) => (
                            <Badge key={genre} variant="secondary">{genre}</Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Languages */}
                  {parseJsonArray(curator.curatorLanguages).length > 0 && (
                    <Card className="flex-1">
                      <CardContent className="pt-6">
                        <h3 className="font-semibold mb-3">{t('curatorProfile.languages')}</h3>
                        <div className="flex flex-wrap gap-2">
                          {parseJsonArray(curator.curatorLanguages).map((langCode) => (
                            <Badge key={langCode} variant="secondary">
                              {LANGUAGE_NAMES[langCode] || langCode}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Playlists Section */}
        <div className="pb-12">
          <h2 className="text-lg md:text-xl font-semibold mb-4 md:mb-6">{t('curatorProfile.playlistsTitle')}</h2>
          
          {playlists.length === 0 ? (
            <Card>
              <CardContent className="py-8 md:py-12 text-center">
                <Music className="w-10 h-10 md:w-12 md:h-12 mx-auto text-muted-foreground mb-3 md:mb-4" />
                <h3 className="text-base md:text-lg font-medium mb-2">{t('curatorProfile.noPlaylists')}</h3>
                <p className="text-sm text-muted-foreground">{t('curatorProfile.noPlaylistsDescription')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[720px] overflow-y-auto pr-1 md:pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4">
                {playlists.map((playlist) => (
                <Card 
                  key={playlist.id} 
                  className="group hover:shadow-xl transition-all duration-200 overflow-hidden border-border/50 hover:border-primary/40"
                >
                  {/* Image - square aspect ratio */}
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {playlist.imageUrl ? (
                      <img 
                        src={getProxiedImageUrl(playlist.imageUrl)} 
                        alt={playlist.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                        <Music className="w-10 h-10 md:w-16 md:h-16 text-purple-400/60" />
                      </div>
                    )}
                    {/* Platform badge overlay */}
                    <div className="absolute top-2 left-2 md:top-3 md:left-3">
                      <div className="bg-black/60 backdrop-blur-sm rounded-full p-1.5 md:p-2">
                        <PlatformIcon platform={playlist.platform} />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-2 md:p-4">
                    {/* Title */}
                    <h3 className="font-semibold text-xs md:text-sm line-clamp-2 mb-0.5 md:mb-1 min-h-[2rem] md:min-h-[2.5rem]">
                      {playlist.name}
                    </h3>
                    
                    {/* Curator name - hidden on mobile */}
                    <p className="hidden md:block text-xs text-muted-foreground mb-2">{curator.name}</p>
                    
                    {/* Stats row with icons */}
                    <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-muted-foreground mb-2 md:mb-3">
                      {playlist.followerCount && (
                        <div className="flex items-center gap-0.5 md:gap-1">
                          <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{formatFollowers(playlist.followerCount)}</span>
                        </div>
                      )}
                      {playlist.tracksCount && (
                        <div className="flex items-center gap-0.5 md:gap-1">
                          <ListMusic className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{playlist.tracksCount}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Genre tags - show only 1 on mobile */}
                    {playlist.genre && (
                      <div className="flex flex-wrap gap-1 mb-2 md:mb-3">
                        {playlist.genre.split(',').slice(0, 1).map((g, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0 h-4 md:h-5">
                            {g.trim()}
                          </Badge>
                        ))}
                        {playlist.genre.split(',').length > 1 && (
                          <Badge variant="outline" className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0 h-4 md:h-5">
                            +{playlist.genre.split(',').length - 1}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {/* Pitch button - full width */}
                    <Button size="sm" className="w-full h-7 md:h-9 text-xs md:text-sm">
                      {t('playlists.pitch')}
                    </Button>
                  </div>
                </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* FAQ Section */}
        {parseFaqItems(curator.curatorFaqItems).length > 0 && (
          <div className="pb-12">
            <div className="flex items-center gap-2 mb-6">
              <HelpCircle className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">{t('curatorProfile.faqTitle')}</h2>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Accordion type="single" collapsible className="w-full">
                  {parseFaqItems(curator.curatorFaqItems).map((item, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground whitespace-pre-wrap">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
