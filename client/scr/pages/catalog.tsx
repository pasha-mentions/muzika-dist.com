import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Music, Calendar, Filter, User, Hash, Download, ChevronDown, ChevronUp, Video, Edit } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isUnauthorizedError } from "@/lib/authUtils";
import PaymentButton from "@/components/release/payment-button";
import VideoPaymentButton from "@/components/video/video-payment-button";
import { EditVideoDialog } from "@/components/video/edit-video-dialog";
import { useTranslation } from "react-i18next";
import { getApiEndpoint } from "@/lib/api";
import { GiftMarker } from "@/components/holiday/GiftMarker";
import { getProductPrice, type OrganizationStatus } from "@shared/paymentHelpers";

interface Release {
  id: string;
  title: string;
  upc?: string;
  type: "SINGLE" | "EP" | "ALBUM";
  status: string;
  createdAt: string;
  updatedAt: string;
  originalReleaseDate?: string;
  releaseDate?: string;
  primaryGenre?: string;
  language?: string;
  artworkUrl?: string;
  artworkFileId?: string;
  artworkOriginalName?: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  paymentOrderReference?: string | null;
  performers?: Array<{ name: string; role: string }>;
  tracks?: Array<{ 
    id: string; 
    title: string;
    aiGenerated?: boolean;
    audioFileId?: string;
    audioUrl?: string;
    audioOriginalName?: string;
    tiktokClipStart?: number | null;
    participants?: Array<{
      name: string;
      role: string;
    }>;
  }>;
  artist: {
    name: string;
  };
  orgId?: string;
}

interface MusicVideo {
  id: string;
  title: string;
  upc?: string;
  isrc?: string;
  releaseId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  firstReleaseDate?: string;
  releaseDate?: string;
  primaryGenre?: string;
  secondaryGenre?: string;
  language?: string;
  metadataLanguage?: string;
  artworkUrl?: string;
  artworkFileId?: string;
  artworkOriginalName?: string;
  videoFileId?: string;
  videoUrl?: string;
  videoOriginalName?: string;
  videoFormat?: string;
  videoCodec?: string;
  videoResolution?: string;
  videoSize?: number;
  duration?: number;
  explicit?: boolean;
  aiGenerated?: boolean;
  performers?: Array<{ name: string; role: string }>;
  credits?: Array<{ name: string; role: string }>;
  platforms?: string[];
  territories?: string[];
  pCopyright?: string;
  cCopyright?: string;
  labelName?: string;
  rightsOwner?: string;
  paidAt?: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  paymentOrderReference?: string | null;
  artist: {
    name: string;
  };
  orgId?: string;
}

