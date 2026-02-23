import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Loader2, DollarSign, Wallet, CheckCircle, Search, TrendingUp, Calculator,
  Music, Headphones, Calendar, ArrowDownToLine, BarChart3, ChevronDown
} from "lucide-react";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";

interface RoyaltiesSummary {
  totalRevenue: number;
  totalRevenueUah: number;
  totalStreams: number;
  availableBalance: number;
  availableBalanceUah: number;
  frozenBalance: number;
  frozenBalanceUah: number;
  paidAmount: number;
  paidAmountUah: number;
  taxFop7: number;
  taxFop7Uah: number;
  taxAgent23: number;
  taxAgent23Uah: number;
}

interface PlatformRpm {
  platform: string;
  streams: number;
  revenue: number;
  revenueUah: number;
  rpm: number;
  rpmUah: number;
}

interface WithdrawalStats {
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  approvedCount: number;
  totalWithdrawn: number;
  totalWithdrawnUah: number;
  averageAmount: number;
  averageAmountUah: number;
  requests: WithdrawalRequest[];
}

interface WithdrawalRequest {
  id: string;
  orgName: string;
  amount: number;
  amountUah: number;
  status: string;
  requestedAt: string;
}

interface MonthlyData {
  month: string;
  revenue: number;
  revenueUah: number;
}

interface OrganizationRoyalty {
  orgId: string;
  orgName: string;
  orgType: string;
  totalRevenue: number;
  totalRevenueUah: number;
  availableBalance: number;
  availableBalanceUah: number;
  frozenBalance: number;
  frozenBalanceUah: number;
  paidAmount: number;
  paidAmountUah: number;
  pendingAmount: number;
  taxFop7: number;
  taxFop7Uah: number;
  taxAgent23: number;
  taxAgent23Uah: number;
}

interface RoyaltiesData {
  summary: RoyaltiesSummary;
  platformRpm: PlatformRpm[];
  withdrawalStats: WithdrawalStats;
  monthlyData: MonthlyData[];
  organizations: OrganizationRoyalty[];
}

type Currency = "EUR" | "UAH";

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const PLATFORM_ICONS: Record<string, string> = {
  "Spotify": "🎵",
  "Apple Music": "🍎",
  "YouTube": "▶️",
  "Shazam": "🔍",
  "TikTok": "🎬",
  "Deezer": "🎧",
  "Tidal": "🌊",
  "Amazon": "📦",
};

const PIE_COLORS = ["#10b981", "#f97316", "#8b5cf6"];

