import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Music, FileText, BarChart3, Search, Calendar, User, Hash, Building2, Loader2, Target, Wallet, Video, Youtube, Globe, Clock, DollarSign, Check, X, MessageSquare, MessageCircle, Gift, Trash2, ExternalLink, Camera, Eye, Instagram, Download } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AudioPlayer } from "@/components/ui/audio-player";
import { FaSpotify } from "react-icons/fa";
import { format } from "date-fns";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isUnauthorizedError } from "@/lib/authUtils";
import { getProxiedImageUrl } from "@/lib/utils";
import UsersTab from "@/components/admin/users-tab";
import ReportsUploadTab from "@/components/admin/reports-upload-tab";
import FinanceTab from "@/components/admin/finance-tab";
import PlatformDashboard from "@/components/admin/platform-dashboard";
import ReleaseDetailsModal from "@/components/admin/release-details-modal";
import MusicVideoDetailsModal from "@/components/admin/music-video-details-modal";
import PitchingDetailsModal from "@/components/admin/pitching-details-modal";
import YouTubeAdsDetailsModal from "@/components/admin/youtube-ads-details-modal";
import NewsTab from "@/components/admin/news-tab";
import HolidayGiftsTab from "@/components/admin/holiday-gifts-tab";
import AcademyTab from "@/components/admin/academy-tab";

interface AdminRelease {
  id: string;
  title: string;
  upc?: string;
  status: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  createdAt: string;
  updatedAt: string;
  originalReleaseDate?: string;
  releaseDate?: string;
  primaryGenre?: string;
  language?: string;
  performers?: Array<{ name: string; role: string }>;
  artist: {
    name: string;
  };
  organization: {
    name: string;
    type: string;
  };
}

interface AdminMusicVideo {
  id: string;
  title: string;
  upc?: string;
  isrc?: string;
  status: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  createdAt: string;
  updatedAt: string;
  firstReleaseDate?: string;
  releaseDate?: string;
  primaryGenre?: string;
  language?: string;
  videoFileId?: string;
  videoUrl?: string;
  artist: {
    name: string;
  };
  organization: {
    name: string;
    type: string;
  };
}

interface PitchingSubmission {
  id: string;
  userId: string;
  releaseId: string;
  orgId: string;
  releaseDescription: string;
  artistInfo: string;
  promoplan: string;
  focusTrack: string;
  budget: string;
  photosGoogleDrive: string;
  spotifyUrl?: string;
  appleMusicUrl?: string;
  instagramUrl?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  release: {
    id: string;
    title: string;
    upc?: string;
    artist: {
      name: string;
    };
    organization: {
      name: string;
    };
  };
}

interface YouTubeAdCampaign {
  id: string;
  userId: string;
  orgId: string;
  videoUrl: string;
  videoId: string;
  budget: number;
  inStreamPercent: number;
  discoveryPercent: number;
  duration: number;
  countries: string[];
  cities?: Record<string, string[]> | null;
  audience?: string | null;
  status: string;
  adminNotes?: string | null;
  createdAt: string;
  updatedAt: string;
  organization?: {
    id: string;
    name: string;
  };
}

interface CuratorApplication {
  id: string;
  applicationCode: string | null;
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  paymentStatus: string | null;
  paidAmount: number | null;
  paidCurrency: string | null;
  packagePrice: number | null;
  packageCurrency: string | null;
  spotifyLink: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  trackId: string;
  playlistId: number;
  artistOrgId: string;
  curatorOrgId: string;
  artistOrgName: string;
  curatorOrgName: string;
  playlistName: string;
  trackTitle: string;
  instagramLink: string | null;
  comment: string | null;
  photos: string[];
  spotifyTrackUrl: string | null;
  proposedPlacementDate: string | null;
  curatorProposedDate: string | null;
  confirmedPlacementDate: string | null;
  curatorResponse: string | null;
  playlistImageUrl: string | null;
  packageName: string | null;
  coverArtworkFileId: string | null;
  trackAudioFileId: string | null;
  releaseDate: string | null;
  organizationName: string | null;
  platformStats: {
    platform: string;
    period: string;
    streams: number;
    revenue: number;
  } | null;
}

