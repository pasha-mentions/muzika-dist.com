import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Music4, 
  Plus, 
  BarChart3,
  TrendingUp,
  Target,
  ShieldCheck,
  Wallet,
  Megaphone,
  MonitorPlay,
  Snowflake,
  Gift,
  TreePine,
  Star,
  Sparkles,
  CandyCane,
  ListMusic,
  User as UserIcon,
  Building2,
  Lock,
  CreditCard,
  Bell,
  LogOut,
  FileText,
  DollarSign
} from "lucide-react";

const HOLIDAY_MODE = false;

const HolidayLayoutDashboard = HOLIDAY_MODE ? Snowflake : LayoutDashboard;
const HolidayMusic4 = HOLIDAY_MODE ? Gift : Music4;
const HolidayPlus = HOLIDAY_MODE ? TreePine : Plus;
const HolidayMegaphone = HOLIDAY_MODE ? Star : Megaphone;
const HolidayBarChart3 = HOLIDAY_MODE ? Sparkles : BarChart3;
const HolidayShieldCheck = HOLIDAY_MODE ? CandyCane : ShieldCheck;
const HolidayTarget = HOLIDAY_MODE ? Star : Target;
const HolidayMonitorPlay = HOLIDAY_MODE ? TreePine : MonitorPlay;
const HolidayTrendingUp = HOLIDAY_MODE ? Sparkles : TrendingUp;
const HolidayWallet = HOLIDAY_MODE ? Gift : Wallet;
const HolidayListMusic = HOLIDAY_MODE ? Gift : ListMusic;
import { useAuth } from "@/hooks/useAuth";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { User } from "@shared/schema";

const navigation = [
  { nameKey: "nav.dashboard", href: "/", icon: HolidayLayoutDashboard, tourId: "nav-dashboard" },
  { nameKey: "nav.catalog", href: "/catalog", icon: HolidayMusic4, tourId: "nav-catalog" },
  { nameKey: "nav.newRelease", href: "/releases", icon: HolidayPlus, highlighted: true, tourId: "nav-newRelease" },
  { nameKey: "nav.promotion", href: "/promo", icon: HolidayMegaphone, tourId: "nav-promotion", hasSubmenu: true, submenuType: "promotion" },
  { nameKey: "nav.reports", href: "/reports", icon: HolidayBarChart3, tourId: "nav-reports", hasSubmenu: true, submenuType: "reports" },
];

import { Inbox } from "lucide-react";
const HolidayInbox = HOLIDAY_MODE ? Gift : Inbox;

const curatorNavigation = [
  { nameKey: "nav.dashboard", href: "/curator", icon: LayoutDashboard, tourId: "nav-curator-dashboard" },
  { nameKey: "nav.curatorApplications", href: "/curator/applications", icon: Inbox, tourId: "nav-curator-applications" },
  { nameKey: "nav.curatorPlaylists", href: "/curator/playlists", icon: ListMusic, tourId: "nav-curator-playlists", highlighted: true },
  { nameKey: "nav.curatorReports", href: "/curator/reports", icon: BarChart3, tourId: "nav-curator-reports", hasSubmenu: true, submenuType: "curatorReports" },
  { nameKey: "nav.curatorProfile", href: "/curator/settings", icon: UserIcon, tourId: "nav-curator-profile", hasSubmenu: true, submenuType: "curatorProfile" },
];

