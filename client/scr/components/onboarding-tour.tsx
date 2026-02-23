import { useState, useEffect, useRef } from 'react';
import Joyride, { Step, CallBackProps, STATUS, ACTIONS, EVENTS, TooltipRenderProps } from 'react-joyride';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import type { User } from '@shared/schema';
import { Button } from '@/components/ui/button';

interface OnboardingTourProps {
  run: boolean;
  onComplete: (dontShowAgain: boolean) => void;
}

// Custom Tooltip Component with two skip options
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  skipProps,
  primaryProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) {
  const { t } = useTranslation();
  
  const handleSkipClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Trigger custom event to show skip confirmation dialog
    const event = new CustomEvent('onboarding-skip-request');
    window.dispatchEvent(event);
  };
  
  return (
    <div
      {...tooltipProps}
      className="bg-[#1f1f1f] text-white rounded-lg p-5 max-w-[400px] relative"
    >
      {/* X button in top-right corner */}
      <button
        onClick={handleSkipClick}
        className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors"
        aria-label={t('onboarding.buttons.skip')}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {step.title && <h3 className="text-lg font-bold mb-2">{step.title}</h3>}
      <div className="mb-4">{step.content}</div>
      
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {index > 0 && (
            <Button
              {...backProps}
              variant="ghost"
              size="sm"
              className="text-[#f050e0] hover:text-[#f050e0] hover:bg-[#f050e0]/10"
            >
              {t('onboarding.buttons.back')}
            </Button>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={handleSkipClick}
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-300 hover:bg-gray-800"
          >
            {t('onboarding.buttons.skip')}
          </Button>
          
          {continuous && (
            <Button
              {...primaryProps}
              size="sm"
              className="bg-[#f050e0] hover:bg-[#f050e0]/90 text-white"
            >
              {isLastStep ? t('onboarding.buttons.start') : t('onboarding.buttons.next')}
            </Button>
          )}
        </div>
      </div>
      
      {/* Don't show again button - only on first and last steps */}
      {(index === 0 || isLastStep) && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <button
            className="text-xs text-gray-500 hover:text-gray-400 underline w-full text-center"
            onClick={() => {
              // Trigger custom action for "don't show again"
              const event = new CustomEvent('onboarding-dismiss-forever');
              window.dispatchEvent(event);
            }}
          >
            {t('onboarding.buttons.dontShowAgain')}
          </button>
        </div>
      )}
    </div>
  );
}

