import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ListMusic, TrendingUp, BarChart3, Eye, CalendarDays, ChevronDown, Trophy, Music, ChevronUp, FileText, CheckCircle, XCircle, Users, PieChart as PieChartIcon } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isBefore, isAfter } from "date-fns";
import { uk, pl } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, getProxiedImageUrl } from "@/lib/utils";

interface PlaylistWithViews {
  id: number;
  name: string;
  imageUrl: string | null;
  viewCount: number;
}

interface PlaylistViewsData {
  playlists: PlaylistWithViews[];
  viewsByDay: { date: string; total: number; [key: string]: number | string }[];
  totalViews: number;
  startDate: string;
  endDate: string;
}

interface ApplicationStats {
  totalApplications: number;
  statusCounts: Record<string, number>;
  approvalRate: number;
  rejectionReasons: Record<string, number>;
  applicationsByMonth: { month: string; count: number }[];
  topArtists: { orgId: string; name: string; applicationCount: number }[];
  topPlaylists: { playlistId: number; name: string; imageUrl: string | null; applicationCount: number }[];
}

const COLORS = [
  "#14b8a6", "#8b5cf6", "#f59e0b", "#ef4444", "#3b82f6", 
  "#ec4899", "#10b981", "#6366f1", "#f97316", "#06b6d4"
];

