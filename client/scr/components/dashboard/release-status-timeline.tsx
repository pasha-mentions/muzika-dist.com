import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { 
  PlusCircle, 
  CreditCard, 
  ClipboardCheck, 
  FileKey, 
  Send, 
  Bookmark, 
  Clock, 
  Play, 
  Link2
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { uk, enUS, pl } from "date-fns/locale";

interface ReleaseStatusTimelineProps {
  release: {
    id: string;
    status: string | null;
    paymentStatus: string | null;
    upc?: string | null | undefined;
    multilink?: string | null | undefined;
    tracks?: Array<{ isrc?: string | null }>;
    createdAt?: string | Date | null;
    paidAt?: string | Date | null;
    codesAssignedAt?: string | Date | null;
  };
}

interface StatusStage {
  id: string;
  icon: React.ReactNode;
  translationKey: string;
  completed: boolean;
  current: boolean;
}

interface StatusEvent {
  id: string;
  releaseId: string;
  fromStatus: string | null;
  toStatus: string;
  transitionedAt: string;
  triggeredBy: string | null;
}

const PRE_SAVE_DOMAIN = "id.ffm.to";
const MULTILINK_DOMAIN = "link.muzika-dist.com";

function isPreSaveLink(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(PRE_SAVE_DOMAIN);
}

function isMultilinkUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(MULTILINK_DOMAIN);
}

function getLocale(lang: string) {
  switch (lang) {
    case 'uk': return uk;
    case 'pl': return pl;
    default: return enUS;
  }
}

function formatDate(date: string | Date | null | undefined, lang: string): string {
  if (!date) return "";
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, "d MMM yyyy, HH:mm", { locale: getLocale(lang) });
  } catch {
    return "";
  }
}

function mapStatusToStageId(status: string): string | null {
  const mapping: Record<string, string> = {
    "DRAFT": "creation",
    "IN_REVIEW": "verification",
    "APPROVED": "verification",
    "DELIVERING": "delivery",
    "DELIVERED": "live",
    "ACTIVE": "live",
    "REJECTED": "verification",
  };
  return mapping[status] || null;
}

function calculateStatusStages(release: ReleaseStatusTimelineProps["release"]): StatusStage[] {
  const { status, paymentStatus, upc, multilink, tracks } = release;
  
  const hasIsrc = tracks?.some(t => t.isrc);
  const hasCodes = !!upc || !!hasIsrc;
  const hasPreSave = isPreSaveLink(multilink);
  const hasMultilink = isMultilinkUrl(multilink);
  
  const isPaid = paymentStatus === "PAID";
  const isInReview = status === "IN_REVIEW" || status === "APPROVED";
  const isDelivering = status === "DELIVERING";
  const isDelivered = status === "DELIVERED";
  const isActive = status === "ACTIVE";
  
  const pastPayment = isPaid || isInReview || isDelivering || isDelivered || isActive;
  const pastVerification = isDelivering || isDelivered || isActive;
  const isLive = isDelivered || isActive;
  
  const rawStages = [
    {
      id: "creation",
      icon: <PlusCircle className="h-3 w-3" />,
      translationKey: "statusTimeline.creation",
      completed: true,
    },
    {
      id: "payment",
      icon: <CreditCard className="h-3 w-3" />,
      translationKey: "statusTimeline.payment",
      completed: pastPayment,
    },
    {
      id: "verification",
      icon: <ClipboardCheck className="h-3 w-3" />,
      translationKey: "statusTimeline.verification",
      completed: pastVerification,
    },
    {
      id: "codes",
      icon: <FileKey className="h-3 w-3" />,
      translationKey: "statusTimeline.codes",
      completed: hasCodes,
    },
    {
      id: "delivery",
      icon: <Send className="h-3 w-3" />,
      translationKey: "statusTimeline.delivery",
      completed: (isDelivering || isLive) && hasCodes,
    },
    {
      id: "presave",
      icon: <Bookmark className="h-3 w-3" />,
      translationKey: "statusTimeline.presave",
      completed: hasPreSave || hasMultilink,
    },
    {
      id: "awaiting",
      icon: <Clock className="h-3 w-3" />,
      translationKey: "statusTimeline.awaiting",
      completed: isLive,
    },
    {
      id: "live",
      icon: <Play className="h-3 w-3" />,
      translationKey: "statusTimeline.live",
      completed: isLive,
    },
    {
      id: "multilink",
      icon: <Link2 className="h-3 w-3" />,
      translationKey: "statusTimeline.multilink",
      completed: hasMultilink,
    },
  ];
  
  const firstIncompleteIndex = rawStages.findIndex(stage => !stage.completed);
  
  const stages: StatusStage[] = rawStages.map((stage, index) => ({
    id: stage.id,
    icon: stage.icon,
    translationKey: stage.translationKey,
    completed: stage.completed,
    current: index === firstIncompleteIndex,
  }));
  
  return stages;
}

