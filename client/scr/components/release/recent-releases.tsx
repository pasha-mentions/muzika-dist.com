import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Music, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import type { Release, Artist } from "@shared/schema";
import { useTranslation } from "react-i18next";
import { GiftMarker } from "@/components/holiday/GiftMarker";

type RecentRelease = Release & { artist: Artist };

export default function RecentReleases() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentOrgId = user?.organizations?.[0]?.id;

  const { data: recentReleases = [], isLoading } = useQuery<RecentRelease[]>({
    queryKey: ["/api/organizations", currentOrgId, "recent-releases"],
    enabled: !!currentOrgId,
    retry: false,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "DELIVERING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "APPROVED":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "IN_REVIEW":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle>{t('dashboard.recentReleases.title')}</CardTitle>
        <GiftMarker placementId="dashboard-releases" className="absolute top-2 right-2" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="w-16 h-16 bg-muted rounded-lg"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                  <div className="h-3 bg-muted rounded w-1/3"></div>
                </div>
                <div className="h-6 w-20 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        ) : !recentReleases || recentReleases.length === 0 ? (
          <div className="text-center py-8">
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">{t('dashboard.recentReleases.noReleases')}</h3>
            <p className="text-muted-foreground mb-4">
              {t('dashboard.recentReleases.noReleasesDesc')}
            </p>
            <Link href="/releases">
              <Button data-testid="button-create-first-release">
                {t('dashboard.recentReleases.createFirstRelease')}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {recentReleases.map((release: RecentRelease) => (
              <div key={release.id} className="flex items-center space-x-4" data-testid={`recent-release-${release.id}`}>
                {/* Album cover placeholder */}
                <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
                  {release.artworkUrl ? (
                    <img 
                      src={release.artworkUrl} 
                      alt={`${release.title} artwork`}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Music className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate" data-testid={`release-title-${release.id}`}>
                    {release.title}
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid={`artist-name-${release.id}`}>
                    {release.artist?.name || 'Unknown Artist'}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid={`release-date-${release.id}`}>
                      {release.releaseDate
                        ? `${t('dashboard.recentReleases.released')} ${new Date(release.releaseDate!).toLocaleDateString()}`
                        : `${t('dashboard.recentReleases.created')} ${new Date(release.createdAt!).toLocaleDateString()}`
                    }
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                    <Badge className={getStatusColor(release.status ?? "DRAFT")} data-testid={`status-${release.id}`}>
                      {(release.status ?? "DRAFT").replace('_', ' ')}
                  </Badge>
                  {release.multilink && (
                    <a
                      href={release.multilink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-background hover:bg-muted transition-colors flex-shrink-0"
                      title={t('dashboard.recentReleases.multilink', 'Multilink')}
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                    </a>
                  )}
                </div>
              </div>
            ))}
            
            <div className="mt-6">
              <Link href="/catalog">
                <Button variant="outline" className="w-full" data-testid="button-view-all-releases">
                  {t('dashboard.recentReleases.viewAll')}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
