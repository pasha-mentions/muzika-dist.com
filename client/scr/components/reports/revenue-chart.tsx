import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { ReportRow } from "@shared/schema";

interface RevenueChartProps {
  data: ReportRow[];
}

export default function RevenueChart({ data }: RevenueChartProps) {
  // This would typically use a chart library like Recharts or Chart.js
  // For now, showing a placeholder that matches the design reference
  
  const hasData = data && data.length > 0;

  if (!hasData) {
    return (
      <div className="bg-muted/20 rounded-lg h-64 flex items-center justify-center border-2 border-dashed border-border">
        <div className="text-center">
          <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-medium">Revenue Chart</p>
          <p className="text-sm text-muted-foreground">No data available for chart visualization</p>
        </div>
      </div>
    );
  }

  // Calculate basic metrics from data
  const totalRevenue = data.reduce((sum, row) => sum + (row.revenueCents || 0), 0) / 100;
  const avgRevenue = totalRevenue / data.length;

  // Group data by period for simple visualization
  const periodData = data.reduce<Record<string, number>>((acc, row) => {
    acc[row.period] = (acc[row.period] ?? 0) + (row.revenueCents ?? 0);
    return acc;
  }, {});

  const periods = Object.keys(periodData).sort();
  const maxRevenue = Math.max(...Object.values(periodData));

  return (
    <div className="space-y-4">
      {/* Simple bar chart visualization */}
      <div className="h-64 flex items-end justify-between space-x-2 bg-muted/10 rounded-lg p-4">
        {periods.slice(-12).map((period) => {
          const revenue = periodData[period] / 100;
          const height = maxRevenue > 0 ? (revenue / (maxRevenue / 100)) * 200 : 0;
          
          return (
            <div key={period} className="flex flex-col items-center flex-1">
              <div 
                className="bg-primary rounded-t w-full min-h-[4px] transition-all duration-300 hover:bg-primary/80"
                style={{ height: `${Math.max(4, height)}px` }}
                data-testid={`chart-bar-${period}`}
              />
              <div className="text-xs text-muted-foreground mt-2 transform -rotate-45 origin-center whitespace-nowrap">
                {period}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart Legend */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-primary rounded-full"></div>
            <span className="text-muted-foreground">Revenue</span>
          </div>
        </div>
        <div className="text-muted-foreground">
          Total: ${totalRevenue.toFixed(2)} | Avg: ${avgRevenue.toFixed(2)}
        </div>
      </div>
    </div>
  );
}