export default function Catalog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Debounce search input - wait 400ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);


  const [sortBy, setSortBy] = useState("newest");
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set());
  const [contentType, setContentType] = useState<"audio" | "video">("audio");
  const [selectedVideo, setSelectedVideo] = useState<MusicVideo | null>(null);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isEditVideoDialogOpen, setIsEditVideoDialogOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(new Set());
  
  // Pagination state
  const [audioPage, setAudioPage] = useState(1);
  const [videoPage, setVideoPage] = useState(1);

  // Helper to get organization status for pricing based on item's orgId
  const getOrgStatus = (itemOrgId?: string): OrganizationStatus => {
    if (!itemOrgId || !user?.organizations) {
      return (user?.organizations?.[0]?.status || "STANDARD") as OrganizationStatus;
    }
    const org = user.organizations.find(o => o.id === itemOrgId);
    return (org?.status || "STANDARD") as OrganizationStatus;
  };

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

  // Fetch releases using new API with pagination
  const { data: releasesData, isLoading: releasesLoading, error } = useQuery<{
    releases: Release[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/releases", audioPage, searchTerm, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', audioPage.toString());
      params.append('limit', '50');
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await fetch(`/api/releases?${params}`);
      if (!response.ok) throw new Error('Failed to fetch releases');
      return response.json();
    },
    retry: false,
  });

  const releases = releasesData?.releases || [];
  const audioTotalPages = releasesData?.totalPages || 1;

  // Fetch music videos with pagination
  const { data: videosData, isLoading: videosLoading, error: videosError } = useQuery<{
    videos: MusicVideo[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/music-videos", videoPage, searchTerm, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', videoPage.toString());
      params.append('limit', '50');
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      
      const response = await fetch(`/api/music-videos?${params}`);
      if (!response.ok) throw new Error('Failed to fetch videos');
      return response.json();
    },
    retry: false,
  });

  const musicVideos = videosData?.videos || [];
  const videoTotalPages = videosData?.totalPages || 1;

  // Reset page to 1 when filters change
  useEffect(() => {
    setAudioPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    setVideoPage(1);
  }, [searchTerm, statusFilter]);

  if (error && isUnauthorizedError(error as Error)) {
    return null; // Will redirect via useEffect
  }

  if (videosError && isUnauthorizedError(videosError as Error)) {
    return null; // Will redirect via useEffect
  }

  if (isLoading || releasesLoading || videosLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading"/>
      </div>
    );
  }

  // Server-side filtering, client-side sorting for releases
  const sortedReleases = [...releases].sort((a: Release, b: Release) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      case "oldest":
        return new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
      case "title":
        return a.title.localeCompare(b.title);
      case "release-date-asc": {
        if (!a.originalReleaseDate && !b.originalReleaseDate) return 0;
        if (!a.originalReleaseDate) return 1;
        if (!b.originalReleaseDate) return -1;
        return new Date(a.originalReleaseDate).getTime() - new Date(b.originalReleaseDate).getTime();
      }
      case "release-date-desc": {
        if (!a.originalReleaseDate && !b.originalReleaseDate) return 0;
        if (!a.originalReleaseDate) return 1;
        if (!b.originalReleaseDate) return -1;
        return new Date(b.originalReleaseDate).getTime() - new Date(a.originalReleaseDate).getTime();
      }
      default:
        return 0;
    }
  });

  // Server-side filtering, client-side sorting for music videos
  const sortedVideos = [...musicVideos].sort((a: MusicVideo, b: MusicVideo) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      case "oldest":
        return new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
      case "title":
        return a.title.localeCompare(b.title);
      case "release-date-asc": {
        if (!a.firstReleaseDate && !b.firstReleaseDate) return 0;
        if (!a.firstReleaseDate) return 1;
        if (!b.firstReleaseDate) return -1;
        return new Date(a.firstReleaseDate).getTime() - new Date(b.firstReleaseDate).getTime();
      }
      case "release-date-desc": {
        if (!a.firstReleaseDate && !b.firstReleaseDate) return 0;
        if (!a.firstReleaseDate) return 1;
        if (!b.firstReleaseDate) return -1;
        return new Date(b.firstReleaseDate).getTime() - new Date(a.firstReleaseDate).getTime();
      }
      default:
        return 0;
    }
  });

  // Legacy combined items for backward compatibility
  type CatalogItem = (Release & { itemType: "release" }) | (MusicVideo & { itemType: "video" });
  
  const allItems: CatalogItem[] = [
    ...releases.map(r => ({ ...r, itemType: "release" as const })),
    ...musicVideos.map(v => ({ ...v, itemType: "video" as const }))
  ];

  const filteredItems = contentType === "audio" 
    ? sortedReleases.map(r => ({ ...r, itemType: "release" as const }))
    : sortedVideos.map(v => ({ ...v, itemType: "video" as const }));

  const sortedItems = [...filteredItems].sort((a: CatalogItem, b: CatalogItem) => {
    switch (sortBy) {
      case "newest":
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      case "oldest":
        return new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
      case "title":
        return a.title.localeCompare(b.title);
      case "release-date-asc": {
        const aDate = a.itemType === "release" ? a.originalReleaseDate : a.firstReleaseDate;
        const bDate = b.itemType === "release" ? b.originalReleaseDate : b.firstReleaseDate;
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }
      case "release-date-desc": {
        const aDate = a.itemType === "release" ? a.originalReleaseDate : a.firstReleaseDate;
        const bDate = b.itemType === "release" ? b.originalReleaseDate : b.firstReleaseDate;
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      }
      default:
        return 0;
    }
  });

  // Convert seconds to HH:MM:SS format
  const formatPreviewTime = (seconds?: number | null): string => {
    if (!seconds) return "00:00:00";
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "accepted":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "validation":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "deleted":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "draft":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      default:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    }
  };

  const getPaymentStatusColor = (status?: string) => {
    switch (status) {
      case "PAID":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "PROCESSING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "PENDING":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "FAILED":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const getPaymentStatusText = (status?: string) => {
    switch (status) {
      case "PAID":
        return "💰 Оплачено";
      case "PROCESSING":
        return "⏳ В процесі";
      case "PENDING":
        return "⏸️ Не оплачено";
      case "FAILED":
        return "❌ Помилка";
      default:
        return "";
    }
  };

  // Toggle release tracks expansion
  const toggleExpanded = (releaseId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setExpandedReleases(prev => {
      const newSet = new Set(prev);
      if (newSet.has(releaseId)) {
        newSet.delete(releaseId);
      } else {
        newSet.add(releaseId);
      }
      return newSet;
    });
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

  // Extract fileId from Google Drive URL
  const extractFileIdFromUrl = (url?: string): string | null => {
    if (!url) return null;
    
    const patterns = [
      /[?&]id=([^&]+)/,
      /\/d\/([^/?]+)/,
      /\/file\/d\/([^/?]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  };

  // Generate thumbnail URL for video
  const getVideoThumbnail = (video: MusicVideo): string | null => {
    // First try to get video file ID for thumbnail
    const videoFileId = video.videoFileId || extractFileIdFromUrl(video.videoUrl);
    
    if (videoFileId) {
      // Use secure server endpoint for thumbnail (with authentication and access control)
      return getApiEndpoint(`/api/files/thumbnail/${videoFileId}?size=200`);
    }
    
    // Fallback to artwork if video thumbnail not available
    return video.artworkUrl || null;
  };

  // Handle file download with progress
  const handleDownload = async (fileId: string | undefined, url: string | undefined, filename: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }
    
    let actualFileId = fileId;
    
    if (!actualFileId && url) {
      actualFileId = extractFileIdFromUrl(url) || undefined;
    }
    
    if (!actualFileId) {
      toast({
        title: "Помилка завантаження",
        description: "Файл не знайдено",
        variant: "destructive",
      });
      return;
    }

    // Mark file as downloading
    setDownloadingFiles(prev => new Set(prev).add(actualFileId!));
    setDownloadProgress(prev => ({ ...prev, [actualFileId!]: 0 }));

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const downloadUrl = getApiEndpoint(`/api/files/download/${actualFileId}?filename=${encodeURIComponent(filename)}`);

      xhr.open('GET', downloadUrl, true);
      xhr.responseType = 'blob';
      xhr.withCredentials = true;

      // Track download progress
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setDownloadProgress(prev => ({ ...prev, [actualFileId!]: percentComplete }));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const blob = xhr.response;
          const blobUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);

          // Clear progress and downloading state
          setDownloadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(actualFileId!);
            return newSet;
          });
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[actualFileId!];
            return newProgress;
          });

          resolve();
        } else {
          // Clear downloading state on error
          setDownloadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(actualFileId!);
            return newSet;
          });
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[actualFileId!];
            return newProgress;
          });

          toast({
            title: "Помилка завантаження",
            description: xhr.status === 403 ? "Немає доступу до файлу" : "Не вдалося завантажити файл",
            variant: "destructive",
          });
          reject(new Error(`Download failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        // Clear downloading state on error
        setDownloadingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(actualFileId!);
          return newSet;
        });
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[actualFileId!];
          return newProgress;
        });

        console.error('Error downloading file:', xhr.statusText);
        toast({
          title: "Помилка завантаження",
          description: "Не вдалося завантажити файл",
          variant: "destructive",
        });
        reject(new Error('Download failed'));
      };

      xhr.send();
    });
  };

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="mb-8 relative">
          <h1 className="text-2xl font-semibold text-foreground">{t('catalog.title')}</h1>
          <p className="mt-1 text-muted-foreground">
            {t('catalog.description')}
          </p>
          <GiftMarker placementId="catalog-header" className="absolute top-0 right-0" />
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

        {/* Search and Filters */}
        <div className="mb-6 space-y-4 lg:space-y-0 lg:flex lg:items-center lg:gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={t('catalog.searchPlaceholder')}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 h-11"
              data-testid="catalog-search"
            />
          </div>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]" data-testid="status-filter">
              <SelectValue placeholder={t('catalog.statusFilter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('catalog.allStatuses')}</SelectItem>
              <SelectItem value="draft">{t('catalog.draft')}</SelectItem>
              <SelectItem value="accepted">{t('catalog.accepted')}</SelectItem>
              <SelectItem value="validation">{t('catalog.validation')}</SelectItem>
              <SelectItem value="deleted">{t('catalog.deleted')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[250px]" data-testid="sort-filter">
              <SelectValue placeholder={t('catalog.sortBy')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">{t('catalog.newest')}</SelectItem>
              <SelectItem value="oldest">{t('catalog.oldest')}</SelectItem>
              <SelectItem value="title">{t('catalog.byTitle')}</SelectItem>
              <SelectItem value="release-date-asc">{t('catalog.byReleaseDateAsc')}</SelectItem>
              <SelectItem value="release-date-desc">{t('catalog.byReleaseDateDesc')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results - Audio Mode */}
        {contentType === "audio" && (
          <div className="space-y-4">
            {sortedReleases.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Music className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {releases.length === 0 ? t('catalog.noReleases') : t('catalog.noResults')}
                  </h3>
                  <p className="text-muted-foreground">
                    {releases.length === 0 
                      ? t('catalog.createFirstRelease')
                      : t('catalog.changeFilters')
                    }
                  </p>
                  {releases.length === 0 && (
                    <Button 
                      className="mt-4" 
                      onClick={() => window.location.href = "/releases"}
                    >
                      {t('catalog.createNewRelease')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
            <div className="space-y-2">
              {/* Table Header */}
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-3 bg-muted/30 rounded-lg font-medium text-sm text-muted-foreground">
                <div className="col-span-4 flex items-center gap-2">
                  <Music className="h-4 w-4" />
                  {t('catalog.trackTitle')}
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t('catalog.mainArtist')}
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  {t('catalog.upc')}
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {t('catalog.publishDate')}
                </div>
                <div className="col-span-2">
                  {t('catalog.status')}
                </div>
              </div>

              {/* Audio Releases */}
              {sortedReleases.map((release: Release) => (
                <Card 
                  key={release.id} 
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/release/${release.id}`)}
                >
                  <CardContent className="p-4">
                    {/* Desktop Layout */}
                    <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
                      <div className="col-span-4">
                        <div className="flex items-center gap-3">
                          {/* Album Cover */}
                          {release.artworkUrl ? (
                            <img 
                              src={release.artworkUrl} 
                              alt={release.title}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold text-sm">
                              {release.title.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-foreground truncate">
                              {release.title}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {release.primaryGenre} • {release.language}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <p className="font-medium text-foreground">{release.performers?.[0]?.name || release.artist.name}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="font-mono text-sm text-muted-foreground">
                          {release.upc || "—"}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">
                          {release.originalReleaseDate ? formatDate(release.originalReleaseDate) : '—'}
                        </p>
                      </div>
                      <div className="col-span-2 flex flex-wrap gap-2">
                        <Badge className={getStatusColor(release.status)}>
                          {release.status}
                        </Badge>
                        {release.paymentStatus && (
                          <Badge className={getPaymentStatusColor(release.paymentStatus)}>
                            {getPaymentStatusText(release.paymentStatus)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Payment Button (Desktop) */}
                    {release.status === "DRAFT" && release.paymentStatus === "PENDING" && (
                      <div className="hidden lg:block mt-4" onClick={(e) => e.stopPropagation()}>
                        <PaymentButton
                          releaseType={release.type}
                          trackCount={release.tracks?.length || 0}
                          paymentStatus={release.paymentStatus}
                          releaseId={release.id}
                          paymentOrderReference={release.paymentOrderReference}
                          priceUAH={getProductPrice((release.tracks?.length || 0) === 1 ? "SINGLE" : "ALBUM", getOrgStatus(release.orgId))}
                        />
                      </div>
                    )}

                    {/* Tracks Info (Desktop) */}
                    {release.tracks && release.tracks.length > 0 && (
                      <Collapsible 
                        open={expandedReleases.has(release.id)}
                        onOpenChange={() => {}}
                        className="hidden lg:block mt-4 pt-4 border-t"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => toggleExpanded(release.id, e)}
                              className="text-sm font-medium gap-2 hover:bg-muted/50 px-2"
                            >
                              {expandedReleases.has(release.id) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                              {t('catalog.tracks')}: {release.tracks.length}
                            </Button>
                          </CollapsibleTrigger>
                          {(release.artworkFileId || release.artworkUrl) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDownload(release.artworkFileId, release.artworkUrl, release.artworkOriginalName || `${release.title}.jpg`, e)}
                              className="text-xs gap-2"
                            >
                              <Download className="h-3 w-3" />
                              Обкладинка
                            </Button>
                          )}
                        </div>
                        <CollapsibleContent className="space-y-2 mt-3">
                          {release.tracks.map((track: any, index: number) => (
                            <div key={track.id} className="flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">{index + 1}.</span>
                              <span className="flex-1">{track.title}</span>
                              {track.tiktokClipStart && track.tiktokClipStart > 0 && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {formatPreviewTime(track.tiktokClipStart)}
                                </span>
                              )}
                              {track.aiGenerated && (
                                <Badge variant="outline" className="text-xs">
                                  🤖 AI
                                </Badge>
                              )}
                              {(track.audioFileId || track.audioUrl) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => handleDownload(track.audioFileId, track.audioUrl, track.audioOriginalName || `${track.title}.wav`, e)}
                                  className="text-xs gap-1"
                                >
                                  <Download className="h-3 w-3" />
                                  Аудіо
                                </Button>
                              )}
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Mobile Layout */}
                    <div className="lg:hidden space-y-3">
                      <div className="flex items-start gap-3">
                        {release.artworkUrl ? (
                          <img 
                            src={release.artworkUrl} 
                            alt={release.title}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                            {release.title.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{release.title}</p>
                          <p className="text-sm text-muted-foreground">{release.performers?.[0]?.name || release.artist.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge className={getStatusColor(release.status)}>
                              {release.status}
                            </Badge>
                            {release.paymentStatus && (
                              <Badge className={getPaymentStatusColor(release.paymentStatus)}>
                                {getPaymentStatusText(release.paymentStatus)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">{t('catalog.upc')}</p>
                          <p className="font-mono">{release.upc || "—"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t('catalog.publishDate')}</p>
                          <p>
                            {release.originalReleaseDate ? formatDate(release.originalReleaseDate) : '—'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Payment Button (Mobile) */}
                      {release.status === "DRAFT" && release.paymentStatus === "PENDING" && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <PaymentButton
                            releaseType={release.type}
                            trackCount={release.tracks?.length || 0}
                            paymentStatus={release.paymentStatus}
                            releaseId={release.id}
                            paymentOrderReference={release.paymentOrderReference}
                            priceUAH={getProductPrice((release.tracks?.length || 0) === 1 ? "SINGLE" : "ALBUM", getOrgStatus(release.orgId))}
                          />
                        </div>
                      )}

                      {/* Tracks Info (Mobile) */}
                      {release.tracks && release.tracks.length > 0 && (
                        <Collapsible 
                          open={expandedReleases.has(release.id)}
                          onOpenChange={() => {}}
                          className="pt-3 border-t"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <CollapsibleTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => toggleExpanded(release.id, e)}
                                className="text-sm font-medium gap-2 hover:bg-muted/50 px-2"
                              >
                                {expandedReleases.has(release.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                                {t('catalog.tracks')}: {release.tracks.length}
                              </Button>
                            </CollapsibleTrigger>
                            {(release.artworkFileId || release.artworkUrl) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => handleDownload(release.artworkFileId, release.artworkUrl, release.artworkOriginalName || `${release.title}.jpg`, e)}
                                className="text-xs gap-1"
                              >
                                <Download className="h-3 w-3" />
                                Обкладинка
                              </Button>
                            )}
                          </div>
                          <CollapsibleContent className="space-y-2 mt-3">
                            {release.tracks.map((track: any, index: number) => (
                              <div key={track.id} className="flex items-start gap-2 text-sm">
                                <span className="text-muted-foreground mt-0.5">{index + 1}.</span>
                                <div className="flex-1 min-w-0">
                                  <p className="truncate">{track.title}</p>
                                  {track.aiGenerated && (
                                    <Badge variant="outline" className="text-xs mt-1">
                                      🤖 AI
                                    </Badge>
                                  )}
                                </div>
                                {(track.audioFileId || track.audioUrl) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => handleDownload(track.audioFileId, track.audioUrl, track.audioOriginalName || `${track.title}.wav`, e)}
                                    className="text-xs gap-1 flex-shrink-0"
                                  >
                                    <Download className="h-3 w-3" />
                                    Аудіо
                                  </Button>
                                )}
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}
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
                Сторінка {audioPage} з {audioTotalPages} ({releasesData?.total || 0} релізів всього)
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

        {/* Results - Video Mode */}
        {contentType === "video" && (
          <div className="space-y-4">
            {sortedVideos.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Video className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">
                    {musicVideos.length === 0 ? "Немає відео" : t('catalog.noResults')}
                  </h3>
                  <p className="text-muted-foreground">
                    {musicVideos.length === 0 
                      ? "Створіть своє перше музичне відео"
                      : t('catalog.changeFilters')
                    }
                  </p>
                  {musicVideos.length === 0 && (
                    <Button 
                      className="mt-4" 
                      onClick={() => window.location.href = "/new-video"}
                    >
                      Створити відео
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {/* Table Header */}
                <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-4 py-3 bg-muted/30 rounded-lg font-medium text-sm text-muted-foreground">
                  <div className="col-span-4 flex items-center gap-2">
                    <Video className="h-4 w-4" />
                    Назва відео
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Виконавець
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    UPC / ISRC
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Дата релізу
                  </div>
                  <div className="col-span-2">
                    Статус
                  </div>
                </div>

                {/* Video Cards */}
                {sortedVideos.map((video: MusicVideo) => (
                  <Card 
                    key={video.id} 
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedVideo(video);
                      setIsVideoModalOpen(true);
                    }}
                  >
                    <CardContent className="p-4">
                      {/* Desktop Layout */}
                      <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
                        <div className="col-span-4">
                          <div className="flex items-center gap-3">
                            {/* Video Thumbnail */}
                            {getVideoThumbnail(video) ? (
                              <img 
                                src={getVideoThumbnail(video)!} 
                                alt={video.title}
                                className="w-12 h-12 rounded-lg object-cover"
                                onError={(e) => {
                                  // Fallback to artwork if thumbnail fails to load
                                  if (video.artworkUrl && e.currentTarget.src !== video.artworkUrl) {
                                    e.currentTarget.src = video.artworkUrl;
                                  } else {
                                    // Fallback to gradient if artwork also fails
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                  }
                                }}
                              />
                            ) : null}
                            <div className={`w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white ${getVideoThumbnail(video) ? 'hidden' : ''}`}>
                              <Video className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground truncate">
                                {video.title}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {video.primaryGenre} {video.language && `• ${video.language}`}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-2">
                          <p className="font-medium text-foreground">{video.artist.name}</p>
                        </div>
                        <div className="col-span-2">
                          <div className="space-y-1">
                            {video.upc && (
                              <p className="font-mono text-xs text-muted-foreground">{video.upc}</p>
                            )}
                            {video.isrc && (
                              <p className="font-mono text-xs text-muted-foreground">{video.isrc}</p>
                            )}
                            {!video.upc && !video.isrc && <p className="text-sm text-muted-foreground">—</p>}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm text-muted-foreground">
                            {video.firstReleaseDate ? formatDate(video.firstReleaseDate) : '—'}
                          </p>
                        </div>
                        <div className="col-span-2 flex flex-wrap gap-2">
                          <Badge className={getStatusColor(video.status)}>
                            {video.status}
                          </Badge>
                          {video.paymentStatus && (
                            <Badge className={getPaymentStatusColor(video.paymentStatus)}>
                              {getPaymentStatusText(video.paymentStatus)}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Payment Button (Desktop) */}
                      {video.status === "DRAFT" && video.paymentStatus === "PENDING" && (
                        <div className="hidden lg:block mt-4" onClick={(e) => e.stopPropagation()}>
                          <VideoPaymentButton
                            videoId={video.id}
                            paymentStatus={video.paymentStatus}
                            paymentOrderReference={video.paymentOrderReference}
                            priceUAH={getProductPrice("VIDEO", getOrgStatus(video.orgId))}
                          />
                        </div>
                      )}

                      {/* Mobile Layout */}
                      <div className="lg:hidden flex gap-3">
                        {getVideoThumbnail(video) ? (
                          <img 
                            src={getVideoThumbnail(video)!} 
                            alt={video.title}
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            onError={(e) => {
                              // Fallback to artwork if thumbnail fails to load
                              if (video.artworkUrl && e.currentTarget.src !== video.artworkUrl) {
                                e.currentTarget.src = video.artworkUrl;
                              } else {
                                // Fallback to gradient if artwork also fails
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white flex-shrink-0 ${getVideoThumbnail(video) ? 'hidden' : ''}`}>
                          <Video className="h-8 w-8" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground truncate">{video.title}</h3>
                          <p className="text-sm text-muted-foreground truncate">{video.artist.name}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Badge className={getStatusColor(video.status)}>
                              {video.status}
                            </Badge>
                            {video.paymentStatus && (
                              <Badge className={`${getPaymentStatusColor(video.paymentStatus)} text-xs`}>
                                {getPaymentStatusText(video.paymentStatus)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Payment Button (Mobile) */}
                      {video.status === "DRAFT" && video.paymentStatus === "PENDING" && (
                        <div className="lg:hidden mt-3" onClick={(e) => e.stopPropagation()}>
                          <VideoPaymentButton
                            videoId={video.id}
                            paymentStatus={video.paymentStatus}
                            paymentOrderReference={video.paymentOrderReference}
                            priceUAH={getProductPrice("VIDEO", getOrgStatus(video.orgId))}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          
          {/* Pagination for Video */}
          {sortedVideos.length > 0 && (
            <div className="mt-8 flex flex-col items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Сторінка {videoPage} з {videoTotalPages} ({videosData?.total || 0} відео всього)
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
      </div>

      {/* Video Details Modal */}
      <Dialog open={isVideoModalOpen} onOpenChange={setIsVideoModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                {selectedVideo?.title}
              </DialogTitle>
              <Button
                variant="default"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditVideoDialogOpen(true);
                }}
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                Редагувати
              </Button>
            </div>
          </DialogHeader>
          
          {selectedVideo && (
            <div className="space-y-4">
              {/* Video Preview */}
              <div className="flex justify-center">
                {getVideoThumbnail(selectedVideo) ? (
                  <img 
                    src={getVideoThumbnail(selectedVideo)!} 
                    alt={selectedVideo.title}
                    className="w-[35%] aspect-video rounded-lg object-cover"
                    onError={(e) => {
                      // Fallback to artwork if thumbnail fails to load
                      if (selectedVideo.artworkUrl && e.currentTarget.src !== selectedVideo.artworkUrl) {
                        e.currentTarget.src = selectedVideo.artworkUrl;
                      } else {
                        // Fallback to gradient if artwork also fails
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }
                    }}
                  />
                ) : null}
                <div className={`w-[35%] aspect-video bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center ${getVideoThumbnail(selectedVideo) ? 'hidden' : ''}`}>
                  <Video className="h-24 w-24 text-white" />
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="metadata" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="metadata">Метадані</TabsTrigger>
                  <TabsTrigger value="contributors">Учасники</TabsTrigger>
                </TabsList>

                {/* Metadata Tab */}
                <TabsContent value="metadata" className="space-y-6 mt-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Виконавець</p>
                      <p className="font-medium">{selectedVideo.artist.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Статус</p>
                      <Badge className={getStatusColor(selectedVideo.status)}>
                        {selectedVideo.status}
                      </Badge>
                    </div>
                    {selectedVideo.paymentStatus && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Статус оплати</p>
                        <Badge className={getPaymentStatusColor(selectedVideo.paymentStatus)}>
                          {getPaymentStatusText(selectedVideo.paymentStatus)}
                        </Badge>
                      </div>
                    )}
                    {selectedVideo.explicit !== null && selectedVideo.explicit !== undefined && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Explicit</p>
                        <p className="text-sm">{selectedVideo.explicit ? "Так" : "Ні"}</p>
                      </div>
                    )}
                    {selectedVideo.aiGenerated !== null && selectedVideo.aiGenerated !== undefined && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Створений ШІ 🤖</p>
                        <p className="text-sm">{selectedVideo.aiGenerated ? "Так" : "Ні"}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Identifiers */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Ідентифікатори</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedVideo.upc && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">UPC</p>
                          <p className="font-mono text-sm">{selectedVideo.upc}</p>
                        </div>
                      )}
                      {selectedVideo.isrc && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">ISRC</p>
                          <p className="font-mono text-sm">{selectedVideo.isrc}</p>
                        </div>
                      )}
                      {selectedVideo.releaseId && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Release ID</p>
                          <p className="font-mono text-xs text-muted-foreground">{selectedVideo.releaseId}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Metadata */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Жанри та мови</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {selectedVideo.primaryGenre && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Основний жанр</p>
                          <p className="text-sm">{selectedVideo.primaryGenre}</p>
                        </div>
                      )}
                      {selectedVideo.secondaryGenre && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Другорядний жанр</p>
                          <p className="text-sm">{selectedVideo.secondaryGenre}</p>
                        </div>
                      )}
                      {selectedVideo.language && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Мова контенту</p>
                          <p className="text-sm">{selectedVideo.language}</p>
                        </div>
                      )}
                      {selectedVideo.metadataLanguage && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Мова метаданих</p>
                          <p className="text-sm">{selectedVideo.metadataLanguage}</p>
                        </div>
                      )}
                      {selectedVideo.firstReleaseDate && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Оригінальна дата релізу</p>
                          <p className="text-sm">{formatDate(selectedVideo.firstReleaseDate)}</p>
                        </div>
                      )}
                      {selectedVideo.releaseDate && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Дата публікації</p>
                          <p className="text-sm">{formatDate(selectedVideo.releaseDate)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Technical Details */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Технічні деталі</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {selectedVideo.videoFormat && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Формат</p>
                          <p className="text-sm">{selectedVideo.videoFormat}</p>
                        </div>
                      )}
                      {selectedVideo.videoCodec && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Кодек</p>
                          <p className="text-sm">{selectedVideo.videoCodec}</p>
                        </div>
                      )}
                      {selectedVideo.videoResolution && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Роздільна здатність</p>
                          <p className="text-sm">{selectedVideo.videoResolution}</p>
                        </div>
                      )}
                      {selectedVideo.duration && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Тривалість</p>
                          <p className="text-sm">{Math.floor(selectedVideo.duration / 60)}:{String(selectedVideo.duration % 60).padStart(2, '0')}</p>
                        </div>
                      )}
                      {selectedVideo.videoSize && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Розмір файлу</p>
                          <p className="text-sm">{(selectedVideo.videoSize / 1024 / 1024).toFixed(2)} MB</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Performers */}
                  {selectedVideo.performers && Array.isArray(selectedVideo.performers) && selectedVideo.performers.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-semibold">Виконавці</h3>
                      <div className="space-y-2">
                        {selectedVideo.performers.map((performer: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{performer.name}</span>
                            <span className="text-muted-foreground">—</span>
                            <span className="text-muted-foreground">{performer.role}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Distribution */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Дистрибуція</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedVideo.platforms && selectedVideo.platforms.length > 0 && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Платформи</p>
                          <div className="flex flex-wrap gap-1">
                            {selectedVideo.platforms.map((platform: string) => (
                              <Badge key={platform} variant="outline" className="text-xs">
                                {platform}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedVideo.territories && selectedVideo.territories.length > 0 && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">Території ({selectedVideo.territories.length})</p>
                          <p className="text-xs text-muted-foreground">
                            {selectedVideo.territories.length === 249 ? "Весь світ" : `${selectedVideo.territories.slice(0, 5).join(", ")}${selectedVideo.territories.length > 5 ? ` +${selectedVideo.territories.length - 5}` : ""}`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Copyright & Rights */}
                  {(selectedVideo.pCopyright || selectedVideo.cCopyright || selectedVideo.labelName || selectedVideo.rightsOwner) && (
                    <div className="space-y-3">
                      <h3 className="font-semibold">Авторські права</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedVideo.pCopyright && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">℗ Copyright</p>
                            <p className="text-sm">{selectedVideo.pCopyright}</p>
                          </div>
                        )}
                        {selectedVideo.cCopyright && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">© Copyright</p>
                            <p className="text-sm">{selectedVideo.cCopyright}</p>
                          </div>
                        )}
                        {selectedVideo.labelName && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Лейбл</p>
                            <p className="text-sm">{selectedVideo.labelName}</p>
                          </div>
                        )}
                        {selectedVideo.rightsOwner && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-1">Власник прав</p>
                            <p className="text-sm">{selectedVideo.rightsOwner}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Dates */}
                  <div className="space-y-3">
                    <h3 className="font-semibold">Дати</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">Створено</p>
                        <p className="text-sm">{formatDate(selectedVideo.createdAt)}</p>
                      </div>
                      {selectedVideo.updatedAt && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Оновлено</p>
                          <p className="text-sm">{formatDate(selectedVideo.updatedAt)}</p>
                        </div>
                      )}
                      {selectedVideo.paidAt && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Оплачено</p>
                          <p className="text-sm">{formatDate(selectedVideo.paidAt)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Contributors Tab */}
                <TabsContent value="contributors" className="space-y-6 mt-4">
                  {selectedVideo.credits && Array.isArray(selectedVideo.credits) && selectedVideo.credits.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="font-semibold">Всі учасники</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedVideo.credits.map((credit: any, index: number) => (
                          <div key={index} className="flex items-start gap-2 text-sm p-3 rounded-lg bg-muted/30">
                            <span className="text-muted-foreground min-w-[140px] font-medium">{credit.role}:</span>
                            <span className="font-medium">{credit.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <User className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Немає інформації про учасників</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
              
              {/* Download Buttons */}
              <div className="flex gap-2 flex-wrap pt-4 border-t">
                {(selectedVideo.artworkFileId || selectedVideo.artworkUrl) && (() => {
                  const artworkId = selectedVideo.artworkFileId || extractFileIdFromUrl(selectedVideo.artworkUrl) || '';
                  const isDownloading = !!artworkId && downloadingFiles.has(artworkId);
                  const progress = artworkId ? downloadProgress[artworkId] || 0 : 0;
                  
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(
                          selectedVideo.artworkFileId, 
                          selectedVideo.artworkUrl, 
                          selectedVideo.artworkOriginalName || `${selectedVideo.title}-artwork.jpg`
                        );
                      }}
                      disabled={isDownloading}
                      className="gap-2 min-w-[180px]"
                    >
                      {isDownloading ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                          {progress > 0 ? `${progress}%` : 'Підготовка...'}
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Завантажити обкладинку
                        </>
                      )}
                    </Button>
                  );
                })()}
                {(selectedVideo.videoFileId || selectedVideo.videoUrl) && (() => {
                  const videoId = selectedVideo.videoFileId || extractFileIdFromUrl(selectedVideo.videoUrl) || '';
                  const isDownloading = !!videoId && downloadingFiles.has(videoId);
                  const progress = videoId ? downloadProgress[videoId] || 0 : 0;
                  
                  return (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(
                          selectedVideo.videoFileId, 
                          selectedVideo.videoUrl, 
                          selectedVideo.videoOriginalName || `${selectedVideo.title}.mp4`
                        );
                      }}
                      disabled={isDownloading}
                      className="gap-2 min-w-[180px]"
                    >
                      {isDownloading ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                          {progress > 0 ? `${progress}%` : 'Підготовка...'}
                        </>
                      ) : (
                        <>
                          <Download className="h-4 w-4" />
                          Завантажити відео
                        </>
                      )}
                    </Button>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Video Dialog */}
      {selectedVideo && (
        <EditVideoDialog
          open={isEditVideoDialogOpen}
          onOpenChange={setIsEditVideoDialogOpen}
          video={selectedVideo}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/music-videos'] });
            setIsEditVideoDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}
