import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { StreamingReportRow } from "@shared/schema";

interface StreamAuthenticityStatsProps {
  rows: StreamingReportRow[];
  displayCurrency?: 'EUR' | 'UAH';
}

// Detect artificial/suspicious streaming activity
const isArtificialService = (service: string): boolean => {
  if (!service) return false;
  const normalized = service.trim().toLowerCase();
  return normalized.includes('artificial');
};

export function StreamAuthenticityStats({ rows, displayCurrency = 'EUR' }: StreamAuthenticityStatsProps) {
  const { t } = useTranslation();
  const currencySymbol = displayCurrency === 'UAH' ? '₴' : '€';
  
  const stats = useMemo(() => {
    let regularStreams = 0;
    let artificialStreams = 0;
    let regularRevenue = 0;
    let artificialRevenue = 0;
    let regularRevenueUah = 0;
    let artificialRevenueUah = 0;
    
    rows.forEach(row => {
      const service = row.service || "";
      const streams = row.streams || 0;
      const revenue = parseFloat(row.netRevenue?.toString() || "0");
      const rate = (row as any)._eurToUahRate || 0;
      
      if (isArtificialService(service)) {
        artificialStreams += streams;
        artificialRevenue += revenue;
        artificialRevenueUah += rate ? revenue * rate : 0;
      } else {
        regularStreams += streams;
        regularRevenue += revenue;
        regularRevenueUah += rate ? revenue * rate : 0;
      }
    });
    
    const totalStreams = regularStreams + artificialStreams;
    const regularPercentage = totalStreams > 0 ? (regularStreams / totalStreams) * 100 : 0;
    const artificialPercentage = totalStreams > 0 ? (artificialStreams / totalStreams) * 100 : 0;
    
    return {
      regularStreams,
      artificialStreams,
      regularRevenue: displayCurrency === 'UAH' ? regularRevenueUah : regularRevenue,
      artificialRevenue: displayCurrency === 'UAH' ? artificialRevenueUah : artificialRevenue,
      totalStreams,
      regularPercentage,
      artificialPercentage,
    };
  }, [rows, displayCurrency]);

  if (stats.totalStreams === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          {t("reports.authenticityTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Regular/Valid Streams */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-green-500/10 to-green-600/10 border border-green-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-600">{t("reports.regularStreams")}</span>
              </div>
              <span className="text-sm font-medium text-green-600">
                {stats.regularPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-bold">{stats.regularStreams.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">{t("reports.streams").toLowerCase()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-semibold text-green-600">
                  {currencySymbol}{stats.regularRevenue.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">{t("reports.profit").toLowerCase()}</span>
              </div>
            </div>
            <div className="mt-2 h-2 bg-green-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-600 rounded-full transition-all"
                style={{ width: `${stats.regularPercentage}%` }}
              />
            </div>
          </div>

          {/* Artificial/Suspicious Streams */}
          {stats.artificialStreams > 0 && (
            <div className="p-4 rounded-lg bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                  <span className="font-semibold text-red-600">{t("reports.artificialStreams")}</span>
                </div>
                <span className="text-sm font-medium text-red-600">
                  {stats.artificialPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-2xl font-bold">{stats.artificialStreams.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground">{t("reports.streams").toLowerCase()}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-lg font-semibold text-red-600">
                    {currencySymbol}{stats.artificialRevenue.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("reports.profit").toLowerCase()}</span>
                </div>
              </div>
              <div className="mt-2 h-2 bg-red-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-600 rounded-full transition-all"
                  style={{ width: `${stats.artificialPercentage}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("reports.artificialWarning")}
              </p>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
}
