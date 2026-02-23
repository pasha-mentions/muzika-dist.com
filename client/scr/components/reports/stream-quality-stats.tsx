import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Crown, Users } from "lucide-react";
import type { StreamingReportRow } from "@shared/schema";

interface StreamQualityStatsProps {
  rows: StreamingReportRow[];
  displayCurrency?: 'EUR' | 'UAH';
}

// Known premium and free service types based on actual data
const isPremiumService = (service: string): boolean => {
  if (!service) return false;
  const normalized = service.trim().toLowerCase();
  
  // FIRST: Exclude artificial streams (they should not count as premium OR free)
  if (normalized.includes('artificial')) return false;
  
  // SECOND: Exclude video/views/shorts (free tier)
  if (normalized.includes('video')) return false;
  if (normalized.includes('views')) return false;
  if (normalized.includes('shorts')) return false;
  if (normalized.includes('creations')) return false;
  
  // THIRD: Exclude ad-supported (free tier)
  if (normalized.includes('ad-supported')) return false;
  if (normalized === 'streaming basic') return false;
  
  // FOURTH: Check for premium indicators
  if (normalized.includes('premium streaming')) return true;
  if (normalized.includes('premium')) return true;
  if (normalized.includes('paid')) return true;
  if (normalized.includes('subscription')) return true;
  
  // DEFAULT: Plain "Streaming" and others default to free
  return false;
};

// Check if service is artificial (exclude from premium/free stats)
const isArtificialService = (service: string): boolean => {
  if (!service) return false;
  return service.toLowerCase().includes('artificial');
};

export function StreamQualityStats({ rows, displayCurrency = 'EUR' }: StreamQualityStatsProps) {
  const { t } = useTranslation();
  const currencySymbol = displayCurrency === 'UAH' ? '₴' : '€';
  
  const stats = useMemo(() => {
    let premiumStreams = 0;
    let freeStreams = 0;
    let premiumRevenue = 0;
    let freeRevenue = 0;
    let premiumRevenueUah = 0;
    let freeRevenueUah = 0;
    
    rows.forEach(row => {
      const service = row.service || "";
      const streams = row.streams || 0;
      const revenue = parseFloat(row.netRevenue?.toString() || "0");
      const rate = (row as any)._eurToUahRate || 0;
      
      // Skip artificial streams entirely - they have their own component
      if (isArtificialService(service)) {
        return;
      }
      
      if (isPremiumService(service)) {
        premiumStreams += streams;
        premiumRevenue += revenue;
        premiumRevenueUah += rate ? revenue * rate : 0;
      } else {
        freeStreams += streams;
        freeRevenue += revenue;
        freeRevenueUah += rate ? revenue * rate : 0;
      }
    });
    
    const totalStreams = premiumStreams + freeStreams;
    const premiumPercentage = totalStreams > 0 ? (premiumStreams / totalStreams) * 100 : 0;
    const freePercentage = totalStreams > 0 ? (freeStreams / totalStreams) * 100 : 0;
    
    return {
      premiumStreams,
      freeStreams,
      premiumRevenue: displayCurrency === 'UAH' ? premiumRevenueUah : premiumRevenue,
      freeRevenue: displayCurrency === 'UAH' ? freeRevenueUah : freeRevenue,
      totalStreams,
      premiumPercentage,
      freePercentage,
    };
  }, [rows, displayCurrency]);

  if (stats.totalStreams === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          {t("reports.streamQualityTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Premium Streams */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-600" />
                <span className="font-semibold text-yellow-600">{t("reports.premiumStreams")}</span>
              </div>
              <span className="text-sm font-medium text-yellow-600">
                {stats.premiumPercentage.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-bold">{stats.premiumStreams.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">{t("reports.streams").toLowerCase()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-semibold text-green-600">
                  {currencySymbol}{stats.premiumRevenue.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">{t("reports.profit").toLowerCase()}</span>
              </div>
            </div>
            <div className="mt-2 h-2 bg-yellow-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-yellow-600 rounded-full transition-all"
                style={{ width: `${stats.premiumPercentage}%` }}
              />
            </div>
          </div>

          {/* Free Streams */}
          <div className="p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-blue-600">{t("reports.freeStreams")}</span>
              </div>
              <span className="text-sm font-medium text-blue-600">
                {stats.freePercentage.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-bold">{stats.freeStreams.toLocaleString()}</span>
                <span className="text-sm text-muted-foreground">{t("reports.streams").toLowerCase()}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-lg font-semibold text-green-600">
                  {currencySymbol}{stats.freeRevenue.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">{t("reports.profit").toLowerCase()}</span>
              </div>
            </div>
            <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${stats.freePercentage}%` }}
              />
            </div>
          </div>

          {/* Summary */}
          <div className="pt-4 border-t">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">{t("reports.totalStreamsLabel")}</span>
              <span className="text-lg font-bold">{stats.totalStreams.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-muted-foreground">{t("reports.totalRevenueLabel")}</span>
              <span className="text-lg font-bold text-green-600">
                {currencySymbol}{(stats.premiumRevenue + stats.freeRevenue).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
