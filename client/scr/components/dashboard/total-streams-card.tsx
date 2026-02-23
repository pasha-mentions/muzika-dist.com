import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Headphones } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TotalStreamsResponse {
  totalStreams: number;
}

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

export default function TotalStreamsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentOrgId = user?.organizations?.[0]?.id;

  const { data, isLoading } = useQuery<TotalStreamsResponse>({
    queryKey: ["/api/organizations", currentOrgId, "total-streams"],
    enabled: !!currentOrgId,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Headphones className="h-5 w-5 text-primary" />
            {t('dashboard.streams.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-8 bg-muted rounded w-24 animate-pulse"></div>
        </CardContent>
      </Card>
    );
  }

  const totalStreams = data?.totalStreams || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Headphones className="h-5 w-5 text-primary" />
          {t('dashboard.streams.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{formatNumber(totalStreams)}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {t('dashboard.streams.allTime')}
        </p>
      </CardContent>
    </Card>
  );
}
