import { useMemo, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar, Sector } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { StreamingReportRow } from "@shared/schema";

interface StreamingChartsProps {
  rows: StreamingReportRow[];
  displayCurrency?: 'EUR' | 'UAH';
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#8DD1E1', '#D084D0', '#FF6B9D'];
const GRAY_COLOR = '#6b7280';

export function StreamingCharts({ rows, displayCurrency = 'EUR' }: StreamingChartsProps) {
  const { t } = useTranslation();
  const [pieMetric, setPieMetric] = useState<'streams' | 'revenue'>('streams');
  const [hoveredLegendIndex, setHoveredLegendIndex] = useState<number | null>(null);
  const [animatedOpacities, setAnimatedOpacities] = useState<number[]>([]);
  const animationRef = useRef<number | null>(null);
  
  const currencySymbol = displayCurrency === 'UAH' ? '₴' : '€';

  // Platform distribution data
  const platformData = useMemo(() => {
    const platformMap = new Map<string, { streams: number; revenue: number; revenueUah: number }>();
    
    rows.forEach(row => {
      const platform = row.partner || 'Unknown';
      const current = platformMap.get(platform) || { streams: 0, revenue: 0, revenueUah: 0 };
      const rowRevenue = Number(row.netRevenue) || 0;
      const rate = (row as any)._eurToUahRate || 0;
      platformMap.set(platform, {
        streams: current.streams + (Number(row.streams) || 0),
        revenue: current.revenue + rowRevenue,
        revenueUah: current.revenueUah + (rate ? rowRevenue * rate : 0)
      });
    });

    const totalStreams = Array.from(platformMap.values()).reduce((sum, val) => sum + val.streams, 0);
    const totalRevenue = Array.from(platformMap.values()).reduce((sum, val) => sum + val.revenue, 0);
    const totalRevenueUah = Array.from(platformMap.values()).reduce((sum, val) => sum + val.revenueUah, 0);

    return Array.from(platformMap.entries())
      .map(([name, data]) => {
        const displayRevenue = displayCurrency === 'UAH' ? data.revenueUah : data.revenue;
        const displayTotal = displayCurrency === 'UAH' ? totalRevenueUah : totalRevenue;
        const value = pieMetric === 'streams' ? data.streams : displayRevenue;
        const total = pieMetric === 'streams' ? totalStreams : displayTotal;
        return {
          name,
          value,
          streams: data.streams,
          revenue: displayRevenue,
          percentage: total > 0 ? ((value / total) * 100).toFixed(1) : 0
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [rows, pieMetric, displayCurrency]);

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const targetOpacities = platformData.map((_, index) => {
      if (hoveredLegendIndex === null) return 1;
      return hoveredLegendIndex === index ? 1 : 0;
    });
    
    const startOpacities = animatedOpacities.length === targetOpacities.length 
      ? [...animatedOpacities] 
      : targetOpacities.map(() => 1);
    
    const duration = 800;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      
      const newOpacities = startOpacities.map((start, i) => {
        const target = targetOpacities[i];
        return start + (target - start) * easeProgress;
      });
      
      setAnimatedOpacities(newOpacities);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [hoveredLegendIndex, platformData.length]);

  // Timeline data - group by period
  const timelineData = useMemo(() => {
    const periodMap = new Map<string, number>();
    
    rows.forEach(row => {
      const period = row.period || '';
      if (period) {
        periodMap.set(period, (periodMap.get(period) || 0) + (row.streams || 0));
      }
    });

    return Array.from(periodMap.entries())
      .map(([period, streams]) => {
        // Parse period format "MM/YYYY" or "MM.YYYY" to Date for proper sorting
        const parts = period.split(/[\/\.]/).filter(p => p.length > 0);
        let sortDate: Date | null = null;
        
        if (parts.length === 2) {
          const month = parseInt(parts[0]) - 1; // 0-indexed
          const year = parseInt(parts[1]);
          if (!isNaN(month) && !isNaN(year) && month >= 0 && month < 12) {
            sortDate = new Date(year, month, 1);
          }
        } else if (parts.length === 1 && parts[0].length === 4) {
          // Year only format
          const year = parseInt(parts[0]);
          if (!isNaN(year)) {
            sortDate = new Date(year, 0, 1);
          }
        }
        
        return {
          period,
          streams,
          sortDate: sortDate || new Date(0), // Use epoch start for invalid dates
          date: period,
          isValid: sortDate !== null
        };
      })
      // Show ALL periods, even with invalid date formats - sort by date if valid, otherwise by period string
      .sort((a, b) => {
        // If both have valid dates, sort by date
        if (a.isValid && b.isValid) {
          return a.sortDate.getTime() - b.sortDate.getTime();
        }
        // If only one has valid date, put valid dates first
        if (a.isValid) return -1;
        if (b.isValid) return 1;
        // If neither has valid date, sort alphabetically by period string
        return a.period.localeCompare(b.period);
      });
  }, [rows]);

  const CustomTooltipPie = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{payload[0].name}</p>
          {pieMetric === 'streams' ? (
            <p className="text-sm text-muted-foreground">
              {t("reports.plays")}: {data.streams.toLocaleString()}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("reports.profit")}: {currencySymbol}{data.revenue.toFixed(2)}
            </p>
          )}
          <p className="text-sm text-primary font-medium">
            {data.percentage}%
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomTooltipLine = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{payload[0].payload.period}</p>
          <p className="text-sm text-primary font-medium">
            {t("reports.streams")}: {payload[0].value.toLocaleString()}
          </p>
        </div>
      );
    }
    return null;
  };

