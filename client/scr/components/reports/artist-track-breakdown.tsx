import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Music2 } from "lucide-react";
import type { StreamingReportRow } from "@shared/schema";

interface ArtistTrackBreakdownProps {
  rows: StreamingReportRow[];
  displayCurrency?: 'EUR' | 'UAH';
}

const BAR_COLORS = [
  '#f050e0', '#a855f7', '#6366f1', '#3b82f6', '#06b6d4',
  '#10b981', '#84cc16', '#eab308', '#f97316', '#ef4444',
  '#ec4899', '#8b5cf6', '#0ea5e9', '#14b8a6', '#22c55e',
];

export function ArtistTrackBreakdown({ rows, displayCurrency = 'EUR' }: ArtistTrackBreakdownProps) {
  const { t } = useTranslation();

  const trackData = useMemo(() => {
    const trackMap = new Map<string, { streams: number; revenue: number; revenueUah: number; album: string }>();

    rows.forEach(row => {
      const trackName = row.trackName?.trim();
      if (!trackName) return;

      const current = trackMap.get(trackName) || { streams: 0, revenue: 0, revenueUah: 0, album: '' };
      const rowRevenue = Number(row.netRevenue) || 0;
      const rate = (row as any)._eurToUahRate || 0;

      trackMap.set(trackName, {
        streams: current.streams + (Number(row.streams) || 0),
        revenue: current.revenue + rowRevenue,
        revenueUah: current.revenueUah + (rate ? rowRevenue * rate : 0),
        album: current.album || row.album || '',
      });
    });

    return Array.from(trackMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.streams - a.streams);
  }, [rows]);

  const maxStreams = trackData.length > 0 ? trackData[0].streams : 0;
  const totalStreams = trackData.reduce((sum, t) => sum + t.streams, 0);

  if (trackData.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart className="h-5 w-5 text-[#f050e0]" />
          {t("reports.trackBreakdownTitle")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t("reports.trackBreakdownSubtitle", { count: trackData.length, total: totalStreams.toLocaleString() })}
        </p>
      </CardHeader>
      <CardContent>
        <div className={`space-y-3 ${trackData.length > 10 ? 'max-h-[600px] overflow-y-auto pr-2' : ''}`}>
          {trackData.map((track, index) => {
            const percentage = maxStreams > 0 ? (track.streams / maxStreams) * 100 : 0;
            const sharePercent = totalStreams > 0 ? ((track.streams / totalStreams) * 100).toFixed(1) : '0';
            const revenue = displayCurrency === 'UAH' ? track.revenueUah : track.revenue;
            const currencySymbol = displayCurrency === 'UAH' ? '₴' : '€';
            const color = BAR_COLORS[index % BAR_COLORS.length];

            return (
              <div key={track.name} className="group">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">
                      {index + 1}
                    </span>
                    <Music2 className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    <span className="text-sm font-medium truncate">{track.name}</span>
                    {track.album && (
                      <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                        — {track.album}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-2">
                    <span className="text-xs text-muted-foreground">
                      {sharePercent}%
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {track.streams.toLocaleString()}
                    </span>
                    <span className="text-xs text-green-600 font-medium tabular-nums w-20 text-right">
                      {revenue.toFixed(2)} {currencySymbol}
                    </span>
                  </div>
                </div>
                <div className="relative h-6 bg-muted/50 rounded-md overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md transition-all duration-500 ease-out"
                    style={{
                      width: `${Math.max(percentage, 1)}%`,
                      background: `linear-gradient(90deg, ${color}40, ${color}80)`,
                      borderRight: `2px solid ${color}`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}