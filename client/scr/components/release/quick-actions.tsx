import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, Target } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

interface OrgStats {
  totalRevenue: number;
  activeReleases: number;
  totalStreams: number;
  pendingReview: number;
  monthlyReleases: number;
  hasDeliveredReleases: boolean;
}

export default function QuickActions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentOrg = user?.organizations?.[0];
  const currentOrgId = currentOrg?.id;

  const { data: stats } = useQuery<OrgStats>({
    queryKey: ["/api/organizations", currentOrgId, "stats"],
    enabled: !!currentOrgId,
    retry: false,
  });
  
  // Account status data
  const agreementAccepted = (user as any)?.agreementAccepted || false;
  const monthlyReleases = stats?.monthlyReleases || 0;
  const releaseLimit = 1;
  
  // Check if all streaming links are connected
  const allLinksConnected = currentOrg && 
    currentOrg.spotifyUrl && 
    currentOrg.appleMusicUrl && 
    currentOrg.youtubeUrl && 
    currentOrg.tiktokUrl && 
    currentOrg.instagramUrl;
  
  const progressPercentage = Math.min((monthlyReleases / releaseLimit) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.quickActions.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href="/releases">
            <Button className="w-full" data-testid="button-new-release">
              <Plus className="w-4 h-4 mr-2" />
              {t('dashboard.quickActions.newRelease')}
            </Button>
          </Link>
          
          <Link href="/reports">
            <Button variant="outline" className="w-full" data-testid="button-request-reports">
              <BarChart3 className="w-4 h-4 mr-2" />
              {t('dashboard.quickActions.requestReport')}
            </Button>
          </Link>
          
          <Link href="/pitching">
            <Button variant="outline" className="w-full" data-testid="button-pitch-release">
              <Target className="w-4 h-4 mr-2" />
              {t('dashboard.quickActions.pitchRelease')}
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Account Status */}
      <Card data-tour="account-status">
        <CardHeader>
          <CardTitle>{t('dashboard.accountStatus.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('dashboard.accountStatus.distributionAgreement')}</span>
            <Badge 
              className={agreementAccepted 
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
              }
              data-testid="badge-agreement-status"
            >
              {agreementAccepted ? t('dashboard.accountStatus.agreed') : t('dashboard.accountStatus.notAgreed')}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('dashboard.accountStatus.streamingLinks')}</span>
            <Badge 
              className={allLinksConnected
                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
              }
              data-testid="badge-streaming-status"
            >
              {allLinksConnected ? t('dashboard.accountStatus.connected') : t('dashboard.accountStatus.notConnected')}
            </Badge>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('dashboard.accountStatus.monthlyReleases')}</span>
            <span className="text-sm text-foreground" data-testid="text-monthly-releases">
              {monthlyReleases} / {releaseLimit}
            </span>
          </div>
          
          <div className="space-y-2">
            <Progress 
              value={progressPercentage} 
              className={`w-full ${monthlyReleases >= releaseLimit ? 'bg-green-100 [&>div]:bg-green-500' : ''}`}
              data-testid="progress-releases" 
            />
            <p className="text-xs text-muted-foreground">
              {releaseLimit - monthlyReleases > 0 
                ? `${releaseLimit - monthlyReleases} ${t('dashboard.accountStatus.releasesRemaining')}`
                : t('dashboard.accountStatus.limitReached')
              }
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