export default function BottomNavigation() {
  const [location, navigate] = useLocation();
  const { user, isPlatformAdmin, isCurator } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const typedUser = user as User | undefined;
  const [reportsDrawerOpen, setReportsDrawerOpen] = useState(false);
  const [promotionDrawerOpen, setPromotionDrawerOpen] = useState(false);
  const [curatorProfileDrawerOpen, setCuratorProfileDrawerOpen] = useState(false);
  const [curatorReportsDrawerOpen, setCuratorReportsDrawerOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/logout');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate('/');
    },
  });

  const baseNavigation = isCurator ? curatorNavigation : navigation;
  const allNavigation = isPlatformAdmin 
    ? [...baseNavigation, { nameKey: "nav.admin", href: "/admin", icon: HolidayShieldCheck, highlighted: false, tourId: "nav-admin" }]
    : baseNavigation;

  // Fetch pending applications count for curators
  const { data: pendingCountData } = useQuery({
    queryKey: ["/api/pitching-applications/pending-count"],
    queryFn: async () => {
      const res = await fetch("/api/pitching-applications/pending-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: isCurator,
    refetchInterval: 30000,
  });
  const pendingApplicationsCount = pendingCountData?.count || 0;

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]">
        <nav className="flex items-center justify-around h-18 px-1 pb-1">
          {allNavigation.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && item.href !== '/curator' && location.startsWith(item.href + '/'));
            const isReportsActive = location === '/reports' || location === '/analytics' || location === '/finance';
            const isPromotionActive = location === '/promo' || location === '/pitching' || location === '/ads' || location.startsWith('/ads/');
            const isHighlighted = item.highlighted;
            
            if (item.hasSubmenu && item.submenuType === 'promotion') {
              return (
                <button
                  key={item.nameKey}
                  onClick={() => setPromotionDrawerOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all",
                    isHighlighted && "relative"
                  )}
                  aria-label={t(item.nameKey)}
                  data-tour={item.tourId}
                >
                  <item.icon
                    className={cn(
                      "flex-shrink-0 h-5 w-5 transition-colors",
                      isPromotionActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className={cn(
                    "text-[10px] font-medium transition-colors truncate max-w-full px-0.5",
                    isPromotionActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {t(item.nameKey)}
                  </span>
                </button>
              );
            }
            
            if (item.hasSubmenu && item.submenuType === 'reports') {
              return (
                <button
                  key={item.nameKey}
                  onClick={() => setReportsDrawerOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all",
                    isHighlighted && "relative"
                  )}
                  aria-label={t(item.nameKey)}
                  data-tour={item.tourId}
                >
                  <item.icon
                    className={cn(
                      "flex-shrink-0 h-5 w-5 transition-colors",
                      isReportsActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className={cn(
                    "text-[10px] font-medium transition-colors truncate max-w-full px-0.5",
                    isReportsActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {t(item.nameKey)}
                  </span>
                </button>
              );
            }
            
            if (item.hasSubmenu && item.submenuType === 'curatorReports') {
              const isCuratorReportsActive = location === '/curator/reports' || location === '/curator/playlists-reports' || location === '/curator/finance';
              return (
                <button
                  key={item.nameKey}
                  onClick={() => setCuratorReportsDrawerOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all",
                    isHighlighted && "relative"
                  )}
                  aria-label={t(item.nameKey)}
                  data-tour={item.tourId}
                >
                  <item.icon
                    className={cn(
                      "flex-shrink-0 h-5 w-5 transition-colors",
                      isCuratorReportsActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className={cn(
                    "text-[10px] font-medium transition-colors truncate max-w-full px-0.5",
                    isCuratorReportsActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {t(item.nameKey)}
                  </span>
                </button>
              );
            }
            
            if (item.hasSubmenu && item.submenuType === 'curatorProfile') {
              const isCuratorProfileActive = location.startsWith('/curator/settings');
              return (
                <button
                  key={item.nameKey}
                  onClick={() => setCuratorProfileDrawerOpen(true)}
                  className={cn(
                    "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all",
                    isHighlighted && "relative"
                  )}
                  aria-label={t(item.nameKey)}
                  data-tour={item.tourId}
                >
                  <item.icon
                    className={cn(
                      "flex-shrink-0 h-5 w-5 transition-colors",
                      isCuratorProfileActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className={cn(
                    "text-[10px] font-medium transition-colors truncate max-w-full px-0.5",
                    isCuratorProfileActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {t(item.nameKey)}
                  </span>
                </button>
              );
            }
            
            const showBadge = item.href === '/curator/applications' && pendingApplicationsCount > 0;
            
            return (
              <Link 
                key={item.nameKey} 
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-all",
                  isHighlighted && "relative"
                )}
                aria-label={t(item.nameKey)}
                data-tour={item.tourId}
              >
                {isHighlighted ? (
                  <div className="flex flex-col items-center justify-center gap-1 h-full -translate-y-3">
                    <div className={cn(
                      "rounded-full p-3 shadow-lg transition-all flex items-center justify-center relative",
                      isActive 
                        ? "bg-primary/90 text-primary-foreground scale-105" 
                        : "bg-primary text-primary-foreground"
                    )}>
                      <item.icon className="h-6 w-6" />
                      {showBadge && (
                        <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                          {pendingApplicationsCount > 99 ? '99+' : pendingApplicationsCount}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] font-medium transition-colors whitespace-nowrap",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}>
                      {t(item.nameKey)}
                    </span>
                  </div>
                ) : (
                  <div className="relative flex flex-col items-center">
                    <item.icon
                      className={cn(
                        "flex-shrink-0 h-5 w-5 transition-colors",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )}
                    />
                    {showBadge && (
                      <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium text-white">
                        {pendingApplicationsCount > 99 ? '99+' : pendingApplicationsCount}
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] font-medium transition-colors truncate max-w-full px-0.5",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}>
                      {t(item.nameKey)}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      
      <Drawer open={promotionDrawerOpen} onOpenChange={setPromotionDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('nav.promotion')}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2">
            <button
              onClick={() => {
                navigate('/promo');
                setPromotionDrawerOpen(false);
              }}
              className={cn(
                location === '/promo' || location === '/pitching'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <HolidayTarget className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.pitching')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/ads');
                setPromotionDrawerOpen(false);
              }}
              className={cn(
                location === '/ads' || location.startsWith('/ads/')
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <HolidayMonitorPlay className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.ads')}</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>
      
      <Drawer open={reportsDrawerOpen} onOpenChange={setReportsDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('nav.reports')}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2">
            <button
              onClick={() => {
                navigate('/reports');
                setReportsDrawerOpen(false);
              }}
              className={cn(
                location === '/reports'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <HolidayBarChart3 className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.streamingReports')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/analytics');
                setReportsDrawerOpen(false);
              }}
              className={cn(
                location === '/analytics'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <HolidayTrendingUp className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.analytics')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/finance');
                setReportsDrawerOpen(false);
              }}
              className={cn(
                location === '/finance'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <HolidayWallet className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.finance')}</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={curatorReportsDrawerOpen} onOpenChange={setCuratorReportsDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('nav.curatorReports')}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2">
            <button
              onClick={() => {
                navigate('/curator/reports');
                setCuratorReportsDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/reports'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <FileText className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.curatorApplicationsReports')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/curator/playlists-reports');
                setCuratorReportsDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/playlists-reports'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <ListMusic className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.curatorPlaylistsReports')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/curator/finance');
                setCuratorReportsDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/finance'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <DollarSign className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('nav.curatorFinance')}</span>
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={curatorProfileDrawerOpen} onOpenChange={setCuratorProfileDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('curatorSettings.title')}</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-2">
            <button
              onClick={() => {
                navigate('/curator/settings/profile');
                setCuratorProfileDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/settings/profile'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <UserIcon className="mr-3 h-5 w-5 text-primary" />
              <span className="font-medium">{t('curatorSettings.tabs.profile')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/curator/settings/organization');
                setCuratorProfileDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/settings/organization'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <Building2 className="mr-3 h-5 w-5 text-primary" />
              <span className="font-medium">{t('curatorSettings.tabs.organization')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/curator/settings/security');
                setCuratorProfileDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/settings/security'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <Lock className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('curatorSettings.tabs.security')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/curator/settings/billing');
                setCuratorProfileDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/settings/billing'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <CreditCard className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('curatorSettings.tabs.billing')}</span>
            </button>
            <button
              onClick={() => {
                navigate('/curator/settings/notifications');
                setCuratorProfileDrawerOpen(false);
              }}
              className={cn(
                location === '/curator/settings/notifications'
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted/80",
                "flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors"
              )}
            >
              <Bell className="mr-3 h-5 w-5" />
              <span className="font-medium">{t('curatorSettings.tabs.notifications')}</span>
            </button>
            
            <div className="border-t border-border my-2 pt-2">
              <button
                onClick={() => {
                  logoutMutation.mutate();
                  setCuratorProfileDrawerOpen(false);
                }}
                disabled={logoutMutation.isPending}
                className="flex items-center w-full px-4 py-3 text-left rounded-lg transition-colors hover:bg-muted/80 text-destructive"
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span className="font-medium">{logoutMutation.isPending ? t('settings.loggingOut', 'Logging out...') : t('auth.logout')}</span>
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