export default function CuratorReports() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();

  const now = new Date();
  
  // Start period (default: beginning of current year)
  const [startMonth, setStartMonth] = useState(0); // January
  const [startYear, setStartYear] = useState(now.getFullYear());
  const [isStartPickerOpen, setIsStartPickerOpen] = useState(false);
  
  // End period (default: current month)
  const [endMonth, setEndMonth] = useState(now.getMonth());
  const [endYear, setEndYear] = useState(now.getFullYear());
  const [isEndPickerOpen, setIsEndPickerOpen] = useState(false);

  const startDate = startOfMonth(new Date(startYear, startMonth));
  const endDate = endOfMonth(new Date(endYear, endMonth));

  const locale = i18n.language === 'uk' ? uk : i18n.language === 'pl' ? pl : undefined;

  const { data: viewsData, isLoading: viewsLoading } = useQuery<PlaylistViewsData>({
    queryKey: ["/api/curator/playlists/views", startYear, startMonth, endYear, endMonth],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });
      const res = await fetch(`/api/curator/playlists/views?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch views');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: appStats, isLoading: appStatsLoading } = useQuery<ApplicationStats>({
    queryKey: ["/api/curator/applications/stats"],
    queryFn: async () => {
      const res = await fetch('/api/curator/applications/stats', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch application stats');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const rejectionReasonLabels: Record<string, string> = {
    'GENRE_MISMATCH': t('curator.reports.rejectionReasons.genreMismatch', 'Не підходить жанр'),
    'LOW_QUALITY': t('curator.reports.rejectionReasons.lowQuality', 'Низька якість'),
    'NOT_FITTING_PLAYLIST_STYLE': t('curator.reports.rejectionReasons.styleMismatch', 'Не підходить стиль'),
    'INCOMPLETE_PROFILE': t('curator.reports.rejectionReasons.incompleteProfile', 'Неповний профіль'),
    'INSUFFICIENT_STREAMING_STATS': t('curator.reports.rejectionReasons.lowStats', 'Недостатня статистика'),
    'OTHER': t('curator.reports.rejectionReasons.other', 'Інше'),
  };

  const rejectionChartData = appStats?.rejectionReasons 
    ? Object.entries(appStats.rejectionReasons).map(([reason, count]) => ({
        name: rejectionReasonLabels[reason] || reason,
        value: count,
      }))
    : [];

  const months = [
    t('common.months.january', 'Січень'),
    t('common.months.february', 'Лютий'),
    t('common.months.march', 'Березень'),
    t('common.months.april', 'Квітень'),
    t('common.months.may', 'Травень'),
    t('common.months.june', 'Червень'),
    t('common.months.july', 'Липень'),
    t('common.months.august', 'Серпень'),
    t('common.months.september', 'Вересень'),
    t('common.months.october', 'Жовтень'),
    t('common.months.november', 'Листопад'),
    t('common.months.december', 'Грудень'),
  ];

  const shortMonths = months.map(m => m.slice(0, 3));

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  const formatChartDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'dd.MM', { locale });
  };

  // Generate all days in the period for complete chart
  const allDaysInPeriod = eachDayOfInterval({ start: startDate, end: endDate });
  
  const chartData = allDaysInPeriod.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayData = viewsData?.viewsByDay.find(d => d.date === dateStr);
    
    const result: any = {
      date: format(day, 'dd.MM', { locale }),
      total: dayData?.total || 0,
    };
    
    viewsData?.playlists?.forEach(p => {
      result[`playlist_${p.id}`] = dayData?.[`playlist_${p.id}`] || 0;
    });
    
    return result;
  });

  // Check if date range is valid
  const isValidRange = !isAfter(startDate, endDate);

  // Check if a month is selectable for start (must be before or equal to end)
  const isStartMonthDisabled = (month: number, year: number) => {
    const date = new Date(year, month);
    const end = new Date(endYear, endMonth);
    return isAfter(date, end) || isAfter(date, now);
  };

  // Check if a month is selectable for end (must be after or equal to start)
  const isEndMonthDisabled = (month: number, year: number) => {
    const date = new Date(year, month);
    const start = new Date(startYear, startMonth);
    return isBefore(date, start) || isAfter(date, now);
  };

  const handleApplyStart = () => {
    setIsStartPickerOpen(false);
  };

  const handleApplyEnd = () => {
    setIsEndPickerOpen(false);
  };

  if (viewsLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">{t('curator.reports.applicationsReports', 'Звіти по заявках')}</h1>
          <p className="text-muted-foreground">{t('curator.reports.applicationsReportsSubtitle', 'Перегляди плейлистів та статистика заявок')}</p>
        </div>

        {/* Period Selection */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center gap-4 justify-center">
              {/* Start Period */}
              <Popover open={isStartPickerOpen} onOpenChange={setIsStartPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[160px] gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>{shortMonths[startMonth]} {startYear}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-4">
                    <Select value={startYear.toString()} onValueChange={(v) => setStartYear(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-3 gap-2">
                      {months.map((month, index) => {
                        const disabled = isStartMonthDisabled(index, startYear);
                        return (
                          <Button
                            key={index}
                            variant={startMonth === index ? "default" : "outline"}
                            size="sm"
                            disabled={disabled}
                            onClick={() => setStartMonth(index)}
                            className="text-xs"
                          >
                            {shortMonths[index]}
                          </Button>
                        );
                      })}
                    </div>
                    <Button className="w-full" onClick={handleApplyStart}>
                      {t('common.apply', 'Застосувати')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground">—</span>

              {/* End Period */}
              <Popover open={isEndPickerOpen} onOpenChange={setIsEndPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[160px] gap-2 justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>{shortMonths[endMonth]} {endYear}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <Select value={endYear.toString()} onValueChange={(v) => setEndYear(parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((year) => (
                          <SelectItem key={year} value={year.toString()}>
                            {year}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-3 gap-2">
                      {months.map((month, index) => {
                        const disabled = isEndMonthDisabled(index, endYear);
                        return (
                          <Button
                            key={index}
                            variant={endMonth === index ? "default" : "outline"}
                            size="sm"
                            disabled={disabled}
                            onClick={() => setEndMonth(index)}
                            className="text-xs"
                          >
                            {shortMonths[index]}
                          </Button>
                        );
                      })}
                    </div>
                    <Button className="w-full" onClick={handleApplyEnd}>
                      {t('common.apply', 'Застосувати')}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>

        {/* Total Views Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-teal-500/10">
                  <Eye className="h-6 w-6 text-teal-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('curator.reports.totalViews', 'Всього переглядів')}</p>
                  <p className="text-2xl font-bold">{viewsData?.totalViews || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-500/10">
                  <ListMusic className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('curator.reports.playlistsTracked', 'Плейлистів відстежується')}</p>
                  <p className="text-2xl font-bold">{viewsData?.playlists?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-amber-500/10">
                  <TrendingUp className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('curator.reports.avgViewsPerDay', 'Середня кількість/день')}</p>
                  <p className="text-2xl font-bold">
                    {chartData.length > 0
                      ? Math.round((viewsData?.totalViews || 0) / chartData.length) 
                      : 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Views Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t('curator.reports.playlistViewsChart', 'Перегляди плейлистів по днях')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isValidRange && chartData.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs fill-muted-foreground" 
                      tick={{ fontSize: 10 }}
                      interval={Math.max(0, Math.floor(chartData.length / 15))}
                    />
                    <YAxis 
                      className="text-xs fill-muted-foreground" 
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(label) => `${t('common.date', 'Дата')}: ${label}`}
                      formatter={(value: number, name: string) => {
                        if (name === 'total') {
                          return [value, t('curator.reports.totalViews', 'Всього')];
                        }
                        const playlistId = parseInt(name.replace('playlist_', ''));
                        const playlist = viewsData?.playlists.find(p => p.id === playlistId);
                        return [value, playlist?.name || name];
                      }}
                    />
                    {viewsData?.playlists?.length === 1 ? (
                      <Bar 
                        dataKey={`playlist_${viewsData.playlists[0].id}`}
                        fill="#14b8a6" 
                        radius={[4, 4, 0, 0]}
                        name={viewsData.playlists[0].name}
                      />
                    ) : (
                      <Bar 
                        dataKey="total" 
                        fill="#14b8a6" 
                        radius={[4, 4, 0, 0]}
                        name={t('curator.reports.totalViews', 'Всього')}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-80 flex flex-col items-center justify-center text-muted-foreground">
                <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('curator.reports.noViewsData', 'Немає даних про перегляди за обраний період')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Playlist breakdown */}
        {viewsData?.playlists && viewsData.playlists.length > 1 && (viewsData.totalViews || 0) > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('curator.reports.viewsByPlaylist', 'Перегляди за плейлистом')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      className="text-xs fill-muted-foreground" 
                      tick={{ fontSize: 10 }}
                      interval={Math.max(0, Math.floor(chartData.length / 15))}
                    />
                    <YAxis 
                      className="text-xs fill-muted-foreground" 
                      tick={{ fontSize: 10 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelFormatter={(label) => `${t('common.date', 'Дата')}: ${label}`}
                      formatter={(value: number, name: string) => {
                        const playlistId = parseInt(name.replace('playlist_', ''));
                        const playlist = viewsData?.playlists.find(p => p.id === playlistId);
                        return [value, playlist?.name || name];
                      }}
                    />
                    <Legend 
                      formatter={(value: string) => {
                        const playlistId = parseInt(value.replace('playlist_', ''));
                        const playlist = viewsData?.playlists.find(p => p.id === playlistId);
                        const name = playlist?.name || value;
                        return name.length > 20 ? name.slice(0, 20) + '...' : name;
                      }}
                    />
                    {viewsData.playlists.map((playlist, index) => (
                      <Bar 
                        key={playlist.id}
                        dataKey={`playlist_${playlist.id}`}
                        fill={COLORS[index % COLORS.length]} 
                        stackId="views"
                        name={`playlist_${playlist.id}`}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Playlist Views Ranking */}
        <PlaylistViewsRanking 
          playlists={viewsData?.playlists || []} 
          totalViews={viewsData?.totalViews || 0}
          t={t}
        />

        {/* Application Statistics Section */}
        <div className="mt-8 border-t pt-8">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('curator.reports.applicationStats', 'Статистика заявок')}
          </h2>

          {/* Application Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-500/10">
                    <FileText className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('curator.reports.totalApplications', 'Всього заявок')}</p>
                    <p className="text-2xl font-bold">{appStats?.totalApplications || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-green-500/10">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('curator.reports.approvalRate', 'Відсоток схвалення')}</p>
                    <p className="text-2xl font-bold">{appStats?.approvalRate || 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-red-500/10">
                    <XCircle className="h-6 w-6 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('curator.reports.rejectedCount', 'Відхилено')}</p>
                    <p className="text-2xl font-bold">{appStats?.statusCounts?.REJECTED || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Applications Chart */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('curator.reports.applicationsByMonth', 'Заявки по місяцях')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appStats?.applicationsByMonth && appStats.applicationsByMonth.some(m => m.count > 0) ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={appStats.applicationsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="month" 
                        className="text-xs fill-muted-foreground" 
                        tick={{ fontSize: 10 }}
                        tickFormatter={(value) => {
                          const [year, month] = value.split('-');
                          return `${month}/${year.slice(2)}`;
                        }}
                      />
                      <YAxis 
                        className="text-xs fill-muted-foreground" 
                        tick={{ fontSize: 10 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                        labelFormatter={(value) => {
                          const [year, month] = String(value).split('-');
                          const monthNames = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
                          return `${monthNames[parseInt(month) - 1]} ${year}`;
                        }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="#3b82f6" 
                        radius={[4, 4, 0, 0]}
                        name={t('curator.reports.applications', 'Заявки')}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t('curator.reports.noApplicationsData', 'Немає даних про заявки')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Rejection Reasons Pie Chart */}
          {rejectionChartData.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  {t('curator.reports.rejectionReasonsChart', 'Причини відхилення')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={rejectionChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {rejectionChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Top Artists and Playlists Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Artists */}
            <TopArtistsRanking 
              artists={appStats?.topArtists || []}
              t={t}
            />

            {/* Top Playlists by Applications */}
            <TopPlaylistsRanking 
              playlists={appStats?.topPlaylists || []}
              t={t}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaylistViewsRanking({ 
  playlists, 
  totalViews,
  t 
}: { 
  playlists: PlaylistWithViews[];
  totalViews: number;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (playlists.length === 0) {
    return null;
  }

  const displayedPlaylists = isExpanded ? playlists : playlists.slice(0, 5);
  const maxViews = playlists[0]?.viewCount || 1;

  const getRankBadge = (index: number) => {
    if (index === 0) return <span className="text-xl">🥇</span>;
    if (index === 1) return <span className="text-xl">🥈</span>;
    if (index === 2) return <span className="text-xl">🥉</span>;
    return <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{index + 1}</span>;
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          {t('curator.reports.viewsRanking', 'Рейтинг переглядів плейлистів')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {totalViews > 0 ? (
          <div className="space-y-3">
            {displayedPlaylists.map((playlist, index) => {
              const percentage = maxViews > 0 ? (playlist.viewCount / maxViews) * 100 : 0;
              
              return (
                <div 
                  key={playlist.id} 
                  className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getRankBadge(index)}
                  </div>
                  
                  {playlist.imageUrl ? (
                    <img 
                      src={getProxiedImageUrl(playlist.imageUrl)} 
                      alt={playlist.name} 
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0" 
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                      <Music className="w-6 h-6 text-purple-400" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{playlist.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <p className="text-lg font-bold text-teal-500">{playlist.viewCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('curator.reports.views', 'переглядів')}
                    </p>
                  </div>
                </div>
              );
            })}
            
            {playlists.length > 5 && (
              <Button
                variant="ghost"
                className="w-full mt-2"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-2" />
                    {t('common.showLess', 'Показати менше')}
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-2" />
                    {t('curator.reports.showAllPlaylists', { count: playlists.length, defaultValue: 'Show all ({{count}})' })}
                  </>
                )}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('curator.reports.noViewsData', 'Немає даних про перегляди за обраний період')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopArtistsRanking({ 
  artists, 
  t 
}: { 
  artists: { orgId: string; name: string; applicationCount: number }[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (artists.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            {t('curator.reports.topArtists', 'Топ артистів')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('curator.reports.noArtistsData', 'Немає даних про артистів')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayedArtists = isExpanded ? artists : artists.slice(0, 5);
  const maxCount = artists[0]?.applicationCount || 1;

  const getRankBadge = (index: number) => {
    if (index === 0) return <span className="text-xl">🥇</span>;
    if (index === 1) return <span className="text-xl">🥈</span>;
    if (index === 2) return <span className="text-xl">🥉</span>;
    return <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{index + 1}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-blue-500" />
          {t('curator.reports.topArtists', 'Топ артистів')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayedArtists.map((artist, index) => {
            const percentage = maxCount > 0 ? (artist.applicationCount / maxCount) * 100 : 0;
            
            return (
              <div 
                key={artist.orgId} 
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
              >
                <div className="flex-shrink-0">
                  {getRankBadge(index)}
                </div>
                
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{artist.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-blue-500">{artist.applicationCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('curator.reports.applications', 'заявок')}
                  </p>
                </div>
              </div>
            );
          })}
          
          {artists.length > 5 && (
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  {t('common.showLess', 'Показати менше')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  {t('curator.reports.showAllArtists', { count: artists.length, defaultValue: 'Show all ({{count}})' })}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TopPlaylistsRanking({ 
  playlists, 
  t 
}: { 
  playlists: { playlistId: number; name: string; imageUrl: string | null; applicationCount: number }[];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (playlists.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5 text-purple-500" />
            {t('curator.reports.topPlaylistsByApps', 'Найактивніші плейлисти')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <ListMusic className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>{t('curator.reports.noPlaylistsData', 'Немає даних про плейлисти')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayedPlaylists = isExpanded ? playlists : playlists.slice(0, 5);
  const maxCount = playlists[0]?.applicationCount || 1;

  const getRankBadge = (index: number) => {
    if (index === 0) return <span className="text-xl">🥇</span>;
    if (index === 1) return <span className="text-xl">🥈</span>;
    if (index === 2) return <span className="text-xl">🥉</span>;
    return <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{index + 1}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListMusic className="h-5 w-5 text-purple-500" />
          {t('curator.reports.topPlaylistsByApps', 'Найактивніші плейлисти')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {displayedPlaylists.map((playlist, index) => {
            const percentage = maxCount > 0 ? (playlist.applicationCount / maxCount) * 100 : 0;
            
            return (
              <div 
                key={playlist.playlistId} 
                className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
              >
                <div className="flex-shrink-0">
                  {getRankBadge(index)}
                </div>
                
                {playlist.imageUrl ? (
                  <img 
                    src={getProxiedImageUrl(playlist.imageUrl)} 
                    alt={playlist.name} 
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0" 
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center flex-shrink-0">
                    <Music className="w-6 h-6 text-purple-400" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{playlist.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold text-purple-500">{playlist.applicationCount}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('curator.reports.applications', 'заявок')}
                  </p>
                </div>
              </div>
            );
          })}
          
          {playlists.length > 5 && (
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 mr-2" />
                  {t('common.showLess', 'Показати менше')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 mr-2" />
                  {t('curator.reports.showAllPlaylists', { count: playlists.length, defaultValue: 'Show all ({{count}})' })}
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
