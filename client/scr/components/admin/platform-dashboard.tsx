import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Users, Music, Video, Target, FileCheck, Link, AlertCircle, TrendingUp, Disc, DollarSign, Calendar as CalendarIcon, Activity, ChevronDown, ChevronUp, Coins } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import PlatformFinanceTab from "./platform-finance-tab";
import RoyaltiesTab from "./royalties-tab";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PlatformAnalytics {
  users: {
    total: number;
    new: number;
    byDay: Array<{ date: string; count: number }>;
  };
  activity: {
    dauByDay: Array<{ date: string; count: number }>;
    sessionDurationByDay: Array<{ date: string; duration: number }>;
  };
  content: {
    totalReleases: number;
    totalVideos: number;
    releasesByDay: Array<{ date: string; count: number }>;
    videosByDay: Array<{ date: string; count: number }>;
  };
  pitching: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  agreements: {
    withoutAgreement: Array<{
      id: string;
      name: string;
      type: string;
      createdAt: string;
    }>;
    withAgreement: number;
  };
  socialMedia: {
    withoutAny: Array<{
      id: string;
      name: string;
      type: string;
      createdAt: string;
    }>;
    spotify: number;
    appleMusic: number;
    youtube: number;
    instagram: number;
    tiktok: number;
  };
  releases: {
    withoutReleases: Array<{
      id: string;
      name: string;
      type: string;
      createdAt: string;
    }>;
  };
}

const COLORS = {
  primary: "#a855f7",
  secondary: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#06b6d4",
};

const PIE_COLORS = [COLORS.success, COLORS.warning, COLORS.danger, COLORS.info];

