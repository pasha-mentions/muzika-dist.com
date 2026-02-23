import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { 
  LayoutDashboard, 
  Music4, 
  Plus, 
  BarChart3,
  TrendingUp,
  Target,
  Settings,
  LogOut,
  ShieldCheck,
  Wallet,
  ChevronRight,
  ChevronDown,
  Megaphone,
  MonitorPlay,
  Snowflake,
  Gift,
  TreePine,
  Star,
  Sparkles,
  CandyCane,
  Video,
  GraduationCap,
  MoreHorizontal,
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
import muzikaLogo from "@assets/Logo_new.png";
import type { User } from "@shared/schema";

import { ListMusic, Inbox, Send } from "lucide-react";
const HolidayListMusic = HOLIDAY_MODE ? Gift : ListMusic;
const HolidayInbox = HOLIDAY_MODE ? Gift : Inbox;
const HolidaySend = HOLIDAY_MODE ? Star : Send;

const navigation = [
  { nameKey: "nav.dashboard", href: "/", icon: HolidayLayoutDashboard },
  { nameKey: "nav.catalog", href: "/catalog", icon: HolidayMusic4 },
  { nameKey: "nav.newRelease", href: "/releases", icon: HolidayPlus },
  { nameKey: "nav.promotion", href: "/pitching", icon: HolidayMegaphone, hasSubmenu: true, submenuType: "promotion" },
  { nameKey: "nav.reports", href: "/reports", icon: HolidayBarChart3, hasSubmenu: true, submenuType: "reports" },
];

const curatorNavigation = [
  { nameKey: "nav.dashboard", href: "/curator", icon: LayoutDashboard },
  { nameKey: "nav.curatorPlaylists", href: "/curator/playlists", icon: ListMusic },
  { nameKey: "nav.curatorApplications", href: "/curator/applications", icon: Inbox },
  { nameKey: "nav.curatorReports", href: "/curator/reports", icon: BarChart3, hasSubmenu: true, submenuType: "curatorReports" },
];

export default function Sidebar() {
  const [location, navigate] = useLocation();
  const { user, isPlatformAdmin, isCurator } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [reportsPopoverOpen, setReportsPopoverOpen] = useState(false);
  const [promotionPopoverOpen, setPromotionPopoverOpen] = useState(false);
  const [curatorReportsPopoverOpen, setCuratorReportsPopoverOpen] = useState(false);
  const [otherSectionsOpen, setOtherSectionsOpen] = useState(
    location === '/content' || location.startsWith('/content/') ||
    location === '/academy' || location.startsWith('/academy/')
  );

  const handlePromotionPopoverChange = (open: boolean) => {
    if (open) setReportsPopoverOpen(false);
    setPromotionPopoverOpen(open);
  };

  const handleReportsPopoverChange = (open: boolean) => {
    if (open) setPromotionPopoverOpen(false);
    setReportsPopoverOpen(open);
  };

  const handleCuratorReportsPopoverChange = (open: boolean) => {
    setCuratorReportsPopoverOpen(open);
  };

  const typedUser = user as User | undefined;

  const userInitials = typedUser?.firstName && typedUser?.lastName 
    ? `${typedUser.firstName[0]}${typedUser.lastName[0]}` 
    : typedUser?.email?.[0]?.toUpperCase() || 'U';

  const displayName = typedUser?.firstName && typedUser?.lastName
    ? `${typedUser.firstName} ${typedUser.lastName}`
    : typedUser?.email || 'User';

  const baseNavigation = isCurator ? curatorNavigation : navigation;
  
  const otherSections: typeof navigation = [];
  if (!isCurator) {
    otherSections.push({ nameKey: "nav.content", href: "/content", icon: Video });
  }
  if (isPlatformAdmin) {
    otherSections.push({ nameKey: "nav.academy", href: "/academy", icon: GraduationCap });
  }

  const allNavigation = isPlatformAdmin 
    ? [...baseNavigation, { nameKey: "nav.admin", href: "/admin", icon: HolidayShieldCheck }]
    : baseNavigation;
  
  const isOtherSectionActive = otherSections.some(s => location === s.href || location.startsWith(s.href + '/'));

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/logout');
      return response.json();
    },
    onSuccess: (data) => {
      // Clear all cached data
      queryClient.clear();
      
      // If there's a redirect URL (for Replit Auth), use it
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        // For Google Auth or simple logout, navigate to home
        navigate('/');
      }
      
      toast({
        title: "Logged out successfully",
        description: "You have been logged out of your account.",
      });
    },
    onError: (error) => {
      console.error("Logout failed:", error);
      toast({
        title: "Logout failed",
        description: "There was an error logging you out. Please try again.",
        variant: "destructive",
      });
      
      // Clear cache anyway and redirect to be safe
      queryClient.clear();
      navigate('/');
    }
  });
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Fetch pending applications count for curators
  const { data: pendingCountData } = useQuery({
    queryKey: ["/api/pitching-applications/pending-count"],
    queryFn: async () => {
      const res = await fetch("/api/pitching-applications/pending-count", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled: isCurator,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
  const pendingApplicationsCount = pendingCountData?.count || 0;

  return (
    <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0" data-tour="sidebar">
      <div className="flex flex-col flex-grow pt-5 pb-4 overflow-y-auto bg-sidebar border-r border-sidebar-border">
        {/* Logo */}
        <div className="flex items-center flex-shrink-0 px-4">
          <img 
            src={muzikaLogo} 
            alt="MUZIKA" 
            className="h-4 w-auto"
          />
        </div>

        {/* Navigation */}
        <nav className="mt-8 flex-1 px-2 space-y-1" data-testid="sidebar-navigation">
          {allNavigation.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && item.href !== '/curator' && location.startsWith(item.href + '/'));
            const isReportsActive = location === '/reports' || location === '/analytics' || location === '/finance';
            const isPromotionActive = location === '/pitching' || location === '/ads' || location.startsWith('/ads/');
            const tourId = item.nameKey.split('.')[1]; // e.g., "dashboard", "catalog", etc.
            
            if (item.hasSubmenu && item.submenuType === 'promotion') {
              return (
                <Popover key={item.nameKey} open={promotionPopoverOpen} onOpenChange={handlePromotionPopoverChange}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        isPromotionActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        "group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md transition-colors"
                      )}
                      data-testid={`nav-link-${tourId}`}
                      data-tour={`nav-${tourId}`}
                    >
                      <item.icon
                        className={cn(
                          "mr-3 flex-shrink-0 h-5 w-5",
                          isPromotionActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
                        )}
                      />
                      {t(item.nameKey)}
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="w-56 p-2">
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          navigate('/promo');
                          setPromotionPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/promo' || location === '/pitching' || location === '/playlists'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <HolidayTarget className="mr-3 h-4 w-4" />
                        {t('nav.pitching')}
                      </button>
                      <button
                        onClick={() => {
                          navigate('/ads');
                          setPromotionPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/ads' || location.startsWith('/ads/')
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <HolidayMonitorPlay className="mr-3 h-4 w-4" />
                        {t('nav.ads')}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }
            
            if (item.hasSubmenu && item.submenuType === 'reports') {
              return (
                <Popover key={item.nameKey} open={reportsPopoverOpen} onOpenChange={handleReportsPopoverChange}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        isReportsActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        "group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md transition-colors"
                      )}
                      data-testid={`nav-link-${tourId}`}
                      data-tour={`nav-${tourId}`}
                    >
                      <item.icon
                        className={cn(
                          "mr-3 flex-shrink-0 h-5 w-5",
                          isReportsActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
                        )}
                      />
                      {t(item.nameKey)}
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="w-56 p-2">
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          navigate('/reports');
                          setReportsPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/reports'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <HolidayBarChart3 className="mr-3 h-4 w-4" />
                        {t('nav.streamingReports')}
                      </button>
                      <button
                        onClick={() => {
                          navigate('/analytics');
                          setReportsPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/analytics'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <HolidayTrendingUp className="mr-3 h-4 w-4" />
                        {t('nav.analytics')}
                      </button>
                      <button
                        onClick={() => {
                          navigate('/finance');
                          setReportsPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/finance'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <HolidayWallet className="mr-3 h-4 w-4" />
                        {t('nav.finance')}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }

            if (item.hasSubmenu && item.submenuType === 'curatorReports') {
              const isCuratorReportsActive = location === '/curator/reports' || location === '/curator/playlists-reports' || location === '/curator/finance';
              return (
                <Popover key={item.nameKey} open={curatorReportsPopoverOpen} onOpenChange={handleCuratorReportsPopoverChange}>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        isCuratorReportsActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        "group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md transition-colors"
                      )}
                      data-testid={`nav-link-${tourId}`}
                      data-tour={`nav-${tourId}`}
                    >
                      <item.icon
                        className={cn(
                          "mr-3 flex-shrink-0 h-5 w-5",
                          isCuratorReportsActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
                        )}
                      />
                      {t(item.nameKey)}
                      <ChevronRight className="ml-auto h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="w-56 p-2">
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          navigate('/curator/reports');
                          setCuratorReportsPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/curator/reports'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <BarChart3 className="mr-3 h-4 w-4" />
                        {t('nav.curatorApplicationsReports')}
                      </button>
                      <button
                        onClick={() => {
                          navigate('/curator/playlists-reports');
                          setCuratorReportsPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/curator/playlists-reports'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <ListMusic className="mr-3 h-4 w-4" />
                        {t('nav.curatorPlaylistsReports')}
                      </button>
                      <button
                        onClick={() => {
                          navigate('/curator/finance');
                          setCuratorReportsPopoverOpen(false);
                        }}
                        className={cn(
                          location === '/curator/finance'
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent hover:text-accent-foreground",
                          "flex items-center w-full px-3 py-2 text-sm rounded-md transition-colors"
                        )}
                      >
                        <Wallet className="mr-3 h-4 w-4" />
                        {t('nav.curatorFinance')}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }
            
            const showBadge = item.href === '/curator/applications' && pendingApplicationsCount > 0;
            
            return (
              <Link 
                key={item.nameKey} 
                href={item.href}
                className={cn(
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors"
                )}
                data-testid={`nav-link-${tourId}`}
                data-tour={`nav-${tourId}`}
              >
                <item.icon
                  className={cn(
                    "mr-3 flex-shrink-0 h-5 w-5",
                    isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
                  )}
                />
                {t(item.nameKey)}
                {showBadge && (
                  <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                    {pendingApplicationsCount > 99 ? '99+' : pendingApplicationsCount}
                  </span>
                )}
              </Link>
            );
          })}

          {otherSections.length > 0 && (
            <div className="mt-3 pt-3 border-t border-sidebar-border">
              <button
                onClick={() => setOtherSectionsOpen(!otherSectionsOpen)}
                className={cn(
                  isOtherSectionActive && !otherSectionsOpen
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                  "group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md transition-colors"
                )}
              >
                <MoreHorizontal className="mr-3 flex-shrink-0 h-5 w-5" />
                {t('nav.otherSections', 'Інші розділи')}
                <ChevronDown
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform duration-200",
                    otherSectionsOpen && "rotate-180"
                  )}
                />
              </button>
              {otherSectionsOpen && (
                <div className="ml-4 mt-0.5 space-y-0.5">
                  {otherSections.map((item) => {
                    const isActive = location === item.href || location.startsWith(item.href + '/');
                    return (
                      <Link
                        key={item.nameKey}
                        href={item.href}
                        className={cn(
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          "group flex items-center px-2 py-1.5 text-sm rounded-md transition-colors"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "mr-3 flex-shrink-0 h-4 w-4",
                            isActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
                          )}
                        />
                        {t(item.nameKey)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        {/* User Profile */}
        <div className="flex-shrink-0 border-t border-sidebar-border p-4 relative" data-tour="user-profile-menu">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                className="w-full p-2 h-auto justify-start hover:bg-sidebar-accent"
                data-testid="profile-menu-trigger"
              >
                <div className="flex items-center w-full">
                  <div className="flex-shrink-0">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={typedUser?.profileImageFileId ? `/api/files/download/${typedUser.profileImageFileId}` : undefined} alt="Profile" />
                      <AvatarFallback className="text-sm font-medium bg-sidebar-accent text-sidebar-accent-foreground">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="ml-3 min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium text-sidebar-foreground truncate" data-testid="user-display-name">
                      {displayName}
                    </p>
                    <p className="text-xs text-sidebar-foreground/70 truncate" data-testid="user-email">
                      {typedUser?.email}
                    </p>
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent 
              align="start" 
              side="top"
              sideOffset={4}
              className="w-56"
              data-testid="profile-dropdown-menu"
            >
              <DropdownMenuItem asChild>
                <Link 
                  href={isCurator ? "/curator/settings/profile" : "/settings"} 
                  className="flex items-center w-full cursor-pointer"
                  data-testid="menu-item-settings"
                  data-tour="nav-settings"
                >
                  <Settings className="mr-2 h-4 w-4" />
                  {t('nav.settings')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="flex items-center cursor-pointer text-destructive focus:text-destructive"
                data-testid="menu-item-logout"
              >
                <LogOut className="mr-2 h-4 w-4" />
                {logoutMutation.isPending ? t('settings.loggingOut', 'Logging out...') : t('settings.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
