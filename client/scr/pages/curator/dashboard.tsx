import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProxiedImageUrl } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Users, TrendingUp, Wallet, FileText, ListMusic, ArrowRight, Newspaper, ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon, FileText as FileTextIcon, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { uk, pl, enUS } from "date-fns/locale";
import { useLocation } from "wouter";

interface CuratorPlaylist {
  id: number;
  name: string;
  followerCount: number | null;
  tracksCount: number | null;
  imageUrl: string | null;
  platform: string;
}

interface FollowerSnapshot {
  id: string;
  playlistId: number;
  followerCount: number;
  tracksCount: number;
  collectedAt: string;
}

interface CuratorBalance {
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  currency: string;
}

interface ApplicationStats {
  totalApplications: number;
  statusCounts: Record<string, number>;
  approvalRate: number;
  rejectionReasons: Record<string, number>;
  applicationsByMonth: { month: string; count: number }[];
  topArtists: { orgId: number; orgName: string; count: number }[];
  topPlaylists: { playlistId: number; name: string; imageUrl: string | null; applicationCount: number }[];
}

interface PlatformNewsItem {
  id: string;
  titleEn: string;
  titleUk: string;
  titlePl: string;
  contentEn: string;
  contentUk: string;
  contentPl: string;
  images: string[];
  youtubeUrl: string | null;
  pdfFileId: string | null;
  publishedAt: string;
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
}