function UsersTabContent({ analytics, startDate, endDate, setStartDate, setEndDate, mergedContentByDay, pitchingPieData, socialMediaData }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <div className="flex gap-2 items-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "MMM d, yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">—</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "w-[140px] justify-start text-left font-normal",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "MMM d, yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={endDate}
                onSelect={(date) => date && setEndDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.users.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-500 font-medium">+{analytics.users.new}</span> {startDate && endDate ? 'in selected period' : 'all time'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Releases</CardTitle>
            <Music className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.content.totalReleases}</div>
            <p className="text-xs text-muted-foreground mt-1">Audio releases on platform</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Music Videos</CardTitle>
            <Video className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.content.totalVideos}</div>
            <p className="text-xs text-muted-foreground mt-1">Video releases on platform</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pitching Submissions</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.pitching.total}</div>
            <p className="text-xs text-muted-foreground mt-1">Total submissions</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              New Users Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.users.byDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke={COLORS.primary} name="New Users" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Content Creation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={mergedContentByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="releases" fill={COLORS.primary} name="Releases" />
                <Bar dataKey="videos" fill={COLORS.secondary} name="Videos" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Daily Active Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analytics.activity?.dauByDay || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="count" stroke={COLORS.success} name="Active Users" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Average Session Duration (minutes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.activity?.sessionDurationByDay || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: number) => [`${value} min`, 'Duration']} />
                <Legend />
                <Bar dataKey="duration" fill={COLORS.info} name="Session Duration" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Pitching Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pitchingPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pitchingPieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5" />
              Social Media Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={socialMediaData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="platform" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS.info} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              Organizations Without Agreement
              <Badge variant="destructive" className="ml-auto">
                {analytics.agreements.withoutAgreement.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.agreements.withoutAgreement.length === 0 ? (
              <p className="text-sm text-muted-foreground">All organizations have accepted the agreement ✓</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.agreements.withoutAgreement.map((org: any) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{org.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(org.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link className="h-5 w-5 text-orange-500" />
              Organizations Without Social Media
              <Badge variant="destructive" className="ml-auto">
                {analytics.socialMedia.withoutAny.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.socialMedia.withoutAny.length === 0 ? (
              <p className="text-sm text-muted-foreground">All organizations have added social media links ✓</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.socialMedia.withoutAny.map((org: any) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{org.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(org.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-orange-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Disc className="h-5 w-5 text-orange-500" />
              Organizations Without Releases
              <Badge variant="destructive" className="ml-auto">
                {analytics.releases?.withoutReleases?.length || 0}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!analytics.releases?.withoutReleases?.length ? (
              <p className="text-sm text-muted-foreground">All organizations have at least one release ✓</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.releases.withoutReleases.map((org: any) => (
                      <TableRow key={org.id}>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{org.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(org.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Agreement Acceptance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8">
            <div>
              <div className="text-sm text-muted-foreground">Accepted</div>
              <div className="text-2xl font-bold text-green-500">{analytics.agreements.withAgreement}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Not Accepted</div>
              <div className="text-2xl font-bold text-orange-500">{analytics.agreements.withoutAgreement.length}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Acceptance Rate</div>
              <div className="text-2xl font-bold text-blue-500">
                {analytics.users.total > 0 ? ((analytics.agreements.withAgreement / analytics.users.total) * 100).toFixed(1) : 0}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PlatformDashboard() {
  const { t } = useTranslation();
  const { isPlatformOwner } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const startDateStr = startDate ? format(startDate, 'yyyy-MM-dd') : '';
  const endDateStr = endDate ? format(endDate, 'yyyy-MM-dd') : '';

  const queryParams = startDateStr && endDateStr 
    ? `?startDate=${startDateStr}&endDate=${endDateStr}` 
    : '';

  const { data: analytics, isLoading } = useQuery<PlatformAnalytics>({
    queryKey: [`/api/admin/platform-analytics${queryParams}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 60000,
  });

  const { data: onlineUsers } = useQuery<{
    count: number;
    organizations: Array<{ id: string; name: string; type: string; userCount: number }>;
  }>({
    queryKey: ["/api/admin/online-users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 30000,
  });

  const [showOnlineDetails, setShowOnlineDetails] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading platform analytics...</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-destructive">Failed to load analytics</div>
      </div>
    );
  }

  const mergedContentByDay = analytics.content.releasesByDay.map((release) => {
    const video = analytics.content.videosByDay.find((v) => v.date === release.date);
    return {
      date: release.date,
      releases: release.count,
      videos: video?.count || 0,
    };
  });

  analytics.content.videosByDay.forEach((video) => {
    if (!mergedContentByDay.find((d) => d.date === video.date)) {
      mergedContentByDay.push({
        date: video.date,
        releases: 0,
        videos: video.count,
      });
    }
  });

  mergedContentByDay.sort((a, b) => a.date.localeCompare(b.date));

  const pitchingPieData = analytics.pitching.byStatus.map((item) => ({
    name: item.status,
    value: item.count,
  }));

  const socialMediaData = [
    { platform: "Spotify", count: analytics.socialMedia.spotify },
    { platform: "Apple Music", count: analytics.socialMedia.appleMusic },
    { platform: "YouTube", count: analytics.socialMedia.youtube },
    { platform: "Instagram", count: analytics.socialMedia.instagram },
    { platform: "TikTok", count: analytics.socialMedia.tiktok },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">{t('dashboard.platformDashboard')}</h2>
        
        <div className="relative">
          <Card className="border-green-500/50 bg-green-500/5">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Activity className="h-5 w-5 text-green-500" />
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Online</div>
                    <div className="text-2xl font-bold text-green-600">{onlineUsers?.count || 0}</div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowOnlineDetails(!showOnlineDetails)}
                  className="h-8 px-2"
                >
                  {showOnlineDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="ml-1 text-xs">Details</span>
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {showOnlineDetails && onlineUsers?.organizations && onlineUsers.organizations.length > 0 && (
            <Card className="absolute right-0 top-full mt-2 z-50 min-w-[280px] shadow-lg">
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-sm font-medium">Active organizations</CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[300px] overflow-y-auto">
                <div className="divide-y">
                  {onlineUsers.organizations.map((org) => (
                    <div key={org.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate max-w-[180px]">{org.name}</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                          {org.type === 'LABEL' ? 'Label' : 'Artist'}
                        </Badge>
                      </div>
                      <Badge variant="outline" className="text-green-600 border-green-500/50">
                        {org.userCount} {org.userCount === 1 ? 'user' : 'users'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={`grid w-full max-w-lg ${isPlatformOwner ? 'grid-cols-3' : 'grid-cols-1'}`}>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('dashboard.users')}
          </TabsTrigger>
          {isPlatformOwner && (
            <TabsTrigger value="finance" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              {t('dashboard.finance')}
            </TabsTrigger>
          )}
          {isPlatformOwner && (
            <TabsTrigger value="royalties" className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              {t('dashboard.royaltiesTab')}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UsersTabContent 
            analytics={analytics}
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
            mergedContentByDay={mergedContentByDay}
            pitchingPieData={pitchingPieData}
            socialMediaData={socialMediaData}
          />
        </TabsContent>

        {isPlatformOwner && (
          <TabsContent value="finance" className="mt-6">
            <PlatformFinanceTab />
          </TabsContent>
        )}

        {isPlatformOwner && (
          <TabsContent value="royalties" className="mt-6">
            <RoyaltiesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
