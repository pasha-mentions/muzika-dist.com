import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { getProxiedImageUrl } from "@/lib/utils";
import CuratorChat from "@/components/curator-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Inbox, 
  Music, 
  Users, 
  Calendar, 
  ExternalLink, 
  Check, 
  X, 
  Clock, 
  Eye,
  Instagram,
  MessageSquare,
  Camera,
  Download,
  TrendingUp,
  BarChart3,
  Search,
  MessageCircle,
  Pencil,
  Heart
} from "lucide-react";
import { FaSpotify } from "react-icons/fa";
import { useToast } from "@/hooks/use-toast";
import { PITCHING_REJECTION_REASONS } from "@/lib/constants";
import { format, type Locale } from "date-fns";
import { uk, enUS, pl } from "date-fns/locale";
import { AudioPlayer } from "@/components/ui/audio-player";

const dateLocales: Record<string, Locale> = { uk, en: enUS, pl };

interface PitchingApplication {
  id: string;
  applicationCode: string | null;
  userId: string;
  orgId: string;
  trackId: string;
  playlistId: number;
  packageId: number;
  curatorOrgId: string;
  spotifyLink: string | null;
  instagramLink: string | null;
  comment: string | null;
  photos: string[];
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  curatorResponse: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  paidAmount: number | null;
  paidCurrency: string | null;
  createdAt: string;
  reviewedAt: string | null;
  proposedPlacementDate: string | null;
  curatorProposedDate: string | null;
  confirmedPlacementDate: string | null;
  playlistName: string;
  playlistImageUrl: string | null;
  packageName: string;
  packageIncludesPhoto: boolean;
  trackTitle: string;
  trackAudioFileId: string | null;
  coverArtworkFileId: string | null;
  releaseDate: string | null;
  platformStats: {
    platform: string;
    period: string;
    streams: number;
    revenue: number;
  } | null;
  spotifyTrackUrl: string | null;
  organizationName: string;
  firstChatMessageAt: string | null;
  isPlacementVerified: boolean | null;
  placementVerifiedAt: string | null;
}

