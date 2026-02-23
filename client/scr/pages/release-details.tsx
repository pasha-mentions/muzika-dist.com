import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Edit, Download, Music, Image as ImageIcon, Calendar, Globe, User, Link as LinkIcon, Video } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EditReleaseDialog } from "@/components/release/edit-release-dialog";
import { useTranslation } from "react-i18next";
import { getApiEndpoint } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/roleLabels";
import { GiftMarker } from "@/components/holiday/GiftMarker";

interface ReleaseDetails {
  id: string;
  title: string;
  upc?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  originalReleaseDate?: string;
  releaseDate?: string;
  primaryGenre?: string;
  secondaryGenre?: string;
  language?: string;
  albumVersion?: string;
  subLabel?: string;
  territories?: string[];
  performers?: Array<{ name: string; role: string }>;
  artworkUrl?: string;
  artworkFileId?: string;
  artworkOriginalName?: string;
  // Animated artwork fields
  animatedArtwork3x4FileId?: string;
  animatedArtwork3x4FileName?: string;
  animatedArtwork3x4Size?: number;
  animatedArtwork1x1FileId?: string;
  animatedArtwork1x1FileName?: string;
  animatedArtwork1x1Size?: number;
  animatedArtworkFeeApplied?: number;
  multilink?: string;
  artist: {
    id: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
  };
  tracks: Array<{
    id: string;
    title: string;
    isrc?: string;
    trackIndex: number;
    explicit: boolean;
    audioUrl?: string;
    audioFileId?: string;
    audioOriginalName?: string;
    lyrics?: string;
    version?: string;
    tiktokClipStart?: number;
    participants?: Array<{ name: string; role: string }>;
  }>;
}

