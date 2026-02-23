import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Music, FileText, CreditCard, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface OrgStats {
  totalRevenue: number;
  activeReleases: number;
  totalStreams: number;
  pendingReview: number;
  draftReleases: number;
  unpaidReleases: number;
  deletedReleases: number;
}

export default function StatsGrid() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentOrgId = user?.organizations?.[0]?.id;

  const { data: stats, isLoading } = useQuery<OrgStats>({
    queryKey: ["/api/organizations", currentOrgId, "stats"],
    enabled: !!currentOrgId,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-3">
            <div className="animate-pulse flex items-center gap-2">
              <div className="h-6 w-6 bg-muted rounded"></div>
              <div className="flex-1">
                <div className="h-3 bg-muted rounded mb-1 w-16"></div>
                <div className="h-4 bg-muted rounded w-8"></div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const { 
    activeReleases = 0, 
    draftReleases = 0, 
    unpaidReleases = 0, 
    deletedReleases = 0 
  } = stats || {};

  const statItems = [
    { label: t('dashboard.stats.activeReleases'), value: activeReleases, icon: Music, color: 'bg-blue-500', testId: 'stats-active-releases' },
    { label: t('dashboard.stats.draftReleases'), value: draftReleases, icon: FileText, color: 'bg-yellow-500', testId: 'stats-draft-releases' },
    { label: t('dashboard.stats.unpaidReleases'), value: unpaidReleases, icon: CreditCard, color: 'bg-orange-500', testId: 'stats-unpaid-releases' },
    { label: t('dashboard.stats.deletedReleases'), value: deletedReleases, icon: Trash2, color: 'bg-gray-500', testId: 'stats-deleted-releases' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-tour="dashboard-stats">
      {statItems.map((item) => (
        <Card key={item.testId} className="p-3">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 ${item.color} rounded flex items-center justify-center flex-shrink-0`}>
              <item.icon className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{item.label}</p>
              <p className="text-base font-semibold" data-testid={item.testId}>{item.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
