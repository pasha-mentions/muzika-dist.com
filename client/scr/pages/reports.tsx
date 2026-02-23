import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Download, TrendingUp, DollarSign, Play, Music2, Loader2, BarChart3, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { StreamingCharts } from "@/components/reports/streaming-charts";
import { WorldMapChart } from "@/components/reports/world-map-chart";
import { PlatformHits } from "@/components/reports/platform-hits";
import { StreamQualityStats } from "@/components/reports/stream-quality-stats";
import { StreamAuthenticityStats } from "@/components/reports/stream-authenticity-stats";
import { ArtistTrackBreakdown } from "@/components/reports/artist-track-breakdown";
import { MonthYearRangePicker } from "@/components/reports/month-year-range-picker";
import type { StreamingReport, StreamingReportRow } from "@shared/schema";
import { GiftMarker } from "@/components/holiday/GiftMarker";
import { YearWrappedModal } from "@/components/reports/year-wrapped-modal";

interface StreamingReportWithRows extends StreamingReport {
  rows?: StreamingReportRow[];
}

interface DateRange {
  from: string;
  to: string;
}

// Helper function to convert MM/YYYY or MM-YYYY to YYYY-MM for correct sorting
const periodToSortable = (period: string): string => {
  if (!period) return '0000-00';
  
  // Reject if period has leading/trailing whitespace or contains any internal whitespace
  if (period !== period.trim() || period.includes(' ')) {
    return '0000-00';
  }
  
  // Support both formats: MM/YYYY and MM-YYYY
  // Normalize to slash format for processing
  const normalizedPeriod = period.replace('-', '/');
  
  if (!normalizedPeriod.includes('/')) {
    return '0000-00';
  }
  
  const segments = normalizedPeriod.split('/');
  
  // Must have exactly 2 segments (month and year)
  if (segments.length !== 2) return '0000-00';
  
  const [monthStr, yearStr] = segments;
  if (!monthStr || !yearStr) return '0000-00';
  
  // Strict validation: only digits allowed
  if (!/^\d+$/.test(monthStr) || !/^\d+$/.test(yearStr)) {
    return '0000-00';
  }
  
  const month = parseInt(monthStr, 10);
  const year = parseInt(yearStr, 10);
  
  // Validate month (1-12) and year (4 digits)
  if (month < 1 || month > 12 || year < 1000 || year > 9999) {
    return '0000-00';
  }
  
  return `${year}-${month.toString().padStart(2, '0')}`;
};

interface Organization {
  id: string;
  name: string;
  type: string;
}

