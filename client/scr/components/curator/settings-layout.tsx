import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronLeft, User, Globe, Lock, CreditCard, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface CuratorSettingsLayoutProps {
  children: ReactNode;
}

const settingsTabs = [
  { key: "profile", href: "/curator/settings/profile", icon: User },
  { key: "organization", href: "/curator/settings/organization", icon: Globe },
  { key: "security", href: "/curator/settings/security", icon: Lock },
  { key: "billing", href: "/curator/settings/billing", icon: CreditCard },
  { key: "notifications", href: "/curator/settings/notifications", icon: Bell },
];

export function CuratorSettingsLayout({ children }: CuratorSettingsLayoutProps) {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/curator')} className="mb-4">
          <ChevronLeft className="w-4 h-4 mr-2" />
          {t('common.back')}
        </Button>
        <h1 className="text-2xl font-bold">{t('curatorSettings.title')}</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {settingsTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location === tab.href;
          return (
            <Button
              key={tab.key}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => navigate(tab.href)}
              className={cn(
                "gap-2",
                isActive && "bg-purple-600 hover:bg-purple-700"
              )}
            >
              <Icon className="w-4 h-4" />
              {t(`curatorSettings.tabs.${tab.key}`)}
            </Button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