export default function Admin() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading, isPlatformAdmin, isPlatformOwner } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);
  const [activeTab, setActiveTab] = useState("catalog");

  // Set active tab to dashboard when platform admin/owner is loaded
  useEffect(() => {
    if (!isLoading && isPlatformAdmin && activeTab === "catalog") {
      setActiveTab("dashboard");
    }
  }, [isPlatformAdmin, isLoading]);
  
  // Admin catalog state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [audioCategoryFilter, setAudioCategoryFilter] = useState<"all" | "DRAFT" | "ACTIVE" | "DELIVERING" | "DELETED" | "PAID" | "UNPAID">("all");
  const [videoCategoryFilter, setVideoCategoryFilter] = useState<"all" | "DRAFT" | "ACTIVE" | "DELETED" | "PAID" | "UNPAID">("all");
  const [contentType, setContentType] = useState<"audio" | "video">("audio"); // Audio, Video switcher
  
  // Pagination state
  const [audioPage, setAudioPage] = useState(1);
  const [videoPage, setVideoPage] = useState(1);
  const pageLimit = 50; // Items per page
  
  // Promo state (Pitching + YouTube Ads + Curator Playlists)
  const [promoTypeFilter, setPromoTypeFilter] = useState<"all" | "pitching" | "youtube" | "playlists">("all");
  const [pitchingSearch, setPitchingSearch] = useState("");
  const [pitchingStatusFilter, setPitchingStatusFilter] = useState("all");
  const [pitchingSortBy, setPitchingSortBy] = useState("newest");
  
  // YouTube Ads modal state
  const [selectedYouTubeAd, setSelectedYouTubeAd] = useState<YouTubeAdCampaign | null>(null);
  const [isYouTubeAdModalOpen, setIsYouTubeAdModalOpen] = useState(false);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  
  // Release details modal state
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Music Video details modal state
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  
  // Pitching details modal state
  const [selectedPitching, setSelectedPitching] = useState<PitchingSubmission | null>(null);
  const [isPitchingModalOpen, setIsPitchingModalOpen] = useState(false);
  
  // Curator application detail state
  const [selectedCuratorApp, setSelectedCuratorApp] = useState<CuratorApplication | null>(null);
  const [showCuratorChat, setShowCuratorChat] = useState(false);

  const { data: adminCuratorMessages } = useQuery<Array<{
    id: string;
    applicationId: string;
    senderId: string;
    senderType: "ARTIST" | "CURATOR";
    message: string;
    isRead: boolean;
    createdAt: string;
  }>>({
    queryKey: ["/api/admin/curator-messages", selectedCuratorApp?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/curator-messages/${selectedCuratorApp!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!selectedCuratorApp && showCuratorChat,
  });
  
  // Notification state for new releases
  const [previousReleaseCount, setPreviousReleaseCount] = useState<number>(0);
  const [latestReleaseId, setLatestReleaseId] = useState<string>("");

  // Fetch ALL releases using admin API with real-time updates and pagination
  const { data: adminReleasesData, isLoading: adminReleasesLoading, error: adminReleasesError } = useQuery<{
    releases: AdminRelease[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/admin/releases", audioPage, searchTerm, audioCategoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: audioPage.toString(),
        limit: pageLimit.toString(),
      });
      
      if (searchTerm) params.append('search', searchTerm);
      
      // Map category filter to status or paymentStatus
      if (audioCategoryFilter === 'PAID') {
        params.append('paymentStatus', 'PAID');
      } else if (audioCategoryFilter === 'UNPAID') {
        params.append('paymentStatus', 'PENDING,PROCESSING,FAILED');
      } else if (audioCategoryFilter !== 'all') {
        params.append('status', audioCategoryFilter);
      }
      
      const response = await fetch(`/api/admin/releases?${params}`);
      if (!response.ok) throw new Error('Failed to fetch releases');
      return response.json();
    },
    retry: false,
    enabled: isPlatformAdmin, // Only fetch if user is admin
    refetchInterval: activeTab === "catalog" && contentType === "audio" ? 5000 : false, // Auto-refresh every 5 seconds when on catalog tab
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });
  
  const adminReleases = adminReleasesData?.releases || [];
  const audioTotalPages = adminReleasesData?.totalPages || 1;

  // Fetch ALL music videos using music videos API with pagination
  const { data: adminMusicVideosData, isLoading: adminVideosLoading, error: adminVideosError } = useQuery<{
    videos: AdminMusicVideo[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/music-videos", videoPage, searchTerm, videoCategoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: videoPage.toString(),
        limit: pageLimit.toString(),
      });
      
      if (searchTerm) params.append('search', searchTerm);
      
      // Map category filter to status or paymentStatus
      if (videoCategoryFilter === 'PAID') {
        params.append('paymentStatus', 'PAID');
      } else if (videoCategoryFilter === 'UNPAID') {
        params.append('paymentStatus', 'PENDING,PROCESSING,FAILED');
      } else if (videoCategoryFilter !== 'all') {
        params.append('status', videoCategoryFilter);
      }
      
      const response = await fetch(`/api/music-videos?${params}`);
      if (!response.ok) throw new Error('Failed to fetch music videos');
      return response.json();
    },
    retry: false,
    enabled: isPlatformAdmin && contentType === "video", // Only fetch if user is admin and viewing videos
    refetchInterval: activeTab === "catalog" && contentType === "video" ? 5000 : false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });
  
  const adminMusicVideos = adminMusicVideosData?.videos || [];
  const videoTotalPages = adminMusicVideosData?.totalPages || 1;

  // Fetch admin stats (total counts by status)
  const { data: adminStats } = useQuery<{
    releases: {
      total: number;
      byStatus: Record<string, number>;
      byPaymentStatus: Record<string, number>;
    };
    videos: {
      total: number;
      byStatus: Record<string, number>;
      byPaymentStatus: Record<string, number>;
    };
  }>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const response = await fetch("/api/admin/stats");
      if (!response.ok) throw new Error('Failed to fetch admin stats');
      return response.json();
    },
    retry: false,
    enabled: isPlatformAdmin,
    refetchInterval: activeTab === "catalog" ? 10000 : false, // Refresh every 10 seconds
    refetchOnWindowFocus: true,
  });

  // Fetch ALL pitching submissions
  const { data: pitchingSubmissions = [], isLoading: pitchingLoading } = useQuery<PitchingSubmission[]>({
    queryKey: ["/api/admin/pitching"],
    retry: false,
    enabled: isPlatformAdmin,
    refetchInterval: activeTab === "promo" ? 5000 : false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  // Fetch ALL YouTube Ad campaigns (admin sees all)
  const { data: youtubeAdCampaigns = [], isLoading: youtubeAdsLoading, refetch: refetchYoutubeAds } = useQuery<YouTubeAdCampaign[]>({
    queryKey: ["/api/ads/youtube"],
    retry: false,
    enabled: isPlatformAdmin,
    refetchInterval: activeTab === "promo" ? 5000 : false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  // Fetch curator applications (Playlists deals)
  const { data: curatorApplications = [], isLoading: curatorAppsLoading } = useQuery<CuratorApplication[]>({
    queryKey: ["/api/admin/curator-applications"],
    retry: false,
    enabled: isPlatformAdmin,
    refetchInterval: activeTab === "promo" ? 5000 : false,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
  });

  // Delete YouTube Ad campaign
  const handleDeleteCampaign = async (campaignId: string) => {
    setDeletingCampaignId(campaignId);
    try {
      const response = await fetch(`/api/admin/ads/youtube/${campaignId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete campaign');
      }
      toast({
        title: "Успішно",
        description: "Рекламну кампанію видалено",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ads/youtube"] });
    } catch (error) {
      toast({
        title: "Помилка",
        description: "Не вдалося видалити кампанію",
        variant: "destructive",
      });
    } finally {
      setDeletingCampaignId(null);
    }
  };

  // Handle URL params for opening release or pitching from notifications
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const releaseIdFromUrl = searchParams.get('releaseId');
    const pitchingIdFromUrl = searchParams.get('pitchingId');
    
    if (releaseIdFromUrl) {
      // Switch to catalog tab and open the release modal
      setActiveTab('catalog');
      setSelectedReleaseId(releaseIdFromUrl);
      setIsModalOpen(true);
      
      // Clean up URL params after a short delay to ensure state is set
      setTimeout(() => {
        setLocation('/admin');
      }, 100);
    } else if (pitchingIdFromUrl) {
      // Switch to promo tab
      setActiveTab('promo');
      
      // Wait for pitching submissions to load
      if (!pitchingLoading) {
        // Find the pitching submission by ID
        const pitching = pitchingSubmissions.find(p => p.id === pitchingIdFromUrl);
        if (pitching) {
          setSelectedPitching(pitching);
          setIsPitchingModalOpen(true);
        }
        
        // Clean up URL params after attempting to find pitching
        setTimeout(() => {
          setLocation('/admin');
        }, 100);
      }
    }
  }, [location, setLocation, pitchingSubmissions, pitchingLoading]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setAudioPage(1);
  }, [searchTerm, audioCategoryFilter]);

  useEffect(() => {
    setVideoPage(1);
  }, [searchTerm, videoCategoryFilter]);

  // Calculate counts for filter buttons based on content type
  // Use server-side stats instead of client-side counting
  const audioCategoryCounts = {
    DRAFT: adminStats?.releases.byStatus.DRAFT || 0,
    ACTIVE: adminStats?.releases.byStatus.ACTIVE || 0,
    DELIVERING: adminStats?.releases.byStatus.DELIVERING || 0,
    DELETED: adminStats?.releases.byStatus.DELETED || 0,
    PAID: adminStats?.releases.byPaymentStatus.PAID || 0,
    UNPAID: adminStats?.releases.byPaymentStatus.UNPAID || 0,
  };

  const videoCategoryCounts = {
    DRAFT: adminStats?.videos.byStatus.DRAFT || 0,
    ACTIVE: adminStats?.videos.byStatus.ACTIVE || 0,
    DELETED: adminStats?.videos.byStatus.DELETED || 0,
    PAID: adminStats?.videos.byPaymentStatus.PAID || 0,
    UNPAID: adminStats?.videos.byPaymentStatus.UNPAID || 0,
  };

  // No need for client-side filtering - it's done on the server now
  const sortedReleases = adminReleases; // Already sorted by server (newest first)

  // No need for client-side filtering for videos - it's done on the server now
  const sortedVideos = adminMusicVideos; // Already sorted by server (newest first)

  // Filter and sort pitching submissions
  const filteredPitching = pitchingSubmissions.filter((submission: PitchingSubmission) => {
    const matchesSearch = pitchingSearch === "" || 
      submission.focusTrack.toLowerCase().includes(pitchingSearch.toLowerCase()) ||
      submission.release.artist.name.toLowerCase().includes(pitchingSearch.toLowerCase()) ||
      submission.release.organization.name.toLowerCase().includes(pitchingSearch.toLowerCase()) ||
      (submission.release.upc && submission.release.upc.includes(pitchingSearch));

    const matchesStatus = pitchingStatusFilter === "all" || 
      (pitchingStatusFilter === "SUBMITTED" && submission.status === "SUBMITTED") ||
      (pitchingStatusFilter === "PENDING" && submission.status === "PENDING");

    return matchesSearch && matchesStatus;
  });

  const sortedPitching = [...filteredPitching].sort((a: PitchingSubmission, b: PitchingSubmission) => {
    switch (pitchingSortBy) {
      case "newest":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      default:
        return 0;
    }
  });

  const getStatusLabel = (status: string) => {
    const statusLabels: Record<string, string> = {
      PENDING: "На розгляді",
      SUBMITTED: "Відправлено",
    };
    return statusLabels[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "IN_REVIEW":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "DELIVERING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "DELIVERED":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "TAKEDOWN":
      case "REJECTED":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "DRAFT":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "SUBMITTED":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Notification effect for new releases
  useEffect(() => {
    if (!isPlatformAdmin || !adminReleases.length) return;

    // Initialize on first load
    if (previousReleaseCount === 0) {
      setPreviousReleaseCount(adminReleases.length);
      if (adminReleases.length > 0) {
        setLatestReleaseId(adminReleases[0].id);
      }
      return;
    }

    // Check for new releases
    const currentCount = adminReleases.length;
    if (currentCount > previousReleaseCount) {
      const newReleasesCount = currentCount - previousReleaseCount;
      const latestRelease = adminReleases[0]; // Assuming sorted by newest first
      
      // Show notification only if we have a new release ID
      if (latestRelease.id !== latestReleaseId) {
        toast({
          title: "🎵 Новий реліз надіслано!",
          description: `"${latestRelease.artist.name}" надіслав новий реліз "${latestRelease.title}". Біжи відправляй в дистрибуцію!`,
          duration: 8000, // Show for 8 seconds
        });
        
        setLatestReleaseId(latestRelease.id);
      }
      
      setPreviousReleaseCount(currentCount);
    }
  }, [adminReleases, previousReleaseCount, latestReleaseId, isPlatformAdmin, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-3">
                <AlertCircle className="h-8 w-8 text-destructive" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Access Denied</h3>
                  <p className="text-muted-foreground">
                    You need administrator privileges to access this page.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-destructive rounded-lg flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-destructive-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Admin Panel</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage catalog, releases, and reports
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive" data-testid="badge-admin-only">
                Admin Only
              </Badge>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className={`inline-flex w-auto min-w-full md:grid md:w-full ${isPlatformOwner ? 'md:grid-cols-8' : 'md:grid-cols-5'} gap-1`}>
              <TabsTrigger value="dashboard" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <BarChart3 className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="catalog" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Catalog</span>
              </TabsTrigger>
              <TabsTrigger value="promo" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <Target className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Promo</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <User className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Users</span>
              </TabsTrigger>
              {isPlatformOwner && (
                <TabsTrigger value="finance" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                  <Wallet className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Finance</span>
                </TabsTrigger>
              )}
              {isPlatformOwner && (
                <TabsTrigger value="reports" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                  <BarChart3 className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Reports</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="news" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">News</span>
              </TabsTrigger>
              <TabsTrigger value="academy" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">Academy</span>
              </TabsTrigger>
              {isPlatformOwner && (
                <TabsTrigger value="gifts" className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                  <Gift className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Gifts</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* PLATFORM DASHBOARD */}
          <TabsContent value="dashboard">
            <PlatformDashboard />
          </TabsContent>
          
          <TabsContent value="catalog" className="space-y-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-foreground mb-2">🛠️ Адміністративний каталог</h2>
              <p className="text-sm text-muted-foreground">
                Перегляд та управління всіма {contentType === "audio" ? "релізами" : "музичними відео"} платформи ({contentType === "audio" ? (adminStats?.releases.total || 0) : (adminStats?.videos.total || 0)} {contentType === "audio" ? "релізів" : "відео"} всього)
              </p>
            </div>

            {/* Audio/Video Toggle */}
            <div className="mb-6">
              <ToggleGroup type="single" value={contentType} onValueChange={(value) => value && setContentType(value as "audio" | "video")}>
                <ToggleGroupItem value="audio" aria-label="Audio Releases" className="gap-2">
                  <Music className="h-4 w-4" />
                  Audio Releases
                </ToggleGroupItem>
                <ToggleGroupItem value="video" aria-label="Music Videos" className="gap-2">
                  <Video className="h-4 w-4" />
                  Music Videos
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Category Filter Buttons - Audio */}
            {contentType === "audio" && (
              <div className="mb-6 flex flex-wrap gap-2">
                <Button
                  variant={audioCategoryFilter === "all" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("all")}
                  className="flex items-center gap-2"
                >
                  <span>ALL</span>
                  <Badge variant="secondary" className="ml-1">
                    {adminStats?.releases.total || 0}
                  </Badge>
                </Button>
                <Button
                  variant={audioCategoryFilter === "DRAFT" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("DRAFT")}
                  className="flex items-center gap-2"
                >
                  <span>DRAFT</span>
                  <Badge variant="secondary" className="ml-1">
                    {audioCategoryCounts.DRAFT}
                  </Badge>
                </Button>
                <Button
                  variant={audioCategoryFilter === "ACTIVE" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("ACTIVE")}
                  className="flex items-center gap-2"
                >
                  <span>ACTIVE</span>
                  <Badge variant="secondary" className="ml-1">
                    {audioCategoryCounts.ACTIVE}
                  </Badge>
                </Button>
                <Button
                  variant={audioCategoryFilter === "DELIVERING" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("DELIVERING")}
                  className="flex items-center gap-2"
                >
                  <span>DELIVERING</span>
                  <Badge variant="secondary" className="ml-1">
                    {audioCategoryCounts.DELIVERING}
                  </Badge>
                </Button>
                <Button
                  variant={audioCategoryFilter === "DELETED" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("DELETED")}
                  className="flex items-center gap-2"
                >
                  <span>DELETED</span>
                  <Badge variant="secondary" className="ml-1">
                    {audioCategoryCounts.DELETED}
                  </Badge>
                </Button>
                <Button
                  variant={audioCategoryFilter === "PAID" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("PAID")}
                  className="flex items-center gap-2"
                >
                  <span>PAID</span>
                  <Badge variant="secondary" className="ml-1">
                    {audioCategoryCounts.PAID}
                  </Badge>
                </Button>
                <Button
                  variant={audioCategoryFilter === "UNPAID" ? "default" : "outline"}
                  onClick={() => setAudioCategoryFilter("UNPAID")}
                  className="flex items-center gap-2"
                >
                  <span>UNPAID</span>
                  <Badge variant="secondary" className="ml-1">
                    {audioCategoryCounts.UNPAID}
                  </Badge>
                </Button>
              </div>
            )}

            {/* Category Filter Buttons - Video */}
            {contentType === "video" && (
              <div className="mb-6 flex flex-wrap gap-2">
                <Button
                  variant={videoCategoryFilter === "all" ? "default" : "outline"}
                  onClick={() => setVideoCategoryFilter("all")}
                  className="flex items-center gap-2"
                >
                  <span>ALL</span>
                  <Badge variant="secondary" className="ml-1">
                    {adminStats?.videos.total || 0}
                  </Badge>
                </Button>
                <Button
                  variant={videoCategoryFilter === "DRAFT" ? "default" : "outline"}
                  onClick={() => setVideoCategoryFilter("DRAFT")}
                  className="flex items-center gap-2"
                >
                  <span>DRAFT</span>
                  <Badge variant="secondary" className="ml-1">
                    {videoCategoryCounts.DRAFT}
                  </Badge>
                </Button>
                <Button
                  variant={videoCategoryFilter === "ACTIVE" ? "default" : "outline"}
                  onClick={() => setVideoCategoryFilter("ACTIVE")}
                  className="flex items-center gap-2"
                >
                  <span>ACTIVE</span>
                  <Badge variant="secondary" className="ml-1">
                    {videoCategoryCounts.ACTIVE}
                  </Badge>
                </Button>
                <Button
                  variant={videoCategoryFilter === "DELETED" ? "default" : "outline"}
                  onClick={() => setVideoCategoryFilter("DELETED")}
                  className="flex items-center gap-2"
                >
                  <span>DELETED</span>
                  <Badge variant="secondary" className="ml-1">
                    {videoCategoryCounts.DELETED}
                  </Badge>
                </Button>
                <Button
                  variant={videoCategoryFilter === "PAID" ? "default" : "outline"}
                  onClick={() => setVideoCategoryFilter("PAID")}
                  className="flex items-center gap-2"
                >
                  <span>PAID</span>
                  <Badge variant="secondary" className="ml-1">
                    {videoCategoryCounts.PAID}
                  </Badge>
                </Button>
                <Button
                  variant={videoCategoryFilter === "UNPAID" ? "default" : "outline"}
                  onClick={() => setVideoCategoryFilter("UNPAID")}
                  className="flex items-center gap-2"
                >
                  <span>UNPAID</span>
                  <Badge variant="secondary" className="ml-1">
                    {videoCategoryCounts.UNPAID}
                  </Badge>
                </Button>
              </div>
            )}

            {/* Search and Filters */}
            <div className="mb-6 space-y-4 lg:space-y-0 lg:flex lg:items-center lg:gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Пошук за назвою треку, артистом, організацією або UPC кодом"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-11"
                  data-testid="admin-catalog-search"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]" data-testid="admin-status-filter">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Всі статуси</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="IN_REVIEW">In Review</SelectItem>
                  <SelectItem value="DELIVERING">Delivering</SelectItem>
                  <SelectItem value="DELIVERED">Delivered</SelectItem>
                  <SelectItem value="DELETED">Deleted</SelectItem>
                  <SelectItem value="TAKEDOWN">Takedown</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[200px]" data-testid="admin-sort-filter">
                  <SelectValue placeholder="Сортування" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Спочатку нові</SelectItem>
                  <SelectItem value="oldest">Спочатку старі</SelectItem>
                  <SelectItem value="title">За назвою А-Я</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading state */}
            {(contentType === "audio" ? adminReleasesLoading : adminVideosLoading) && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {/* Results for Audio Releases */}
            {contentType === "audio" && !adminReleasesLoading && (
              <div className="space-y-4">
                {sortedReleases.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Music className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">
                        {adminReleases.length === 0 ? "Немає релізів" : "Немає результатів"}
                      </h3>
                      <p className="text-muted-foreground">
                        {adminReleases.length === 0 
                          ? "Поки що немає релізів в системі" 
                          : "Спробуйте змінити фільтри або пошуковий запит"
                        }
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {/* Table Header */}
                    <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-3 bg-muted/30 rounded-lg font-medium text-sm text-muted-foreground">
                      <div className="col-span-3 flex items-center gap-2">
                        <Music className="h-4 w-4" />
                        Назва треку
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Головний артист
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Організація
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        UPC
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Дати
                      </div>
                      <div className="col-span-1">
                        Статус
                      </div>
                    </div>

                    {/* Release Items */}
                    {sortedReleases.map((release: AdminRelease) => (
                      <Card 
                        key={release.id} 
                        className="hover:bg-muted/30 transition-colors cursor-pointer" 
                        data-testid={`admin-release-card-${release.id}`}
                        onClick={() => {
                          setSelectedReleaseId(release.id);
                          setIsModalOpen(true);
                        }}
                      >
                        <CardContent className="p-4">
                          {/* Desktop Layout */}
                          <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
                            <div className="col-span-3">
                              <div className="flex items-center gap-3">
                                {/* Album Cover Placeholder */}
                                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                                  {release.title.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-medium text-foreground truncate" data-testid={`admin-release-title-${release.id}`}>
                                    {release.title}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {release.primaryGenre} • {release.language}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="col-span-2">
                              <p className="font-medium text-foreground" data-testid={`admin-release-artist-${release.id}`}>{release.performers?.[0]?.name || release.artist.name}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-foreground" data-testid={`admin-release-organization-${release.id}`}>{release.organization.name}</p>
                              <p className="text-xs text-muted-foreground">{release.organization.type}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="font-mono text-sm text-muted-foreground">
                                {release.upc || "—"}
                              </p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-muted-foreground">
                                Публ: {formatDate(release.createdAt)}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Реліз: {release.releaseDate ? formatDate(release.releaseDate) : "—"}
                              </p>
                            </div>
                            <div className="col-span-1">
                              <Badge className={getStatusColor(release.status)} data-testid={`admin-release-status-${release.id}`}>
                                {release.status}
                              </Badge>
                            </div>
                          </div>

                          {/* Mobile Layout */}
                          <div className="lg:hidden space-y-3">
                            <div className="flex items-start gap-3">
                              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                                {release.title.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground">{release.title}</p>
                                <p className="text-sm text-muted-foreground">{release.performers?.[0]?.name || release.artist.name}</p>
                                <p className="text-xs text-muted-foreground">{release.organization.name} ({release.organization.type})</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge className={getStatusColor(release.status)}>
                                    {release.status}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">UPC</p>
                                <p className="font-mono text-xs">{release.upc || "—"}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Публікація</p>
                                <p>{formatDate(release.createdAt)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Реліз</p>
                                <p>{release.releaseDate ? formatDate(release.releaseDate) : "—"}</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pagination for Audio */}
                {sortedReleases.length > 0 && (
                  <div className="mt-8 flex flex-col items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Сторінка {audioPage} з {audioTotalPages} ({adminReleasesData?.total || 0} релізів всього)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAudioPage(Math.max(1, audioPage - 1))}
                        disabled={audioPage === 1}
                      >
                        ← Попередня
                      </Button>
                      
                      {/* Page numbers */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, audioTotalPages) }, (_, i) => {
                          let pageNum;
                          if (audioTotalPages <= 5) {
                            pageNum = i + 1;
                          } else if (audioPage <= 3) {
                            pageNum = i + 1;
                          } else if (audioPage >= audioTotalPages - 2) {
                            pageNum = audioTotalPages - 4 + i;
                          } else {
                            pageNum = audioPage - 2 + i;
                          }
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={audioPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setAudioPage(pageNum)}
                              className="w-10"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAudioPage(Math.min(audioTotalPages, audioPage + 1))}
                        disabled={audioPage === audioTotalPages}
                      >
                        Наступна →
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Results for Music Videos */}
            {contentType === "video" && !adminVideosLoading && (
              <div className="space-y-4">
                {sortedVideos.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Video className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">
                        {adminMusicVideos.length === 0 ? "Немає музичних відео" : "Немає результатів"}
                      </h3>
                      <p className="text-muted-foreground">
                        {adminMusicVideos.length === 0 
                          ? "Поки що немає музичних відео в системі" 
                          : "Спробуйте змінити фільтри або пошуковий запит"
                        }
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {/* Music Video Items */}
                    {sortedVideos.map((video: AdminMusicVideo) => (
                      <Card 
                        key={video.id} 
                        className="hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedVideoId(video.id);
                          setIsVideoModalOpen(true);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Video Icon */}
                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Video className="h-8 w-8 text-white" />
                            </div>
                            
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-lg">{video.title}</h3>
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                  🎬 Video
                                </Badge>
                                <Badge className={getStatusColor(video.status)}>
                                  {video.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">
                                {video.artist.name} • {video.organization.name}
                              </p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div>
                                  <p className="text-muted-foreground">UPC</p>
                                  <p className="font-mono">{video.upc || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">ISRC</p>
                                  <p className="font-mono">{video.isrc || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Жанр</p>
                                  <p>{video.primaryGenre || "—"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Дата релізу</p>
                                  <p>{video.firstReleaseDate ? formatDate(video.firstReleaseDate) : "—"}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Pagination for Video */}
                {sortedVideos.length > 0 && (
                  <div className="mt-8 flex flex-col items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Сторінка {videoPage} з {videoTotalPages} ({adminMusicVideosData?.total || 0} відео всього)
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVideoPage(Math.max(1, videoPage - 1))}
                        disabled={videoPage === 1}
                      >
                        ← Попередня
                      </Button>
                      
                      {/* Page numbers */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, videoTotalPages) }, (_, i) => {
                          let pageNum;
                          if (videoTotalPages <= 5) {
                            pageNum = i + 1;
                          } else if (videoPage <= 3) {
                            pageNum = i + 1;
                          } else if (videoPage >= videoTotalPages - 2) {
                            pageNum = videoTotalPages - 4 + i;
                          } else {
                            pageNum = videoPage - 2 + i;
                          }
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={videoPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setVideoPage(pageNum)}
                              className="w-10"
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVideoPage(Math.min(videoTotalPages, videoPage + 1))}
                        disabled={videoPage === videoTotalPages}
                      >
                        Наступна →
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

          </TabsContent>
          
          <TabsContent value="promo" className="space-y-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-foreground mb-2">🎯 Promo Queue</h2>
              <p className="text-sm text-muted-foreground">
                Заявки на промо-кампанії від користувачів
              </p>
            </div>

            {/* Count Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card 
                className={`cursor-pointer transition-all ${promoTypeFilter === 'all' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setPromoTypeFilter('all')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Всього</p>
                      <p className="text-2xl font-bold">{pitchingSubmissions.length + youtubeAdCampaigns.length}</p>
                    </div>
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-all ${promoTypeFilter === 'pitching' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setPromoTypeFilter('pitching')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pitching</p>
                      <p className="text-2xl font-bold">{pitchingSubmissions.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {pitchingSubmissions.filter(p => p.status === 'PENDING' || p.status === 'SUBMITTED').length} нових
                      </p>
                    </div>
                    <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                      <Target className="w-5 h-5 text-green-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-all ${promoTypeFilter === 'youtube' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setPromoTypeFilter('youtube')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">YouTube Ads</p>
                      <p className="text-2xl font-bold">{youtubeAdCampaigns.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {youtubeAdCampaigns.filter(c => c.status === 'PENDING').length} нових
                      </p>
                    </div>
                    <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
                      <Youtube className="w-5 h-5 text-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card 
                className={`cursor-pointer transition-all ${promoTypeFilter === 'playlists' ? 'ring-2 ring-primary' : 'hover:shadow-md'}`}
                onClick={() => setPromoTypeFilter('playlists')}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Playlists</p>
                      <p className="text-2xl font-bold">{curatorApplications.length}</p>
                      <p className="text-xs text-muted-foreground">
                        {curatorApplications.filter(a => a.status === 'APPROVED' && a.paymentStatus === 'PAID').length} оплачено
                      </p>
                    </div>
                    <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center">
                      <Music className="w-5 h-5 text-purple-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters and Search */}
            <div className="mb-6 space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Пошук за назвою, артистом, організацією..."
                    value={pitchingSearch}
                    onChange={(e) => setPitchingSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={pitchingStatusFilter} onValueChange={setPitchingStatusFilter}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Всі статуси</SelectItem>
                    <SelectItem value="PENDING">Очікує</SelectItem>
                    <SelectItem value="SUBMITTED">Відправлено</SelectItem>
                    <SelectItem value="APPROVED">Схвалено</SelectItem>
                    <SelectItem value="REJECTED">Відхилено</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={pitchingSortBy} onValueChange={setPitchingSortBy}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Сортування" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Спочатку нові</SelectItem>
                    <SelectItem value="oldest">Спочатку старі</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Unified Promo List */}
            {(pitchingLoading || youtubeAdsLoading) ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pitching Submissions */}
                {(promoTypeFilter === 'all' || promoTypeFilter === 'pitching') && sortedPitching.map((submission: PitchingSubmission) => (
                  <Card 
                    key={`pitching-${submission.id}`} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedPitching(submission);
                      setIsPitchingModalOpen(true);
                    }}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-green-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                                <Target className="h-4 w-4 text-green-500" />
                              </div>
                              <Badge variant="outline" className="text-xs">Pitching</Badge>
                              <Badge className={getStatusColor(submission.status)}>
                                {getStatusLabel(submission.status)}
                              </Badge>
                            </div>
                            <h3 className="text-lg font-semibold text-foreground truncate">
                              {submission.release.title}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">
                              {submission.release.artist.name} • {submission.release.organization.name}
                            </p>
                          </div>
                          <div className="text-left sm:text-right text-sm text-muted-foreground flex-shrink-0">
                            <p>{formatDate(submission.createdAt)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 pt-4 border-t">
                          <div className="min-w-0">
                            <p className="text-xs text-muted-foreground mb-1">Фокус трек</p>
                            <p className="text-sm font-medium truncate">{submission.focusTrack}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Бюджет</p>
                            <p className="text-sm font-medium">{submission.budget}</p>
                          </div>
                          {submission.release.upc && (
                            <div className="col-span-2 sm:col-span-1">
                              <p className="text-xs text-muted-foreground mb-1">UPC</p>
                              <p className="text-sm font-mono truncate">{submission.release.upc}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* YouTube Ads Campaigns */}
                {(promoTypeFilter === 'all' || promoTypeFilter === 'youtube') && youtubeAdCampaigns
                  .filter((campaign: YouTubeAdCampaign) => {
                    if (pitchingStatusFilter !== 'all' && campaign.status !== pitchingStatusFilter) return false;
                    if (pitchingSearch) {
                      const search = pitchingSearch.toLowerCase();
                      return campaign.videoUrl.toLowerCase().includes(search) ||
                             campaign.audience?.toLowerCase().includes(search);
                    }
                    return true;
                  })
                  .sort((a: YouTubeAdCampaign, b: YouTubeAdCampaign) => {
                    const dateA = new Date(a.createdAt).getTime();
                    const dateB = new Date(b.createdAt).getTime();
                    return pitchingSortBy === 'newest' ? dateB - dateA : dateA - dateB;
                  })
                  .map((campaign: YouTubeAdCampaign) => (
                  <Card 
                    key={`youtube-${campaign.id}`} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => {
                      setSelectedYouTubeAd(campaign);
                      setIsYouTubeAdModalOpen(true);
                    }}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-red-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                                <Youtube className="h-4 w-4 text-red-500" />
                              </div>
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">YouTube Ads</Badge>
                              <Badge className={
                                campaign.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                                campaign.status === 'APPROVED' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                campaign.status === 'ACTIVE' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                campaign.status === 'COMPLETED' ? 'bg-gray-500/10 text-gray-600 border-gray-500/20' :
                                'bg-red-500/10 text-red-600 border-red-500/20'
                              }>
                                {campaign.status === 'PENDING' ? 'Очікує' :
                                 campaign.status === 'APPROVED' ? 'Схвалено' :
                                 campaign.status === 'ACTIVE' ? 'Активна' :
                                 campaign.status === 'COMPLETED' ? 'Завершена' :
                                 'Відхилено'}
                              </Badge>
                              {campaign.organization && (
                                <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                                  {campaign.organization.name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate" title={campaign.videoUrl}>
                              {campaign.videoUrl}
                            </p>
                          </div>
                          <div className="text-left sm:text-right text-sm text-muted-foreground flex-shrink-0">
                            <p>{formatDate(campaign.createdAt)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-4 border-t">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">Бюджет</p>
                              <p className="text-sm font-medium">${campaign.budget}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">Тривалість</p>
                              <p className="text-sm font-medium">{campaign.duration} днів</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs text-muted-foreground">Країни</p>
                              <p className="text-sm font-medium">{campaign.countries.length} країн</p>
                            </div>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <p className="text-xs text-muted-foreground">Розподіл</p>
                            <p className="text-sm font-medium">In {campaign.inStreamPercent}% / Disc {campaign.discoveryPercent}%</p>
                          </div>
                        </div>

                        {/* Video Thumbnail Preview */}
                        <div className="pt-4 border-t flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                          <img 
                            src={`https://img.youtube.com/vi/${campaign.videoId}/mqdefault.jpg`}
                            alt="Video thumbnail"
                            className="w-24 sm:w-32 h-auto object-cover rounded flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            {campaign.audience && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Аудиторія</p>
                                <p className="text-sm text-foreground line-clamp-2">{campaign.audience}</p>
                              </div>
                            )}
                          </div>
                          <div onClick={(e) => e.stopPropagation()}>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
                                disabled={deletingCampaignId === campaign.id}
                              >
                                {deletingCampaignId === campaign.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Видалити кампанію?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Ви впевнені, що хочете видалити цю рекламну кампанію? Цю дію неможливо буде скасувати.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Скасувати</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-500 hover:bg-red-600"
                                  onClick={() => handleDeleteCampaign(campaign.id)}
                                >
                                  Видалити
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Curator Playlists Applications */}
                {(promoTypeFilter === 'all' || promoTypeFilter === 'playlists') && curatorApplications
                  .filter((app: CuratorApplication) => {
                    if (pitchingStatusFilter !== 'all' && app.status !== pitchingStatusFilter) return false;
                    if (pitchingSearch) {
                      const search = pitchingSearch.toLowerCase();
                      return (app.playlistName?.toLowerCase().includes(search) ||
                              app.trackTitle?.toLowerCase().includes(search) ||
                              app.artistOrgName?.toLowerCase().includes(search) ||
                              app.curatorOrgName?.toLowerCase().includes(search));
                    }
                    return true;
                  })
                  .sort((a: CuratorApplication, b: CuratorApplication) => {
                    const dateA = new Date(a.createdAt).getTime();
                    const dateB = new Date(b.createdAt).getTime();
                    return pitchingSortBy === 'newest' ? dateB - dateA : dateA - dateB;
                  })
                  .map((app: CuratorApplication) => (
                  <Card 
                    key={`playlist-${app.id}`} 
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedCuratorApp(app)}
                  >
                    <CardContent className="p-4 sm:p-6">
                      <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <div className="w-8 h-8 bg-purple-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                                <Music className="h-4 w-4 text-purple-500" />
                              </div>
                              <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/20">Playlist</Badge>
                              <Badge className={
                                app.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                                app.status === 'IN_REVIEW' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                                app.status === 'APPROVED' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                'bg-red-500/10 text-red-600 border-red-500/20'
                              }>
                                {app.status === 'PENDING' ? 'Очікує' :
                                 app.status === 'IN_REVIEW' ? 'На розгляді' :
                                 app.status === 'APPROVED' ? 'Схвалено' :
                                 'Відхилено'}
                              </Badge>
                              {app.paymentStatus === 'PAID' && (
                                <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                                  Оплачено
                                </Badge>
                              )}
                              {app.paymentStatus === 'PENDING' && app.status === 'APPROVED' && (
                                <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">
                                  Очікує оплату
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm font-medium mb-1">{app.trackTitle || 'Трек не знайдено'}</p>
                            <p className="text-xs text-muted-foreground">Плейлист: {app.playlistName || 'Невідомий плейлист'}</p>
                          </div>
                          <div className="text-left sm:text-right text-sm text-muted-foreground flex-shrink-0">
                            <p>{formatDate(app.createdAt)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">Артист</p>
                            <p className="text-sm font-medium truncate" title={app.artistOrgName || 'N/A'}>{app.artistOrgName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Куратор</p>
                            <p className="text-sm font-medium truncate" title={app.curatorOrgName || 'N/A'}>{app.curatorOrgName || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Сума</p>
                            <p className="text-sm font-medium">
                              {app.paidAmount != null && app.paidAmount > 0 
                                ? `${app.paidAmount} ${app.paidCurrency || 'UAH'}` 
                                : app.packagePrice != null && app.packagePrice > 0 
                                  ? `${app.packagePrice} ${app.packageCurrency || 'UAH'} (очікується)`
                                  : 'Безкоштовно'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Дохід платформи</p>
                            <p className="text-sm font-medium text-green-600">
                              {app.paymentStatus === 'PAID' && app.paidAmount != null && app.paidAmount > 0 
                                ? `${app.paidAmount} ${app.paidCurrency || 'UAH'}` 
                                : '—'}
                            </p>
                          </div>
                        </div>

                        {app.spotifyLink && (
                          <div className="pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-1">Spotify</p>
                            <a 
                              href={app.spotifyLink} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm text-primary hover:underline truncate block"
                            >
                              {app.spotifyLink}
                            </a>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Curator Application Detail Dialog */}
                <Dialog open={!!selectedCuratorApp} onOpenChange={(open) => { if (!open) { setSelectedCuratorApp(null); setShowCuratorChat(false); } }}>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
                    <DialogHeader className="sr-only">
                      <DialogTitle>Деталі заявки</DialogTitle>
                    </DialogHeader>
                    {selectedCuratorApp && (
                      <div className="flex flex-col">
                        <div className="relative">
                          {selectedCuratorApp.playlistImageUrl ? (
                            <div className="relative h-32 sm:h-48 overflow-hidden rounded-t-lg">
                              <img src={getProxiedImageUrl(selectedCuratorApp.playlistImageUrl)!} alt={selectedCuratorApp.playlistName} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                            </div>
                          ) : (
                            <div className="h-32 sm:h-48 bg-gradient-to-br from-primary/30 via-purple-600/20 to-pink-600/20 rounded-t-lg" />
                          )}
                          <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6">
                            <div className="flex items-end gap-2 sm:gap-4">
                              {selectedCuratorApp.playlistImageUrl && (
                                <img src={getProxiedImageUrl(selectedCuratorApp.playlistImageUrl)!} alt={selectedCuratorApp.playlistName} className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl object-cover shadow-2xl border-2 border-white/20 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                                  <h2 className="text-base sm:text-xl font-bold text-white truncate">{selectedCuratorApp.playlistName}</h2>
                                  {selectedCuratorApp.applicationCode && (
                                    <Badge className="bg-white/30 text-white border-0 font-mono text-[10px] sm:text-xs backdrop-blur-sm">{selectedCuratorApp.applicationCode}</Badge>
                                  )}
                                </div>
                                <p className="text-white/70 text-xs sm:text-sm">{selectedCuratorApp.organizationName || selectedCuratorApp.artistOrgName}</p>
                                <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-2 flex-wrap">
                                  {selectedCuratorApp.packageName && (
                                    <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs">{selectedCuratorApp.packageName}</Badge>
                                  )}
                                  <Badge className={
                                    selectedCuratorApp.status === 'PENDING' ? 'bg-yellow-500/80 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs' :
                                    selectedCuratorApp.status === 'IN_REVIEW' ? 'bg-blue-500/80 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs' :
                                    selectedCuratorApp.status === 'APPROVED' ? 'bg-green-500/80 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs' :
                                    'bg-red-500/80 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs'
                                  }>
                                    {selectedCuratorApp.status === 'PENDING' ? 'Очікує' :
                                     selectedCuratorApp.status === 'IN_REVIEW' ? 'На розгляді' :
                                     selectedCuratorApp.status === 'APPROVED' ? 'Схвалено' :
                                     'Відхилено'}
                                  </Badge>
                                  {selectedCuratorApp.paymentStatus === 'PAID' && (
                                    <Badge className="bg-green-500/80 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs">Оплачено</Badge>
                                  )}
                                  {selectedCuratorApp.paymentStatus === 'PENDING' && selectedCuratorApp.status === 'APPROVED' && (
                                    <Badge className="bg-orange-500/80 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs">Очікує оплату</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="p-3 sm:p-6 space-y-3 sm:space-y-6">
                          {/* Track Card with Audio Player */}
                          <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4">
                              <div className="p-1 sm:p-1.5 bg-primary/10 rounded-lg">
                                <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                              </div>
                              <h3 className="font-semibold text-xs sm:text-sm">Поданий трек</h3>
                            </div>
                            
                            <div className="flex items-center gap-3 sm:gap-4">
                              {selectedCuratorApp.coverArtworkFileId ? (
                                <img 
                                  src={`/api/files/download/${selectedCuratorApp.coverArtworkFileId}`}
                                  alt="Cover"
                                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl object-cover shadow-lg flex-shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                                  <Music className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm sm:text-base text-foreground truncate">{selectedCuratorApp.trackTitle}</p>
                                {selectedCuratorApp.trackAudioFileId && (
                                  <div className="mt-2 sm:mt-3">
                                    <AudioPlayer 
                                      src={`/api/files/download/${selectedCuratorApp.trackAudioFileId}`}
                                      className="w-full"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Release Date & Proposed Placement Date */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                            {selectedCuratorApp.releaseDate && (
                              <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                  <div className="p-1 sm:p-1.5 bg-blue-500/10 rounded-lg">
                                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                                  </div>
                                  <h3 className="font-semibold text-xs sm:text-sm">Дата релізу</h3>
                                </div>
                                <p className="text-base sm:text-lg font-medium text-foreground">
                                  {format(new Date(selectedCuratorApp.releaseDate), "d MMMM yyyy")}
                                </p>
                              </div>
                            )}

                            {selectedCuratorApp.proposedPlacementDate && (
                              <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                  <div className="p-1 sm:p-1.5 bg-purple-500/10 rounded-lg">
                                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
                                  </div>
                                  <h3 className="font-semibold text-xs sm:text-sm">Бажана дата розміщення</h3>
                                </div>
                                <p className="text-base sm:text-lg font-medium text-foreground">
                                  {format(new Date(selectedCuratorApp.proposedPlacementDate), "d MMMM yyyy")}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Confirmed Placement Date */}
                          {selectedCuratorApp.confirmedPlacementDate && (
                            <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-green-500/30 shadow-sm">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                <div className="p-1 sm:p-1.5 bg-green-500/20 rounded-lg">
                                  <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Підтверджена дата розміщення</h3>
                              </div>
                              <p className="text-lg font-medium text-green-600">
                                {format(new Date(selectedCuratorApp.confirmedPlacementDate), "d MMMM yyyy")}
                              </p>
                            </div>
                          )}

                          {/* Spotify Track URL + Platform Stats in one row */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                            <div className="bg-gradient-to-br from-[#1DB954]/10 to-[#1DB954]/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-[#1DB954]/20 shadow-sm">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                <div className="p-1 sm:p-1.5 bg-[#1DB954]/20 rounded-lg">
                                  <FaSpotify className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1DB954]" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Spotify трек</h3>
                              </div>
                              
                              {selectedCuratorApp.spotifyTrackUrl ? (
                                <a 
                                  href={selectedCuratorApp.spotifyTrackUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-white rounded-xl transition-colors font-medium text-sm w-fit"
                                >
                                  <FaSpotify className="w-5 h-5" />
                                  Відкрити на Spotify
                                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                                </a>
                              ) : (
                                <p className="text-xs sm:text-sm text-muted-foreground">Ще не знайдено</p>
                              )}
                            </div>

                            {selectedCuratorApp.platformStats ? (
                              <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                  <div className="p-1 sm:p-1.5 bg-green-500/10 rounded-lg">
                                    <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                                  </div>
                                  <h3 className="font-semibold text-xs sm:text-sm">
                                    Статистика ({selectedCuratorApp.platformStats.platform})
                                  </h3>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground text-sm">Прослуховування</span>
                                    <span className="font-medium text-foreground">
                                      {selectedCuratorApp.platformStats.streams.toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Період: {selectedCuratorApp.platformStats.period}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                  <div className="p-1 sm:p-1.5 bg-gray-500/10 rounded-lg">
                                    <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                                  </div>
                                  <h3 className="font-semibold text-xs sm:text-sm">Статистика</h3>
                                </div>
                                <p className="text-xs sm:text-sm text-muted-foreground">Немає даних</p>
                              </div>
                            )}
                          </div>

                          {/* Social Links */}
                          {(selectedCuratorApp.spotifyLink || selectedCuratorApp.instagramLink) && (
                            <div className="flex flex-wrap gap-3">
                              {selectedCuratorApp.spotifyLink && (
                                <a 
                                  href={selectedCuratorApp.spotifyLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1DB954]/10 hover:bg-[#1DB954]/20 text-[#1DB954] rounded-xl transition-colors font-medium text-sm"
                                >
                                  <FaSpotify className="w-5 h-5" />
                                  Spotify артиста
                                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                                </a>
                              )}
                              {selectedCuratorApp.instagramLink && (
                                <a 
                                  href={selectedCuratorApp.instagramLink.startsWith('@') 
                                    ? `https://instagram.com/${selectedCuratorApp.instagramLink.slice(1)}`
                                    : selectedCuratorApp.instagramLink
                                  } 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-[#833AB4]/10 via-[#E1306C]/10 to-[#F77737]/10 hover:from-[#833AB4]/20 hover:via-[#E1306C]/20 hover:to-[#F77737]/20 text-[#E1306C] rounded-xl transition-colors font-medium text-sm"
                                >
                                  <Instagram className="w-5 h-5" />
                                  Instagram
                                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Comment Card */}
                          {selectedCuratorApp.comment && (
                            <div className="bg-muted/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                <div className="p-1 sm:p-1.5 bg-blue-500/10 rounded-lg">
                                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Коментар артиста</h3>
                              </div>
                              <p className="text-muted-foreground text-sm leading-relaxed">
                                {selectedCuratorApp.comment}
                              </p>
                            </div>
                          )}

                          {/* Photo Gallery */}
                          {selectedCuratorApp.photos && selectedCuratorApp.photos.length > 0 && (
                            <div>
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                <div className="p-1 sm:p-1.5 bg-purple-500/10 rounded-lg">
                                  <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Фото</h3>
                                <Badge variant="secondary" className="ml-auto">{selectedCuratorApp.photos.length}</Badge>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {selectedCuratorApp.photos.map((photoId, index) => (
                                  <a 
                                    key={index} 
                                    href={`/api/files/download/${photoId}?download=true`}
                                    download
                                    className="relative group"
                                  >
                                    <img 
                                      src={`/api/files/download/${photoId}`}
                                      alt={`Photo ${index + 1}`}
                                      className="w-24 h-24 sm:w-40 sm:h-40 object-cover rounded-lg shadow-sm transition-transform group-hover:scale-105 border border-border/50"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                                      <Download className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Curator Response */}
                          {selectedCuratorApp.curatorResponse && (
                            <div className="bg-blue-500/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-blue-500/20">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                <div className="p-1 sm:p-1.5 bg-blue-500/10 rounded-lg">
                                  <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Відповідь куратора</h3>
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedCuratorApp.curatorResponse}</p>
                            </div>
                          )}

                          {/* Rejection Reason */}
                          {selectedCuratorApp.rejectionReason && (
                            <div className="bg-red-500/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-red-500/20">
                              <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                <div className="p-1 sm:p-1.5 bg-red-500/10 rounded-lg">
                                  <X className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Причина відхилення</h3>
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{selectedCuratorApp.rejectionReason}</p>
                            </div>
                          )}

                          {/* Timeline */}
                          <div className="bg-muted/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/30">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                              <div className="p-1 sm:p-1.5 bg-emerald-500/10 rounded-lg">
                                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                              </div>
                              <h3 className="font-semibold text-xs sm:text-sm">Хронологія</h3>
                            </div>
                            
                            <div className="relative pl-6">
                              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                              
                              <div className="space-y-4">
                                {/* Submitted */}
                                <div className="relative flex items-start gap-3">
                                  <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background shadow-sm" />
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">Подано</p>
                                    <p className="text-muted-foreground text-xs">
                                      {format(new Date(selectedCuratorApp.createdAt), "dd MMM yyyy, HH:mm")}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Artist proposed date */}
                                {selectedCuratorApp.proposedPlacementDate && (
                                  <div className="relative flex items-start gap-3">
                                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-background shadow-sm" />
                                    <div className="flex-1">
                                      <p className="font-medium text-sm">Артист запропонував дату</p>
                                      <p className="text-muted-foreground text-xs">
                                        {format(new Date(selectedCuratorApp.proposedPlacementDate), "dd MMM yyyy")}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Curator proposed alternative date */}
                                {selectedCuratorApp.curatorProposedDate && (
                                  <div className="relative flex items-start gap-3">
                                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-yellow-500 border-4 border-background shadow-sm" />
                                    <div className="flex-1">
                                      <p className="font-medium text-sm text-yellow-600">Куратор запропонував дату</p>
                                      <p className="text-muted-foreground text-xs">
                                        {format(new Date(selectedCuratorApp.curatorProposedDate), "dd MMM yyyy")}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Confirmed placement date */}
                                {selectedCuratorApp.confirmedPlacementDate && (
                                  <div className="relative flex items-start gap-3">
                                    <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-green-500 border-4 border-background shadow-sm" />
                                    <div className="flex-1">
                                      <p className="font-medium text-sm text-green-600">Дату підтверджено</p>
                                      <p className="text-muted-foreground text-xs">
                                        {format(new Date(selectedCuratorApp.confirmedPlacementDate), "dd MMM yyyy")}
                                      </p>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Reviewed/Approved/Rejected */}
                                {selectedCuratorApp.reviewedAt && (
                                  <div className="relative flex items-start gap-3">
                                    <div className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-4 border-background shadow-sm ${
                                      selectedCuratorApp.status === 'APPROVED' ? 'bg-emerald-500' : 
                                      selectedCuratorApp.status === 'REJECTED' ? 'bg-red-500' : 'bg-blue-500'
                                    }`} />
                                    <div className="flex-1">
                                      <p className="font-medium text-sm">
                                        {selectedCuratorApp.status === 'APPROVED' 
                                          ? 'Схвалено'
                                          : selectedCuratorApp.status === 'REJECTED'
                                          ? 'Відхилено'
                                          : 'Розглянуто'}
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        {format(new Date(selectedCuratorApp.reviewedAt), "dd MMM yyyy, HH:mm")}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Payment Info */}
                          <div className="bg-muted/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/30">
                            <div className="flex items-center gap-1.5 sm:gap-2 mb-3">
                              <div className="p-1 sm:p-1.5 bg-emerald-500/10 rounded-lg">
                                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                              </div>
                              <h3 className="font-semibold text-xs sm:text-sm">Оплата</h3>
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Статус</span>
                                <Badge className={
                                  selectedCuratorApp.paymentStatus === 'PAID' ? 'bg-green-500/10 text-green-600 border-green-500/20' :
                                  selectedCuratorApp.paymentStatus === 'PENDING' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' :
                                  'bg-gray-500/10 text-gray-600 border-gray-500/20'
                                }>
                                  {selectedCuratorApp.paymentStatus === 'PAID' ? 'Оплачено' :
                                   selectedCuratorApp.paymentStatus === 'PENDING' ? 'Очікує' :
                                   selectedCuratorApp.paymentStatus || '—'}
                                </Badge>
                              </div>
                              {selectedCuratorApp.paidAmount != null && selectedCuratorApp.paidAmount > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Сума</span>
                                  <span className="font-medium">{selectedCuratorApp.paidAmount} {selectedCuratorApp.paidCurrency || 'UAH'}</span>
                                </div>
                              )}
                              {selectedCuratorApp.packagePrice != null && selectedCuratorApp.packagePrice > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Ціна пакету</span>
                                  <span className="font-medium">{selectedCuratorApp.packagePrice} {selectedCuratorApp.packageCurrency || 'UAH'}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Артист</span>
                                <span className="font-medium">{selectedCuratorApp.artistOrgName || '—'}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Куратор</span>
                                <span className="font-medium">{selectedCuratorApp.curatorOrgName || '—'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Chat Messages Section */}
                          <div className="bg-muted/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/30">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <div className="p-1 sm:p-1.5 bg-purple-500/10 rounded-lg">
                                  <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
                                </div>
                                <h3 className="font-semibold text-xs sm:text-sm">Чат куратор-артист</h3>
                              </div>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="text-xs"
                                onClick={() => setShowCuratorChat(!showCuratorChat)}
                              >
                                {showCuratorChat ? 'Сховати' : 'Показати'}
                              </Button>
                            </div>
                            
                            {showCuratorChat && (
                              <div className="space-y-2 max-h-80 overflow-y-auto">
                                {!adminCuratorMessages || adminCuratorMessages.length === 0 ? (
                                  <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                                    Повідомлень немає
                                  </p>
                                ) : (
                                  adminCuratorMessages.map((msg) => (
                                    <div 
                                      key={msg.id}
                                      className={`flex flex-col gap-0.5 p-2.5 rounded-lg text-sm ${
                                        msg.senderType === 'CURATOR' 
                                          ? 'bg-blue-500/10 border border-blue-500/20 ml-6' 
                                          : 'bg-muted/60 border border-border/50 mr-6'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                          {msg.senderType === 'CURATOR' ? 'Куратор' : 'Артист'}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground">
                                          {format(new Date(msg.createdAt), "dd.MM.yyyy HH:mm")}
                                        </span>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>

                          </div>
                        </div>
                    )}
                  </DialogContent>
                </Dialog>

                {/* Empty state */}
                {sortedPitching.length === 0 && youtubeAdCampaigns.length === 0 && curatorApplications.length === 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-12">
                        <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-foreground mb-2">Немає заявок</h3>
                        <p className="text-muted-foreground">
                          Заявки на промо з'являться тут після їх створення користувачами
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

          </TabsContent>
          
          <TabsContent value="users" className="space-y-6">
            <UsersTab />
          </TabsContent>
          
          {isPlatformOwner && (
            <TabsContent value="finance" className="space-y-6">
              <FinanceTab />
            </TabsContent>
          )}
          
          {isPlatformOwner && (
            <TabsContent value="reports" className="space-y-6">
              <ReportsUploadTab />
            </TabsContent>
          )}

          <TabsContent value="news" className="space-y-6">
            <NewsTab />
          </TabsContent>

          <TabsContent value="academy" className="space-y-6">
            <AcademyTab />
          </TabsContent>

          {isPlatformOwner && (
            <TabsContent value="gifts" className="space-y-6">
              <HolidayGiftsTab />
            </TabsContent>
          )}

        </Tabs>
        
        {/* Release Details Modal */}
        <ReleaseDetailsModal
          releaseId={selectedReleaseId}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedReleaseId(null);
          }}
        />
        
        {/* Music Video Details Modal */}
        <MusicVideoDetailsModal
          videoId={selectedVideoId}
          isOpen={isVideoModalOpen}
          onClose={() => {
            setIsVideoModalOpen(false);
            setSelectedVideoId(null);
          }}
        />
        
        {/* Pitching Details Modal */}
        <PitchingDetailsModal
          submission={selectedPitching}
          isOpen={isPitchingModalOpen}
          onClose={() => {
            setIsPitchingModalOpen(false);
            setSelectedPitching(null);
          }}
        />
        
        {/* YouTube Ads Details Modal */}
        <YouTubeAdsDetailsModal
          campaign={selectedYouTubeAd}
          isOpen={isYouTubeAdModalOpen}
          onClose={() => {
            setIsYouTubeAdModalOpen(false);
            setSelectedYouTubeAd(null);
          }}
        />
      </div>
    </div>
  );
}