export default function RoyaltiesTab() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [currency, setCurrency] = useState<Currency>("EUR");
  
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, "0");
  
  const [startMonth, setStartMonth] = useState("01");
  const [startYear, setStartYear] = useState(String(currentYear - 1));
  const [endMonth, setEndMonth] = useState(currentMonth);
  const [endYear, setEndYear] = useState(String(currentYear));

  const years = useMemo(() => {
    const result = [];
    for (let y = 2020; y <= currentYear + 1; y++) {
      result.push(String(y));
    }
    return result;
  }, [currentYear]);

  const startPeriod = `${startYear}-${startMonth}`;
  const endPeriod = `${endYear}-${endMonth}`;

  const { data, isLoading, error } = useQuery<RoyaltiesData>({
    queryKey: ["/api/admin/royalties/summary", startPeriod, endPeriod],
    queryFn: async () => {
      const response = await fetch(`/api/admin/royalties/summary?startPeriod=${startPeriod}&endPeriod=${endPeriod}`);
      if (!response.ok) throw new Error("Failed to fetch royalties");
      return response.json();
    },
  });

  const filteredOrganizations = useMemo(() => {
    if (!data?.organizations) return [];
    const orgs = searchQuery.trim() 
      ? data.organizations.filter(org => org.orgName.toLowerCase().includes(searchQuery.toLowerCase()))
      : data.organizations;
    return orgs.slice(0, 10);
  }, [data?.organizations, searchQuery]);

  const formatAmount = (cents: number, curr: Currency = currency) => {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
    }).format(cents / 100);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('uk-UA').format(num);
  };

  const getValue = (eur: number, uah: number) => {
    return currency === "EUR" ? eur : uah;
  };

  const pieData = useMemo(() => {
    if (!data?.summary) return [];
    return [
      { 
        name: t("admin.royalties.available"), 
        value: getValue(data.summary.availableBalance, data.summary.availableBalanceUah),
        color: PIE_COLORS[0]
      },
      { 
        name: t("admin.royalties.frozen"), 
        value: getValue(data.summary.frozenBalance, data.summary.frozenBalanceUah),
        color: PIE_COLORS[1]
      },
      { 
        name: t("admin.royalties.paid"), 
        value: getValue(data.summary.paidAmount, data.summary.paidAmountUah),
        color: PIE_COLORS[2]
      },
    ].filter(item => item.value > 0);
  }, [data?.summary, currency, t]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{item.month || item.name}</p>
          <p className="text-sm text-primary font-medium">
            {formatAmount(item.value || (currency === "EUR" ? item.revenue : item.revenueUah))}
          </p>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        {t("common.error")}: {(error as Error).message}
      </div>
    );
  }

  const summary = data?.summary;
  const monthlyData = data?.monthlyData || [];
  const platformRpm = data?.platformRpm || [];
  const withdrawalStats = data?.withdrawalStats;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("admin.royalties.from")}:</span>
          </div>
          <Select value={startMonth} onValueChange={setStartMonth}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={startYear} onValueChange={setStartYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <span className="text-muted-foreground">—</span>
          
          <span className="text-sm text-muted-foreground">{t("admin.royalties.to")}:</span>
          <Select value={endMonth} onValueChange={setEndMonth}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={endYear} onValueChange={setEndYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrency("EUR")}
            className={currency === "EUR" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
          >
            € EUR
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrency("UAH")}
            className={currency === "UAH" ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
          >
            ₴ UAH
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.royalties.totalRevenue")}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatAmount(getValue(summary?.totalRevenue || 0, summary?.totalRevenueUah || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.royalties.forPeriod")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.royalties.totalStreams")}
            </CardTitle>
            <Headphones className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatNumber(summary?.totalStreams || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.royalties.forPeriod")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.royalties.averageRpm")}
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {summary?.totalStreams && summary.totalStreams > 0
                ? formatAmount(Math.round((getValue(summary.totalRevenue, summary.totalRevenueUah) / summary.totalStreams) * 1000))
                : formatAmount(0)
              }
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin.royalties.per1000Streams")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.royalties.taxFop7")}
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatAmount(getValue(summary?.taxFop7 || 0, summary?.taxFop7Uah || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              7% {t("admin.royalties.fromTotal")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.royalties.taxAgent23")}
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatAmount(getValue(summary?.taxAgent23 || 0, summary?.taxAgent23Uah || 0))}
            </div>
            <p className="text-xs text-muted-foreground">
              23% {t("admin.royalties.fromTotal")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {currency === "EUR" ? "€" : "₴"} {t("admin.royalties.per1000Streams")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart 
              data={[...platformRpm]
                .map(p => ({
                  ...p,
                  rpmValue: getValue(p.rpm, p.rpmUah) / 100
                }))
                .sort((a, b) => b.rpmValue - a.rpmValue)
              }
              margin={{ top: 10, right: 10, left: 10, bottom: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis 
                dataKey="platform" 
                tick={{ fill: 'currentColor', fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis 
                tick={{ fill: 'currentColor', fontSize: 12 }}
                tickFormatter={(value) => currency === "EUR" ? `€${value.toFixed(2)}` : `₴${value.toFixed(2)}`}
                label={{ value: `${currency === "EUR" ? "€" : "₴"} / 1000`, angle: -90, position: 'insideLeft', style: { fill: 'currentColor', fontSize: 12 } }}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload;
                    return (
                      <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
                        <p className="font-medium">{item.platform}</p>
                        <p className="text-sm text-muted-foreground">
                          RPM: {formatAmount(getValue(item.rpm, item.rpmUah))}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatNumber(item.streams)} {t("admin.royalties.streams")}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar 
                dataKey="rpmValue" 
                fill="#5eead4" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {monthlyData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                {t("admin.royalties.monthlyChart")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                  />
                  <YAxis 
                    className="text-xs"
                    tick={{ fill: 'currentColor' }}
                    tickFormatter={(value) => currency === "EUR" ? `€${(value / 100).toFixed(0)}` : `₴${(value / 100).toFixed(0)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line 
                    type="monotone" 
                    dataKey={currency === "EUR" ? "revenue" : "revenueUah"} 
                    stroke="#10b981" 
                    strokeWidth={2}
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              {t("admin.royalties.fundsDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="font-medium">{t("admin.royalties.available")}</span>
                </div>
                <span className="text-xl font-bold text-emerald-500">
                  {formatAmount(getValue(summary?.availableBalance || 0, summary?.availableBalanceUah || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500" />
                  <span className="font-medium">{t("admin.royalties.frozen")}</span>
                </div>
                <span className="text-xl font-bold text-orange-500">
                  {formatAmount(getValue(summary?.frozenBalance || 0, summary?.frozenBalanceUah || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-violet-500/10 rounded-lg border border-violet-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-violet-500" />
                  <span className="font-medium">{t("admin.royalties.paid")}</span>
                </div>
                <span className="text-xl font-bold text-violet-500">
                  {formatAmount(getValue(summary?.paidAmount || 0, summary?.paidAmountUah || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="font-medium">{t("admin.royalties.taxFop7")}</span>
                </div>
                <span className="text-xl font-bold text-amber-500">
                  {formatAmount(getValue(summary?.taxFop7 || 0, summary?.taxFop7Uah || 0))}
                </span>
              </div>
              <div className="flex items-center justify-between p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="font-medium">{t("admin.royalties.taxAgent23")}</span>
                </div>
                <span className="text-xl font-bold text-red-500">
                  {formatAmount(getValue(summary?.taxAgent23 || 0, summary?.taxAgent23Uah || 0))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <Collapsible>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ArrowDownToLine className="h-5 w-5" />
                <CardTitle>{t("admin.royalties.withdrawalRequests")}</CardTitle>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-bold">{withdrawalStats?.totalCount || 0}</div>
                <div className="flex gap-2">
                  <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-800">
                    {withdrawalStats?.pendingCount || 0} {t("admin.royalties.pending")}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                    {withdrawalStats?.approvedCount || 0} {t("admin.royalties.approved")}
                  </Badge>
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                    {withdrawalStats?.completedCount || 0} {t("admin.royalties.completed")}
                  </Badge>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.royalties.organization")}</TableHead>
                    <TableHead className="text-right">{t("admin.royalties.amount")}</TableHead>
                    <TableHead>{t("admin.royalties.status")}</TableHead>
                    <TableHead>{t("admin.royalties.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawalStats?.requests?.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.orgName}</TableCell>
                      <TableCell className="text-right">
                        {formatAmount(getValue(request.amount, request.amountUah))}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={
                            request.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                            request.status === 'APPROVED' ? 'bg-blue-100 text-blue-800' :
                            request.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }
                        >
                          {request.status === 'COMPLETED' ? t("admin.royalties.completed") :
                           request.status === 'APPROVED' ? t("admin.royalties.approved") :
                           request.status === 'PENDING' ? t("admin.royalties.pending") :
                           request.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {request.requestedAt ? new Date(request.requestedAt).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!withdrawalStats?.requests || withdrawalStats.requests.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t("admin.royalties.noData")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.royalties.topOrganizations")}</CardTitle>
          <div className="flex items-center gap-2 mt-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("admin.royalties.searchOrganization")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>{t("admin.royalties.organization")}</TableHead>
                  <TableHead className="text-right">{t("admin.royalties.totalRevenue")}</TableHead>
                  <TableHead className="text-right">{t("admin.royalties.available")}</TableHead>
                  <TableHead className="text-right">{t("admin.royalties.frozen")}</TableHead>
                  <TableHead className="text-right">{t("admin.royalties.paid")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrganizations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {t("admin.royalties.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrganizations.map((org, index) => (
                    <TableRow key={org.orgId}>
                      <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{org.orgName}</span>
                          <Badge variant="outline" className="text-xs">
                            {org.orgType === 'LABEL' ? 'Label' : 'Artist'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatAmount(getValue(org.totalRevenue, org.totalRevenueUah))}
                      </TableCell>
                      <TableCell className="text-right text-blue-600">
                        {formatAmount(getValue(org.availableBalance, org.availableBalanceUah))}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        {formatAmount(getValue(org.frozenBalance, org.frozenBalanceUah))}
                      </TableCell>
                      <TableCell className="text-right text-purple-600">
                        {formatAmount(getValue(org.paidAmount, org.paidAmountUah))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