  const CustomTooltipBar = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border rounded-lg p-3 shadow-lg">
          <p className="font-semibold">{payload[0].payload.name}</p>
          <p className="text-sm text-primary font-medium">
            {currencySymbol}{payload[0].value.toFixed(3)} / 1000 {t("reports.streams").toLowerCase()}
          </p>
        </div>
      );
    }
    return null;
  };

  // CPM data - per 1000 streams by platform (supports EUR/UAH)
  const cpmData = useMemo(() => {
    const platformMap = new Map<string, { streams: number; revenue: number; revenueUah: number }>();
    
    rows.forEach(row => {
      const platform = row.partner || 'Unknown';
      const current = platformMap.get(platform) || { streams: 0, revenue: 0, revenueUah: 0 };
      const rowRevenue = Number(row.netRevenue) || 0;
      const rate = (row as any)._eurToUahRate || 0;
      platformMap.set(platform, {
        streams: current.streams + (Number(row.streams) || 0),
        revenue: current.revenue + rowRevenue,
        revenueUah: current.revenueUah + (rate ? rowRevenue * rate : 0)
      });
    });

    return Array.from(platformMap.entries())
      .filter(([name]) => {
        const lowerName = name.toLowerCase();
        return !lowerName.includes('itunes');
      })
      .map(([name, data]) => {
        const displayRevenue = displayCurrency === 'UAH' ? data.revenueUah : data.revenue;
        const cpm = data.streams > 0 ? (displayRevenue / data.streams) * 1000 : 0;
        return {
          name,
          cpm,
          streams: data.streams,
          revenue: displayRevenue
        };
      })
      .filter(item => item.cpm > 0) // Only show platforms with revenue
      .sort((a, b) => b.cpm - a.cpm); // Sort by CPM descending
  }, [rows, displayCurrency]);

  const totalStreams = rows.reduce((sum, row) => sum + (row.streams || 0), 0);

  return (
    <div className="space-y-6 mb-6">
      {/* First Row: Pie Chart + Bar Chart */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pie Chart - Platform Distribution */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle>{t("reports.streamingByServices")}</CardTitle>
            <Select value={pieMetric} onValueChange={(value: 'streams' | 'revenue') => setPieMetric(value)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="streams">{t("reports.streaming")}</SelectItem>
                <SelectItem value="revenue">{t("reports.profit")}</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={platformData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ percentage }) => parseFloat(percentage) >= 5 ? `${percentage}%` : ''}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {platformData.map((entry, index) => {
                    const opacity = animatedOpacities[index] ?? 1;
                    const originalColor = COLORS[index % COLORS.length];
                    const blendedColor = opacity === 1 
                      ? originalColor 
                      : opacity === 0 
                        ? GRAY_COLOR 
                        : originalColor;
                    return (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={opacity < 0.5 ? GRAY_COLOR : originalColor}
                        fillOpacity={opacity < 0.5 ? 1 - opacity : opacity}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<CustomTooltipPie />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {platformData.slice(0, 6).map((platform, index) => (
                <div 
                  key={platform.name} 
                  className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-1 py-0.5 transition-colors hover:bg-muted/50"
                  onMouseEnter={() => setHoveredLegendIndex(index)}
                  onMouseLeave={() => setHoveredLegendIndex(null)}
                >
                  <div 
                    className="w-3 h-3 rounded-sm flex-shrink-0" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="truncate">{platform.name}</span>
                  {hoveredLegendIndex === index && (
                    <span className="text-muted-foreground font-medium ml-auto">
                      {platform.percentage}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart - CPM per 1000 streams */}
        <Card>
          <CardHeader>
            <CardTitle>{currencySymbol} {t("reports.per1000streams")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cpmData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  type="category"
                  dataKey="name" 
                  className="text-xs"
                  tick={{ fill: 'currentColor' }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  type="number"
                  className="text-xs"
                  tick={{ fill: 'currentColor' }}
                  label={{ value: `${currencySymbol} / 1000`, angle: -90, position: 'insideLeft' }}
                />
                <Tooltip content={<CustomTooltipBar />} />
                <Bar 
                  dataKey="cpm" 
                  fill="#00C49F"
                  radius={[8, 8, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Second Row: Line Chart - Full Width */}
      <Card>
        <CardHeader>
          <CardTitle>{t("reports.streamingTimeline", { total: totalStreams.toLocaleString() })}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="period" 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                label={{ value: t("reports.quantity"), angle: -90, position: 'insideLeft' }}
              />
              <Tooltip content={<CustomTooltipLine />} />
              <Line 
                type="monotone" 
                dataKey="streams" 
                stroke="#0088FE" 
                strokeWidth={2}
                dot={{ fill: '#0088FE', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
