import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ListMusic, Users, TrendingUp, Calendar, BarChart3, ChevronDown, ChevronUp, RefreshCw, Flame } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LabelList } from "recharts";
import { format } from "date-fns";
import { uk } from "date-fns/locale";

interface CuratorPlaylist {
  id: number;
  name: string;
  followerCount: number | null;
  tracksCount: number | null;
  imageUrl: string | null;
  platform: string;
  averageTrackPopularity: number | null;
}

interface FollowerSnapshot {
  id: string;
  playlistId: number;
  followerCount: number;
  tracksCount: number;
  collectedAt: string;
}

export default function CuratorPlaylistsReports() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGrowthExpanded, setIsGrowthExpanded] = useState(false);

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/curator/playlists/sync-all', {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Sync failed');
      return res.json();
    },
    onSuccess: (data: { synced: number; failed: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists/history/bulk"] });
      toast({
        title: t('curator.reports.syncSuccess'),
        description: t('curator.reports.syncResult', { synced: data.synced, failed: data.failed }),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('curator.reports.syncError'),
        variant: 'destructive',
      });
    },
  });

  const { data: playlists, isLoading } = useQuery<CuratorPlaylist[]>({
    queryKey: ["/api/curator/playlists"],
    enabled: isAuthenticated,
  });

  const { data: bulkHistory } = useQuery<Record<number, FollowerSnapshot[]>>({
    queryKey: ["/api/curator/playlists/history/bulk"],
    queryFn: async () => {
      const res = await fetch('/api/curator/playlists/history/bulk?days=90', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: isAuthenticated && !!playlists?.length,
  });

  const formatFollowers = (count: number | null) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const playlistsWithGrowth = playlists?.map(playlist => {
    const history = bulkHistory?.[playlist.id];
    if (!history || history.length < 2) {
      return { ...playlist, growth: 0, growthPercent: 0 };
    }
    const first = history[0].followerCount;
    const last = history[history.length - 1].followerCount;
    const growth = last - first;
    const growthPercent = first > 0 ? ((growth / first) * 100) : 0;
    return { ...playlist, growth, growthPercent };
  }).sort((a, b) => (b?.growthPercent || 0) - (a?.growthPercent || 0)) || [];

  const aggregatedChartData = (() => {
    if (!bulkHistory || Object.keys(bulkHistory).length === 0) return [];
    
    const allDates = new Set<string>();
    const playlistSnapshots: Record<number, Record<string, number>> = {};
    
    Object.entries(bulkHistory).forEach(([playlistIdStr, snapshots]) => {
      const playlistId = Number(playlistIdStr);
      playlistSnapshots[playlistId] = {};
      
      snapshots.forEach(s => {
        const dateKey = format(new Date(s.collectedAt), 'yyyy-MM-dd');
        const displayDate = format(new Date(s.collectedAt), 'dd.MM', { locale: uk });
        allDates.add(dateKey);
        playlistSnapshots[playlistId][dateKey] = s.followerCount;
      });
    });
    
    const sortedDates = Array.from(allDates).sort();
    
    return sortedDates.slice(-30).map(dateKey => {
      let totalFollowers = 0;
      Object.values(playlistSnapshots).forEach(dateMap => {
        if (dateMap[dateKey]) {
          totalFollowers += dateMap[dateKey];
        } else {
          const availableDates = Object.keys(dateMap).filter(d => d <= dateKey).sort();
          if (availableDates.length > 0) {
            totalFollowers += dateMap[availableDates[availableDates.length - 1]];
          }
        }
      });
      
      return {
        date: format(new Date(dateKey), 'dd.MM', { locale: uk }),
        value: totalFollowers
      };
    });
  })();

  const playlistComparisonData = playlists?.slice(0, 10).map(p => ({
    name: p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name,
    followers: p.followerCount || 0,
  })) || [];

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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('curator.reports.title')}</h1>
            <p className="text-muted-foreground">{t('curator.reports.subtitle')}</p>
          </div>
          <Button 
            onClick={() => syncAllMutation.mutate()} 
            disabled={syncAllMutation.isPending}
            variant="outline"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${syncAllMutation.isPending ? 'animate-spin' : ''}`} />
            {syncAllMutation.isPending ? t('curator.reports.syncing') : t('curator.reports.syncButton')}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t('curator.reports.followerTrend')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aggregatedChartData.length > 1 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={aggregatedChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} />
                      <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} tickFormatter={(v) => formatFollowers(v)} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Line type="monotone" dataKey="value" stroke="#14b8a6" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  {t('curator.reports.noData')}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('curator.reports.playlistComparison')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {playlistComparisonData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={playlistComparisonData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} tickFormatter={(v) => formatFollowers(v)} />
                      <YAxis type="category" dataKey="name" width={100} className="text-xs fill-muted-foreground" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          zIndex: 100,
                        }}
                        cursor={{ fill: 'rgba(255, 255, 255, 0.1)' }}
                        wrapperStyle={{ zIndex: 100 }}
                      />
                      <Bar dataKey="followers" fill="#14b8a6" radius={[0, 4, 4, 0]}>
                        <LabelList 
                          dataKey="followers" 
                          position="right" 
                          formatter={(v: number) => formatFollowers(v)}
                          className="fill-muted-foreground text-xs"
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  {t('curator.reports.noData')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              {t('curator.reports.growthLeaderboard')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {playlistsWithGrowth.length > 0 ? (
              <div className="space-y-4">
                {(isGrowthExpanded ? playlistsWithGrowth : playlistsWithGrowth.slice(0, 3)).map((playlist, index) => (
                  <div key={playlist.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                    {playlist.imageUrl ? (
                      <img src={playlist.imageUrl} alt={playlist.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        <ListMusic className="w-5 h-5 text-purple-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{playlist.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatFollowers(playlist.followerCount)} {t('curator.reports.followers')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${playlist.growthPercent > 0 ? 'text-green-500' : playlist.growthPercent < 0 ? 'text-red-500' : ''}`}>
                        {playlist.growthPercent > 0 ? '+' : ''}{playlist.growthPercent.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {playlist.growth > 0 ? '+' : ''}{formatFollowers(playlist.growth)}
                      </p>
                    </div>
                  </div>
                ))}
                {playlistsWithGrowth.length > 3 && (
                  <Button
                    variant="ghost"
                    className="w-full mt-2"
                    onClick={() => setIsGrowthExpanded(!isGrowthExpanded)}
                  >
                    {isGrowthExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4 mr-2" />
                        {t('common.showLess')}
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4 mr-2" />
                        {t('curator.reports.showAllPlaylists', { count: playlistsWithGrowth.length })}
                      </>
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <ListMusic className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('curator.reports.noPlaylists')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5" />
              {t('curator.reports.trackPopularity')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {playlists && playlists.length > 0 ? (
              <div className="space-y-3">
                {playlists.map((playlist) => {
                  const popularity = playlist.averageTrackPopularity || 0;
                  const getPopularityColor = (val: number) => {
                    if (val >= 70) return 'bg-green-500';
                    if (val >= 50) return 'bg-teal-500';
                    if (val >= 30) return 'bg-yellow-500';
                    return 'bg-red-500';
                  };
                  return (
                    <div key={playlist.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                      {playlist.imageUrl ? (
                        <img src={playlist.imageUrl} alt={playlist.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                          <ListMusic className="w-5 h-5 text-purple-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{playlist.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${getPopularityColor(popularity)} transition-all`}
                              style={{ width: `${popularity}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-10 text-right">{popularity}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Flame className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('curator.reports.noPlaylists')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