export function OnboardingTour({ run, onComplete }: OnboardingTourProps) {
  const [, setLocation] = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [tourRun, setTourRun] = useState(run);
  // Lock device type when tour STARTS (run becomes true), not at component mount
  const deviceTypeRef = useRef<'mobile' | 'desktop' | null>(null);
  const { user, isPlatformAdmin } = useAuth();
  const typedUser = user as User | undefined;
  const { t } = useTranslation();

  useEffect(() => {
    // Disable onboarding completely on mobile
    const currentIsMobile = window.innerWidth < 768;
    if (currentIsMobile) {
      setTourRun(false);
      return;
    }
    
    setTourRun(run);
    // Lock device type when tour starts for the first time (desktop only)
    if (run && deviceTypeRef.current === null) {
      deviceTypeRef.current = 'desktop';
    }
  }, [run]);

  const isMobile = false; // Always false - onboarding disabled on mobile

  // Handle "Don't show again" custom event
  useEffect(() => {
    const handleDismissForever = () => {
      setTourRun(false);
      onComplete(true); // Mark as "don't show again"
      
      // Navigate back to dashboard if not there
      if (window.location.pathname !== '/dashboard' && window.location.pathname !== '/') {
        setLocation('/dashboard');
      }
    };

    window.addEventListener('onboarding-dismiss-forever', handleDismissForever);
    return () => {
      window.removeEventListener('onboarding-dismiss-forever', handleDismissForever);
    };
  }, [onComplete, setLocation]);

  // Handle "Skip" request - close tour and mark as seen
  useEffect(() => {
    const handleSkipRequest = () => {
      setTourRun(false);
      onComplete(true); // Mark as seen - won't show again until next logout & login
      
      // Navigate back to dashboard if not there
      if (window.location.pathname !== '/dashboard' && window.location.pathname !== '/') {
        setLocation('/dashboard');
      }
    };

    window.addEventListener('onboarding-skip-request', handleSkipRequest);
    return () => {
      window.removeEventListener('onboarding-skip-request', handleSkipRequest);
    };
  }, [onComplete, setLocation]);

  // Build steps based on user role
  const buildSteps = (): Step[] => {
    // Initial steps (0-3): Welcome, Dashboard, Stats, Account Status
    const initialSteps: Step[] = [
      // Step 0: Welcome
      {
        target: 'body',
        content: (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">{t('onboarding.welcome.title')}</h3>
            <p>{t('onboarding.welcome.subtitle')}</p>
            <p className="text-sm">{t('onboarding.welcome.description')}</p>
          </div>
        ),
        placement: 'center',
        disableBeacon: true,
      },
      // Step 1: Dashboard button
      {
        target: '[data-tour="nav-dashboard"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.dashboard.title')}</h3>
            <p>{t('onboarding.dashboard.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.dashboard.stats')}</li>
              <li>{t('onboarding.dashboard.updates')}</li>
              <li>{t('onboarding.dashboard.actions')}</li>
            </ul>
          </div>
        ),
        placement: isMobile ? 'top' : 'right',
      },
      // Step 2: Dashboard Stats
      {
        target: '[data-tour="dashboard-stats"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.stats.title')}</h3>
            <p>{t('onboarding.stats.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.stats.active')}</li>
              <li>{t('onboarding.stats.draft')}</li>
              <li>{t('onboarding.stats.unpaid')}</li>
              <li>{t('onboarding.stats.deleted')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
      // Step 3: Account Status
      {
        target: '[data-tour="account-status"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.accountStatus.title')}</h3>
            <p>{t('onboarding.accountStatus.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.accountStatus.agreement')}</li>
              <li>{t('onboarding.accountStatus.links')}</li>
              <li>{t('onboarding.accountStatus.required')}</li>
            </ul>
          </div>
        ),
        placement: 'left',
      },
    ];

    // Communication tools steps (4-6): AI, Support, Notifications
    // Only show on desktop, skip on mobile to avoid issues
    const communicationSteps: Step[] = isMobile ? [] : [
      // Step 4: AI Assistant
      {
        target: '[data-tour="ai-assistant-button"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.aiAssistant.title')}</h3>
            <p>{t('onboarding.aiAssistant.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.aiAssistant.questions')}</li>
              <li>{t('onboarding.aiAssistant.guide')}</li>
              <li>{t('onboarding.aiAssistant.solve')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
      // Step 5: Support Chat
      {
        target: '[data-tour="support-chat-button"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.supportChat.title')}</h3>
            <p>{t('onboarding.supportChat.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.supportChat.ask')}</li>
              <li>{t('onboarding.supportChat.realtime')}</li>
              <li>{t('onboarding.supportChat.consultation')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
      // Step 6: Notifications
      {
        target: '[data-tour="notifications-button"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.notifications.title')}</h3>
            <p>{t('onboarding.notifications.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.notifications.status')}</li>
              <li>{t('onboarding.notifications.admin')}</li>
              <li>{t('onboarding.notifications.reminders')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
    ];

    // Navigation steps: Catalog, New Release, Pitching, Reports
    // Placement depends on device: top for mobile (bottom nav), right for desktop (sidebar)
    const navPlacement = isMobile ? 'top' : 'right';
    const navigationSteps: Step[] = [
      // Catalog button
      {
        target: '[data-tour="nav-catalog"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.catalog.title')}</h3>
            <p>{t('onboarding.catalog.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.catalog.view')}</li>
              <li>{t('onboarding.catalog.filter')}</li>
              <li>{t('onboarding.catalog.edit')}</li>
              <li>{t('onboarding.catalog.multilink')}</li>
              <li>{t('onboarding.catalog.payment')}</li>
            </ul>
          </div>
        ),
        placement: navPlacement,
      },
      // New Release button
      {
        target: '[data-tour="nav-newRelease"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.newRelease.title')}</h3>
            <p>{t('onboarding.newRelease.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.newRelease.upload')}</li>
              <li>{t('onboarding.newRelease.metadata')}</li>
              <li>{t('onboarding.newRelease.wizard')}</li>
            </ul>
          </div>
        ),
        placement: navPlacement,
      },
      // Promotion button (Pitching + YouTube Ads)
      {
        target: '[data-tour="nav-promotion"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.promotion.title')}</h3>
            <p>{t('onboarding.promotion.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.promotion.pitching')}</li>
              <li>{t('onboarding.promotion.youtubeAds')}</li>
              <li>{t('onboarding.promotion.reach')}</li>
            </ul>
          </div>
        ),
        placement: navPlacement,
      },
      // Reports button (Streaming + Quick Analytics + Finance)
      {
        target: '[data-tour="nav-reports"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.reports.title')}</h3>
            <p>{t('onboarding.reports.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.reports.streams')}</li>
              <li>{t('onboarding.reports.quickAnalytics')}</li>
              <li>{t('onboarding.reports.finance')}</li>
              <li>{t('onboarding.reports.charts')}</li>
            </ul>
          </div>
        ),
        placement: navPlacement,
      },
    ];

    // Combine initial, communication, and navigation steps
    const baseSteps = [...initialSteps, ...communicationSteps, ...navigationSteps];

    // Add Admin button step if user is admin
    if (isPlatformAdmin) {
      baseSteps.push({
        target: '[data-tour="nav-admin"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.admin.title')}</h3>
            <p>{t('onboarding.admin.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.admin.releases')}</li>
              <li>{t('onboarding.admin.users')}</li>
              <li>{t('onboarding.admin.pitching')}</li>
            </ul>
          </div>
        ),
        placement: isMobile ? 'top' : 'right',
      });
    }

    // Add Settings navigation button step (only for desktop)
    if (!isMobile) {
      baseSteps.push({
        target: '[data-tour="nav-settings"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.settings.title')}</h3>
            <p>{t('onboarding.settings.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.settings.profile')}</li>
              <li>{t('onboarding.settings.organization')}</li>
              <li>{t('onboarding.settings.security')}</li>
              <li>{t('onboarding.settings.language')}</li>
            </ul>
          </div>
        ),
        placement: 'right',
      });
    }

    // Add Settings and other steps
    const settingsSteps: Step[] = [
      // Settings menu (only for desktop)
      ...(!isMobile ? [{
        target: '[data-tour="user-profile-menu"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.settingsMenu.title')}</h3>
            <p>{t('onboarding.settingsMenu.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.settingsMenu.basics')}</li>
              <li>{t('onboarding.settingsMenu.language')}</li>
              <li>{t('onboarding.settingsMenu.profileSecurity')}</li>
            </ul>
          </div>
        ),
        placement: 'top' as const,
      }] : []),
      // Profile section
      {
        target: '[data-tour="profile-section"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.profile.title')}</h3>
            <p>{t('onboarding.profile.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.profile.photo')}</li>
              <li>{t('onboarding.profile.language')}</li>
              <li>{t('onboarding.profile.address')}</li>
            </ul>
            <p className="text-sm text-muted-foreground">{t('onboarding.profile.reminder')}</p>
          </div>
        ),
        placement: 'bottom',
      },
      // Organization tab
      {
        target: '[data-tour="organization-tab"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.organization.title')}</h3>
            <p>{t('onboarding.organization.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.organization.data')}</li>
              <li>{t('onboarding.organization.links')}</li>
              <li>{t('onboarding.organization.team')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
      // Security tab
      {
        target: '[data-tour="security-tab"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.security.title')}</h3>
            <p>{t('onboarding.security.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.security.password')}</li>
              <li>{t('onboarding.security.twoFactor')}</li>
              <li>{t('onboarding.security.history')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
      // Billing/Notifications tab
      {
        target: '[data-tour="billing-tab"]',
        content: (
          <div className="space-y-3">
            <h3 className="text-lg font-bold">{t('onboarding.billing.title')}</h3>
            <p>{t('onboarding.billing.description')}</p>
            <ul className="text-sm space-y-1 list-disc list-inside">
              <li>{t('onboarding.billing.history')}</li>
            </ul>
          </div>
        ),
        placement: 'bottom',
      },
      // Completion
      {
        target: 'body',
        content: (
          <div className="space-y-4">
            <h3 className="text-xl font-bold">{t('onboarding.completion.title')}</h3>
            <p>{t('onboarding.completion.description')}</p>
            <p className="text-sm">{t('onboarding.completion.cta')}</p>
            <p className="text-sm">{t('onboarding.completion.reminder')}</p>
          </div>
        ),
        placement: 'center',
      },
    ];

    return [...baseSteps, ...settingsSteps];
  };

  const steps = buildSteps();

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, action, index, type } = data;

    if ((status === STATUS.FINISHED)) {
      setTourRun(false);
      // FINISHED = completed entire tour -> save as "don't show again"
      onComplete(true);
      
      // Navigate back to dashboard if not there
      if (window.location.pathname !== '/dashboard' && window.location.pathname !== '/') {
        setLocation('/dashboard');
      }
    } else if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      // Move to next step
      const nextStepIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      
      // Handle bounds
      if (nextStepIndex < 0) {
        return; // Can't go before first step
      }
      
      // If we're past the last step, complete the tour
      if (nextStepIndex >= steps.length) {
        setTourRun(false);
        onComplete(true);
        if (window.location.pathname !== '/dashboard' && window.location.pathname !== '/') {
          setLocation('/dashboard');
        }
        return;
      }
      
      // Determine step boundaries (depends on device and role)
      // Initial steps (0-3): Welcome, Dashboard, Stats, Account Status = 4 steps
      // Communication steps (4-6): AI, Support, Notifications = 3 steps (desktop only, 0 on mobile)
      // Navigation steps: Catalog, New Release, Pitching, Reports = 4 steps
      // Admin step (if admin): 1 step
      // Settings button step: 1 step (desktop only, 0 on mobile)
      // Settings menu step: 1 step (desktop only, 0 on mobile)
      // Settings tabs: Profile, Organization, Security, Billing = 4 steps
      // Completion: 1 step
      const communicationStepsCount = isMobile ? 0 : 3;
      const initialStepsCount = 4;
      const navigationStepsCount = 4;
      const adminStepCount = isPlatformAdmin ? 1 : 0;
      const settingsButtonStepCount = isMobile ? 0 : 1;
      const settingsMenuStepCount = isMobile ? 0 : 1;
      
      const settingsButtonStepIndex = initialStepsCount + communicationStepsCount + navigationStepsCount + adminStepCount;
      const settingsMenuStepIndex = settingsButtonStepIndex + settingsButtonStepCount;
      const profileStepIndex = settingsMenuStepIndex + settingsMenuStepCount;
      const lastStepIndex = steps.length - 1;
      
      // Determine which page the next step should be on
      const currentPath = window.location.pathname;
      const shouldBeOnSettings = nextStepIndex >= settingsMenuStepIndex && nextStepIndex < lastStepIndex;
      const shouldBeOnDashboard = nextStepIndex < settingsMenuStepIndex || nextStepIndex === lastStepIndex;
      
      // Handle navigation based on next step requirements
      if (shouldBeOnSettings && currentPath !== '/settings') {
        // Need to navigate to settings (for settings menu and tabs)
        setLocation('/settings');
        setTimeout(() => setStepIndex(nextStepIndex), 300);
      } else if (shouldBeOnDashboard && currentPath !== '/dashboard' && currentPath !== '/') {
        // Need to navigate to dashboard (for all steps before settings menu)
        setLocation('/dashboard');
        setTimeout(() => setStepIndex(nextStepIndex), 300);
      } else {
        // Already on correct page, just update step
        // Add slight delay on mobile to ensure elements are rendered
        const delay = isMobile ? 100 : 0;
        setTimeout(() => setStepIndex(nextStepIndex), delay);
      }
    }
  };

  return (
    <Joyride
      steps={steps}
      run={tourRun}
      stepIndex={stepIndex}
      continuous
      showProgress
      disableCloseOnEsc={false}
      disableOverlayClose={false}
      callback={handleJoyrideCallback}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          arrowColor: '#1f1f1f',
          overlayColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 10000,
        },
      }}
    />
  );
}