const StatusBadge = ({ status, t }: { status: string; t: (key: string) => string }) => {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> {t('curatorApplications.pending')}</Badge>;
    case "IN_REVIEW":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200"><Eye className="w-3 h-3 mr-1" /> {t('curatorApplications.inReview')}</Badge>;
    case "APPROVED":
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200"><Check className="w-3 h-3 mr-1" /> {t('curatorApplications.approved')}</Badge>;
    case "REJECTED":
      return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200"><X className="w-3 h-3 mr-1" /> {t('curatorApplications.rejected')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function CuratorApplications() {
  const { t, i18n } = useTranslation();
  const currentLocale = dateLocales[i18n.language] || dateLocales.en;
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [selectedApplication, setSelectedApplication] = useState<PitchingApplication | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [responseText, setResponseText] = useState("");
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [placementDateAction, setPlacementDateAction] = useState<"accept" | "propose" | null>(null);
  const [proposedNewDate, setProposedNewDate] = useState<string>("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatApplicationId, setChatApplicationId] = useState<string | null>(null);
  const [chatApplicationCode, setChatApplicationCode] = useState<string>("");
  const [chatPlaylistName, setChatPlaylistName] = useState<string>("");
  const [chatArtistName, setChatArtistName] = useState<string>("");
  const [editingConfirmedDate, setEditingConfirmedDate] = useState(false);
  const [newConfirmedDate, setNewConfirmedDate] = useState<string>("");

  const donationQuery = useQuery<any[]>({
    queryKey: ["/api/pitching-applications/donation", selectedApplication?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pitching-applications/${selectedApplication!.id}/donation`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedApplication && selectedApplication.paidAmount === 0,
  });

  const paidDonation = donationQuery.data?.find((d: any) => d.status === 'PAID');

  // Auto-open chat from URL parameter (e.g., from notification click)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const chatAppId = params.get('chatApplicationId');
    if (chatAppId) {
      setChatApplicationId(chatAppId);
      setChatOpen(true);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const { data: applications = [], isLoading } = useQuery<PitchingApplication[]>({
    queryKey: ["/api/pitching-applications", { role: "curator", status: statusFilter !== "all" && statusFilter !== "ARCHIVE" ? statusFilter : undefined, tab: statusFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ role: "curator" });
      if (statusFilter === "ARCHIVE") {
        params.append("status", "APPROVED");
      } else if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const res = await fetch(`/api/pitching-applications?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch applications");
      const data = await res.json();
      if (statusFilter === "ARCHIVE") {
        return data.filter((app: PitchingApplication) => app.isPlacementVerified === true);
      }
      if (statusFilter === "APPROVED") {
        return data.filter((app: PitchingApplication) => !app.isPlacementVerified);
      }
      return data;
    },
    enabled: isAuthenticated,
  });

  // Set missing chat info once applications are loaded (for URL-opened chat)
  useEffect(() => {
    if (chatApplicationId && applications.length > 0 && !chatArtistName) {
      const app = applications.find(a => a.id === chatApplicationId);
      if (app) {
        setChatApplicationCode(app.applicationCode || "");
        setChatPlaylistName(app.playlistName || "");
        setChatArtistName(app.organizationName || "");
      }
    }
  }, [chatApplicationId, applications, chatArtistName]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ applicationId, status, curatorResponse, rejectionReason, confirmedPlacementDate, curatorProposedDate }: { applicationId: string; status: string; curatorResponse?: string; rejectionReason?: string; confirmedPlacementDate?: string; curatorProposedDate?: string }) => {
      const res = await fetch(`/api/pitching-applications/${applicationId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, curatorResponse, rejectionReason, confirmedPlacementDate, curatorProposedDate }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pitching-applications"] });
      setSelectedApplication(null);
      setResponseText("");
      setRejectionReason("");
      setShowRejectDialog(false);
      setPlacementDateAction(null);
      setProposedNewDate("");
      toast({
        title: t("curatorApplications.statusUpdated"),
        description: t("curatorApplications.statusUpdatedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("curatorApplications.error"),
        description: t("curatorApplications.errorDesc"),
        variant: "destructive",
      });
    },
  });

  const updateConfirmedDateMutation = useMutation({
    mutationFn: async ({ applicationId, confirmedPlacementDate }: { applicationId: string; confirmedPlacementDate: string }) => {
      const res = await fetch(`/api/pitching-applications/${applicationId}/confirmed-date`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmedPlacementDate }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update confirmed date");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pitching-applications"] });
      if (selectedApplication) {
        setSelectedApplication({
          ...selectedApplication,
          confirmedPlacementDate: newConfirmedDate,
        });
      }
      setEditingConfirmedDate(false);
      setNewConfirmedDate("");
      toast({
        title: t("curatorApplications.dateUpdated"),
        description: t("curatorApplications.dateUpdatedDesc"),
      });
    },
    onError: () => {
      toast({
        title: t("curatorApplications.error"),
        description: t("curatorApplications.errorUpdatingDate"),
        variant: "destructive",
      });
    },
  });

  const findSpotifyMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`/api/pitching-applications/${applicationId}/find-spotify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to find track on Spotify");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pitching-applications"] });
      if (selectedApplication) {
        setSelectedApplication({
          ...selectedApplication,
          spotifyTrackUrl: data.spotifyTrackUrl
        });
      }
      toast({
        title: t("curatorApplications.spotifyFound"),
        description: t("curatorApplications.spotifyFoundDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("curatorApplications.spotifyNotFound"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (status: string) => {
    if (!selectedApplication) return;
    updateStatusMutation.mutate({
      applicationId: selectedApplication.id,
      status,
      curatorResponse: responseText || undefined,
    });
  };

  const handleApproveWithDate = () => {
    if (!selectedApplication) return;
    
    let confirmedDate: string | undefined;
    let curatorDate: string | undefined;
    
    if (placementDateAction === "accept" && selectedApplication.proposedPlacementDate) {
      confirmedDate = selectedApplication.proposedPlacementDate;
    } else if (placementDateAction === "propose" && proposedNewDate) {
      curatorDate = proposedNewDate;
    }
    
    updateStatusMutation.mutate({
      applicationId: selectedApplication.id,
      status: "APPROVED",
      curatorResponse: responseText || undefined,
      confirmedPlacementDate: confirmedDate,
      curatorProposedDate: curatorDate,
    });
  };

  const getMinDateForPlacement = () => {
    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 3);
    return minDate.toISOString().split('T')[0];
  };

  const handleReject = () => {
    if (!selectedApplication || !rejectionReason) return;
    updateStatusMutation.mutate({
      applicationId: selectedApplication.id,
      status: "REJECTED",
      curatorResponse: responseText || undefined,
      rejectionReason,
    });
  };

  const pendingCount = applications.filter(a => a.status === "PENDING").length;
  const inReviewCount = applications.filter(a => a.status === "IN_REVIEW").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-2.5 bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-xl">
              <Inbox className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t("curatorApplications.title")}</h1>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {applications.length} {t("curatorApplications.totalApplications")}
              </p>
            </div>
          </div>
          
          {pendingCount > 0 && (
            <Badge variant="secondary" className="gap-1 bg-yellow-500/10 text-yellow-600 text-xs sm:text-sm">
              <Clock className="w-3 h-3" />
              {pendingCount}
              <span className="hidden sm:inline">{t("curatorApplications.pending")}</span>
            </Badge>
          )}
        </div>

        <Tabs value={statusFilter} onValueChange={setStatusFilter} className="mb-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-6 gap-1">
              <TabsTrigger value="all" className="whitespace-nowrap px-3">{t("curatorApplications.all")}</TabsTrigger>
              <TabsTrigger value="PENDING" className="whitespace-nowrap px-3 gap-1">
                {t("curatorApplications.pending")}
                {pendingCount > 0 && <Badge variant="secondary" className="ml-1 h-5 px-1.5">{pendingCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="IN_REVIEW" className="whitespace-nowrap px-3">{t("curatorApplications.inReview")}</TabsTrigger>
              <TabsTrigger value="APPROVED" className="whitespace-nowrap px-3">{t("curatorApplications.approved")}</TabsTrigger>
              <TabsTrigger value="REJECTED" className="whitespace-nowrap px-3">{t("curatorApplications.rejected")}</TabsTrigger>
              <TabsTrigger value="ARCHIVE" className="whitespace-nowrap px-3">{t("curatorApplications.archive")}</TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {applications.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-muted rounded-full mb-4">
                <Inbox className="w-12 h-12 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium mb-2">{t("curatorApplications.noApplications")}</h3>
              <p className="text-muted-foreground text-center max-w-sm">
                {t("curatorApplications.noApplicationsDesc")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map((application) => (
              <Card 
                key={application.id} 
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedApplication(application)}
              >
                <CardContent className="p-4 sm:p-4">
                  {/* Mobile Layout */}
                  <div className="sm:hidden">
                    {/* Main content row */}
                    <div className="flex gap-4">
                      {/* Playlist cover */}
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0 shadow-sm">
                        {application.playlistImageUrl ? (
                          <img 
                            src={getProxiedImageUrl(application.playlistImageUrl)!} 
                            alt={application.playlistName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                            <Music className="w-6 h-6 text-purple-400/60" />
                          </div>
                        )}
                      </div>
                      
                      {/* Text content */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-base leading-tight line-clamp-1">{application.trackTitle}</h3>
                          <div className="flex items-center gap-1">
                            <StatusBadge status={application.status} t={t} />
                            {application.status === 'APPROVED' && application.paymentStatus === 'PAID' && (
                              <Badge className="gap-1 bg-green-600/20 text-green-600 border-green-600/30 text-xs px-1.5 py-0">
                                <Check className="w-2.5 h-2.5" />
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">{application.organizationName}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1 truncate">{application.playlistName}</p>
                      </div>
                    </div>
                    
                    {/* Footer row */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/40">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {application.applicationCode && (
                          <span className="font-mono bg-muted/60 px-2 py-1 rounded-md">
                            {application.applicationCode}
                          </span>
                        )}
                        {application.status === 'APPROVED' && application.confirmedPlacementDate ? (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(application.confirmedPlacementDate), "dd.MM.yy", { locale: currentLocale })}
                          </span>
                        ) : (
                          <span>{format(new Date(application.createdAt), "dd.MM.yy", { locale: currentLocale })}</span>
                        )}
                        {application.photos?.length > 0 && (
                          <span className="flex items-center gap-1 text-purple-500">
                            <Camera className="w-3.5 h-3.5" />
                            {application.photos.length}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-base text-foreground">
                        {application.paidAmount?.toLocaleString()} {application.paidCurrency}
                      </span>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex gap-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border">
                      {application.playlistImageUrl ? (
                        <img 
                          src={getProxiedImageUrl(application.playlistImageUrl)!} 
                          alt={application.playlistName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                          <Music className="w-6 h-6 text-purple-400/60" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold truncate">{application.trackTitle}</h3>
                            {application.applicationCode && (
                              <Badge variant="secondary" className="font-mono text-xs">
                                {application.applicationCode}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{application.organizationName}</p>
                        </div>
                        <StatusBadge status={application.status} t={t} />
                        {application.status === 'APPROVED' && application.paymentStatus === 'PAID' && (
                          <Badge className="gap-1 bg-green-600/20 text-green-600 border-green-600/30">
                            <Check className="w-3 h-3" />
                            {t("curatorApplications.paidStatus")}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Music className="w-3.5 h-3.5" />
                          {application.playlistName}
                        </div>
                        {application.status === 'APPROVED' && application.confirmedPlacementDate ? (
                          <div className="flex items-center gap-1 text-emerald-600">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(application.confirmedPlacementDate), "dd MMM yyyy", { locale: currentLocale })}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(application.createdAt), "dd MMM yyyy", { locale: currentLocale })}
                          </div>
                        )}
                        {application.packageIncludesPhoto && (
                          <div className="flex items-center gap-1 text-purple-600">
                            <Camera className="w-3.5 h-3.5" />
                            {t("curatorApplications.withPhoto")}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end justify-between">
                      <div className="text-sm font-medium">
                        {application.paidAmount?.toLocaleString()} {application.paidCurrency}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {application.packageName}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={!!selectedApplication} onOpenChange={(open) => !open && setSelectedApplication(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            <DialogHeader className="sr-only">
              <DialogTitle>{t("curatorApplications.applicationDetails")}</DialogTitle>
            </DialogHeader>
            {selectedApplication && (
              <div className="flex flex-col">
                {/* Hero Header with Playlist Cover */}
                <div className="relative">
                  {selectedApplication.playlistImageUrl ? (
                    <div className="relative h-32 sm:h-48 overflow-hidden">
                      <img 
                        src={getProxiedImageUrl(selectedApplication.playlistImageUrl)!} 
                        alt={selectedApplication.playlistName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                    </div>
                  ) : (
                    <div className="h-32 sm:h-48 bg-gradient-to-br from-primary/30 via-purple-600/20 to-pink-600/20" />
                  )}
                  
                  {/* Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6">
                    <div className="flex items-end gap-2 sm:gap-4">
                      {selectedApplication.playlistImageUrl && (
                        <img 
                          src={getProxiedImageUrl(selectedApplication.playlistImageUrl)!} 
                          alt={selectedApplication.playlistName}
                          className="w-14 h-14 sm:w-20 sm:h-20 rounded-xl object-cover shadow-2xl border-2 border-white/20 flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                          <h2 className="text-base sm:text-xl font-bold text-white truncate">
                            {selectedApplication.playlistName}
                          </h2>
                          {selectedApplication.applicationCode && (
                            <Badge className="bg-white/30 text-white border-0 font-mono text-[10px] sm:text-xs backdrop-blur-sm">
                              {selectedApplication.applicationCode}
                            </Badge>
                          )}
                        </div>
                        <p className="text-white/70 text-xs sm:text-sm">
                          {selectedApplication.organizationName}
                        </p>
                        <div className="flex items-center gap-1.5 sm:gap-2 mt-1 sm:mt-2">
                          <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm text-[10px] sm:text-xs">
                            {selectedApplication.packageName}
                          </Badge>
                          <StatusBadge status={selectedApplication.status} t={t} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-3 sm:p-6 space-y-3 sm:space-y-6">
                  {/* Track Card with Audio Player */}
                  <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-4">
                      <div className="p-1 sm:p-1.5 bg-primary/10 rounded-lg">
                        <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.submittedTrack")}</h3>
                    </div>
                    
                    <div className="flex items-center gap-3 sm:gap-4">
                      {selectedApplication.coverArtworkFileId ? (
                        <img 
                          src={`/api/files/download/${selectedApplication.coverArtworkFileId}`}
                          alt="Cover"
                          className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl object-cover shadow-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                          <Music className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm sm:text-base text-foreground truncate">{selectedApplication.trackTitle}</p>
                        {selectedApplication.trackAudioFileId && (
                          <div className="mt-2 sm:mt-3">
                            <AudioPlayer 
                              src={`/api/files/download/${selectedApplication.trackAudioFileId}`}
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Release Date & Proposed Placement Date */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                    {/* Release Date */}
                    {selectedApplication.releaseDate && (
                      <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <div className="p-1 sm:p-1.5 bg-blue-500/10 rounded-lg">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                          </div>
                          <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.releaseDate")}</h3>
                        </div>
                        <p className="text-base sm:text-lg font-medium text-foreground">
                          {format(new Date(selectedApplication.releaseDate), "d MMMM yyyy", { locale: currentLocale })}
                        </p>
                      </div>
                    )}

                    {/* Proposed Placement Date with Confirmation Options */}
                    {selectedApplication.proposedPlacementDate && (
                      <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <div className="p-1 sm:p-1.5 bg-purple-500/10 rounded-lg">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
                          </div>
                          <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.proposedPlacementDate")}</h3>
                        </div>
                        <p className="text-base sm:text-lg font-medium text-foreground mb-2 sm:mb-3">
                          {format(new Date(selectedApplication.proposedPlacementDate), "d MMMM yyyy", { locale: currentLocale })}
                        </p>
                        
                        {/* Date confirmation options - only show for pending/in_review applications */}
                        {(selectedApplication.status === "PENDING" || selectedApplication.status === "IN_REVIEW") && !selectedApplication.confirmedPlacementDate && (
                          <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                            <div className="flex flex-col gap-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="dateAction"
                                  checked={placementDateAction === "accept"}
                                  onChange={() => {
                                    setPlacementDateAction("accept");
                                    setProposedNewDate("");
                                  }}
                                  className="w-4 h-4 text-primary"
                                />
                                <span className="text-sm">{t("curatorApplications.acceptProposedDate")}</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name="dateAction"
                                  checked={placementDateAction === "propose"}
                                  onChange={() => setPlacementDateAction("propose")}
                                  className="w-4 h-4 text-primary"
                                />
                                <span className="text-sm">{t("curatorApplications.proposeNewDate")}</span>
                              </label>
                            </div>
                            
                            {placementDateAction === "propose" && (
                              <input
                                type="date"
                                value={proposedNewDate}
                                onChange={(e) => setProposedNewDate(e.target.value)}
                                min={getMinDateForPlacement()}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Standalone Confirmed Placement Date section for approved applications */}
                  {selectedApplication.status === 'APPROVED' && (
                    <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-green-500/30 shadow-sm">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        <div className="p-1 sm:p-1.5 bg-green-500/20 rounded-lg">
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                        </div>
                        <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.confirmedPlacementDate")}</h3>
                      </div>
                      
                      {selectedApplication.confirmedPlacementDate ? (
                        <div className="space-y-3">
                          {editingConfirmedDate ? (
                            <div className="space-y-3">
                              <input
                                type="date"
                                value={newConfirmedDate}
                                onChange={(e) => setNewConfirmedDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => updateConfirmedDateMutation.mutate({
                                    applicationId: selectedApplication.id,
                                    confirmedPlacementDate: newConfirmedDate,
                                  })}
                                  disabled={!newConfirmedDate || updateConfirmedDateMutation.isPending}
                                >
                                  {updateConfirmedDateMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4 mr-2" />
                                  )}
                                  {t("curatorApplications.saveDate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingConfirmedDate(false);
                                    setNewConfirmedDate("");
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <p className="text-lg font-medium text-green-600">
                                {format(new Date(selectedApplication.confirmedPlacementDate), "d MMMM yyyy", { locale: currentLocale })}
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 px-2"
                                onClick={() => {
                                  setNewConfirmedDate(selectedApplication.confirmedPlacementDate?.split('T')[0] || "");
                                  setEditingConfirmedDate(true);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {editingConfirmedDate ? (
                            <div className="space-y-3">
                              <input
                                type="date"
                                value={newConfirmedDate}
                                onChange={(e) => setNewConfirmedDate(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm [&::-webkit-calendar-picker-indicator]:invert [&::-webkit-calendar-picker-indicator]:opacity-70"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="flex-1"
                                  onClick={() => updateConfirmedDateMutation.mutate({
                                    applicationId: selectedApplication.id,
                                    confirmedPlacementDate: newConfirmedDate,
                                  })}
                                  disabled={!newConfirmedDate || updateConfirmedDateMutation.isPending}
                                >
                                  {updateConfirmedDateMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <Check className="w-4 h-4 mr-2" />
                                  )}
                                  {t("curatorApplications.saveDate")}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingConfirmedDate(false);
                                    setNewConfirmedDate("");
                                  }}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">{t("curatorApplications.noConfirmedDateYet")}</p>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setNewConfirmedDate("");
                                  setEditingConfirmedDate(true);
                                }}
                              >
                                <Calendar className="w-4 h-4 mr-2" />
                                {t("curatorApplications.setDate")}
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Spotify Track URL + Platform Stats in one row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                    {/* Spotify Track URL - Found by curator */}
                    <div className="bg-gradient-to-br from-[#1DB954]/10 to-[#1DB954]/5 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-[#1DB954]/20 shadow-sm">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        <div className="p-1 sm:p-1.5 bg-[#1DB954]/20 rounded-lg">
                          <FaSpotify className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#1DB954]" />
                        </div>
                        <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.spotifyTrack")}</h3>
                      </div>
                      
                      {selectedApplication.spotifyTrackUrl ? (
                        <a 
                          href={selectedApplication.spotifyTrackUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] text-white rounded-xl transition-colors font-medium text-sm w-fit"
                        >
                          <FaSpotify className="w-5 h-5" />
                          {t("curatorApplications.openOnSpotify")}
                          <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                        </a>
                      ) : (
                        <Button
                          onClick={() => findSpotifyMutation.mutate(selectedApplication.id)}
                          disabled={findSpotifyMutation.isPending}
                          className="bg-[#1DB954] hover:bg-[#1ed760] text-white"
                        >
                          {findSpotifyMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Search className="w-4 h-4 mr-2" />
                          )}
                          {t("curatorApplications.findOnSpotify")}
                        </Button>
                      )}
                    </div>

                    {/* Platform Stats */}
                    {selectedApplication.platformStats ? (
                      <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <div className="p-1 sm:p-1.5 bg-green-500/10 rounded-lg">
                            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                          </div>
                          <h3 className="font-semibold text-xs sm:text-sm">
                            {t("curatorApplications.platformStats")} ({selectedApplication.platformStats.platform})
                          </h3>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground text-sm">{t("curatorApplications.streams")}</span>
                            <span className="font-medium text-foreground">
                              {selectedApplication.platformStats.streams.toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("curatorApplications.period")}: {selectedApplication.platformStats.period}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          <div className="p-1 sm:p-1.5 bg-gray-500/10 rounded-lg">
                            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" />
                          </div>
                          <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.platformStats")}</h3>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">{t("curatorApplications.noStatsAvailable")}</p>
                      </div>
                    )}
                  </div>

                  {/* Social Links */}
                  {(selectedApplication.spotifyLink || selectedApplication.instagramLink) && (
                    <div className="flex flex-wrap gap-3">
                      {selectedApplication.spotifyLink && (
                        <a 
                          href={selectedApplication.spotifyLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2.5 bg-[#1DB954]/10 hover:bg-[#1DB954]/20 text-[#1DB954] rounded-xl transition-colors font-medium text-sm"
                        >
                          <FaSpotify className="w-5 h-5" />
                          {t("curatorApplications.artistSpotify")}
                          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                        </a>
                      )}
                      {selectedApplication.instagramLink && (
                        <a 
                          href={selectedApplication.instagramLink.startsWith('@') 
                            ? `https://instagram.com/${selectedApplication.instagramLink.slice(1)}`
                            : selectedApplication.instagramLink
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
                  {selectedApplication.comment && (
                    <div className="bg-muted/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/50">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        <div className="p-1 sm:p-1.5 bg-blue-500/10 rounded-lg">
                          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                        </div>
                        <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.artistComment")}</h3>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {selectedApplication.comment}
                      </p>
                    </div>
                  )}

                  {/* Photo Gallery - compact thumbnails */}
                  {selectedApplication.photos && selectedApplication.photos.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        <div className="p-1 sm:p-1.5 bg-purple-500/10 rounded-lg">
                          <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500" />
                        </div>
                        <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.photos")}</h3>
                        <Badge variant="secondary" className="ml-auto">{selectedApplication.photos.length}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedApplication.photos.map((photoId, index) => (
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

                  {/* Timeline */}
                  <div className="bg-muted/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-border/30">
                    <div className="flex items-center gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                      <div className="p-1 sm:p-1.5 bg-emerald-500/10 rounded-lg">
                        <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500" />
                      </div>
                      <h3 className="font-semibold text-xs sm:text-sm">{t("curatorApplications.timeline")}</h3>
                    </div>
                    
                    <div className="relative pl-6">
                      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                      
                      <div className="space-y-4">
                        {/* Submitted */}
                        <div className="relative flex items-start gap-3">
                          <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background shadow-sm" />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{t("curatorApplications.submitted")}</p>
                            <p className="text-muted-foreground text-xs">
                              {format(new Date(selectedApplication.createdAt), "dd MMM yyyy, HH:mm", { locale: currentLocale })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Artist proposed date */}
                        {selectedApplication.proposedPlacementDate && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{t("curatorApplications.artistProposedDate")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.proposedPlacementDate), "dd MMM yyyy", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Curator proposed alternative date */}
                        {selectedApplication.curatorProposedDate && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-yellow-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-yellow-600">{t("curatorApplications.curatorProposedDate")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.curatorProposedDate), "dd MMM yyyy", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Chat opened for negotiation */}
                        {selectedApplication.firstChatMessageAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-purple-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-purple-600">{t("curatorApplications.chatOpened")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.firstChatMessageAt), "dd MMM yyyy, HH:mm", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Confirmed placement date */}
                        {selectedApplication.confirmedPlacementDate && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-green-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-green-600">{t("curatorApplications.dateConfirmed")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.confirmedPlacementDate), "dd MMM yyyy", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Reviewed/Approved/Rejected */}
                        {selectedApplication.reviewedAt && (
                          <div className="relative flex items-start gap-3">
                            <div className={`absolute -left-6 top-1 w-4 h-4 rounded-full border-4 border-background shadow-sm ${
                              selectedApplication.status === 'APPROVED' ? 'bg-emerald-500' : 
                              selectedApplication.status === 'REJECTED' ? 'bg-red-500' : 'bg-blue-500'
                            }`} />
                            <div className="flex-1">
                              <p className="font-medium text-sm">
                                {selectedApplication.status === 'APPROVED' 
                                  ? t("curatorApplications.approved")
                                  : selectedApplication.status === 'REJECTED'
                                  ? t("curatorApplications.rejected")
                                  : t("curatorApplications.reviewed")}
                              </p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.reviewedAt), "dd MMM yyyy, HH:mm", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Paid */}
                        {selectedApplication.paymentStatus === 'PAID' && selectedApplication.paidAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-green-600 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-green-600">{t("curatorApplications.paidStatus")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.paidAt), "dd MMM yyyy, HH:mm", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Donation received */}
                        {paidDonation && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-pink-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-xs sm:text-sm text-pink-500">{t("curatorApplications.donationReceived")}</p>
                              <p className="text-muted-foreground text-xs">
                                {paidDonation.amount} UAH
                                {paidDonation.paidAt && ` — ${format(new Date(paidDonation.paidAt), "dd MMM yyyy, HH:mm", { locale: currentLocale })}`}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Placement verified */}
                        {selectedApplication.isPlacementVerified && selectedApplication.placementVerifiedAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-600 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-emerald-600">{t("curatorApplications.placementVerified")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.placementVerifiedAt), "dd MMM yyyy, HH:mm", { locale: currentLocale })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Placement pending - only show if confirmed date has passed but not verified */}
                        {selectedApplication.confirmedPlacementDate && 
                         !selectedApplication.isPlacementVerified && 
                         new Date(selectedApplication.confirmedPlacementDate) < new Date() && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-orange-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-orange-600">{t("curatorApplications.placementPending")}</p>
                              <p className="text-muted-foreground text-xs">
                                {t("curatorApplications.awaitingVerification")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {selectedApplication.status !== "APPROVED" && selectedApplication.status !== "REJECTED" && (
                    <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4 border-t">
                      <div className="space-y-2">
                        <Label className="text-xs sm:text-sm">{t("curatorApplications.response")}</Label>
                        <Textarea
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder={t("curatorApplications.responsePlaceholder")}
                          className="min-h-[60px] sm:min-h-[100px] text-sm"
                        />
                      </div>
                      
                      <div className="flex gap-1.5 sm:gap-2">
                        {selectedApplication.status === "PENDING" && (
                          <Button 
                            variant="outline" 
                            className="flex-1 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
                            onClick={() => handleStatusChange("IN_REVIEW")}
                            disabled={updateStatusMutation.isPending}
                          >
                            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            {t("curatorApplications.markInReview")}
                          </Button>
                        )}
                        <Button 
                          variant="destructive" 
                          className="flex-1 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
                          onClick={() => setShowRejectDialog(true)}
                          disabled={updateStatusMutation.isPending}
                        >
                          <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          {t("curatorApplications.reject")}
                        </Button>
                        <Button 
                          className="flex-1 gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-4"
                          onClick={() => {
                            if (selectedApplication.proposedPlacementDate && !selectedApplication.confirmedPlacementDate) {
                              handleApproveWithDate();
                            } else {
                              handleStatusChange("APPROVED");
                            }
                          }}
                          disabled={updateStatusMutation.isPending || (selectedApplication.proposedPlacementDate && !selectedApplication.confirmedPlacementDate && !placementDateAction) || (placementDateAction === "propose" && !proposedNewDate)}
                        >
                          {updateStatusMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4" />
                          )}
                          {t("curatorApplications.approve")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {selectedApplication.curatorResponse && (
                    <div className="space-y-2 pt-4 border-t">
                      <Label>{t("curatorApplications.yourResponse")}</Label>
                      <div className="p-3 bg-muted/50 rounded-lg text-sm">
                        {selectedApplication.curatorResponse}
                      </div>
                    </div>
                  )}

                  {/* Chat with Artist Button */}
                  <div className="pt-4 border-t">
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => {
                        setChatApplicationId(selectedApplication.id);
                        setChatApplicationCode(selectedApplication.applicationCode || "");
                        setChatPlaylistName(selectedApplication.playlistName || "");
                        setChatArtistName(selectedApplication.organizationName || "");
                        setChatOpen(true);
                      }}
                    >
                      <MessageCircle className="w-4 h-4" />
                      {t("curatorApplications.chatWithArtist")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rejection Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t("curatorApplications.rejectApplication")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("curatorApplications.rejectionReason")}</Label>
                <Select value={rejectionReason} onValueChange={setRejectionReason}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("curatorApplications.selectReason")} />
                  </SelectTrigger>
                  <SelectContent>
                    {PITCHING_REJECTION_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {t(`curatorApplications.reasons.${reason}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("curatorApplications.additionalComment")}</Label>
                <Textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder={t("curatorApplications.commentPlaceholder")}
                  className="min-h-[80px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
                {t("common.cancel")}
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={!rejectionReason || updateStatusMutation.isPending}
              >
                {updateStatusMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <X className="w-4 h-4 mr-2" />
                )}
                {t("curatorApplications.confirmReject")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Curator Chat Dialog */}
        {chatApplicationId && (
          <CuratorChat
            applicationId={chatApplicationId}
            applicationCode={chatApplicationCode}
            playlistName={chatPlaylistName}
            artistName={chatArtistName}
            isCuratorView={true}
            isOpen={chatOpen}
            onClose={() => {
              setChatOpen(false);
              setChatApplicationId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