export default function ReleaseDetails() {
  const { t, i18n } = useTranslation();
  const [, params] = useRoute("/release/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isPlatformAdmin } = useAuth();
  const releaseId = params?.id;
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [showAllTerritories, setShowAllTerritories] = useState(false);

  const { data: release, isLoading, refetch } = useQuery<ReleaseDetails>({
    queryKey: [`/api/releases/${releaseId}`],
    enabled: !!releaseId,
  });

  const { data: userOrganizations } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/organizations"],
    enabled: !!user,
  });

  const isOwner = release && user && userOrganizations?.some(org => org.id === release.organization.id);

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "DRAFT":
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
      case "IN_REVIEW":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "APPROVED":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "DELIVERING":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "DELIVERED":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      case "REJECTED":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('releaseDetails.notSpecified');
    const date = new Date(dateString);
    const locale = i18n.language === 'uk' ? 'uk-UA' : i18n.language === 'pl' ? 'pl-PL' : 'en-US';
    return date.toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const handleEditSuccess = () => {
    refetch();
  };

  // Handle edit button click
  const handleEditClick = () => {
    if (!release) return;
    
    // Always show warning dialog first
    setWarningDialogOpen(true);
  };

  // Handle warning dialog confirmation
  const handleWarningConfirm = () => {
    setWarningDialogOpen(false);
    setEditDialogOpen(true);
  };

  // Extract fileId from Google Drive URL
  const extractFileIdFromUrl = (url?: string): string | null => {
    if (!url) return null;
    
    // Match Google Drive URLs: thumbnail?id=FILE_ID or /d/FILE_ID or /file/d/FILE_ID
    const patterns = [
      /[?&]id=([^&]+)/,           // thumbnail?id=FILE_ID
      /\/d\/([^/?]+)/,             // /d/FILE_ID
      /\/file\/d\/([^/?]+)/        // /file/d/FILE_ID
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  };

  // Handle file download
  const handleDownload = async (fileId: string | undefined, url: string | undefined, filename: string) => {
    // Try to get fileId directly or extract from URL
    let actualFileId = fileId;
    
    if (!actualFileId && url) {
      actualFileId = extractFileIdFromUrl(url) || undefined;
    }
    
    if (!actualFileId) {
      toast({
        title: t('releaseDetails.downloadError'),
        description: t('releaseDetails.downloadErrorDescription'),
        variant: "destructive",
      });
      return;
    }

    try {
      const downloadUrl = getApiEndpoint(`/api/files/download/${actualFileId}?filename=${encodeURIComponent(filename)}`);
      
      // Use fetch with credentials to maintain session
      const response = await fetch(downloadUrl, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      // Get file as blob
      const blob = await response.blob();

      // Create blob URL and trigger download
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up blob URL
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading file:', error);
      toast({
        title: t('releaseDetails.downloadError'),
        description: t('releaseDetails.downloadErrorDescription'),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading"/>
      </div>
    );
  }

  if (!release) {
    return (
      <div className="py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-foreground">{t('releaseDetails.releaseNotFound')}</h2>
            <Button onClick={() => navigate("/catalog")} className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('releaseDetails.backToCatalog')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Header */}
        <div className="mb-6 relative">
          <GiftMarker placementId="release-details" className="absolute top-0 right-0" />
          <Button 
            variant="ghost" 
            onClick={() => navigate("/catalog")}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('releaseDetails.backToCatalog')}
          </Button>
          
          {/* Row 1: Status + Edit button */}
          <div className="flex items-center justify-between gap-4 mb-3">
            <Badge className={getStatusColor(release.status)}>
              {release.status}
            </Badge>
            <Button onClick={handleEditClick}>
              <Edit className="mr-2 h-4 w-4" />
              {t('releaseDetails.edit')}
            </Button>
          </div>
          
          {/* Row 2: Title */}
          <h1 className="text-3xl font-bold text-foreground">{release.title}</h1>
          
          {/* Row 3: Artist name */}
          <p className="text-muted-foreground mt-2">{release.artist.name}</p>
          
          {/* Warning dialog for non-draft releases */}
          <AlertDialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('releaseDetails.warningTitle')}</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3">
                    <p>
                      {t('releaseDetails.warningDescription')}
                    </p>
                    <p className="font-semibold">{t('releaseDetails.warningRemember')}</p>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>{t('releaseDetails.warningPoint1')}</li>
                      <li>{t('releaseDetails.warningPoint2')}</li>
                      <li>{t('releaseDetails.warningPoint3')}</li>
                      <li>{t('releaseDetails.warningPoint4')}</li>
                      <li>{t('releaseDetails.warningPoint5')}</li>
                    </ul>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('releaseDetails.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleWarningConfirm}>{t('releaseDetails.ok')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <EditReleaseDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            release={release}
            onSuccess={handleEditSuccess}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Artwork */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  {t('releaseDetails.coverArt')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {release.artworkUrl ? (
                  <div className="space-y-4">
                    <img 
                      src={release.artworkUrl} 
                      alt={release.title}
                      className="w-full rounded-lg shadow-lg"
                    />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>{release.artworkOriginalName}</span>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownload(release.artworkFileId, release.artworkUrl, release.artworkOriginalName || 'artwork.jpg')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                    <ImageIcon className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Animated Artwork */}
            {(release.animatedArtwork3x4FileId || release.animatedArtwork1x1FileId) && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    {t('releaseDetails.animatedArtwork', 'Apple Music Animated Artwork')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {release.animatedArtwork3x4FileId && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">3:4 Album Page Motion</p>
                        <p className="text-xs text-muted-foreground">
                          {release.animatedArtwork3x4FileName}
                          {release.animatedArtwork3x4Size && ` (${(release.animatedArtwork3x4Size / 1024 / 1024).toFixed(1)} MB)`}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownload(
                          release.animatedArtwork3x4FileId, 
                          undefined, 
                          release.animatedArtwork3x4FileName || 'animated_3x4.mp4'
                        )}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                  {release.animatedArtwork1x1FileId && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-sm font-medium">1:1 Square Format</p>
                        <p className="text-xs text-muted-foreground">
                          {release.animatedArtwork1x1FileName}
                          {release.animatedArtwork1x1Size && ` (${(release.animatedArtwork1x1Size / 1024 / 1024).toFixed(1)} MB)`}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDownload(
                          release.animatedArtwork1x1FileId, 
                          undefined, 
                          release.animatedArtwork1x1FileName || 'animated_1x1.mp4'
                        )}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Metadata */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('releaseDetails.metadata')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('releaseDetails.upc')}</p>
                    <p className="font-medium">{release.upc || t('releaseDetails.notSpecified')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('releaseDetails.primaryGenre')}</p>
                    <p className="font-medium">{release.primaryGenre || t('releaseDetails.notSpecified')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('releaseDetails.secondaryGenre')}</p>
                    <p className="font-medium">{release.secondaryGenre || t('releaseDetails.notSpecified')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('releaseDetails.language')}</p>
                    <p className="font-medium">{release.language || t('releaseDetails.notSpecified')}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('releaseDetails.firstReleaseDate')}</p>
                    <p className="font-medium">{formatDate(release.originalReleaseDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('releaseDetails.releaseDate')}</p>
                    <p className="font-medium">{formatDate(release.releaseDate)}</p>
                  </div>
                  {release.albumVersion && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t('releaseDetails.albumVersion')}</p>
                      <p className="font-medium">{release.albumVersion}</p>
                    </div>
                  )}
                  {release.subLabel && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t('releaseDetails.subLabel')}</p>
                      <p className="font-medium">{release.subLabel}</p>
                    </div>
                  )}
                </div>

                {release.territories && release.territories.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {t('releaseDetails.territories')} ({release.territories.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(showAllTerritories ? release.territories : release.territories.slice(0, 10)).map((territory, idx) => (
                        <Badge key={idx} variant="outline">{territory}</Badge>
                      ))}
                      {release.territories.length > 10 && (
                        <Badge 
                          variant="outline" 
                          className="cursor-pointer hover:bg-accent"
                          onClick={() => setShowAllTerritories(!showAllTerritories)}
                        >
                          {showAllTerritories 
                            ? t('releaseDetails.showLess')
                            : `+${release.territories.length - 10} ${t('releaseDetails.more')}`
                          }
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Multilink Button */}
            {release.multilink && (
              <div className="flex justify-start mb-4">
                <Button
                  onClick={() => window.open(release.multilink, '_blank')}
                  className="flex items-center gap-2"
                >
                  <LinkIcon className="h-4 w-4" />
                  {t('releaseDetails.openMultilink')}
                </Button>
              </div>
            )}
            {!release.multilink && (
              <div className="flex justify-start mb-4">
                <Button
                  disabled
                  className="flex items-center gap-2 opacity-50 cursor-not-allowed"
                >
                  <LinkIcon className="h-4 w-4" />
                  {t('releaseDetails.multilinkUnavailable')}
                </Button>
              </div>
            )}

            {/* Tracks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  {t('releaseDetails.tracks')} ({release.tracks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {release.tracks.map((track) => (
                    <div 
                      key={track.id}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <span className="text-sm text-muted-foreground flex-shrink-0">
                              {track.trackIndex}.
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-medium">{track.title}</h3>
                                {track.explicit && (
                                  <Badge variant="destructive" className="text-xs">E</Badge>
                                )}
                              </div>
                              {track.version && (
                                <p className="text-sm text-muted-foreground mt-1">{track.version}</p>
                              )}
                              {track.isrc && (
                                <p className="text-sm text-muted-foreground mt-1">ISRC: {track.isrc}</p>
                              )}
                              {track.tiktokClipStart !== undefined && track.tiktokClipStart !== null && (
                                <p className="text-sm text-muted-foreground mt-1">
                                  TikTok Clip Start: {Math.floor(track.tiktokClipStart / 3600).toString().padStart(2, '0')}:{Math.floor((track.tiktokClipStart % 3600) / 60).toString().padStart(2, '0')}:{(track.tiktokClipStart % 60).toString().padStart(2, '0')}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        {(track.audioFileId || track.audioUrl) && (
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-sm text-muted-foreground truncate max-w-[200px] hidden sm:inline">
                              {track.audioOriginalName || `${track.title}.wav`}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(track.audioFileId, track.audioUrl, track.audioOriginalName || `${track.title}.wav`);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                      {track.participants && track.participants.length > 0 && (
                        <details className="mt-3">
                          <summary className="text-sm text-muted-foreground cursor-pointer flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {t('releaseDetails.participants')}
                          </summary>
                          <div className="mt-2 space-y-1.5">
                            {track.participants.map((participant, idx) => (
                              <div key={idx} className="text-sm flex items-start gap-2">
                                <span className="text-muted-foreground min-w-[140px]">
                                  {ROLE_LABELS[participant.role as keyof typeof ROLE_LABELS] || participant.role}:
                                </span>
                                <span>{participant.name}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {track.lyrics && (
                        <details className="mt-3">
                          <summary className="text-sm text-muted-foreground cursor-pointer">
                            {t('releaseDetails.lyrics')}
                          </summary>
                          <p className="mt-2 text-sm whitespace-pre-wrap">{track.lyrics}</p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