export default function Reports() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading, user, isPlatformAdmin } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedCountry, setSelectedCountry] = useState<string>("all");
  const [selectedTrack, setSelectedTrack] = useState<string>("all");
  const [isTableOpen, setIsTableOpen] = useState<boolean>(false);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [yearWrappedOpen, setYearWrappedOpen] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState<'EUR' | 'UAH'>('EUR');

  // Fetch organizations for Admin
  const { data: organizations } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: !!isAuthenticated && isPlatformAdmin,
    retry: false,
  });

  // Fetch report metadata (without rows - fast)
  const { data: reports, isLoading: reportsLoading, error } = useQuery<StreamingReportWithRows[]>({
    queryKey: selectedOrgId ? [`/api/streaming-reports?orgId=${selectedOrgId}`] : ["/api/streaming-reports"],
    enabled: !!isAuthenticated && (!isPlatformAdmin || !!selectedOrgId),
    retry: false,
  });

  // Auto-select date range to the latest available month only
  useEffect(() => {
    if (reports && reports.length > 0 && !dateRange) {
      const sortedReports = [...reports].sort((a, b) => 
        periodToSortable(a.period).localeCompare(periodToSortable(b.period))
      );
      const latestPeriod = sortedReports[sortedReports.length - 1].period;
      setDateRange({
        from: latestPeriod,
        to: latestPeriod
      });
    }
  }, [reports, dateRange]);

  // Build list of periods in selected range
  const periodsInRange = useMemo(() => {
    if (!reports || !dateRange) return [];
    const fromSortable = periodToSortable(dateRange.from);
    const toSortable = periodToSortable(dateRange.to);
    const periods = new Set<string>();
    for (const report of reports) {
      const reportSortable = periodToSortable(report.period);
      if (reportSortable >= fromSortable && reportSortable <= toSortable) {
        periods.add(report.period);
      }
    }
    return Array.from(periods);
  }, [reports, dateRange]);

  // Fetch rows by period (on demand, only when date range is selected)
  const periodsKey = periodsInRange.join(',');
  const orgParam = selectedOrgId ? `&orgId=${selectedOrgId}` : '';
  const { data: periodRows, isLoading: rowsLoading } = useQuery<StreamingReportRow[]>({
    queryKey: [`/api/streaming-reports/rows-by-period?periods=${periodsKey}${orgParam}`],
    enabled: !!isAuthenticated && periodsInRange.length > 0 && (!isPlatformAdmin || !!selectedOrgId),
    retry: false,
  });

  // Filter reports by date range
  const filteredReportsInRange = useMemo(() => {
    if (!reports || !dateRange) return [];
    const fromSortable = periodToSortable(dateRange.from);
    const toSortable = periodToSortable(dateRange.to);
    return reports.filter(report => {
      const reportSortable = periodToSortable(report.period);
      return reportSortable >= fromSortable && reportSortable <= toSortable;
    });
  }, [reports, dateRange]);

  // Use rows fetched by period, with eurToUahRate from matching report
  const rows = useMemo(() => {
    if (!periodRows) return [];
    const reportMap = new Map((reports || []).map(r => [r.id, r]));
    return periodRows.map(row => {
      const report = reportMap.get(row.reportId);
      return {
        ...row,
        _eurToUahRate: report?.eurToUahRate ? parseFloat(report.eurToUahRate as string) : null
      };
    });
  }, [periodRows, reports]);

  // Filter rows based on selected filters
  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      if (selectedPlatform !== "all" && row.partner !== selectedPlatform) return false;
      if (selectedCountry !== "all" && row.country !== selectedCountry) return false;
      if (selectedTrack !== "all" && row.trackName !== selectedTrack) return false;
      return true;
    });
  }, [rows, selectedPlatform, selectedCountry, selectedTrack]);

  // Get unique platforms and countries for filters
  const platforms = useMemo(() => {
    const unique = new Set(rows.map(r => r.partner).filter((p): p is string => !!p && p.trim().length > 0));
    return Array.from(unique).sort();
  }, [rows]);

  const countries = useMemo(() => {
    const unique = new Set(rows.map(r => r.country).filter((c): c is string => !!c && c.trim().length > 0));
    return Array.from(unique).sort();
  }, [rows]);

  const tracks = useMemo(() => {
    const unique = new Set(rows.map(r => r.trackName).filter((t): t is string => !!t && t.trim().length > 0));
    return Array.from(unique).sort();
  }, [rows]);

  // Get currency from filtered reports
  const currency = useMemo(() => {
    return filteredReportsInRange[0]?.currency || 'EUR';
  }, [filteredReportsInRange]);

  // Get average EUR/UAH rate from filtered reports (for UAH display)
  const avgEurToUahRate = useMemo(() => {
    const reportsWithRate = filteredReportsInRange.filter(r => r.eurToUahRate);
    if (reportsWithRate.length === 0) return null;
    const sum = reportsWithRate.reduce((acc, r) => acc + parseFloat(r.eurToUahRate as string), 0);
    return sum / reportsWithRate.length;
  }, [filteredReportsInRange]);

  // Check if UAH display is available
  const canShowUah = avgEurToUahRate !== null;

  // Calculate summary stats with accurate UAH conversion per row
  const summary = useMemo(() => {
    const totalStreams = filteredRows.reduce((sum, row) => sum + (row.streams || 0), 0);
    const totalRevenue = filteredRows.reduce((sum, row) => sum + parseFloat(row.netRevenue?.toString() || "0"), 0);
    // Calculate UAH total using each row's actual exchange rate
    const totalRevenueUah = filteredRows.reduce((sum, row) => {
      const revenue = parseFloat(row.netRevenue?.toString() || "0");
      const rate = (row as any)._eurToUahRate;
      return sum + (rate ? revenue * rate : 0);
    }, 0);
    return { totalStreams, totalRevenue, totalRevenueUah };
  }, [filteredRows]);

  // Early returns after all hooks
  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

  if (authLoading || reportsLoading || rowsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleExportCSV = () => {
    if (!filteredRows || filteredRows.length === 0) {
      toast({
        title: t("reports.noData"),
        description: t("reports.noDataDescription"),
        variant: "destructive",
      });
      return;
    }

    const csvHeaders = [t("reports.period"), t("reports.platform"), t("reports.service"), t("reports.artist"), t("reports.track"), t("reports.album"), t("reports.country"), t("reports.streams"), t("reports.revenue")];
    const csvData = filteredRows.map((row: StreamingReportRow) => [
      row.period,
      row.partner,
      row.service,
      row.artist,
      row.trackName,
      row.album || "",
      row.country || "",
      row.streams ?? 0,
      row.netRevenue || "0"
    ]);

    const csvContent = [csvHeaders, ...csvData]
      .map((row: (string | number)[]) => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `streaming-report-${dateRange?.from || 'all'}-${dateRange?.to || 'all'}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    toast({
      title: t("reports.exportComplete"),
      description: t("reports.exportSuccess"),
    });
  };

  // Show empty state only for non-admin users or when admin has selected an org but has no reports
  const shouldShowEmptyState = (!reports || reports.length === 0) && (!isPlatformAdmin || selectedOrgId);
  
  if (shouldShowEmptyState) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground">{t("reports.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("reports.subtitle")}
            </p>
          </div>

          {/* Admin Organization Selector - shown even when no reports */}
          {isPlatformAdmin && (
            <Card className="mb-6 border-2 border-primary/50 bg-primary/5">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {t("newRelease.selectOrganization")}
                  </label>
                  <Select
                    value={selectedOrgId || ""}
                    onValueChange={(value) => {
                      setSelectedOrgId(value);
                      setDateRange(null);
                      setSelectedPlatform("all");
                      setSelectedCountry("all");
                      setSelectedTrack("all");
                    }}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder={t("newRelease.chooseOrganization")} />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations?.map((org) => (
                        <SelectItem key={org.id} value={org.id}>
                          {org.name} ({org.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
          
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">{t("reports.noReportsAvailable")}</h3>
                <p className="text-muted-foreground">
                  {t("reports.noReportsDescription")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="mb-6 relative">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{t("reports.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("reports.subtitle")}
              </p>
            </div>
            {(!isPlatformAdmin || selectedOrgId) && (
              <Button
                onClick={() => setYearWrappedOpen(true)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Магічний звіт 2025
              </Button>
            )}
          </div>
          <GiftMarker placementId="reports-header" className="absolute top-0 right-0" />
        </div>

        <YearWrappedModal 
          open={yearWrappedOpen} 
          onOpenChange={setYearWrappedOpen} 
          orgId={selectedOrgId}
        />

        {/* Admin Organization Selector */}
        {isPlatformAdmin && (
          <Card className="mb-6 border-2 border-primary/50 bg-primary/5">
            <CardContent className="pt-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {t("newRelease.selectOrganization")}
                </label>
                <Select
                  value={selectedOrgId || ""}
                  onValueChange={(value) => {
                    setSelectedOrgId(value);
                    // Reset filters when changing organization
                    setDateRange(null);
                    setSelectedPlatform("all");
                    setSelectedCountry("all");
                    setSelectedTrack("all");
                  }}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t("newRelease.chooseOrganization")} />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name} ({org.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedOrgId && (
                  <p className="text-sm text-muted-foreground">
                    {t("newRelease.selectOrgPrompt")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <>
          {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-muted-foreground truncate">{t("reports.totalRevenue")}</dt>
                        <dd className="text-lg font-medium text-foreground">
                          {displayCurrency === 'UAH' && canShowUah 
                            ? `${summary.totalRevenueUah.toFixed(2)} ₴`
                            : `${summary.totalRevenue.toFixed(2)} ${currency}`
                          }
                        </dd>
                      </dl>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Play className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-muted-foreground truncate">{t("reports.totalStreams")}</dt>
                        <dd className="text-lg font-medium text-foreground">
                          {summary.totalStreams.toLocaleString()}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-muted-foreground truncate">{t("reports.avgPerStream")}</dt>
                        <dd className="text-lg font-medium text-foreground">
                          {summary.totalStreams > 0 
                            ? (displayCurrency === 'UAH' && canShowUah 
                                ? (summary.totalRevenueUah / summary.totalStreams).toFixed(6) 
                                : (summary.totalRevenue / summary.totalStreams).toFixed(6))
                            : "0.000000"}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                        <Music2 className="w-4 h-4 text-white" />
                      </div>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-muted-foreground truncate">{t("reports.tracks")}</dt>
                        <dd className="text-lg font-medium text-foreground">
                          {new Set(filteredRows.map(r => r.trackName)).size}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Report and Filters Selection */}
            <div className="mb-8 grid grid-cols-1 md:grid-cols-5 gap-4">
              <MonthYearRangePicker
                value={dateRange}
                onChange={setDateRange}
                currency={currency}
              />

              <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("reports.allPlatforms")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reports.allPlatforms")}</SelectItem>
                  {platforms.map(platform => (
                    <SelectItem key={platform} value={platform}>
                      {platform}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("reports.allCountries")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reports.allCountries")}</SelectItem>
                  {countries.map(country => (
                    <SelectItem key={country} value={country}>
                      {country}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedTrack} onValueChange={setSelectedTrack}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("reports.allTracks")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("reports.allTracks")}</SelectItem>
                  {tracks.map(track => (
                    <SelectItem key={track} value={track}>
                      {track}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {canShowUah && (
                <Select value={displayCurrency} onValueChange={(v) => setDisplayCurrency(v as 'EUR' | 'UAH')}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="UAH">UAH (₴)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Charts */}
            {filteredRows.length > 0 && <StreamingCharts rows={filteredRows} displayCurrency={displayCurrency} />}

            {/* World Map - Geographical Analytics */}
            {filteredRows.length > 0 && <WorldMapChart rows={filteredRows} />}

            {/* Artist Track Breakdown - horizontal bars */}
            {filteredRows.length > 0 && <ArtistTrackBreakdown rows={filteredRows} displayCurrency={displayCurrency} />}

            {/* Platform Hits */}
            {filteredRows.length > 0 && <PlatformHits rows={filteredRows} />}

            {/* Stream Quality Stats - Premium vs Free */}
            {filteredRows.length > 0 && <StreamQualityStats rows={filteredRows} displayCurrency={displayCurrency} />}

            {/* Stream Authenticity Stats - Artificial vs Regular */}
            {filteredRows.length > 0 && <StreamAuthenticityStats rows={filteredRows} displayCurrency={displayCurrency} />}

            {/* Detailed Reports Table */}
            <Card>
              <Collapsible open={isTableOpen} onOpenChange={setIsTableOpen}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle>Detailed Streaming Breakdown</CardTitle>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      {isTableOpen ? (
                        <>
                          {t("reports.hideTable")}
                          <ChevronUp className="h-4 w-4" />
                        </>
                      ) : (
                        <>
                          {t("reports.showTable")}
                          <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent>
                    {filteredRows.length === 0 ? (
                      <div className="text-center py-12">
                        <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">{t("reports.noData")}</h3>
                        <p className="text-muted-foreground">
                          {t("reports.noDataDescription")}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("reports.platform")}</TableHead>
                              <TableHead>{t("reports.service")}</TableHead>
                              <TableHead>{t("reports.artist")}</TableHead>
                              <TableHead>{t("reports.track")}</TableHead>
                              <TableHead>{t("reports.album")}</TableHead>
                              <TableHead>{t("reports.country")}</TableHead>
                              <TableHead className="text-right">{t("reports.streams")}</TableHead>
                              <TableHead className="text-right">{t("reports.revenue")}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRows.map((row: StreamingReportRow) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-medium">
                                  {row.partner}
                                </TableCell>
                                <TableCell>
                                  {row.service}
                                </TableCell>
                                <TableCell>
                                  {row.artist}
                                </TableCell>
                                <TableCell>
                                  {row.trackName}
                                </TableCell>
                                <TableCell>
                                  {row.album || "-"}
                                </TableCell>
                                <TableCell>
                                  {row.country || "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {(row.streams ?? 0).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-semibold text-green-600">
                                  {displayCurrency === 'UAH' && (row as any)._eurToUahRate 
                                    ? `${(parseFloat(row.netRevenue?.toString() || "0") * (row as any)._eurToUahRate).toFixed(2)} ₴`
                                    : `${parseFloat(row.netRevenue?.toString() || "0").toFixed(2)} €`
                                  }
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>

            {/* Export Button */}
            <div className="mt-6 flex justify-end">
              <Button onClick={handleExportCSV} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                {t("reports.exportCSV")}
              </Button>
            </div>
          </>
      </div>
    </div>
  );
}
