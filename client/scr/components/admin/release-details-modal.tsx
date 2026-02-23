import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Edit, Music, Image as ImageIcon, Download, User, Globe, Link as LinkIcon, Copy, X, CheckCircle, Trash2 } from "lucide-react";
import { getApiEndpoint } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/roleLabels";

interface ReleaseDetailsModalProps {
  releaseId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ReleaseDetails {
  id: string;
  title: string;
  type: string;
  status: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  upc?: string;
  primaryGenre?: string;
  secondaryGenre?: string;
  language?: string;
  albumVersion?: string;
  originalReleaseDate?: string;
  releaseDate?: string;
  subLabel?: string;
  territories?: string[];
  performers?: { name: string; role: string }[];
  multilink?: string;
  artworkUrl?: string;
  artworkOriginalName?: string;
  artworkFileId?: string;
  animatedArtwork3x4FileId?: string;
  animatedArtwork3x4FileName?: string;
  animatedArtwork1x1FileId?: string;
  animatedArtwork1x1FileName?: string;
  artist: {
    id: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
  };
  tracks: Track[];
}

interface Track {
  id: string;
  title: string;
  isrc?: string;
  trackIndex: number;
  explicit: boolean;
  aiGenerated: boolean;
  primaryGenre?: string;
  secondaryGenre?: string;
  audioUrl?: string;
  audioFileId?: string;
  audioOriginalName?: string;
  lyrics?: string;
  version?: string;
  tiktokClipStart?: number;
  tiktokPreviewDate?: string;
  participants?: { name: string; role: string }[];
}

const GENRES = [
  "Electronic", "Pop", "Rock", "Hip Hop", "R&B", "Country", 
  "Jazz", "Classical", "Folk", "Reggae", "Blues", "Alternative",
  "Indie", "Dance", "House", "Techno", "Ambient", "World",
  "Christian", "Christian & Gospel", "Christian Metal", "Christian Pop",
  "Christian Rap", "Christian Rap/Hip-Hop", "Christian Rock",
  "Поп", "Рок", "Електронна", "Хіп-хоп", "R&B", "Джаз",
  "Класична", "Фолк", "Блюз", "Альтернативна", "Інді"
];

export default function ReleaseDetailsModal({ releaseId, isOpen, onClose }: ReleaseDetailsModalProps) {
  const [selectedTab, setSelectedTab] = useState("metadata");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  // Metadata editing state
  const [metadataEdits, setMetadataEdits] = useState<Partial<ReleaseDetails>>({});
  const [performersEdits, setPerformersEdits] = useState<{ name: string; role: string }[]>([]);

  // Track editing state
  const [trackEdits, setTrackEdits] = useState<Record<string, Partial<Track>>>({});

  useEffect(() => {
    if (!isOpen) {
      setSelectedTab("metadata");
      setIsEditMode(false);
      setEditingTrackId(null);
      setMetadataEdits({});
      setPerformersEdits([]);
      setTrackEdits({});
    }
  }, [isOpen]);

  const { data: release, isLoading } = useQuery({
    queryKey: ["/api/admin/releases", releaseId],
    enabled: !!releaseId && isOpen,
  }) as { data: ReleaseDetails | undefined; isLoading: boolean };

  // Initialize performers when release loads
  useEffect(() => {
    if (release) {
      setPerformersEdits(release.performers || []);
    }
  }, [release]);

  const updateMetadataMutation = useMutation({
    mutationFn: async (updates: Partial<ReleaseDetails>) => {
      if (!releaseId) throw new Error("No release ID");
      const response = await apiRequest("PUT", `/api/admin/releases/${releaseId}`, {
        ...updates,
        performers: performersEdits,
      });
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases", releaseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/releases"], exact: false });
      setMetadataEdits({});
      setTrackEdits({});
      toast({
        title: "Успішно!",
        description: "Метадані оновлено",
      });
    },
    onError: () => {
      toast({
        title: "Помилка",
        description: "Не вдалося оновити метадані",
        variant: "destructive",
      });
    },
  });

  const updateTrackMutation = useMutation({
    mutationFn: async ({ trackId, data }: { trackId: string; data: Partial<Track> }) => {
      const response = await apiRequest("PUT", `/api/admin/tracks/${trackId}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases", releaseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/releases"], exact: false });
      setEditingTrackId(null);
      setTrackEdits({});
      toast({
        title: "Успішно!",
        description: "Трек оновлено",
      });
    },
    onError: () => {
      toast({
        title: "Помилка",
        description: "Не вдалося оновити трек",
        variant: "destructive",
      });
    },
  });

  const uploadAudioMutation = useMutation({
    mutationFn: async ({ trackId, file }: { trackId: string; file: File }) => {
      // Use Google Drive for all files (up to 500MB)
      const formData = new FormData();
      formData.append('audio', file);
      
      console.log(`[ADMIN UPLOAD] Uploading file to Google Drive: ${file.name}, size: ${file.size}`);
      
      // Use existing /audio endpoint which handles FormData upload
      const response = await fetch(`/api/admin/releases/${releaseId}/tracks/${trackId}/audio`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ADMIN UPLOAD] Upload failed:', errorText);
        throw new Error(`Upload failed: ${errorText}`);
      }

      const result = await response.json();
      console.log('[ADMIN UPLOAD] Upload successful:', result);
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases", releaseId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
      toast({
        title: "Успішно!",
        description: "Аудіо файл завантажено",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Помилка завантаження",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteReleaseMutation = useMutation({
    mutationFn: async () => {
      if (!releaseId) throw new Error("No release ID");
      const response = await apiRequest("DELETE", `/api/admin/releases/${releaseId}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/releases"] });
      setShowDeleteDialog(false);
      onClose();
      toast({
        title: "Успішно видалено!",
        description: "Реліз та всі пов'язані файли видалено",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Помилка",
        description: `Не вдалося видалити реліз: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleAudioUpload = (trackId: string, file: File) => {
    // Validate file type
    const allowedTypes = ['audio/wav', 'audio/flac', 'audio/x-wav', 'audio/x-flac'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Невірний формат",
        description: "Дозволені тільки файли WAV та FLAC",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "Файл занадто великий",
        description: "Максимальний розмір файлу: 500 MB",
        variant: "destructive",
      });
      return;
    }

    uploadAudioMutation.mutate({ trackId, file });
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Не вказано";
    return new Date(dateString).toLocaleDateString('uk-UA', {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

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

  const handleDownload = async (fileId: string | undefined | null, url: string | undefined | null, filename: string) => {
    let actualFileId = fileId;
    
    if (!actualFileId && url) {
      actualFileId = extractFileIdFromUrl(url);
    }
    
    if (!actualFileId) {
      toast({
        title: "Помилка",
        description: "Файл не знайдено",
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
        title: "Помилка завантаження",
        description: "Не вдалося завантажити файл",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопійовано!",
      description: `${label}: ${text}`,
    });
  };

  const handleMetadataSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // First, save release metadata (UPC, multilink, performers)
    updateMetadataMutation.mutate(metadataEdits);
    
    // Then, save ISRC codes for each track that was edited
    for (const [trackId, trackData] of Object.entries(trackEdits)) {
      if (trackData.isrc !== undefined) {
        updateTrackMutation.mutate({ trackId, data: trackData });
      }
    }
  };

  const handleTrackUpdate = (trackId: string, field: string, value: any) => {
    setTrackEdits(prev => ({
      ...prev,
      [trackId]: {
        ...prev[trackId],
        [field]: value,
      }
    }));
  };

  const handleSaveTrack = (trackId: string) => {
    if (!release) return;
    const originalTrack = release.tracks.find(t => t.id === trackId);
    if (!originalTrack) return;

    const mergedData = { ...originalTrack, ...trackEdits[trackId] };
    updateTrackMutation.mutate({ trackId, data: mergedData });
  };

  const handlePerformerChange = (index: number, field: "name" | "role", value: string) => {
    const updated = [...performersEdits];
    updated[index] = { ...updated[index], [field]: value };
    setPerformersEdits(updated);
  };

  const handleAddPerformer = () => {
    if (performersEdits.length < 5) {
      setPerformersEdits([...performersEdits, { name: "", role: "" }]);
    }
  };

  const handleRemovePerformer = (index: number) => {
    setPerformersEdits(performersEdits.filter((_, i) => i !== index));
  };

  if (!isOpen || !releaseId) return null;

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Завантаження...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!release) return null;

  const currentMetadata = { ...release, ...metadataEdits };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <DialogTitle className="text-3xl font-bold mb-2">{release.title}</DialogTitle>
              <p className="text-muted-foreground">{release.artist.name}</p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {/* Status Badge */}
              <Badge variant="outline" className="capitalize">
                {release.status.toLowerCase().replace('_', ' ')}
              </Badge>
              {/* Payment Status Badge */}
              {release.paymentStatus && (
                <Badge 
                  variant={release.paymentStatus === "PAID" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {release.paymentStatus.toLowerCase()}
                </Badge>
              )}
              {/* Edit Button */}
              <Button
                variant={isEditMode ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setIsEditMode(!isEditMode);
                  if (isEditMode) {
                    // Cancel edits when exiting edit mode
                    setMetadataEdits({});
                    setPerformersEdits(release.performers || []);
                    setTrackEdits({});
                    setEditingTrackId(null);
                  }
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                {isEditMode ? "Cancel Edit" : "Edit"}
              </Button>
              {/* Delete Button */}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Видалити
              </Button>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="metadata">Metadata</TabsTrigger>
            <TabsTrigger value="tracks">Tracks</TabsTrigger>
          </TabsList>

          {/* METADATA TAB */}
          <TabsContent value="metadata" className="space-y-6 mt-6">
            <form onSubmit={handleMetadataSubmit} className="space-y-6">
              {/* Cover Art */}
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Cover Art
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {release.artworkUrl ? (
                    <div className="flex gap-4 items-start">
                      <img 
                        src={release.artworkUrl} 
                        alt={release.title}
                        className="w-48 h-48 rounded-lg shadow-lg object-cover"
                      />
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-muted-foreground">
                          Requirements: JPEG or PNG, exactly 3000×3000px
                        </p>
                        <div className="flex gap-2">
                          <Button 
                            type="button"
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDownload(release.artworkFileId, release.artworkUrl, release.artworkOriginalName || 'artwork.jpg')}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Cover Art
                          </Button>
                          {release.tracks?.find(t => t.audioFileId || t.audioUrl) && (() => {
                            const trackWithAudio = release.tracks.find(t => t.audioFileId || t.audioUrl)!;
                            return (
                              <Button 
                                type="button"
                                variant="outline" 
                                size="sm"
                                onClick={() => handleDownload(
                                  trackWithAudio.audioFileId,
                                  trackWithAudio.audioUrl,
                                  trackWithAudio.audioOriginalName || `${trackWithAudio.title}.wav`
                                )}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download Audio
                              </Button>
                            );
                          })()}
                          {release.animatedArtwork3x4FileId && (
                            <Button 
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDownload(
                                release.animatedArtwork3x4FileId,
                                undefined,
                                release.animatedArtwork3x4FileName || 'artwork_3x4.mp4'
                              )}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              3x4 Motion
                            </Button>
                          )}
                          {release.animatedArtwork1x1FileId && (
                            <Button 
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDownload(
                                release.animatedArtwork1x1FileId,
                                undefined,
                                release.animatedArtwork1x1FileName || 'artwork_1x1.mp4'
                              )}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              1x1 Square
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
                      <ImageIcon className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Release Info */}
              <div className="grid grid-cols-2 gap-4">
                {/* Album Name */}
                <div>
                  <Label>* Album Name</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={currentMetadata.title ?? ""}
                        onChange={(e) => setMetadataEdits(prev => ({ ...prev, title: e.target.value }))}
                        className="h-12 flex-1"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.title || "—"}
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(release.title || "", "Album Name")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Album Version */}
                <div>
                  <Label>Album Version (optional)</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={currentMetadata.albumVersion ?? ""}
                        onChange={(e) => setMetadataEdits(prev => ({ ...prev, albumVersion: e.target.value }))}
                        placeholder="Deluxe, Remastered..."
                        className="h-12 flex-1"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.albumVersion || "—"}
                      </p>
                      {release.albumVersion && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(release.albumVersion!, "Album Version")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Main Genre */}
                <div>
                  <Label>* Main Genre</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Select 
                        value={currentMetadata.primaryGenre ?? ""} 
                        onValueChange={(value) => setMetadataEdits(prev => ({ ...prev, primaryGenre: value }))}
                      >
                        <SelectTrigger className="h-12 flex-1">
                          <SelectValue placeholder="Select genre" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alternative">Alternative</SelectItem>
                          <SelectItem value="blues">Blues</SelectItem>
                          <SelectItem value="brazilian">Brazilian</SelectItem>
                          <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                          <SelectItem value="chill-out">Chill Out</SelectItem>
                          <SelectItem value="christian">Christian</SelectItem>
                          <SelectItem value="christian-gospel">Christian & Gospel</SelectItem>
                          <SelectItem value="christian-metal">Christian Metal</SelectItem>
                          <SelectItem value="christian-pop">Christian Pop</SelectItem>
                          <SelectItem value="christian-rap">Christian Rap</SelectItem>
                          <SelectItem value="christian-rap-hip-hop">Christian Rap/Hip-Hop</SelectItem>
                          <SelectItem value="christian-rock">Christian Rock</SelectItem>
                          <SelectItem value="classic-rock">Classic Rock</SelectItem>
                          <SelectItem value="country-rock">Country Rock</SelectItem>
                          <SelectItem value="dance">Dance</SelectItem>
                          <SelectItem value="electric-blues">Electric Blues</SelectItem>
                          <SelectItem value="electro">Electro</SelectItem>
                          <SelectItem value="electronic">Electronic</SelectItem>
                          <SelectItem value="electro-pop">Electro Pop</SelectItem>
                          <SelectItem value="experimental">Experimental</SelectItem>
                          <SelectItem value="folk">Folk</SelectItem>
                          <SelectItem value="funk">Funk</SelectItem>
                          <SelectItem value="grunge">Grunge</SelectItem>
                          <SelectItem value="hard-rock">Hard Rock</SelectItem>
                          <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                          <SelectItem value="house">House</SelectItem>
                          <SelectItem value="indie-dance">Indie Dance</SelectItem>
                          <SelectItem value="indie-rock">Indie Rock</SelectItem>
                          <SelectItem value="instrumental">Instrumental</SelectItem>
                          <SelectItem value="jazz">Jazz</SelectItem>
                          <SelectItem value="latin">Latin</SelectItem>
                          <SelectItem value="metal">Metal</SelectItem>
                          <SelectItem value="new-wave">New Wave</SelectItem>
                          <SelectItem value="pop">Pop</SelectItem>
                          <SelectItem value="pop-dance">Pop Dance</SelectItem>
                          <SelectItem value="pop-rock">Pop Rock</SelectItem>
                          <SelectItem value="punk">Punk</SelectItem>
                          <SelectItem value="reggae">Reggae</SelectItem>
                          <SelectItem value="rnb">R'n'B</SelectItem>
                          <SelectItem value="rock">Rock</SelectItem>
                          <SelectItem value="shoegazing">Shoegazing</SelectItem>
                          <SelectItem value="smooth">Smooth</SelectItem>
                          <SelectItem value="soul">Soul</SelectItem>
                          <SelectItem value="synthwave">Synthwave</SelectItem>
                          <SelectItem value="trance">Trance</SelectItem>
                          <SelectItem value="world">World</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.primaryGenre || "—"}
                      </p>
                      {release.primaryGenre && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(release.primaryGenre!, "Primary Genre")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Secondary Genre */}
                <div>
                  <Label>Secondary Genre (optional)</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Select 
                        value={currentMetadata.secondaryGenre ?? ""} 
                        onValueChange={(value) => setMetadataEdits(prev => ({ ...prev, secondaryGenre: value }))}
                      >
                        <SelectTrigger className="h-12 flex-1">
                          <SelectValue placeholder="Select genre" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alternative">Alternative</SelectItem>
                          <SelectItem value="blues">Blues</SelectItem>
                          <SelectItem value="brazilian">Brazilian</SelectItem>
                          <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                          <SelectItem value="chill-out">Chill Out</SelectItem>
                          <SelectItem value="christian">Christian</SelectItem>
                          <SelectItem value="christian-gospel">Christian & Gospel</SelectItem>
                          <SelectItem value="christian-metal">Christian Metal</SelectItem>
                          <SelectItem value="christian-pop">Christian Pop</SelectItem>
                          <SelectItem value="christian-rap">Christian Rap</SelectItem>
                          <SelectItem value="christian-rap-hip-hop">Christian Rap/Hip-Hop</SelectItem>
                          <SelectItem value="christian-rock">Christian Rock</SelectItem>
                          <SelectItem value="classic-rock">Classic Rock</SelectItem>
                          <SelectItem value="country-rock">Country Rock</SelectItem>
                          <SelectItem value="dance">Dance</SelectItem>
                          <SelectItem value="electric-blues">Electric Blues</SelectItem>
                          <SelectItem value="electro">Electro</SelectItem>
                          <SelectItem value="electronic">Electronic</SelectItem>
                          <SelectItem value="electro-pop">Electro Pop</SelectItem>
                          <SelectItem value="experimental">Experimental</SelectItem>
                          <SelectItem value="folk">Folk</SelectItem>
                          <SelectItem value="funk">Funk</SelectItem>
                          <SelectItem value="grunge">Grunge</SelectItem>
                          <SelectItem value="hard-rock">Hard Rock</SelectItem>
                          <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                          <SelectItem value="house">House</SelectItem>
                          <SelectItem value="indie-dance">Indie Dance</SelectItem>
                          <SelectItem value="indie-rock">Indie Rock</SelectItem>
                          <SelectItem value="instrumental">Instrumental</SelectItem>
                          <SelectItem value="jazz">Jazz</SelectItem>
                          <SelectItem value="latin">Latin</SelectItem>
                          <SelectItem value="metal">Metal</SelectItem>
                          <SelectItem value="new-wave">New Wave</SelectItem>
                          <SelectItem value="pop">Pop</SelectItem>
                          <SelectItem value="pop-dance">Pop Dance</SelectItem>
                          <SelectItem value="pop-rock">Pop Rock</SelectItem>
                          <SelectItem value="punk">Punk</SelectItem>
                          <SelectItem value="reggae">Reggae</SelectItem>
                          <SelectItem value="rnb">R'n'B</SelectItem>
                          <SelectItem value="rock">Rock</SelectItem>
                          <SelectItem value="shoegazing">Shoegazing</SelectItem>
                          <SelectItem value="smooth">Smooth</SelectItem>
                          <SelectItem value="soul">Soul</SelectItem>
                          <SelectItem value="synthwave">Synthwave</SelectItem>
                          <SelectItem value="trance">Trance</SelectItem>
                          <SelectItem value="world">World</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.secondaryGenre || "—"}
                      </p>
                      {release.secondaryGenre && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(release.secondaryGenre!, "Secondary Genre")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Language */}
                <div>
                  <Label>* Language</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Select 
                        value={currentMetadata.language ?? ""} 
                        onValueChange={(value) => setMetadataEdits(prev => ({ ...prev, language: value }))}
                      >
                        <SelectTrigger className="h-12 flex-1">
                          <SelectValue placeholder="Select language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ukrainian">Українська</SelectItem>
                          <SelectItem value="english">English</SelectItem>
                          <SelectItem value="russian">Російська</SelectItem>
                          <SelectItem value="spanish">Español</SelectItem>
                          <SelectItem value="french">Français</SelectItem>
                          <SelectItem value="german">Deutsch</SelectItem>
                          <SelectItem value="italian">Italiano</SelectItem>
                          <SelectItem value="portuguese">Português</SelectItem>
                          <SelectItem value="polish">Polski</SelectItem>
                          <SelectItem value="instrumental">Інструментальна</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.language || "—"}
                      </p>
                      {release.language && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(release.language!, "Language")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Sub-Label */}
                <div>
                  <Label>Sub-Label (optional)</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        value={currentMetadata.subLabel ?? ""}
                        onChange={(e) => setMetadataEdits(prev => ({ ...prev, subLabel: e.target.value }))}
                        placeholder="Опціонально"
                        className="h-12 flex-1"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.subLabel || "—"}
                      </p>
                      {release.subLabel && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(release.subLabel!, "Sub Label")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* First Release Date */}
                <div>
                  <Label>* First Release Date</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="date"
                        value={currentMetadata.originalReleaseDate ? new Date(currentMetadata.originalReleaseDate).toISOString().split('T')[0] : ""}
                        onChange={(e) => setMetadataEdits(prev => ({ ...prev, originalReleaseDate: e.target.value }))}
                        className="h-12 flex-1 [color-scheme:dark]"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.originalReleaseDate ? formatDate(release.originalReleaseDate) : "—"}
                      </p>
                      {release.originalReleaseDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(formatDate(release.originalReleaseDate), "First Release Date")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Release Date */}
                <div>
                  <Label>Release Date (optional)</Label>
                  {isEditMode ? (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        type="date"
                        value={currentMetadata.releaseDate ? new Date(currentMetadata.releaseDate).toISOString().split('T')[0] : ""}
                        onChange={(e) => setMetadataEdits(prev => ({ ...prev, releaseDate: e.target.value }))}
                        className="h-12 flex-1 [color-scheme:dark]"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                        {release.releaseDate ? formatDate(release.releaseDate) : "—"}
                      </p>
                      {release.releaseDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(formatDate(release.releaseDate), "Release Date")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Main Performer */}
              <Card>
                <CardHeader>
                  <CardTitle>Main Performer</CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditMode ? (
                    <div className="space-y-4">
                      {performersEdits.map((performer, index) => (
                        <div key={index} className="space-y-2 p-4 border rounded-lg relative">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePerformer(index)}
                            className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <div>
                            <Input
                              placeholder="Псевдонім артиста"
                              value={performer.name}
                              onChange={(e) => handlePerformerChange(index, "name", e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <div>
                            <Input
                              placeholder="Роль (main_performer)"
                              value={performer.role}
                              onChange={(e) => handlePerformerChange(index, "role", e.target.value)}
                              className="h-10"
                            />
                          </div>
                        </div>
                      ))}
                      {performersEdits.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Виконавці не додані
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddPerformer}
                        disabled={performersEdits.length >= 5}
                        className="w-full"
                      >
                        Add Performer
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(release.performers || []).map((performer, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-muted">
                          <div>
                            <p className="font-medium">{performer.name}</p>
                            <p className="text-sm text-muted-foreground">{ROLE_LABELS[performer.role as keyof typeof ROLE_LABELS] || performer.role}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(performer.name, "Performer")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {(!release.performers || release.performers.length === 0) && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Виконавці не додані
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Admin Controls */}
              <Card className="border-amber-500">
                <CardHeader>
                  <CardTitle className="text-amber-600">Admin Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Status */}
                    <div>
                      <Label>Release Status</Label>
                      {isEditMode ? (
                        <Select
                          value={metadataEdits.status ?? release.status}
                          onValueChange={(value) => setMetadataEdits(prev => ({ ...prev, status: value }))}
                        >
                          <SelectTrigger className="mt-2 h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DRAFT">DRAFT</SelectItem>
                            <SelectItem value="ACTIVE">ACTIVE</SelectItem>
                            <SelectItem value="DELETED">DELETED</SelectItem>
                            <SelectItem value="IN_REVIEW">IN_REVIEW</SelectItem>
                            <SelectItem value="APPROVED">APPROVED</SelectItem>
                            <SelectItem value="DELIVERING">DELIVERING</SelectItem>
                            <SelectItem value="DELIVERED">DELIVERED</SelectItem>
                            <SelectItem value="TAKEDOWN">TAKEDOWN</SelectItem>
                            <SelectItem value="REJECTED">REJECTED</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted capitalize">
                            {release.status.toLowerCase().replace('_', ' ')}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(release.status, "Release Status")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Payment Status */}
                    <div>
                      <Label>Payment Status</Label>
                      {isEditMode ? (
                        <Select
                          value={metadataEdits.paymentStatus ?? release.paymentStatus ?? "PENDING"}
                          onValueChange={(value) => setMetadataEdits(prev => ({ ...prev, paymentStatus: value as any }))}
                        >
                          <SelectTrigger className="mt-2 h-12">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">PENDING</SelectItem>
                            <SelectItem value="PROCESSING">PROCESSING</SelectItem>
                            <SelectItem value="PAID">PAID</SelectItem>
                            <SelectItem value="FAILED">FAILED</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted capitalize">
                            {(release.paymentStatus || "PENDING").toLowerCase()}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(release.paymentStatus || "PENDING", "Payment Status")}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* UPC */}
                    <div>
                      <Label>UPC</Label>
                      {isEditMode ? (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            value={currentMetadata.upc ?? ""}
                            onChange={(e) => setMetadataEdits(prev => ({ ...prev, upc: e.target.value }))}
                            className="h-12 flex-1"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                            {release.upc || "—"}
                          </p>
                          {release.upc && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(release.upc!, "UPC")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ISRC Codes */}
                    <div className="col-span-2">
                      <Label className="text-base font-semibold">ISRC Codes</Label>
                      <div className="mt-3 space-y-2">
                        {release.tracks.map((track, idx) => (
                          <div key={track.id}>
                            <Label className="text-xs text-muted-foreground mb-1">
                              {track.trackIndex}. {track.title}
                            </Label>
                            {isEditMode ? (
                              <div className="flex items-center gap-2 mt-1">
                                <Input
                                  value={trackEdits[track.id]?.isrc ?? track.isrc ?? ""}
                                  onChange={(e) => handleTrackUpdate(track.id, "isrc", e.target.value)}
                                  placeholder="ISRC code"
                                  className="h-10 flex-1"
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted text-sm">
                                  {track.isrc || "—"}
                                </p>
                                {track.isrc && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(track.isrc!, `ISRC for ${track.title}`)}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Multilink */}
                    <div>
                      <Label>Multilink URL</Label>
                      {isEditMode ? (
                        <div className="flex items-center gap-2 mt-2">
                          <Input
                            value={currentMetadata.multilink ?? ""}
                            onChange={(e) => setMetadataEdits(prev => ({ ...prev, multilink: e.target.value }))}
                            placeholder="https://..."
                            className="h-12 flex-1"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 mt-2">
                          <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted">
                            {release.multilink || "—"}
                          </p>
                          {release.multilink && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(release.multilink!, "Multilink")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons - Only in Edit Mode */}
              {isEditMode && (
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setMetadataEdits({});
                      setPerformersEdits(release.performers || []);
                    }}
                    disabled={updateMetadataMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMetadataMutation.isPending}>
                    {updateMetadataMutation.isPending ? "Saving..." : "Save Metadata"}
                  </Button>
                </div>
              )}
            </form>
          </TabsContent>

          {/* TRACKS TAB */}
          <TabsContent value="tracks" className="space-y-6 mt-6">
            <div className="space-y-4">
              {release.tracks.map((track) => {
                const currentTrackData = { ...track, ...trackEdits[track.id] };
                const isEditing = editingTrackId === track.id;

                return (
                  <Card key={track.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Music className="h-5 w-5" />
                          {track.trackIndex}. {track.title}
                          {track.explicit && <Badge variant="destructive" className="ml-2">Explicit</Badge>}
                          {track.aiGenerated && <Badge variant="secondary" className="ml-2">AI Generated</Badge>}
                        </CardTitle>
                        {isEditMode && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (isEditing) {
                                setEditingTrackId(null);
                                setTrackEdits(prev => {
                                  const updated = { ...prev };
                                  delete updated[track.id];
                                  return updated;
                                });
                              } else {
                                setEditingTrackId(track.id);
                              }
                            }}
                          >
                            {isEditing ? "Cancel" : "Edit"}
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    
                    {/* View Mode - Always show track info */}
                    {!isEditing && (
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          {/* Track Title */}
                          <div>
                            <Label className="text-xs text-muted-foreground">Track Title</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="flex-1">{track.title}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(track.title, "Track Title")}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* Version */}
                          {track.version && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Version</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1">{track.version}</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(track.version!, "Version")}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* ISRC */}
                          {track.isrc && (
                            <div>
                              <Label className="text-xs text-muted-foreground">ISRC</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1">{track.isrc}</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(track.isrc!, "ISRC")}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Explicit Content */}
                          <div>
                            <Label className="text-xs text-muted-foreground">Explicit Content</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="flex-1">{track.explicit ? "Так" : "Ні"}</p>
                            </div>
                          </div>

                          {/* AI Generated */}
                          <div>
                            <Label className="text-xs text-muted-foreground">AI Generated</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="flex-1">{track.aiGenerated ? "Так" : "Ні"}</p>
                            </div>
                          </div>

                          {/* Primary Genre */}
                          {track.primaryGenre && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Primary Genre</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1">{track.primaryGenre}</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(track.primaryGenre!, "Primary Genre")}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Secondary Genre */}
                          {track.secondaryGenre && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Secondary Genre</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1">{track.secondaryGenre}</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(track.secondaryGenre!, "Secondary Genre")}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* TikTok Clip Start */}
                          {track.tiktokClipStart !== undefined && track.tiktokClipStart !== null && (
                            <div>
                              <Label className="text-xs text-muted-foreground">TikTok Clip Start</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1">
                                  {Math.floor(track.tiktokClipStart / 60)}:{(track.tiktokClipStart % 60).toString().padStart(2, '0')}
                                </p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(
                                    `${Math.floor(track.tiktokClipStart! / 60)}:${(track.tiktokClipStart! % 60).toString().padStart(2, '0')}`,
                                    "TikTok Clip Start"
                                  )}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* TikTok Preview Date */}
                          {track.tiktokPreviewDate && (
                            <div>
                              <Label className="text-xs text-muted-foreground">TikTok Preview Date</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1">
                                  {new Date(track.tiktokPreviewDate).toLocaleDateString('uk-UA')}
                                </p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(
                                    new Date(track.tiktokPreviewDate!).toLocaleDateString('uk-UA'),
                                    "TikTok Preview Date"
                                  )}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Audio File */}
                          {(track.audioOriginalName || track.audioFileId || track.audioUrl) && (
                            <div>
                              <Label className="text-xs text-muted-foreground">Audio File</Label>
                              <div className="flex items-center gap-2 mt-1">
                                <p className="flex-1 text-sm truncate">{track.audioOriginalName || 'audio.wav'}</p>
                                {(track.audioFileId || track.audioUrl) && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownload(track.audioFileId, track.audioUrl, track.audioOriginalName || 'track.wav')}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Lyrics */}
                        {track.lyrics && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Lyrics</Label>
                            <div className="relative mt-1">
                              <p className="text-sm whitespace-pre-wrap max-h-32 overflow-y-auto p-3 bg-muted rounded-md">
                                {track.lyrics}
                              </p>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => copyToClipboard(track.lyrics!, "Lyrics")}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}

                        {/* Participants */}
                        {track.participants && track.participants.length > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Participants</Label>
                            <div className="mt-1 space-y-1">
                              {track.participants.map((participant, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded-md">
                                  <div className="flex items-center gap-2">
                                    <User className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-sm">{participant.name}</span>
                                    <Badge variant="outline" className="text-xs">{ROLE_LABELS[participant.role as keyof typeof ROLE_LABELS] || participant.role}</Badge>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(participant.name, "Participant")}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    )}

                    {/* Edit Mode */}
                    {isEditing && (
                      <CardContent className="space-y-4">
                        {/* Track Title */}
                        <div>
                          <Label>* Track Title</Label>
                          <div className="flex items-center gap-2 mt-2">
                            <Input
                              value={currentTrackData.title}
                              onChange={(e) => handleTrackUpdate(track.id, "title", e.target.value)}
                              className="h-12 flex-1"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(currentTrackData.title, "Track Title")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Version */}
                        <div>
                          <Label>Version (optional)</Label>
                          <div className="flex items-center gap-2 mt-2">
                            <Input
                              value={currentTrackData.version || ""}
                              onChange={(e) => handleTrackUpdate(track.id, "version", e.target.value)}
                              className="h-12 flex-1"
                              placeholder="Original, Remix, Acoustic..."
                            />
                            {currentTrackData.version && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(currentTrackData.version!, "Version")}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* ISRC */}
                        <div>
                          <Label>ISRC</Label>
                          <div className="flex items-center gap-2 mt-2">
                            <Input
                              value={currentTrackData.isrc || ""}
                              onChange={(e) => handleTrackUpdate(track.id, "isrc", e.target.value)}
                              className="h-12 flex-1"
                              placeholder="XX-XXX-XX-XXXXX"
                            />
                            {currentTrackData.isrc && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(currentTrackData.isrc!, "ISRC")}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* TikTok Clip Start */}
                        <div>
                          <Label>TikTok Clip Start (seconds)</Label>
                          <div className="flex items-center gap-2 mt-2">
                            <Input
                              type="number"
                              min="0"
                              value={currentTrackData.tiktokClipStart ?? ""}
                              onChange={(e) => handleTrackUpdate(track.id, "tiktokClipStart", e.target.value ? parseInt(e.target.value) : null)}
                              className="h-12 flex-1"
                              placeholder="0"
                            />
                            {currentTrackData.tiktokClipStart !== undefined && currentTrackData.tiktokClipStart !== null && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(
                                  `${Math.floor(currentTrackData.tiktokClipStart! / 60)}:${(currentTrackData.tiktokClipStart! % 60).toString().padStart(2, '0')}`,
                                  "TikTok Clip Start"
                                )}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Explicit Content & AI Generated */}
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`explicit-${track.id}`}
                              checked={currentTrackData.explicit}
                              onChange={(e) => handleTrackUpdate(track.id, "explicit", e.target.checked)}
                              className="w-4 h-4"
                            />
                            <Label htmlFor={`explicit-${track.id}`} className="cursor-pointer">
                              Explicit Content
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`ai-generated-${track.id}`}
                              checked={currentTrackData.aiGenerated}
                              onChange={(e) => handleTrackUpdate(track.id, "aiGenerated", e.target.checked)}
                              className="w-4 h-4"
                            />
                            <Label htmlFor={`ai-generated-${track.id}`} className="cursor-pointer">
                              AI Generated
                            </Label>
                          </div>
                        </div>

                        {/* Primary Genre */}
                        <div>
                          <Label>Primary Genre</Label>
                          <Select
                            value={currentTrackData.primaryGenre || ""}
                            onValueChange={(value) => handleTrackUpdate(track.id, "primaryGenre", value)}
                          >
                            <SelectTrigger className="h-12 mt-2">
                              <SelectValue placeholder="Select primary genre" />
                            </SelectTrigger>
                            <SelectContent>
                              {GENRES.map((genre) => (
                                <SelectItem key={genre} value={genre}>
                                  {genre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Secondary Genre */}
                        <div>
                          <Label>Secondary Genre (Optional)</Label>
                          <Select
                            value={currentTrackData.secondaryGenre || ""}
                            onValueChange={(value) => handleTrackUpdate(track.id, "secondaryGenre", value)}
                          >
                            <SelectTrigger className="h-12 mt-2">
                              <SelectValue placeholder="Select secondary genre" />
                            </SelectTrigger>
                            <SelectContent>
                              {GENRES.map((genre) => (
                                <SelectItem key={genre} value={genre}>
                                  {genre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Lyrics */}
                        <div>
                          <Label>Lyrics</Label>
                          <div className="mt-2 relative">
                            <Textarea
                              value={currentTrackData.lyrics || ""}
                              onChange={(e) => handleTrackUpdate(track.id, "lyrics", e.target.value)}
                              className="min-h-[150px]"
                              placeholder="Введіть текст пісні..."
                            />
                            {currentTrackData.lyrics && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2"
                                onClick={() => copyToClipboard(currentTrackData.lyrics!, "Lyrics")}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Participants */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label>Participants</Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const currentParticipants = currentTrackData.participants || [];
                                handleTrackUpdate(track.id, "participants", [
                                  ...currentParticipants,
                                  { name: "", role: "main_performer" }
                                ]);
                              }}
                            >
                              Add Participant
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(currentTrackData.participants || []).map((participant, idx) => (
                              <div key={idx} className="flex gap-2 items-start">
                                <div className="flex-1">
                                  <Input
                                    placeholder="Name"
                                    value={participant.name || ""}
                                    onChange={(e) => {
                                      const currentParticipants = [...(currentTrackData.participants || [])];
                                      currentParticipants[idx].name = e.target.value;
                                      handleTrackUpdate(track.id, "participants", currentParticipants);
                                    }}
                                    className="h-10"
                                  />
                                </div>
                                <div className="flex-1">
                                  <Select
                                    value={participant.role || "main_performer"}
                                    onValueChange={(value) => {
                                      const currentParticipants = [...(currentTrackData.participants || [])];
                                      currentParticipants[idx].role = value;
                                      handleTrackUpdate(track.id, "participants", currentParticipants);
                                    }}
                                  >
                                    <SelectTrigger className="h-10">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="main_performer">Main Performer</SelectItem>
                                      <SelectItem value="composer">Composer</SelectItem>
                                      <SelectItem value="lyricist">Lyricist</SelectItem>
                                      <SelectItem value="arranger">Arranger</SelectItem>
                                      <SelectItem value="mixing_engineer">Mixing Engineer</SelectItem>
                                      <SelectItem value="mastering_engineer">Mastering Engineer</SelectItem>
                                      <SelectItem value="cover_designer">Cover Designer</SelectItem>
                                      <SelectItem value="musician">Musician</SelectItem>
                                      <SelectItem value="backing_vocalist">Backing Vocalist</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const currentParticipants = [...(currentTrackData.participants || [])];
                                    currentParticipants.splice(idx, 1);
                                    handleTrackUpdate(track.id, "participants", currentParticipants);
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                            {(!currentTrackData.participants || currentTrackData.participants.length === 0) && (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No participants added
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Audio File Section */}
                        <Card className="border-muted">
                          <CardHeader>
                            <CardTitle className="text-base">Аудіо файл</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Current Audio File */}
                            {(track.audioOriginalName || track.audioFileId || track.audioUrl) && (
                              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  <span className="text-sm font-medium">{track.audioOriginalName || 'audio.wav'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDownload(track.audioFileId, track.audioUrl, track.audioOriginalName || `${track.title}.wav`)}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Завантажити
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => copyToClipboard(track.audioOriginalName!, "Audio filename")}
                                  >
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Upload New Audio */}
                            <div>
                              <Label className="text-sm">
                                {track.audioOriginalName ? "Замінити аудіо файл" : "Завантажити аудіо файл"}
                              </Label>
                              <div className="mt-2">
                                <Input
                                  type="file"
                                  accept=".wav,.flac,audio/wav,audio/flac"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleAudioUpload(track.id, file);
                                      // Reset input
                                      e.target.value = '';
                                    }
                                  }}
                                  disabled={uploadAudioMutation.isPending}
                                  className="cursor-pointer"
                                />
                                <p className="text-xs text-muted-foreground mt-2">
                                  Формати: WAV, FLAC • Розмір до 44.1 kHz - 96kHz • Розрядність 16 та 24-bit • Макс 500 MB
                                </p>
                                {uploadAudioMutation.isPending && (
                                  <p className="text-sm text-primary mt-2">Завантаження...</p>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Save/Cancel Buttons */}
                        <div className="flex justify-end gap-2 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setEditingTrackId(null);
                              setTrackEdits(prev => {
                                const updated = { ...prev };
                                delete updated[track.id];
                                return updated;
                              });
                            }}
                            disabled={updateTrackMutation.isPending}
                          >
                            Скасувати
                          </Button>
                          <Button
                            type="button"
                            onClick={() => handleSaveTrack(track.id)}
                            disabled={updateTrackMutation.isPending}
                          >
                            {updateTrackMutation.isPending ? "Зберігання..." : "Save Track Changes"}
                          </Button>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ви впевнені?</AlertDialogTitle>
            <AlertDialogDescription>
              Ця дія назавжди видалить реліз "{release?.title}" та всі пов'язані файли (обкладинка та аудіо треків) з Google Drive. Цю дію не можна скасувати.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReleaseMutation.isPending}>
              Скасувати
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteReleaseMutation.mutate()}
              disabled={deleteReleaseMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteReleaseMutation.isPending ? "Видалення..." : "Видалити назавжди"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