export default function CuratorDashboard() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedNews, setSelectedNews] = useState<PlatformNewsItem | null>(null);

  const getLocale = () => {
    switch (i18n.language) {
      case 'uk': return uk;
      case 'pl': return pl;
      default: return enUS;
    }
  };

  const { data: playlists, isLoading: playlistsLoading } = useQuery<CuratorPlaylist[]>({
    queryKey: ["/api/curator/playlists"],
    enabled: isAuthenticated,
  });

  const { data: bulkHistory } = useQuery<Record<number, FollowerSnapshot[]>>({
    queryKey: ["/api/curator/playlists/history/bulk"],
    queryFn: async () => {
      const res = await fetch('/api/curator/playlists/history/bulk?days=30', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: isAuthenticated && !!playlists?.length,
  });

  const { data: balance, isLoading: balanceLoading } = useQuery<CuratorBalance>({
    queryKey: ["/api/curator/balance"],
    enabled: isAuthenticated,
  });

  const { data: appStats, isLoading: appStatsLoading } = useQuery<ApplicationStats>({
    queryKey: ["/api/curator/applications/stats"],
    enabled: isAuthenticated,
  });

  const { data: news = [] } = useQuery<PlatformNewsItem[]>({
    queryKey: ["/api/curator/platform-news"],
    enabled: isAuthenticated,
  });

  const getNewsTitle = (item: PlatformNewsItem) => {
    switch (i18n.language) {
      case 'uk': return item.titleUk;
      case 'pl': return item.titlePl;
      default: return item.titleEn;
    }
  };

  const getNewsContent = (item: PlatformNewsItem) => {
    switch (i18n.language) {
      case 'uk': return item.contentUk;
      case 'pl': return item.contentPl;
      default: return item.contentEn;
    }
  };

  const formatFollowers = (count: number | null) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const formatMoney = (kopecks: number) => {
    const uah = kopecks / 100;
    return new Intl.NumberFormat(i18n.language, {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(uah);
  };

  const totalFollowers = playlists?.reduce((sum, p) => sum + (p.followerCount || 0), 0) || 0;

  const growthPercentage = (() => {
    if (!bulkHistory || Object.keys(bulkHistory).length === 0) return 0;
    
    const dateMap: Record<string, number> = {};
    Object.values(bulkHistory).forEach(snapshots => {
      snapshots.forEach(s => {
        const date = format(new Date(s.collectedAt), 'yyyy-MM-dd', { locale: getLocale() });
        dateMap[date] = (dateMap[date] || 0) + s.followerCount;
      });
    });
    
    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length < 2) return 0;
    
    const first = dateMap[sortedDates[0]];
    const last = dateMap[sortedDates[sortedDates.length - 1]];
    if (first === 0) return 0;
    return ((last - first) / first * 100).toFixed(1);
  })();

  const pendingApplications = appStats?.statusCounts?.PENDING || 0;
  const totalEarned = balance?.totalEarned || 0;
  const availableBalance = balance?.availableBalance || 0;

  const last30DaysApps = (() => {
    if (!appStats?.applicationsByMonth) return [];
    const data = appStats.applicationsByMonth.slice(-3).map(item => ({
      month: format(new Date(item.month + '-01'), 'MMM', { locale: getLocale() }),
      count: item.count,
    }));
    return data;
  })();

  const top3Playlists = appStats?.topPlaylists?.slice(0, 3) || [];

  const isLoading = playlistsLoading || balanceLoading || appStatsLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">{t('curator.dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('curator.dashboard.subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-8">
          <Card 
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setLocation('/curator/applications?tab=pending')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">{t('curator.dashboard.newApplications')}</CardTitle>
              <FileText className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-xl md:text-2xl font-bold text-primary">{pendingApplications}</div>
              <p className="text-[10px] md:text-xs text-muted-foreground flex items-center gap-1 mt-0.5 md:mt-1">
                {t('curator.dashboard.viewPending')}
                <ArrowRight className="h-2.5 w-2.5 md:h-3 md:w-3" />
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">{t('curator.dashboard.totalEarnings')}</CardTitle>
              <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">{formatMoney(totalEarned)}</div>
              {availableBalance > 0 && (
                <Button 
                  variant="link" 
                  size="sm" 
                  className="p-0 h-auto text-[10px] md:text-xs text-primary"
                  onClick={() => setLocation('/curator/finance')}
                >
                  {t('curator.dashboard.withdraw')} ({formatMoney(availableBalance)})
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">{t('curator.dashboard.totalFollowers')}</CardTitle>
              <Users className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-xl md:text-2xl font-bold">{formatFollowers(totalFollowers)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-6 pb-1 md:pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">{t('curator.dashboard.growth')}</CardTitle>
              <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className={`text-xl md:text-2xl font-bold ${Number(growthPercentage) > 0 ? 'text-green-500' : Number(growthPercentage) < 0 ? 'text-red-500' : ''}`}>
                {Number(growthPercentage) > 0 ? '+' : ''}{growthPercentage}%
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground">{t('curator.dashboard.last30Days')}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {last30DaysApps.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('curator.dashboard.applicationsTrend')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={last30DaysApps}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="month" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                      <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelStyle={{ color: 'hsl(var(--foreground))' }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="#14b8a6" 
                        radius={[4, 4, 0, 0]}
                        name={t('curator.playlistReports.applications')}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('curator.dashboard.topPlaylistsByApps')}</CardTitle>
            </CardHeader>
            <CardContent>
              {top3Playlists.length > 0 ? (
                <div className="space-y-4">
                  {top3Playlists.map((playlist, index) => (
                    <div key={playlist.playlistId} className="flex items-center gap-4">
                      <span className="text-lg font-bold w-6">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </span>
                      {playlist.imageUrl ? (
                        <img src={getProxiedImageUrl(playlist.imageUrl)} alt={playlist.name} className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                          <ListMusic className="w-5 h-5 text-purple-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate text-sm">{playlist.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {playlist.applicationCount} {t('curator.playlistReports.applications')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ListMusic className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('curator.dashboard.noApplicationsYet')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {news.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="h-5 w-5" />
                {t('dashboard.platformNews')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {news.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedNews(item)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{getNewsTitle(item)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.publishedAt && format(new Date(item.publishedAt), 'dd.MM.yyyy')}
                    </span>
                  </button>
                ))}
              </div>
              {news.length > 3 && (
                <Button 
                  variant="ghost" 
                  className="w-full mt-3" 
                  onClick={() => setLocation('/curator/news')}
                >
                  {t('dashboard.viewAllNews')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!selectedNews} onOpenChange={() => setSelectedNews(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedNews && getNewsTitle(selectedNews)}</DialogTitle>
            {selectedNews?.publishedAt && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(selectedNews.publishedAt), 'dd MMMM yyyy', { locale: getLocale() })}
              </p>
            )}
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {selectedNews?.youtubeUrl && extractYoutubeId(selectedNews.youtubeUrl) && (
              <div className="aspect-video mb-4 rounded-lg overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${extractYoutubeId(selectedNews.youtubeUrl)}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            {selectedNews?.images && selectedNews.images.length > 0 && (
              <div className="mb-4 rounded-lg overflow-hidden">
                <img
                  src={`/api/files/download/${selectedNews.images[0]}`}
                  alt=""
                  className="w-full h-auto object-contain max-h-64"
                />
              </div>
            )}
            <div 
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedNews ? getNewsContent(selectedNews) : '' }}
            />
            {selectedNews?.pdfFileId && (
              <Button variant="outline" className="mt-4" asChild>
                <a href={`/api/files/download/${selectedNews.pdfFileId}`} download>
                  <Download className="h-4 w-4 mr-2" />
                  {t('common.downloadPdf')}
                </a>
              </Button>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