function MobileTimeline({ 
  stages, 
  statusHistory, 
  release 
}: { 
  stages: StatusStage[]; 
  statusHistory: StatusEvent[];
  release: ReleaseStatusTimelineProps["release"];
}) {
  const { t, i18n } = useTranslation();
  
  function getDateForStage(stageId: string): string {
    if (stageId === "creation" && release.createdAt) {
      return formatDate(release.createdAt, i18n.language);
    }
    if (stageId === "payment" && release.paidAt) {
      return formatDate(release.paidAt, i18n.language);
    }
    if (stageId === "codes" && release.codesAssignedAt) {
      return formatDate(release.codesAssignedAt, i18n.language);
    }
    
    for (const event of statusHistory) {
      const mappedStage = mapStatusToStageId(event.toStatus);
      if (mappedStage === stageId) {
        return formatDate(event.transitionedAt, i18n.language);
      }
    }
    return "";
  }
  
  return (
    <Accordion type="single" collapsible className="w-full lg:hidden">
      <AccordionItem value="status-timeline" className="border-none">
        <AccordionTrigger className="py-3 px-4 bg-muted/30 rounded-lg hover:no-underline hover:bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {t('dashboard.upcomingReleases.statusTimeline.title', 'Release Progress')}
            </span>
            <span className="text-xs text-muted-foreground">
              ({stages.filter(s => s.completed).length}/{stages.length})
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-3 pb-0">
          <div className="space-y-0">
            {stages.map((stage, index) => {
              const stageDate = getDateForStage(stage.id);
              return (
                <div key={stage.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center transition-colors relative",
                        stage.completed
                          ? "bg-primary text-primary-foreground"
                          : stage.current
                          ? "bg-primary/20 text-primary border-2 border-primary"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {stage.icon}
                      {stage.current && (
                        <span className="absolute inset-0 rounded-full animate-glow-pulse bg-primary/30" />
                      )}
                    </div>
                    {index < stages.length - 1 && (
                      <div className="relative w-0.5 h-6 my-1">
                        <div
                          className={cn(
                            "absolute inset-0",
                            stages[index + 1].completed || stages[index + 1].current
                              ? "bg-primary"
                              : "bg-muted"
                          )}
                        />
                        {stages[index + 1]?.current && (
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary animate-pulse shadow-lg shadow-primary/50" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="pt-1 flex-1">
                    <span
                      className={cn(
                        "text-sm block",
                        stage.completed
                          ? "text-foreground font-medium"
                          : stage.current
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      )}
                    >
                      {t(`dashboard.upcomingReleases.${stage.translationKey}`)}
                    </span>
                    {stageDate && stage.completed && (
                      <span className="text-xs text-muted-foreground">
                        {stageDate}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function DesktopTimeline({ 
  stages,
  statusHistory,
  release
}: { 
  stages: StatusStage[];
  statusHistory: StatusEvent[];
  release: ReleaseStatusTimelineProps["release"];
}) {
  const { t, i18n } = useTranslation();
  const completedCount = stages.filter(s => s.completed).length;
  
  function getDateForStage(stageId: string): string {
    if (stageId === "creation" && release.createdAt) {
      return formatDate(release.createdAt, i18n.language);
    }
    if (stageId === "payment" && release.paidAt) {
      return formatDate(release.paidAt, i18n.language);
    }
    if (stageId === "codes" && release.codesAssignedAt) {
      return formatDate(release.codesAssignedAt, i18n.language);
    }
    
    for (const event of statusHistory) {
      const mappedStage = mapStatusToStageId(event.toStatus);
      if (mappedStage === stageId) {
        return formatDate(event.transitionedAt, i18n.language);
      }
    }
    return "";
  }
  
  return (
    <TooltipProvider delayDuration={100}>
      <div className="hidden lg:block mt-6 pt-4 border-t border-border">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium text-foreground">
            {t('dashboard.upcomingReleases.statusTimeline.title', 'Release Progress')}
          </span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{stages.length})
          </span>
        </div>
        <div className="flex items-center">
          {stages.map((stage, index) => {
            const stageDate = getDateForStage(stage.id);
            const tooltipContent = (
              <div className="text-center">
                <div className="font-medium">
                  {t(`dashboard.upcomingReleases.${stage.translationKey}`)}
                </div>
                {stageDate && stage.completed && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {stageDate}
                  </div>
                )}
              </div>
            );
            
            return (
              <div key={stage.id} className="flex items-center flex-1 last:flex-none">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center transition-all cursor-pointer relative",
                        stage.completed
                          ? "bg-primary text-primary-foreground"
                          : stage.current
                          ? "bg-primary/30 text-primary border-2 border-primary"
                          : "bg-muted/60 text-muted-foreground border border-muted-foreground/20"
                      )}
                    >
                      {stage.icon}
                      {stage.current && (
                        <span className="absolute inset-0 rounded-full animate-glow-pulse bg-primary/30" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    {tooltipContent}
                  </TooltipContent>
                </Tooltip>
                {index < stages.length - 1 && (
                  <div className="relative flex-1 h-0.5 mx-1">
                    <div
                      className={cn(
                        "absolute inset-0 rounded-full",
                        stages[index + 1].completed || stages[index + 1].current
                          ? "bg-primary"
                          : "bg-muted/60"
                      )}
                    />
                    {stages[index + 1]?.current && (
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary shadow-lg animate-bounce-slow"
                        style={{ 
                          left: '70%',
                          boxShadow: '0 0 8px 2px rgba(var(--primary), 0.4)'
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

export default function ReleaseStatusTimeline({ release }: ReleaseStatusTimelineProps) {
  const stages = calculateStatusStages(release);
  
  const { data: statusHistory = [] } = useQuery<StatusEvent[]>({
    queryKey: ['/api/releases', release.id, 'status-history'],
    queryFn: async () => {
      const response = await fetch(`/api/releases/${release.id}/status-history`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    staleTime: 60000,
  });
  
  return (
    <>
      <MobileTimeline stages={stages} statusHistory={statusHistory} release={release} />
      <DesktopTimeline stages={stages} statusHistory={statusHistory} release={release} />
    </>
  );
}
