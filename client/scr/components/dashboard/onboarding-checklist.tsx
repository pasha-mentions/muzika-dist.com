import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Circle, FileText, Link as LinkIcon, Music, Send, Wallet } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

interface OnboardingStatus {
  agreementAccepted: boolean;
  socialLinksAdded: boolean;
  firstReleaseShipped: boolean;
  pitchingSubmitted: boolean;
  firstWithdrawal: boolean;
}

export default function OnboardingChecklist() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentOrgId = user?.organizations?.[0]?.id;

  const { data: status, isLoading } = useQuery<OnboardingStatus>({
    queryKey: ["/api/organizations", currentOrgId, "onboarding-status"],
    enabled: !!currentOrgId,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.onboarding.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-muted rounded-lg"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const completedCount = [
    status.agreementAccepted,
    status.socialLinksAdded,
    status.firstReleaseShipped,
    status.pitchingSubmitted,
    status.firstWithdrawal,
  ].filter(Boolean).length;

  const allCompleted = completedCount === 5;

  if (allCompleted) {
    return null;
  }

  const allSteps = [
    {
      id: 'agreement',
      completed: status.agreementAccepted,
      icon: FileText,
      label: t('dashboard.onboarding.steps.agreement'),
      href: '/settings',
    },
    {
      id: 'socialLinks',
      completed: status.socialLinksAdded,
      icon: LinkIcon,
      label: t('dashboard.onboarding.steps.socialLinks'),
      href: '/settings',
    },
    {
      id: 'firstRelease',
      completed: status.firstReleaseShipped,
      icon: Music,
      label: t('dashboard.onboarding.steps.firstRelease'),
      href: '/releases',
    },
    {
      id: 'pitching',
      completed: status.pitchingSubmitted,
      icon: Send,
      label: t('dashboard.onboarding.steps.pitching'),
      href: '/pitching',
    },
    {
      id: 'withdrawal',
      completed: status.firstWithdrawal,
      icon: Wallet,
      label: t('dashboard.onboarding.steps.withdrawal'),
      href: '/finance',
    },
  ];

  const steps = allSteps.filter(step => !step.completed);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('dashboard.onboarding.title')}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/5 {t('dashboard.onboarding.completed')}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Link key={step.id} href={step.href}>
                <div className="flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer bg-muted/50 hover:bg-muted">
                  <Circle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {step.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
