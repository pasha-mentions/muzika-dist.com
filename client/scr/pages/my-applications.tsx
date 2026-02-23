import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getProxiedImageUrl } from "@/lib/utils";
import CuratorChat from "@/components/curator-chat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Loader2, 
  Music, 
  Calendar, 
  ExternalLink, 
  Check, 
  X, 
  Clock, 
  Eye,
  Instagram,
  MessageSquare,
  MessageCircle,
  CreditCard,
  AlertCircle,
  ListMusic,
  ArrowLeft,
  Heart,
} from "lucide-react";
import { FaSpotify } from "react-icons/fa";
import { AudioPlayer } from "@/components/ui/audio-player";
import { format } from "date-fns";
import WayforpayWidget from "@/components/payment/WayforpayWidget";
import { uk, pl } from "date-fns/locale";
import { useLocation } from "wouter";

interface MyApplication {
  id: string;
  applicationCode: string | null;
  trackId: string;
  playlistId: number;
  packageId: number;
  spotifyLink: string | null;
  instagramLink: string | null;
  comment: string | null;
  photos: string[];
  status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  curatorResponse: string | null;
  rejectionReason: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  paidAmount: number | null;
  paidCurrency: string | null;
  createdAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  proposedPlacementDate: string | null;
  curatorProposedDate: string | null;
  confirmedPlacementDate: string | null;
  firstChatMessageAt: string | null;
  isPlacementVerified: boolean | null;
  placementVerifiedAt: string | null;
  playlistName: string;
  playlistImageUrl: string | null;
  packageName: string;
  packageIncludesPhoto: boolean;
  trackTitle: string;
  trackAudioFileId: string | null;
  coverArtworkFileId: string | null;
  curatorName: string;
}

