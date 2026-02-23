import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { StreamingReportRow } from "@shared/schema";

interface WorldMapChartProps {
  rows: StreamingReportRow[];
}

// Using EU GISCO data - shows de jure (internationally recognized) borders
// Crimea is correctly displayed as part of Ukraine
const geoUrl = "https://gisco-services.ec.europa.eu/distribution/v2/countries/geojson/CNTR_RG_60M_2024_4326.geojson";

export function WorldMapChart({ rows }: WorldMapChartProps) {
  const { t } = useTranslation();
  const [isTopCountriesOpen, setIsTopCountriesOpen] = useState<boolean>(false);
  
  const countryData = useMemo(() => {
    const countryMap = new Map<string, number>();
    
    rows.forEach(row => {
      const country = row.country?.trim();
      if (country && country !== '-') {
        countryMap.set(country, (countryMap.get(country) || 0) + (row.streams || 0));
      }
    });

    const sortedCountries = Array.from(countryMap.entries())
      .sort((a, b) => b[1] - a[1]);

    const top3Countries = new Set(sortedCountries.slice(0, 3).map(([country]) => country));
    const allCountriesWithData = new Set(countryMap.keys());

    return {
      countryMap,
      top3Countries,
      allCountriesWithData,
      sortedCountries
    };
  }, [rows]);

  const getCountryColor = (countryName: string) => {
    if (countryData.top3Countries.has(countryName)) {
      return "#22C55E"; // Green for TOP 3
    }
    if (countryData.allCountriesWithData.has(countryName)) {
      return "#EAB308"; // Yellow for countries with streams
    }
    return "#EF4444"; // Red for countries with no streams
  };

  const getCountryStreams = (countryName: string): number => {
    return countryData.countryMap.get(countryName) || 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reports.geoAnalytics")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full" style={{ maxWidth: '100%', height: 'auto' }}>
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{
              scale: 147,
              center: [0, 20]
            }}
            style={{
              width: "100%",
              height: "auto"
            }}
          >
            <Geographies geography={geoUrl}>
              {({ geographies }: any) => geographies.map((geo: any) => {
                // EU GISCO uses CNTR_ID for country codes and NAME_ENGL for names
                const countryCode = geo.properties.CNTR_ID || geo.properties.ISO_A2 || geo.properties.iso_a2;
                const countryName = geo.properties.NAME_ENGL || geo.properties.NAME || geo.properties.name;
                const streams = getCountryStreams(countryCode);
                const color = getCountryColor(countryCode);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { 
                        fill: color === "#22C55E" ? "#16A34A" : color === "#EAB308" ? "#CA8A04" : "#DC2626",
                        outline: 'none',
                        cursor: 'pointer'
                      },
                      pressed: { outline: 'none' }
                    }}
                  >
                    <title>
                      {countryName}: {streams > 0 ? `${streams.toLocaleString()} ${t("reports.streams").toLowerCase()}` : t("reports.noDataAvailable")}
                    </title>
                  </Geography>
                );
              })}
            </Geographies>
          </ComposableMap>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-6 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-[#22C55E]" />
            <span className="text-sm text-muted-foreground">{t("reports.top3Countries")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-[#EAB308]" />
            <span className="text-sm text-muted-foreground">{t("reports.countriesWithStreams")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-sm bg-[#EF4444]" />
            <span className="text-sm text-muted-foreground">{t("reports.noStreams")}</span>
          </div>
        </div>

        {/* Top Countries List */}
        {countryData.sortedCountries.length > 0 && (
          <div className="mt-6">
            <Collapsible open={isTopCountriesOpen} onOpenChange={setIsTopCountriesOpen}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">{t("reports.topCountriesByStreams")}</h4>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    {isTopCountriesOpen ? (
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
              </div>
              <CollapsibleContent>
                <div className="grid gap-2">
                  {countryData.sortedCountries.slice(0, 10).map(([country, streams], index) => (
                    <div key={country} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-muted-foreground w-6">
                          #{index + 1}
                        </span>
                        <span className="text-sm font-medium">{country}</span>
                      </div>
                      <span className="text-sm font-semibold text-primary">
                        {streams.toLocaleString()} {t("reports.streams").toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
