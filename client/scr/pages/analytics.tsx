import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Loader2, TrendingUp, TrendingDown, RefreshCw, Music, ExternalLink, AlertCircle, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SiSpotify, SiYoutube, SiAmazon, SiTiktok, SiInstagram } from 'react-icons/si';
import { FaMusic } from 'react-icons/fa';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { useLocation } from 'wouter';
import { GiftMarker } from "@/components/holiday/GiftMarker";

interface HistoryPoint {
  date: string;
  count: number;
}

interface SocialStats {
  platform: string;
  current: number;
  change7d: number;
  changePercent7d: number;
  history: HistoryPoint[];
}

interface SpotifyTopTrack {
  id: string;
  name: string;
  popularity: number;
  albumName: string;
  albumImage: string;
  previewUrl: string | null;
  externalUrl: string;
  durationMs: number;
}

interface AudioFeatures {
  danceability: number;
  energy: number;
  valence: number;
  tempo: number;
  acousticness: number;
  instrumentalness: number;
  speechiness: number;
  liveness: number;
}

interface RelatedArtist {
  id: string;
  name: string;
  popularity: number;
  followers: number;
  genres: string[];
  image: string;
  externalUrl: string;
}

export default function Analytics() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<SocialStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [period, setPeriod] = useState<string>('30d');
  const [youtubeAvatar, setYoutubeAvatar] = useState<string>('');
  const [topTracks, setTopTracks] = useState<SpotifyTopTrack[]>([]);
  const [audioFeatures, setAudioFeatures] = useState<AudioFeatures | null>(null);
  const [relatedArtists, setRelatedArtists] = useState<RelatedArtist[]>([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);
  const [showAllTracks, setShowAllTracks] = useState(false);
  
  // Daily refresh limit state
  const [canRefresh, setCanRefresh] = useState(true);
  const [nextRefreshAt, setNextRefreshAt] = useState<string | null>(null);
  
  // Check if user has social links set up
  const currentOrg = user?.organizations?.[0];
  const hasSpotifyUrl = !!currentOrg?.spotifyUrl;
  const hasYoutubeUrl = !!currentOrg?.youtubeUrl;
  const hasSocialLinks = hasSpotifyUrl || hasYoutubeUrl;
  const missingLinks = !hasSpotifyUrl && !hasYoutubeUrl ? 'both' : !hasSpotifyUrl ? 'spotify' : 'youtube';

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
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
  }, [isAuthenticated, authLoading, toast, t]);

  // Check if refresh is available (daily limit)
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkRefreshStatus = async () => {
      try {
        const response = await fetch('/api/social-followers/refresh-status');
        if (response.ok) {
          const data = await response.json();
          setCanRefresh(data.canRefresh);
          setNextRefreshAt(data.nextRefreshAt);
        }
      } catch (error) {
        console.error('Error checking refresh status:', error);
      }
    };

    checkRefreshStatus();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchStats = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/social-followers?period=${period}`);
        if (!response.ok) throw new Error('Failed to fetch stats');
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error('Error fetching social stats:', error);
        toast({
          title: t('analytics.error'),
          description: t('analytics.errorDesc'),
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, [isAuthenticated, period, toast, t]);

  // Fetch YouTube avatar
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchYouTubeAvatar = async () => {
      try {
        const response = await fetch('/api/youtube/channel-info');
        if (response.ok) {
          const data = await response.json();
          if (data.avatar) {
            setYoutubeAvatar(data.avatar);
          }
        }
      } catch (error) {
        console.error('Error fetching YouTube avatar:', error);
      }
    };

    fetchYouTubeAvatar();
  }, [isAuthenticated]);

  // Fetch Spotify data
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchSpotifyData = async () => {
      try {
        setSpotifyLoading(true);
        setSpotifyError(null);

        const [tracksRes, featuresRes, artistsRes] = await Promise.all([
          fetch('/api/spotify/top-tracks'),
          fetch('/api/spotify/audio-features'),
          fetch('/api/spotify/related-artists'),
        ]);

        if (tracksRes.ok) {
          const tracks = await tracksRes.json();
          setTopTracks(tracks);
        }

        if (featuresRes.ok) {
          const features = await featuresRes.json();
          setAudioFeatures(features);
        }

        if (artistsRes.ok) {
          const artists = await artistsRes.json();
          setRelatedArtists(artists);
        }
      } catch (error) {
        console.error('Error fetching Spotify data:', error);
        setSpotifyError('Failed to load Spotify data');
      } finally {
        setSpotifyLoading(false);
      }
    };

    fetchSpotifyData();
  }, [isAuthenticated]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getPlatformConfig = (platform: string) => {
    switch (platform) {
      case 'SPOTIFY':
        return {
          name: 'Spotify',
          icon: <SiSpotify className="h-8 w-8" />,
          color: '#1DB954',
          label: 'SPOTIFY FOLLOWERS'
        };
      case 'YOUTUBE':
        return {
          name: 'YouTube',
          icon: <SiYoutube className="h-8 w-8" />,
          color: '#FF0000',
          label: 'YOUTUBE SUBSCRIBERS'
        };
      case 'DEEZER':
        return {
          name: 'Deezer',
          icon: <FaMusic className="h-8 w-8" />,
          color: '#FF6B00',
          label: 'DEEZER FANS'
        };
      case 'INSTAGRAM':
        return {
          name: 'Instagram',
          icon: <SiInstagram className="h-8 w-8" />,
          color: '#E4405F',
          label: 'INSTAGRAM FOLLOWERS'
        };
      case 'TIKTOK':
        return {
          name: 'TikTok',
          icon: <SiTiktok className="h-8 w-8" />,
          color: '#000000',
          label: 'TIKTOK FOLLOWERS'
        };
      case 'AMAZON':
        return {
          name: 'Amazon',
          icon: <SiAmazon className="h-8 w-8" />,
          color: '#FF9900',
          label: 'AMAZON FOLLOWERS'
        };
      default:
        return {
          name: platform,
          icon: <FaMusic className="h-8 w-8" />,
          color: '#6B7280',
          label: platform.toUpperCase() + ' FOLLOWERS'
        };
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };

  const formatFullNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch('/api/social-followers/refresh', {
        method: 'POST',
      });
      
      // Handle daily limit reached (429 Too Many Requests)
      if (response.status === 429) {
        const result = await response.json();
        setCanRefresh(false);
        setNextRefreshAt(result.nextRefreshAt);
        toast({
          title: t('analytics.dailyLimitReached'),
          description: t('analytics.dailyLimitDesc'),
          variant: "destructive",
        });
        return;
      }
      
      if (!response.ok) throw new Error('Failed to refresh data');
      
      const result = await response.json();
      
      // Update refresh status after successful refresh
      setCanRefresh(false);
      const tomorrow = new Date();
      tomorrow.setHours(24, 0, 0, 0);
      setNextRefreshAt(tomorrow.toISOString());
      
      toast({
        title: t('analytics.refreshSuccess'),
        description: t('analytics.refreshSuccessDesc', { count: result.collected }),
      });
      
      // Reload stats and Spotify data after refresh
      const [statsResponse, tracksRes, featuresRes, artistsRes] = await Promise.all([
        fetch(`/api/social-followers?period=${period}`),
        fetch('/api/spotify/top-tracks'),
        fetch('/api/spotify/audio-features'),
        fetch('/api/spotify/related-artists'),
      ]);
      
      if (statsResponse.ok) {
        const data = await statsResponse.json();
        setStats(data);
      }
      
      if (tracksRes.ok) {
        const tracks = await tracksRes.json();
        setTopTracks(tracks);
      }
      
      if (featuresRes.ok) {
        const features = await featuresRes.json();
        setAudioFeatures(features);
      }
      
      if (artistsRes.ok) {
        const artists = await artistsRes.json();
        setRelatedArtists(artists);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({
        title: t('analytics.refreshError'),
        description: t('analytics.refreshErrorDesc'),
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate total fans and 28-day growth
  const total = stats.reduce((sum, stat) => sum + stat.current, 0);
  let change28d = 0;
  
  stats.forEach(stat => {
    if (stat.history.length >= 2) {
      const current = stat.current;
      const oldest = stat.history[0]?.count || current;
      change28d += (current - oldest);
    }
  });
  
  const changePercent28d = total > 0 && change28d !== 0 
    ? ((change28d / (total - change28d)) * 100) 
    : 0;
  
  const totalStats = { total, change28d, changePercent28d };

  // Get 28-day change for individual platform
  const get28DayChange = (stat: SocialStats) => {
    if (stat.history.length >= 2) {
      const current = stat.current;
      const oldest = stat.history[0]?.count || current;
      const change = current - oldest;
      const percent = oldest > 0 ? ((change / oldest) * 100) : 0;
      return { change, percent };
    }
    return { change: 0, percent: 0 };
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header with Avatar */}
        <div className="mb-6 flex items-center gap-4 relative">
          {youtubeAvatar && (
            <Avatar className="h-20 w-20">
              <AvatarImage src={youtubeAvatar} alt="YouTube Profile" />
              <AvatarFallback>YT</AvatarFallback>
            </Avatar>
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">
              {t('analytics.title')}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('analytics.description')}
            </p>
          </div>
          <GiftMarker placementId="analytics-header" className="absolute top-0 right-0" />
          <div className="ml-auto flex flex-col items-end gap-1">
            <Button
              onClick={handleRefresh}
              disabled={isRefreshing || !canRefresh}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {t('analytics.refreshData')}
            </Button>
            {!canRefresh && nextRefreshAt && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('analytics.nextRefreshAt', { time: '00:00' })}
              </span>
            )}
          </div>
        </div>

        {/* Missing Social Links Alert */}
        {!hasSocialLinks && (
          <Alert className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('analytics.missingLinksTitle')}</AlertTitle>
            <AlertDescription className="mt-2">
              <div className="flex items-center justify-between">
                <span>
                  {missingLinks === 'both' 
                    ? t('analytics.missingLinksBoth')
                    : missingLinks === 'spotify'
                    ? t('analytics.missingLinksSpotify')
                    : t('analytics.missingLinksYoutube')
                  }
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setLocation('/settings')}
                  className="ml-4 shrink-0"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t('analytics.goToSettings')}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Analytics Content */}
        <div className="space-y-6">
            {stats.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    {t('analytics.noData')}
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                    {t('analytics.noDataDesc')}
                  </p>
                </CardContent>
              </Card>
            ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Total Circle */}
            <div className="flex items-center justify-center">
              <div className="relative w-48 h-48">
                {/* Circular progress */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="96"
                    cy="96"
                    r="88"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.1)"
                    strokeWidth="16"
                  />
                  {stats.map((stat, index) => {
                    const percentage = (stat.current / totalStats.total) * 100;
                    const config = getPlatformConfig(stat.platform);
                    const offset = stats.slice(0, index).reduce((acc, s) => acc + (s.current / totalStats.total) * 100, 0);
                    const circumference = 2 * Math.PI * 88;
                    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                    const strokeDashoffset = -((offset / 100) * circumference);
                    
                    return (
                      <circle
                        key={stat.platform}
                        cx="96"
                        cy="96"
                        r="88"
                        fill="none"
                        stroke={config.color}
                        strokeWidth="16"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                      />
                    );
                  })}
                </svg>
                
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-bold text-white">
                    {formatNumber(totalStats.total)}
                  </div>
                  <div className={`text-sm font-medium mt-1 flex items-center gap-1 ${totalStats.changePercent28d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalStats.changePercent28d >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(totalStats.changePercent28d).toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.map((stat) => {
                const config = getPlatformConfig(stat.platform);
                const change = get28DayChange(stat);
                
                return (
                  <Card 
                    key={stat.platform}
                    className="hover:shadow-lg transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div style={{ color: config.color }}>
                          {config.icon}
                        </div>
                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {config.label}
                        </div>
                      </div>
                      
                      <div className="flex items-baseline gap-2 mb-1">
                        <div className="text-2xl font-bold text-white">
                          {formatNumber(stat.current)}
                        </div>
                        <div className={`text-sm font-medium flex items-center gap-1 ${change.percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {change.percent >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {Math.abs(change.percent).toFixed(1)}%
                          <span className="text-xs">
                            ({change.change >= 0 ? '+' : ''}{change.change})
                          </span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-400">
                        {formatFullNumber(stat.current)} total
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
            )}

            {/* Top Tracks Section */}
            {spotifyLoading ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                  <p className="mt-4 text-gray-500 dark:text-gray-400">Loading Spotify data...</p>
                </CardContent>
              </Card>
            ) : topTracks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SiSpotify className="h-5 w-5 text-[#1DB954]" />
                    Top Tracks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Track</TableHead>
                        <TableHead>Album</TableHead>
                        <TableHead>Popularity</TableHead>
                        <TableHead className="text-right">Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(showAllTracks ? topTracks : topTracks.slice(0, 3)).map((track) => (
                        <TableRow key={track.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {track.albumImage && (
                                <img 
                                  src={track.albumImage} 
                                  alt={track.name}
                                  className="w-10 h-10 rounded"
                                />
                              )}
                              <span className="font-medium">{track.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{track.albumName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={track.popularity} className="w-24" />
                              <span className="text-sm text-gray-500">{track.popularity}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                            >
                              <a href={track.externalUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {topTracks.length > 3 && (
                    <div className="mt-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAllTracks(!showAllTracks)}
                      >
                        {showAllTracks ? 'Show less' : `Show all ${topTracks.length} tracks`}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Audio Features Section */}
            {audioFeatures && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="h-5 w-5" />
                    Audio Features
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <RadarChart data={[
                      { feature: 'Danceability', value: audioFeatures.danceability },
                      { feature: 'Energy', value: audioFeatures.energy },
                      { feature: 'Valence', value: audioFeatures.valence },
                      { feature: 'Acousticness', value: audioFeatures.acousticness },
                      { feature: 'Speechiness', value: audioFeatures.speechiness },
                      { feature: 'Liveness', value: audioFeatures.liveness },
                      { feature: 'Tempo', value: audioFeatures.tempo / 200 },
                    ]}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="feature" />
                      <Radar
                        name="Audio Features"
                        dataKey="value"
                        stroke="#1DB954"
                        fill="#1DB954"
                        fillOpacity={0.6}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Similar Artists Section */}
            {relatedArtists.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SiSpotify className="h-5 w-5 text-[#1DB954]" />
                    Similar Artists
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {relatedArtists.map((artist) => (
                      <Card key={artist.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3 mb-3">
                            {artist.image && (
                              <img
                                src={artist.image}
                                alt={artist.name}
                                className="w-16 h-16 rounded-full object-cover"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold truncate">{artist.name}</h4>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {formatFullNumber(artist.followers)} followers
                              </p>
                            </div>
                          </div>
                          
                          <div className="mb-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-gray-500">Popularity</span>
                            </div>
                            <Progress value={artist.popularity} className="h-2" />
                          </div>

                          {artist.genres.length > 0 && (
                            <div className="mb-3">
                              <div className="flex flex-wrap gap-1">
                                {artist.genres.slice(0, 3).map((genre, idx) => (
                                  <span
                                    key={idx}
                                    className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded"
                                  >
                                    {genre}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            asChild
                          >
                            <a href={artist.externalUrl} target="_blank" rel="noopener noreferrer">
                              <SiSpotify className="h-3 w-3 mr-2" />
                              Open in Spotify
                            </a>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
        </div>
      </div>
    </div>
  );
}