const StatusBadge = ({ status, t }: { status: string; t: (key: string) => string }) => {
  switch (status) {
    case "PENDING":
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-200"><Clock className="w-3 h-3 mr-1" /> {t('myApplications.pending')}</Badge>;
    case "IN_REVIEW":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200"><Eye className="w-3 h-3 mr-1" /> {t('myApplications.inReview')}</Badge>;
    case "APPROVED":
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200"><Check className="w-3 h-3 mr-1" /> {t('myApplications.approved')}</Badge>;
    case "REJECTED":
      return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200"><X className="w-3 h-3 mr-1" /> {t('myApplications.rejected')}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function MyApplications() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  const [selectedApplication, setSelectedApplication] = useState<MyApplication | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatApplicationId, setChatApplicationId] = useState<string | null>(null);
  const [chatApplicationCode, setChatApplicationCode] = useState<string>("");
  const [chatPlaylistName, setChatPlaylistName] = useState<string>("");
  const [donationAmount, setDonationAmount] = useState<string>("");
  const [isDonationProcessing, setIsDonationProcessing] = useState(false);

  const getDateLocale = () => {
    switch (i18n.language) {
      case 'uk': return uk;
      case 'pl': return pl;
      default: return undefined;
    }
  };

  const queryClient = useQueryClient();

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
  
  const { data: applications = [], isLoading } = useQuery<MyApplication[]>({
    queryKey: ["/api/pitching-applications", { role: "artist", status: statusFilter !== "all" ? statusFilter : undefined }],
    queryFn: async () => {
      const params = new URLSearchParams({ role: "artist" });
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      const res = await fetch(`/api/pitching-applications?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch applications");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const acceptDateMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`/api/pitching-applications/${applicationId}/accept-date`, {
        method: "PUT",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to accept date");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pitching-applications"] });
      toast({
        title: t("myApplications.dateAcceptedTitle"),
        description: t("myApplications.dateAcceptedDescription"),
      });
      setSelectedApplication(null);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("myApplications.error"),
        description: t("myApplications.dateAcceptError"),
      });
    },
  });

  const donationQuery = useQuery<any[]>({
    queryKey: ["/api/pitching-applications/donation", selectedApplication?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pitching-applications/${selectedApplication!.id}/donation`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedApplication && selectedApplication.status === "APPROVED" && selectedApplication.paidAmount === 0,
  });

  const hasPaidDonation = donationQuery.data?.some((d: any) => d.status === 'PAID') ?? false;

  const handleDonationPayment = async () => {
    if (!selectedApplication) return;
    const amount = parseInt(donationAmount);
    if (!amount || amount < 10) {
      toast({
        variant: "destructive",
        title: t("myApplications.donation.error"),
        description: t("myApplications.donation.minAmount"),
      });
      return;
    }
    if (amount > 50000) {
      toast({
        variant: "destructive",
        title: t("myApplications.donation.error"),
        description: t("myApplications.donation.maxAmount"),
      });
      return;
    }

    setIsDonationProcessing(true);
    try {
      const res = await fetch(`/api/pitching-applications/${selectedApplication.id}/donation-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create donation payment");
      }

      const paymentData = await res.json();

      if (!window.Wayforpay) {
        throw new Error("Payment widget not loaded");
      }

      const wayforpay = new window.Wayforpay();
      setSelectedApplication(null);
      
      wayforpay.run(
        {
          merchantAccount: paymentData.merchantAccount,
          merchantDomainName: paymentData.merchantDomainName,
          authorizationType: "SimpleSignature",
          merchantSignature: paymentData.merchantSignature,
          orderReference: paymentData.orderReference,
          orderDate: paymentData.orderDate,
          amount: paymentData.amount,
          currency: paymentData.currency,
          productName: paymentData.productName,
          productPrice: paymentData.productPrice,
          productCount: paymentData.productCount,
          clientFirstName: paymentData.clientFirstName,
          clientLastName: paymentData.clientLastName,
          clientEmail: paymentData.clientEmail,
          clientPhone: paymentData.clientPhone,
          language: paymentData.language,
          serviceUrl: paymentData.serviceUrl,
        },
        () => {
          wayforpay.closeit();
          toast({
            title: t("myApplications.donation.successTitle"),
            description: t("myApplications.donation.successDescription"),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/pitching-applications"] });
          setIsDonationProcessing(false);
          setDonationAmount("");
        },
        () => {
          wayforpay.closeit();
          toast({
            variant: "destructive",
            title: t("myApplications.donation.error"),
            description: t("myApplications.donation.declined"),
          });
          setIsDonationProcessing(false);
        },
        () => {
          wayforpay.closeit();
          setIsDonationProcessing(false);
        }
      );
    } catch (error) {
      console.error("Donation payment error:", error);
      toast({
        variant: "destructive",
        title: t("myApplications.donation.error"),
        description: error instanceof Error ? error.message : t("myApplications.donation.failed"),
      });
      setIsDonationProcessing(false);
    }
  };

  const pendingCount = applications.filter(a => a.status === "PENDING").length;
  const inReviewCount = applications.filter(a => a.status === "IN_REVIEW").length;
  const approvedCount = applications.filter(a => a.status === "APPROVED").length;
  const rejectedCount = applications.filter(a => a.status === "REJECTED").length;

  const approvedUnpaid = applications.filter(a => a.status === "APPROVED" && a.paymentStatus !== "PAID");

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
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/playlists')}
              className="mr-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="p-2.5 bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-xl">
              <ListMusic className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t("myApplications.title")}</h1>
              <p className="text-muted-foreground text-sm">
                {applications.length} {t("myApplications.totalApplications")}
              </p>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {approvedUnpaid.length > 0 && (
          <Card className="mb-6 border-green-500/20 bg-green-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-green-700 dark:text-green-400">
                    {t("myApplications.approvedApplications", { count: approvedUnpaid.length })}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("myApplications.readyToPay")}
                  </p>
                </div>
                <Button onClick={() => setStatusFilter("APPROVED")}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {t("myApplications.viewApproved")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Filters */}
        <div className="mb-6">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">{t("myApplications.all")}</TabsTrigger>
              <TabsTrigger value="PENDING" className="gap-1">
                {t("myApplications.pending")}
                {pendingCount > 0 && <Badge variant="secondary" className="ml-1">{pendingCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="IN_REVIEW" className="gap-1">
                {t("myApplications.inReview")}
                {inReviewCount > 0 && <Badge variant="secondary" className="ml-1">{inReviewCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="APPROVED" className="gap-1">
                {t("myApplications.approved")}
                {approvedCount > 0 && <Badge variant="secondary" className="ml-1">{approvedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="REJECTED" className="gap-1">
                {t("myApplications.rejected")}
                {rejectedCount > 0 && <Badge variant="secondary" className="ml-1">{rejectedCount}</Badge>}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Applications List */}
        {applications.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ListMusic className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">{t("myApplications.noApplications")}</h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {t("myApplications.noApplicationsDesc")}
              </p>
              <Button onClick={() => navigate("/playlists")}>
                {t("myApplications.browsePlaylists")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {applications.map((application) => (
              <Card 
                key={application.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setSelectedApplication(application)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {application.playlistImageUrl ? (
                      <img 
                        src={getProxiedImageUrl(application.playlistImageUrl)!} 
                        alt={application.playlistName}
                        className="w-16 h-16 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center">
                        <Music className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{application.playlistName}</h3>
                        <StatusBadge status={application.status} t={t} />
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {t("myApplications.track")}: {application.trackTitle}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        {application.applicationCode && (
                          <Badge variant="secondary" className="font-mono text-xs">
                            {application.applicationCode}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(application.createdAt), "PP", { locale: getDateLocale() })}
                        </div>
                        <Badge variant="outline">{application.packageName}</Badge>
                        {application.paidAmount && (
                          <span className="font-medium">
                            {application.paidAmount} {application.paidCurrency}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      {application.status === "APPROVED" && application.paymentStatus === "PAID" && (
                        <Badge className="gap-1 bg-green-600/20 text-green-600 border-green-600/30">
                          <Check className="w-3 h-3" />
                          {t("myApplications.paidStatus")}
                        </Badge>
                      )}
                      {application.status === "APPROVED" && application.paymentStatus !== "PAID" && (
                        <Badge className="gap-1 bg-green-500/20 text-green-700 border-green-500/30">
                          <CreditCard className="w-3 h-3" />
                          {t("myApplications.readyForPayment")}
                        </Badge>
                      )}
                      {application.status === "REJECTED" && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {t("myApplications.rejected")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Application Details Dialog */}
        <Dialog open={!!selectedApplication} onOpenChange={() => setSelectedApplication(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
            {selectedApplication && (
              <div className="flex flex-col">
                {/* Hero Header with Playlist Cover */}
                <div className="relative">
                  {selectedApplication.playlistImageUrl ? (
                    <div className="relative h-48 overflow-hidden">
                      <img 
                        src={getProxiedImageUrl(selectedApplication.playlistImageUrl)!} 
                        alt={selectedApplication.playlistName}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                    </div>
                  ) : (
                    <div className="h-48 bg-gradient-to-br from-primary/30 via-purple-600/20 to-pink-600/20" />
                  )}
                  
                  {/* Playlist Info Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <div className="flex items-end gap-4">
                      {selectedApplication.playlistImageUrl && (
                        <img 
                          src={getProxiedImageUrl(selectedApplication.playlistImageUrl)!} 
                          alt={selectedApplication.playlistName}
                          className="w-20 h-20 rounded-xl object-cover shadow-2xl border-2 border-white/20 flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h2 className="text-xl font-bold text-white truncate">
                            {selectedApplication.playlistName}
                          </h2>
                          {selectedApplication.applicationCode && (
                            <Badge className="bg-white/30 text-white border-0 font-mono text-xs backdrop-blur-sm">
                              {selectedApplication.applicationCode}
                            </Badge>
                          )}
                        </div>
                        <p className="text-white/70 text-sm">
                          {t("myApplications.curatedBy")}: {selectedApplication.curatorName}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge className="bg-white/20 text-white border-0 backdrop-blur-sm">
                            {selectedApplication.packageName}
                          </Badge>
                          <StatusBadge status={selectedApplication.status} t={t} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                  {/* Track Card */}
                  <div className="bg-gradient-to-br from-muted/80 to-muted/40 rounded-2xl p-4 border border-border/50 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-primary/10 rounded-lg">
                        <Music className="w-4 h-4 text-primary" />
                      </div>
                      <h3 className="font-semibold text-sm">{t("myApplications.submittedTrack")}</h3>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      {selectedApplication.coverArtworkFileId ? (
                        <img 
                          src={`/api/files/download/${selectedApplication.coverArtworkFileId}`}
                          alt="Cover"
                          className="w-16 h-16 rounded-xl object-cover shadow-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                          <Music className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{selectedApplication.trackTitle}</p>
                        {selectedApplication.trackAudioFileId && (
                          <div className="mt-3">
                            <AudioPlayer 
                              src={`/api/files/download/${selectedApplication.trackAudioFileId}`}
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                    </div>
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
                          Spotify
                          <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                        </a>
                      )}
                      {selectedApplication.instagramLink && (
                        <a 
                          href={selectedApplication.instagramLink} 
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
                    <div className="bg-muted/50 rounded-2xl p-4 border border-border/50">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                          <MessageSquare className="w-4 h-4 text-blue-500" />
                        </div>
                        <h3 className="font-semibold text-sm">{t("myApplications.yourComment")}</h3>
                      </div>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        {selectedApplication.comment}
                      </p>
                    </div>
                  )}

                  {/* Photo Gallery */}
                  {selectedApplication.photos && selectedApplication.photos.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-purple-500/10 rounded-lg">
                          <Eye className="w-4 h-4 text-purple-500" />
                        </div>
                        <h3 className="font-semibold text-sm">{t("myApplications.attachedPhotos")}</h3>
                        <Badge variant="secondary" className="ml-auto">{selectedApplication.photos.length}</Badge>
                      </div>
                      <div className={`grid gap-3 ${selectedApplication.photos.length === 1 ? 'grid-cols-1' : selectedApplication.photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                        {selectedApplication.photos.map((photoId, index) => (
                          <div key={index} className="relative group">
                            <img 
                              src={`/api/files/download/${photoId}`}
                              alt={`Photo ${index + 1}`}
                              className="w-full aspect-square object-cover rounded-xl shadow-sm transition-transform group-hover:scale-[1.02]"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Timeline */}
                  <div className="bg-muted/30 rounded-2xl p-4 border border-border/30">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                        <Calendar className="w-4 h-4 text-emerald-500" />
                      </div>
                      <h3 className="font-semibold text-sm">{t("myApplications.timeline")}</h3>
                    </div>
                    
                    <div className="relative pl-6">
                      {/* Vertical line */}
                      <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-border" />
                      
                      <div className="space-y-4">
                        {/* Submitted */}
                        <div className="relative flex items-start gap-3">
                          <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background shadow-sm" />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{t("myApplications.submitted")}</p>
                            <p className="text-muted-foreground text-xs">
                              {format(new Date(selectedApplication.createdAt), "PPp", { locale: getDateLocale() })}
                            </p>
                          </div>
                        </div>
                        
                        {/* Artist proposed date */}
                        {selectedApplication.proposedPlacementDate && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-blue-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{t("myApplications.artistProposedDate")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.proposedPlacementDate), "PPP", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Reviewed */}
                        {selectedApplication.reviewedAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{t("myApplications.reviewed")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.reviewedAt), "PPp", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Curator proposed different date */}
                        {selectedApplication.curatorProposedDate && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-yellow-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-yellow-600">{t("myApplications.curatorProposedDate")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.curatorProposedDate), "PPP", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Chat opened for negotiation */}
                        {selectedApplication.firstChatMessageAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-purple-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-purple-600">{t("myApplications.chatOpened")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.firstChatMessageAt), "PPp", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Confirmed placement date */}
                        {selectedApplication.confirmedPlacementDate && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-green-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-green-600">{t("myApplications.dateConfirmed")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.confirmedPlacementDate), "PPP", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Approved */}
                        {selectedApplication.status === 'APPROVED' && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{t("myApplications.approvedStatus")}</p>
                              <p className="text-muted-foreground text-xs">
                                {selectedApplication.approvedAt 
                                  ? format(new Date(selectedApplication.approvedAt), "PPp", { locale: getDateLocale() })
                                  : selectedApplication.reviewedAt 
                                    ? format(new Date(selectedApplication.reviewedAt), "PPp", { locale: getDateLocale() })
                                    : ''
                                }
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Paid */}
                        {selectedApplication.paymentStatus === 'PAID' && selectedApplication.paidAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-green-600 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-green-600">{t("myApplications.paidStatus")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.paidAt), "PPp", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Rejected */}
                        {selectedApplication.status === 'REJECTED' && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-red-500 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-red-500">{t("myApplications.rejectedStatus")}</p>
                              <p className="text-muted-foreground text-xs">
                                {selectedApplication.reviewedAt && format(new Date(selectedApplication.reviewedAt), "PPp", { locale: getDateLocale() })}
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* Placement verified */}
                        {selectedApplication.isPlacementVerified && selectedApplication.placementVerifiedAt && (
                          <div className="relative flex items-start gap-3">
                            <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-emerald-600 border-4 border-background shadow-sm" />
                            <div className="flex-1">
                              <p className="font-medium text-sm text-emerald-600">{t("myApplications.placementVerified")}</p>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(selectedApplication.placementVerifiedAt), "PPp", { locale: getDateLocale() })}
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
                              <p className="font-medium text-sm text-orange-600">{t("myApplications.placementPending")}</p>
                              <p className="text-muted-foreground text-xs">
                                {t("myApplications.awaitingVerification")}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Proposed Placement Date Section - when curator proposed a different date and not yet confirmed */}
                  {selectedApplication.curatorProposedDate && selectedApplication.status === 'APPROVED' && !selectedApplication.confirmedPlacementDate && (
                    <div className="bg-yellow-500/10 rounded-2xl p-4 border border-yellow-500/30">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="p-1.5 bg-yellow-500/20 rounded-lg">
                          <Calendar className="w-4 h-4 text-yellow-600" />
                        </div>
                        <h3 className="font-semibold text-sm text-yellow-700">{t("myApplications.proposedDateTitle")}</h3>
                      </div>
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-muted-foreground">{t("myApplications.yourProposedDate")}:</p>
                            <p className="font-medium">
                              {selectedApplication.proposedPlacementDate 
                                ? format(new Date(selectedApplication.proposedPlacementDate), "PPP", { locale: getDateLocale() })
                                : "-"
                              }
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">{t("myApplications.curatorProposedDate")}:</p>
                            <p className="font-medium text-yellow-700">
                              {format(new Date(selectedApplication.curatorProposedDate), "PPP", { locale: getDateLocale() })}
                            </p>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {t("myApplications.dateProposalDescription")}
                        </p>
                        
                        <div className="flex gap-2 pt-2">
                          <Button 
                            size="sm" 
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => acceptDateMutation.mutate(selectedApplication.id)}
                            disabled={acceptDateMutation.isPending}
                          >
                            {acceptDateMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4 mr-2" />
                            )}
                            {t("myApplications.acceptDate")}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1 border-yellow-500/50 text-yellow-700 hover:bg-yellow-500/10"
                            onClick={() => {
                              setChatApplicationId(selectedApplication.id);
                              setChatApplicationCode(selectedApplication.applicationCode || "");
                              setChatPlaylistName(selectedApplication.playlistName || "");
                              setChatOpen(true);
                            }}
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            {t("myApplications.discussDate")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Confirmed Placement Date - when date has been accepted */}
                  {selectedApplication.confirmedPlacementDate && selectedApplication.status === 'APPROVED' && (
                    <div className="bg-emerald-500/10 rounded-2xl p-4 border border-emerald-500/30">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-emerald-500/20 rounded-lg">
                          <Calendar className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h3 className="font-semibold text-sm text-emerald-700">{t("myApplications.confirmedPlacementDate")}</h3>
                      </div>
                      <p className="font-medium text-lg text-emerald-700">
                        {format(new Date(selectedApplication.confirmedPlacementDate), "PPP", { locale: getDateLocale() })}
                      </p>
                    </div>
                  )}

                  {/* Curator Response / Rejection */}
                  {(selectedApplication.curatorResponse || selectedApplication.rejectionReason) && (
                    <div className={`rounded-2xl p-4 border ${
                      selectedApplication.status === 'REJECTED' 
                        ? 'bg-red-500/5 border-red-500/20' 
                        : 'bg-emerald-500/5 border-emerald-500/20'
                    }`}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`p-1.5 rounded-lg ${selectedApplication.status === 'REJECTED' ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                          {selectedApplication.status === 'REJECTED' ? (
                            <X className="w-4 h-4 text-red-500" />
                          ) : (
                            <Check className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                        <h3 className="font-semibold text-sm">
                          {selectedApplication.status === 'REJECTED' 
                            ? t("myApplications.rejectionDetails")
                            : t("myApplications.curatorResponse")
                          }
                        </h3>
                      </div>
                      
                      {selectedApplication.rejectionReason && (
                        <div className="mb-2">
                          <span className="text-sm font-medium text-muted-foreground">{t("myApplications.reason")}: </span>
                          <span className="text-sm">{t(`curatorApplications.reasons.${selectedApplication.rejectionReason}`)}</span>
                        </div>
                      )}
                      {selectedApplication.curatorResponse && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {selectedApplication.curatorResponse}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Payment CTA */}
                  {selectedApplication.status === "APPROVED" && selectedApplication.paymentStatus !== "PAID" && (
                    <div className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-2xl p-5 border border-emerald-500/20">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-emerald-500/20 rounded-xl">
                            <CreditCard className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {t("myApplications.readyForPayment")}
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {t("myApplications.amountToPay")}: <span className="font-semibold">{selectedApplication.paidAmount} {selectedApplication.paidCurrency}</span>
                            </p>
                          </div>
                        </div>
                        <WayforpayWidget
                          entityType="pitching"
                          entityId={selectedApplication.id}
                          paymentStatus={selectedApplication.paymentStatus as "UNPAID" | "PENDING" | "PAID" | "FAILED"}
                          amount={`${selectedApplication.paidAmount} ${selectedApplication.paidCurrency}`}
                          onPaymentSuccess={() => setSelectedApplication(null)}
                          onWidgetOpen={() => setSelectedApplication(null)}
                        />
                      </div>
                    </div>
                  )}

                  {/* Donation Card - "Pay what you want" for free approved applications */}
                  {selectedApplication.status === "APPROVED" && selectedApplication.paidAmount === 0 && !hasPaidDonation && (
                    <div className="bg-gradient-to-r from-pink-500/10 to-rose-500/10 rounded-2xl p-4 sm:p-5 border border-pink-500/20">
                      <div className="flex items-center gap-2.5 mb-3">
                        <div className="p-2 bg-pink-500/20 rounded-xl">
                          <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-pink-500" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-pink-700 dark:text-pink-400 text-sm sm:text-base">
                            {t("myApplications.donation.title")}
                          </h4>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {t("myApplications.donation.subtitle")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="relative flex-1">
                          <Input
                            type="number"
                            min={10}
                            max={50000}
                            value={donationAmount}
                            onChange={(e) => setDonationAmount(e.target.value)}
                            placeholder={t("myApplications.donation.amountPlaceholder")}
                            className="pr-14 text-sm"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
                            UAH
                          </span>
                        </div>
                        <Button
                          onClick={handleDonationPayment}
                          disabled={isDonationProcessing || !donationAmount || parseInt(donationAmount) < 10}
                          className="bg-pink-500 hover:bg-pink-600 text-white gap-1.5 text-xs sm:text-sm px-3 sm:px-4 shrink-0"
                        >
                          {isDonationProcessing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          )}
                          {t("myApplications.donation.send")}
                        </Button>
                      </div>
                      <p className="text-[11px] sm:text-xs text-muted-foreground mt-2">
                        {t("myApplications.donation.hint")}
                      </p>
                    </div>
                  )}

                  {/* Donation Success */}
                  {selectedApplication.status === "APPROVED" && selectedApplication.paidAmount === 0 && hasPaidDonation && (
                    <div className="bg-gradient-to-r from-pink-500/5 to-rose-500/5 rounded-2xl p-4 border border-pink-500/10">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-pink-500/10 rounded-xl">
                          <Heart className="w-4 h-4 text-pink-400 fill-pink-400" />
                        </div>
                        <div>
                          <h4 className="font-medium text-pink-600 dark:text-pink-400 text-sm">
                            {t("myApplications.donation.thankYou")}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {t("myApplications.donation.thankYouDescription")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Curator Chat Dialog */}
        {chatApplicationId && (
          <CuratorChat
            applicationId={chatApplicationId}
            applicationCode={chatApplicationCode}
            playlistName={chatPlaylistName}
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
