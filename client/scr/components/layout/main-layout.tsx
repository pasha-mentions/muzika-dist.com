import { ReactNode, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Sidebar from "./sidebar";
import BottomNavigation from "./bottom-navigation";
import JotformAIButton from "../jotform-ai-button";
import NotificationsDropdown from "../notifications-dropdown";
import PromotionalBanner from "../promotional-banner";
import { OnboardingTour } from "../onboarding-tour";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { User as UserIcon, Building2, Lock, CreditCard, Bell, LogOut, Wallet } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isCurator, currentOrg } = useAuth();
  const { toast } = useToast();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [runOnboarding, setRunOnboarding] = useState(false);

  const typedUser = user as User | undefined;

  // Check if user should see onboarding (skip for curators - their dashboard is different)
  useEffect(() => {
    if (typedUser && !typedUser.hasSeenOnboarding && !isCurator) {
      // Small delay to ensure page is loaded
      const timer = setTimeout(() => {
        setRunOnboarding(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [typedUser, isCurator]);

  // Send presence heartbeat every 2 minutes when authenticated
  useEffect(() => {
    if (!typedUser) return;
    
    const sendHeartbeat = () => {
      fetch('/api/presence/heartbeat', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    };
    
    // Send immediately on mount
    sendHeartbeat();
    
    // Then every 2 minutes
    const interval = setInterval(sendHeartbeat, 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [typedUser]);

  const userInitials = typedUser?.firstName && typedUser?.lastName 
    ? `${typedUser.firstName[0]}${typedUser.lastName[0]}` 
    : typedUser?.email?.[0]?.toUpperCase() || 'U';

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/logout');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.clear();
      
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        setLocation('/');
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
      
      queryClient.clear();
      setLocation('/');
    }
  });
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleOnboardingComplete = async (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      try {
        await apiRequest('PATCH', '/api/user/onboarding', {
          hasSeenOnboarding: true,
        });
        // Refresh user data
        queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      } catch (error) {
        console.error('Error updating onboarding status:', error);
      }
    }
    setRunOnboarding(false);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="md:pl-64 flex flex-col flex-1 overflow-hidden">
        {/* Top Bar */}
        <div className="bg-card border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between">
            {/* Left side - Mobile: Avatar + Notifications */}
            <div className="flex items-center gap-3">
              {/* Mobile: Curator brand name */}
              {isCurator && (
              <div className="md:hidden flex items-center gap-2">
                <Avatar className="w-6 h-6">
                  <AvatarImage src={currentOrg?.curatorCoverImageUrl || '/muzika-logo-icon.png'} alt="Brand" />
                </Avatar>
                <span className="font-medium text-xs text-muted-foreground truncate max-w-[140px]">
                  {currentOrg?.name || 'Curator'}
                </span>
              </div>
              )}
              
              {/* Mobile Avatar Menu - hidden for curators (they use bottom nav profile menu) */}
              {!isCurator && (
              <div className="md:hidden">
                <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                  <DrawerTrigger asChild>
                    <Button 
                      variant="ghost" 
                      className="p-0 h-auto rounded-full"
                      data-testid="mobile-avatar-menu"
                      data-tour="nav-settings"
                    >
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={typedUser?.profileImageUrl || undefined} alt="Profile" />
                        <AvatarFallback className="text-sm font-medium bg-primary text-primary-foreground">
                          {userInitials}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent data-tour="user-profile-menu">
                    <div className="flex flex-col py-4">
                      <Link
                        href="/settings"
                        onClick={() => setIsDrawerOpen(false)}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors"
                        )}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <UserIcon className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-base font-medium">Profile</span>
                      </Link>
                      
                      <Link
                        href="/settings?tab=organization"
                        onClick={() => setIsDrawerOpen(false)}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors"
                        )}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-base font-medium">Organization</span>
                      </Link>
                      
                      <Link
                        href="/settings?tab=security"
                        onClick={() => setIsDrawerOpen(false)}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors"
                        )}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <Lock className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-base font-medium">Security</span>
                      </Link>
                      
                      <Link
                        href="/settings?tab=billing"
                        onClick={() => setIsDrawerOpen(false)}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors"
                        )}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <CreditCard className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-base font-medium">{t('settings.billing')}</span>
                      </Link>
                      
                      <Link
                        href="/settings?tab=notifications"
                        onClick={() => setIsDrawerOpen(false)}
                        className={cn(
                          "flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors"
                        )}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                          <Bell className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-base font-medium">{t('settings.notifications')}</span>
                      </Link>
                      
                      <div className="border-t border-border mt-2 pt-2">
                        <button
                          onClick={() => {
                            setIsDrawerOpen(false);
                            handleLogout();
                          }}
                          disabled={logoutMutation.isPending}
                          className={cn(
                            "flex items-center gap-4 px-6 py-4 hover:bg-accent transition-colors w-full text-left"
                          )}
                        >
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-destructive/10">
                            <LogOut className="h-5 w-5 text-destructive" />
                          </div>
                          <span className="text-base font-medium text-destructive">
                            {logoutMutation.isPending ? t('settings.loggingOut', 'Logging out...') : t('settings.logout')}
                          </span>
                        </button>
                      </div>
                    </div>
                  </DrawerContent>
                </Drawer>
              </div>
              )}
              
              {/* Mobile: Notifications (not for curators - they have it on the right) */}
              {!isCurator && (
              <div className="md:hidden flex items-center gap-2">
                <NotificationsDropdown />
              </div>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Desktop: Show all buttons */}
              <div className="hidden md:flex items-center gap-3">
                <PromotionalBanner />
                <JotformAIButton />
                <NotificationsDropdown />
              </div>
              
              {/* Mobile: Show only AI + Finance (not for curators) */}
              {!isCurator && (
              <div className="md:hidden flex items-center gap-3">
                <JotformAIButton />
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-2"
                  onClick={() => setLocation('/finance')}
                >
                  <Wallet className="h-5 w-5" />
                </Button>
              </div>
              )}
              
              {/* Mobile: Curators only see notifications */}
              {isCurator && (
              <div className="md:hidden flex items-center">
                <NotificationsDropdown />
              </div>
              )}
            </div>
          </div>
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-background pb-16 md:pb-0">
          {children}
        </main>

        {/* Mobile Bottom Navigation */}
        <BottomNavigation />
      </div>

      {/* Onboarding Tour */}
      <OnboardingTour 
        run={runOnboarding} 
        onComplete={handleOnboardingComplete} 
      />
    </div>
  );
}
