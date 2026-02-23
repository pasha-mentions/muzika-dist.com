import { Switch, Route, useRoute, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AnimatePresence } from "framer-motion";
import AnimatedPage from "@/components/animated-page";
import { lazy, Suspense } from "react";
// Holiday Hunt temporarily disabled - uncomment to re-enable
// import { HolidayHuntProvider } from "@/contexts/HolidayHuntContext";
// import { HolidayGiftModal } from "@/components/holiday/HolidayGiftModal";

const NotFound = lazy(() => import("@/pages/not-found"));
const Landing = lazy(() => import("@/pages/landing"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Catalog = lazy(() => import("@/pages/catalog"));
const Releases = lazy(() => import("@/pages/releases"));
const NewRelease = lazy(() => import("@/pages/new-release"));
const NewVideo = lazy(() => import("@/pages/new-video"));
const ReleaseDetails = lazy(() => import("@/pages/release-details"));
const Reports = lazy(() => import("@/pages/reports"));
const Analytics = lazy(() => import("@/pages/analytics"));
const Finance = lazy(() => import("@/pages/finance"));
const Splits = lazy(() => import("@/pages/splits"));
const Payouts = lazy(() => import("@/pages/payouts"));
const Settings = lazy(() => import("@/pages/settings"));
const Pitching = lazy(() => import("@/pages/pitching"));
const Promo = lazy(() => import("@/pages/promo"));
const Playlists = lazy(() => import("@/pages/playlists"));
const PlaylistCart = lazy(() => import("@/pages/playlists/cart"));
const Ads = lazy(() => import("@/pages/ads"));
const YouTubeAds = lazy(() => import("@/pages/youtube-ads"));
const YouTubeAdsHistory = lazy(() => import("@/pages/youtube-ads-history"));
const Admin = lazy(() => import("@/pages/admin"));
const ContentPage = lazy(() => import("@/pages/content"));
const PaymentSuccess = lazy(() => import("@/pages/payment-success"));
const PaymentFailure = lazy(() => import("@/pages/payment-failure"));
const PaymentVideoSuccess = lazy(() => import("@/pages/payment-video-success"));
const PaymentVideoFailure = lazy(() => import("@/pages/payment-video-failure"));
const AgreementRequired = lazy(() => import("@/pages/agreement-required"));
const ForgotPassword = lazy(() => import("@/pages/forgot-password"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
const OrganizationFrozen = lazy(() => import("@/pages/organization-frozen"));
const MainLayout = lazy(() => import("@/components/layout/main-layout"));
const NotificationsPage = lazy(() => import("@/pages/notifications-page"));
const PrivacyPolicy = lazy(() => import("@/pages/legal/privacy"));
const PublicOffer = lazy(() => import("@/pages/legal/offer"));
const TermsAndConditions = lazy(() => import("@/pages/legal/terms"));
const RefundPolicy = lazy(() => import("@/pages/legal/refund"));
const CuratorDashboard = lazy(() => import("@/pages/curator/dashboard"));
const CuratorPlaylists = lazy(() => import("@/pages/curator/playlists"));
const CuratorApplications = lazy(() => import("@/pages/curator/applications"));
const CuratorProfile = lazy(() => import("@/pages/curator-profile"));
const CuratorReports = lazy(() => import("@/pages/curator/reports"));
const CuratorPlaylistsReports = lazy(() => import("@/pages/curator/playlists-reports"));
const CuratorFinance = lazy(() => import("@/pages/curator/finance"));
const CuratorNews = lazy(() => import("@/pages/curator/news"));
const CuratorSettings = lazy(() => import("@/pages/curator/settings"));
const CuratorSettingsProfile = lazy(() => import("@/pages/curator/settings/profile"));
const CuratorSettingsOrganization = lazy(() => import("@/pages/curator/settings/organization"));
const CuratorSettingsSecurity = lazy(() => import("@/pages/curator/settings/security"));
const CuratorSettingsBilling = lazy(() => import("@/pages/curator/settings/billing"));
const CuratorSettingsNotifications = lazy(() => import("@/pages/curator/settings/notifications"));
const MyApplications = lazy(() => import("@/pages/my-applications"));
const Academy = lazy(() => import("@/pages/academy"));
const AcademyCourse = lazy(() => import("@/pages/academy-course"));
import { CuratorRoute } from "@/components/curator-route";

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading"/>
    </div>
  );
}

function Router() {
  const { isAuthenticated, isLoading, isOrganizationFrozen } = useAuth();
  const [isPaymentSuccess] = useRoute("/payment/success");
  const [isPaymentFailure] = useRoute("/payment/failure");
  const [isPaymentVideoSuccess] = useRoute("/payment/video-success");
  const [isPaymentVideoFailure] = useRoute("/payment/video-failure");
  const [isForgotPassword] = useRoute("/forgot-password");
  const [isResetPassword] = useRoute("/reset-password");
  const [isLegalPrivacy] = useRoute("/legal/privacy");
  const [isLegalOffer] = useRoute("/legal/offer");
  const [isLegalTerms] = useRoute("/legal/terms");
  const [isLegalRefund] = useRoute("/legal/refund");
  const [location] = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isPaymentSuccess) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentSuccess />
      </Suspense>
    );
  }

  if (isPaymentFailure) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentFailure />
      </Suspense>
    );
  }

  if (isPaymentVideoSuccess) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentVideoSuccess />
      </Suspense>
    );
  }

  if (isPaymentVideoFailure) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PaymentVideoFailure />
      </Suspense>
    );
  }

  if (isForgotPassword) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <ForgotPassword />
      </Suspense>
    );
  }

  if (isResetPassword) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <ResetPassword />
      </Suspense>
    );
  }

  if (isLegalPrivacy) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PrivacyPolicy />
      </Suspense>
    );
  }

  if (isLegalOffer) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <PublicOffer />
      </Suspense>
    );
  }

  if (isLegalTerms) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <TermsAndConditions />
      </Suspense>
    );
  }

  if (isLegalRefund) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <RefundPolicy />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <Landing />
      </Suspense>
    );
  }

  if (isOrganizationFrozen) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <OrganizationFrozen />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <MainLayout>
        <AnimatePresence mode="wait">
          <AnimatedPage key={location}>
            <Suspense fallback={<LoadingSpinner />}>
              <Switch location={location}>
                <Route path="/" component={Dashboard} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/catalog" component={Catalog} />
                <Route path="/releases" component={Releases} />
                <Route path="/releases/new" component={NewRelease} />
                <Route path="/new-video" component={NewVideo} />
                <Route path="/release/:id" component={ReleaseDetails} />
                <Route path="/release/:id/edit" component={ReleaseDetails} />
                <Route path="/reports" component={Reports} />
                <Route path="/analytics" component={Analytics} />
                <Route path="/finance" component={Finance} />
                <Route path="/finance/splits" component={Splits} />
                <Route path="/payouts" component={Payouts} />
                <Route path="/pitching" component={Pitching} />
                <Route path="/promo" component={Promo} />
                <Route path="/playlists" component={Playlists} />
                <Route path="/playlists/cart" component={PlaylistCart} />
                <Route path="/my-applications" component={MyApplications} />
                <Route path="/c/:curatorId" component={CuratorProfile} />
                <Route path="/ads" component={Ads} />
                <Route path="/ads/youtube" component={YouTubeAds} />
                <Route path="/ads/youtube/history" component={YouTubeAdsHistory} />
                <Route path="/settings" component={Settings} />
                <Route path="/notifications" component={NotificationsPage} />
                <Route path="/agreement-required" component={AgreementRequired} />
                <Route path="/content" component={ContentPage} />
                <Route path="/academy/:slug" component={AcademyCourse} />
                <Route path="/academy" component={Academy} />
                <Route path="/admin" component={Admin} />
                <Route path="/curator">
                  {() => <CuratorRoute component={CuratorDashboard} />}
                </Route>
                <Route path="/curator/playlists">
                  {() => <CuratorRoute component={CuratorPlaylists} />}
                </Route>
                <Route path="/curator/applications">
                  {() => <CuratorRoute component={CuratorApplications} />}
                </Route>
                <Route path="/curator/reports">
                  {() => <CuratorRoute component={CuratorReports} />}
                </Route>
                <Route path="/curator/playlists-reports">
                  {() => <CuratorRoute component={CuratorPlaylistsReports} />}
                </Route>
                <Route path="/curator/finance">
                  {() => <CuratorRoute component={CuratorFinance} />}
                </Route>
                <Route path="/curator/news">
                  {() => <CuratorRoute component={CuratorNews} />}
                </Route>
                <Route path="/curator/settings/profile">
                  {() => <CuratorRoute component={CuratorSettingsProfile} />}
                </Route>
                <Route path="/curator/settings/organization">
                  {() => <CuratorRoute component={CuratorSettingsOrganization} />}
                </Route>
                <Route path="/curator/settings/security">
                  {() => <CuratorRoute component={CuratorSettingsSecurity} />}
                </Route>
                <Route path="/curator/settings/billing">
                  {() => <CuratorRoute component={CuratorSettingsBilling} />}
                </Route>
                <Route path="/curator/settings/notifications">
                  {() => <CuratorRoute component={CuratorSettingsNotifications} />}
                </Route>
                <Route path="/curator/settings">
                  {() => <CuratorRoute component={CuratorSettings} />}
                </Route>
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </AnimatedPage>
        </AnimatePresence>
      </MainLayout>
    </Suspense>
  );
}

function App() {
  // Holiday Hunt temporarily disabled
  // To re-enable: uncomment HolidayHuntProvider imports and wrap TooltipProvider with it
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
