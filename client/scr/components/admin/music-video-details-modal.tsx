import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Video, Download, Copy, Image as ImageIcon, User, Globe, Film, Edit, X, ChevronDown, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { ROLE_LABELS } from "@/lib/roleLabels";

interface MusicVideoDetailsModalProps {
  videoId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface MusicVideoDetails {
  id: string;
  title: string;
  status: string;
  paymentStatus?: "PENDING" | "PROCESSING" | "PAID" | "FAILED";
  paidAt?: string;
  upc?: string;
  isrc?: string;
  releaseId?: string;
  primaryGenre?: string;
  secondaryGenre?: string;
  language?: string;
  metadataLanguage?: string;
  firstReleaseDate?: string;
  releaseDate?: string;
  releaseTime?: string;
  previewStart?: string;
  thumbnailTime?: string;
  territories?: string[];
  platforms?: string[];
  explicit?: boolean;
  aiGenerated?: boolean;
  videoFileId?: string;
  videoUrl?: string;
  videoOriginalName?: string;
  videoSize?: number;
  videoFormat?: string;
  videoCodec?: string;
  videoResolution?: string;
  duration?: number;
  artworkUrl?: string;
  artworkOriginalName?: string;
  artworkFileId?: string;
  artworkSize?: number;
  performers?: { name: string; role: string }[];
  credits?: { name: string; role: string }[];
  pCopyright?: string;
  cCopyright?: string;
  labelName?: string;
  rightsOwner?: string;
  createdAt?: string;
  updatedAt?: string;
  artistId?: string;
  artist: {
    id: string;
    name: string;
  };
  organization: {
    id: string;
    name: string;
    type: string;
  };
}

export default function MusicVideoDetailsModal({ videoId, isOpen, onClose }: MusicVideoDetailsModalProps) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [metadataEdits, setMetadataEdits] = useState<Partial<MusicVideoDetails>>({});
  const [isTerritoriesOpen, setIsTerritoriesOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Helper function to format date for input type="date"
  const formatDateForInput = (date: string | Date | null | undefined): string => {
    if (!date) return "";
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return "";
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return "";
    }
  };

  useEffect(() => {
    if (!isOpen) {
      setIsEditMode(false);
      setMetadataEdits({});
    }
  }, [isOpen]);

  const { data: video, isLoading } = useQuery({
    queryKey: ["/api/music-videos", videoId],
    enabled: !!videoId && isOpen,
  }) as { data: MusicVideoDetails | undefined; isLoading: boolean };

  // Fetch artists list for editing
  const { data: artists } = useQuery({
    queryKey: ["/api/organizations", video?.organization?.id, "artists"],
    enabled: !!video?.organization?.id && isOpen,
  }) as { data: { id: string; name: string }[] | undefined };

  const updateVideoMutation = useMutation({
    mutationFn: async (updates: Partial<MusicVideoDetails>) => {
      if (!videoId) throw new Error("No video ID");
      const response = await fetch(`/api/admin/music-videos/${videoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!response.ok) throw new Error("Update failed");
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music-videos", videoId] });
      queryClient.invalidateQueries({ queryKey: ["/api/music-videos"] });
      setMetadataEdits({});
      setIsEditMode(false);
      toast({
        title: "Успішно!",
        description: "Метадані відео оновлено",
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

  const deleteVideoMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("No video ID");
      const response = await fetch(`/api/admin/music-videos/${videoId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Delete failed");
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/music-videos"] });
      toast({
        title: "Успішно!",
        description: "Музичне відео видалено",
      });
      setIsDeleteDialogOpen(false);
      onClose();
    },
    onError: () => {
      toast({
        title: "Помилка",
        description: "Не вдалося видалити музичне відео",
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
    },
  });

  const handleSaveChanges = () => {
    updateVideoMutation.mutate(metadataEdits);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Скопійовано!",
        description: `${label} скопійовано в буфер обміну`,
      });
    } catch (error) {
      toast({
        title: "Помилка",
        description: "Не вдалося скопіювати текст",
        variant: "destructive",
      });
    }
  };

  const handleDownloadVideo = async () => {
    if (!video || !video.videoFileId) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`/api/download/${video.videoFileId}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = video.videoOriginalName || `${video.title}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Завантажено!",
        description: `Відео "${video.title}" завантажено`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Помилка",
        description: "Не вдалося завантажити відео",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadArtwork = async () => {
    if (!video || !video.artworkFileId) return;

    try {
      const response = await fetch(`/api/download/${video.artworkFileId}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = video.artworkOriginalName || 'artwork.jpg';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Завантажено!",
        description: "Обкладинку завантажено",
      });
    } catch (error) {
      toast({
        title: "Помилка",
        description: "Не вдалося завантажити обкладинку",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl">
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!video) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <DialogTitle className="text-3xl font-bold mb-2 flex items-center gap-3">
                <Video className="h-8 w-8" />
                {video.title}
              </DialogTitle>
              {video.artist && (
                <p className="text-muted-foreground">{video.artist.name}</p>
              )}
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <Badge variant="outline" className="capitalize">
                {video.status.toLowerCase().replace('_', ' ')}
              </Badge>
              {video.paymentStatus && (
                <Badge 
                  variant={video.paymentStatus === "PAID" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {video.paymentStatus.toLowerCase()}
                </Badge>
              )}
              {isEditMode ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSaveChanges}
                    disabled={updateVideoMutation.isPending}
                  >
                    {updateVideoMutation.isPending ? "Збереження..." : "Зберегти"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsEditMode(false);
                      setMetadataEdits({});
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Скасувати
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Видалити
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Редагувати
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-6">
          {/* Video File & Artwork */}
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5" />
                Файли
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Artwork */}
                {video.artworkUrl && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Обкладинка</p>
                    <img 
                      src={video.artworkUrl} 
                      alt={video.title}
                      className="w-48 h-48 rounded-lg shadow-lg object-cover mb-2"
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleDownloadArtwork}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Завантажити обкладинку
                    </Button>
                  </div>
                )}

                {/* Video File Info */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Відео файл</p>
                  {video.videoFileId ? (
                    <Button 
                      variant="default" 
                      size="lg"
                      onClick={handleDownloadVideo}
                      disabled={isDownloading}
                      className="w-full"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {isDownloading ? "Завантаження..." : "Завантажити відео"}
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="lg"
                      disabled
                      className="w-full"
                    >
                      Відео не завантажено
                    </Button>
                  )}
                  
                  {/* Video Original Filename */}
                  {video.videoOriginalName && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-muted-foreground">Файл: {video.videoOriginalName}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.videoOriginalName!, "Назва файлу")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Video Size */}
                  {video.videoSize && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-muted-foreground">Розмір: {formatFileSize(video.videoSize)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(formatFileSize(video.videoSize!), "Розмір")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Video Format */}
                  {video.videoFormat && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-muted-foreground">Формат: {video.videoFormat}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.videoFormat!, "Формат")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Video Codec */}
                  {video.videoCodec && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-muted-foreground">Кодек: {video.videoCodec}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.videoCodec!, "Кодек")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Video Resolution */}
                  {video.videoResolution && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-muted-foreground">Роздільна здатність: {video.videoResolution}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.videoResolution!, "Роздільна здатність")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  
                  {/* Video Duration */}
                  {video.duration && (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 text-sm text-muted-foreground">Тривалість: {formatDuration(video.duration)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(formatDuration(video.duration!), "Тривалість")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Basic Info with Copy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Основна інформація
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {/* Title */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">* Назва відео</p>
                <div className="flex items-center gap-2">
                  {isEditMode ? (
                    <Input
                      value={metadataEdits.title ?? video.title}
                      onChange={(e) => setMetadataEdits({ ...metadataEdits, title: e.target.value })}
                      className="h-10 flex-1"
                    />
                  ) : (
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.title}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(metadataEdits.title ?? video.title, "Назва відео")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Artist */}
              {video.artist && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">* Виконавець</p>
                  {isEditMode ? (
                    <Select
                      value={metadataEdits.artistId ?? video.artist.id}
                      onValueChange={(value) => setMetadataEdits({ ...metadataEdits, artistId: value })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {artists?.map((artist) => (
                          <SelectItem key={artist.id} value={artist.id}>
                            {artist.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                        {video.artist.name}
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.artist.name, "Виконавець")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Primary Genre */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">* Основний жанр</p>
                {isEditMode ? (
                  <Select
                    value={metadataEdits.primaryGenre ?? video.primaryGenre ?? ""}
                    onValueChange={(value) => setMetadataEdits({ ...metadataEdits, primaryGenre: value })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Оберіть жанр" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Electronic", "Pop", "Rock", "Hip Hop", "R&B", "Country", "Jazz", "Classical", "Folk", "Reggae", "Blues", "Alternative", "Indie", "Dance", "House", "Techno", "Ambient", "World", "Christian", "Christian & Gospel"].map(genre => (
                        <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.primaryGenre || "—"}
                    </p>
                    {video.primaryGenre && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.primaryGenre!, "Основний жанр")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Secondary Genre */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Додатковий жанр</p>
                {isEditMode ? (
                  <Select
                    value={metadataEdits.secondaryGenre ?? video.secondaryGenre ?? ""}
                    onValueChange={(value) => setMetadataEdits({ ...metadataEdits, secondaryGenre: value })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Оберіть жанр" />
                    </SelectTrigger>
                    <SelectContent>
                      {["Electronic", "Pop", "Rock", "Hip Hop", "R&B", "Country", "Jazz", "Classical", "Folk", "Reggae", "Blues", "Alternative", "Indie", "Dance", "House", "Techno", "Ambient", "World", "Christian", "Christian & Gospel"].map(genre => (
                        <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.secondaryGenre || "—"}
                    </p>
                    {video.secondaryGenre && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.secondaryGenre!, "Додатковий жанр")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Language */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Мова</p>
                {isEditMode ? (
                  <Select
                    value={metadataEdits.language ?? video.language ?? ""}
                    onValueChange={(value) => setMetadataEdits({ ...metadataEdits, language: value })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Оберіть мову" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="uk">Ukrainian</SelectItem>
                      <SelectItem value="pl">Polish</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="ru">Russian</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.language || "—"}
                    </p>
                    {video.language && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.language!, "Мова")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Metadata Language */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Мова метаданих</p>
                {isEditMode ? (
                  <Select
                    value={metadataEdits.metadataLanguage ?? video.metadataLanguage ?? ""}
                    onValueChange={(value) => setMetadataEdits({ ...metadataEdits, metadataLanguage: value })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Оберіть мову метаданих" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="uk">Ukrainian</SelectItem>
                      <SelectItem value="pl">Polish</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="ru">Russian</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.metadataLanguage || "—"}
                    </p>
                    {video.metadataLanguage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.metadataLanguage!, "Мова метаданих")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* First Release Date */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Дата першого релізу</p>
                {isEditMode ? (
                  <Input
                    type="date"
                    value={formatDateForInput(metadataEdits.firstReleaseDate ?? video.firstReleaseDate)}
                    onChange={(e) => setMetadataEdits({ ...metadataEdits, firstReleaseDate: e.target.value })}
                    className="h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.firstReleaseDate ? new Date(video.firstReleaseDate).toLocaleDateString() : "—"}
                    </p>
                    {video.firstReleaseDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(new Date(video.firstReleaseDate!).toLocaleDateString(), "Дата першого релізу")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Release Date */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Дата публікації</p>
                {isEditMode ? (
                  <Input
                    type="date"
                    value={formatDateForInput(metadataEdits.releaseDate ?? video.releaseDate)}
                    onChange={(e) => setMetadataEdits({ ...metadataEdits, releaseDate: e.target.value })}
                    className="h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.releaseDate ? new Date(video.releaseDate).toLocaleDateString() : "—"}
                    </p>
                    {video.releaseDate && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(new Date(video.releaseDate!).toLocaleDateString(), "Дата публікації")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Release Time */}
              {video.releaseTime && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Час публікації</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.releaseTime}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.releaseTime!, "Час публікації")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Preview Start */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Початок прев'ю</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                    {video.previewStart || "—"}
                  </p>
                  {video.previewStart && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.previewStart!, "Початок прев'ю")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Thumbnail Time */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Час мініатюри</p>
                <div className="flex items-center gap-2">
                  <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                    {video.thumbnailTime || "—"}
                  </p>
                  {video.thumbnailTime && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.thumbnailTime!, "Час мініатюри")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Explicit */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Explicit контент</p>
                {isEditMode ? (
                  <Select
                    value={String(metadataEdits.explicit ?? video.explicit ?? false)}
                    onValueChange={(value) => setMetadataEdits({ ...metadataEdits, explicit: value === "true" })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Ні</SelectItem>
                      <SelectItem value="true">Так</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.explicit ? "Так" : "Ні"}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.explicit ? "Так" : "Ні", "Explicit контент")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* AI Generated */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Контент створений ШІ</p>
                {isEditMode ? (
                  <Select
                    value={String(metadataEdits.aiGenerated ?? video.aiGenerated ?? false)}
                    onValueChange={(value) => setMetadataEdits({ ...metadataEdits, aiGenerated: value === "true" })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">Ні</SelectItem>
                      <SelectItem value="true">Так 🤖</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.aiGenerated ? "Так 🤖" : "Ні"}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.aiGenerated ? "Так" : "Ні", "ШІ контент")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Organization */}
              {video.organization && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Організація</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.organization.name} ({video.organization.type})
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.organization.name, "Організація")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Created At */}
              {video.createdAt && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Створено</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {new Date(video.createdAt).toLocaleString()}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(new Date(video.createdAt!).toLocaleString(), "Створено")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Updated At */}
              {video.updatedAt && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Оновлено</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {new Date(video.updatedAt).toLocaleString()}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(new Date(video.updatedAt!).toLocaleString(), "Оновлено")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Copyright & Rights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                ©️ Авторські права
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {/* P Copyright */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">℗ Авторські права на фонограму</p>
                {isEditMode ? (
                  <Input
                    value={metadataEdits.pCopyright ?? video.pCopyright ?? ""}
                    onChange={(e) => setMetadataEdits({ ...metadataEdits, pCopyright: e.target.value })}
                    placeholder="℗ 2024 Label Name"
                    className="h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.pCopyright || "—"}
                    </p>
                    {video.pCopyright && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.pCopyright!, "℗ Copyright")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* C Copyright */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">© Авторські права</p>
                {isEditMode ? (
                  <Input
                    value={metadataEdits.cCopyright ?? video.cCopyright ?? ""}
                    onChange={(e) => setMetadataEdits({ ...metadataEdits, cCopyright: e.target.value })}
                    placeholder="© 2024 Artist Name"
                    className="h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.cCopyright || "—"}
                    </p>
                    {video.cCopyright && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.cCopyright!, "© Copyright")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Label Name */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Лейбл</p>
                {isEditMode ? (
                  <Input
                    value={metadataEdits.labelName ?? video.labelName ?? ""}
                    onChange={(e) => setMetadataEdits({ ...metadataEdits, labelName: e.target.value })}
                    placeholder="Label Name"
                    className="h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.labelName || "—"}
                    </p>
                    {video.labelName && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.labelName!, "Лейбл")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Rights Owner */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Власник прав</p>
                {isEditMode ? (
                  <Input
                    value={metadataEdits.rightsOwner ?? video.rightsOwner ?? ""}
                    onChange={(e) => setMetadataEdits({ ...metadataEdits, rightsOwner: e.target.value })}
                    placeholder="Rights Owner"
                    className="h-10"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {video.rightsOwner || "—"}
                    </p>
                    {video.rightsOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.rightsOwner!, "Власник прав")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Performers */}
          {video.performers && video.performers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Виконавці ({video.performers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {video.performers.map((performer, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                          {performer.name}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(performer.name, `Виконавець #${index + 1}`)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted text-muted-foreground">
                          {ROLE_LABELS[performer.role as keyof typeof ROLE_LABELS] || performer.role}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(ROLE_LABELS[performer.role as keyof typeof ROLE_LABELS] || performer.role, "Роль")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Credits */}
          {video.credits && video.credits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Учасники ({video.credits.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {video.credits.map((credit, index) => (
                    <div key={index} className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                          {credit.name}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(credit.name, `Учасник #${index + 1}`)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted text-muted-foreground">
                          {ROLE_LABELS[credit.role as keyof typeof ROLE_LABELS] || credit.role}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(ROLE_LABELS[credit.role as keyof typeof ROLE_LABELS] || credit.role, "Роль")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Дистрибуція
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Platforms */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Платформи ({video.platforms?.length || 0})</p>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-h-10 flex items-center px-3 rounded-md border bg-muted flex-wrap gap-1">
                    {video.platforms && video.platforms.length > 0 ? (
                      video.platforms.map((platform, index) => (
                        <Badge key={index} variant="secondary">{platform}</Badge>
                      ))
                    ) : "—"}
                  </div>
                  {video.platforms && video.platforms.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.platforms!.join(', '), "Платформи")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Territories */}
              <Collapsible open={isTerritoriesOpen} onOpenChange={setIsTerritoriesOpen}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-muted-foreground">Території ({video.territories?.length || 0})</p>
                  <div className="flex items-center gap-2">
                    {video.territories && video.territories.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(video.territories!.join(', '), "Території")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <ChevronDown className={`h-4 w-4 transition-transform ${isTerritoriesOpen ? "rotate-180" : ""}`} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="min-h-10 flex items-center px-3 rounded-md border bg-muted flex-wrap gap-1 mt-2">
                    {video.territories && video.territories.length > 0 ? (
                      video.territories.map((territory, index) => (
                        <Badge key={index} variant="outline" className="text-xs">{territory}</Badge>
                      ))
                    ) : "—"}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Admin Controls - UPC, ISRC, Payment Info */}
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                🔧 Admin Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              {/* UPC */}
              <div>
                <Label>UPC</Label>
                <div className="flex items-center gap-2 mt-2">
                  {isEditMode ? (
                    <Input
                      value={metadataEdits.upc ?? video.upc ?? ""}
                      onChange={(e) => setMetadataEdits({ ...metadataEdits, upc: e.target.value })}
                      placeholder="Enter UPC"
                      className="h-12 flex-1 font-mono"
                    />
                  ) : (
                    <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted font-mono">
                      {video.upc || "—"}
                    </p>
                  )}
                  {video.upc && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.upc!, "UPC")}
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
                  {isEditMode ? (
                    <Input
                      value={metadataEdits.isrc ?? video.isrc ?? ""}
                      onChange={(e) => setMetadataEdits({ ...metadataEdits, isrc: e.target.value })}
                      placeholder="Enter ISRC"
                      className="h-12 flex-1 font-mono"
                    />
                  ) : (
                    <p className="flex-1 h-12 flex items-center px-3 rounded-md border bg-muted font-mono">
                      {video.isrc || "—"}
                    </p>
                  )}
                  {video.isrc && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.isrc!, "ISRC")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Status */}
              <div>
                <Label>Статус релізу</Label>
                <div className="flex items-center gap-2 mt-2">
                  {isEditMode ? (
                    <Select
                      value={metadataEdits.status ?? video.status}
                      onValueChange={(value) => setMetadataEdits({ ...metadataEdits, status: value })}
                    >
                      <SelectTrigger className="h-12">
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
                    <Badge 
                      variant="outline"
                      className="capitalize h-12 flex items-center justify-center"
                    >
                      {video.status.toLowerCase().replace('_', ' ')}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Payment Status */}
              <div>
                <Label>Статус оплати</Label>
                <div className="flex items-center gap-2 mt-2">
                  {isEditMode ? (
                    <Select
                      value={metadataEdits.paymentStatus ?? video.paymentStatus ?? "PENDING"}
                      onValueChange={(value) => setMetadataEdits({ ...metadataEdits, paymentStatus: value as any })}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="PROCESSING">Processing</SelectItem>
                        <SelectItem value="PAID">Paid</SelectItem>
                        <SelectItem value="FAILED">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge 
                      variant={video.paymentStatus === "PAID" ? "default" : "secondary"}
                      className="capitalize h-12 flex items-center justify-center"
                    >
                      {video.paymentStatus?.toLowerCase() || "—"}
                    </Badge>
                  )}
                </div>
              </div>


              {/* Paid At */}
              {video.paidAt && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Дата оплати</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted">
                      {new Date(video.paidAt).toLocaleString()}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(new Date(video.paidAt!).toLocaleString(), "Дата оплати")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}


              {/* Release ID (if linked to release) */}
              {video.releaseId && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground mb-2">Пов'язаний з аудіо релізом</p>
                  <div className="flex items-center gap-2">
                    <p className="flex-1 h-10 flex items-center px-3 rounded-md border bg-muted font-mono text-xs">
                      {video.releaseId}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(video.releaseId!, "Release ID")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Підтвердження видалення</AlertDialogTitle>
            <AlertDialogDescription>
              Ви впевнені, що хочете видалити музичне відео "{video.title}"? 
              Цю дію неможливо скасувати. Всі дані та файли, пов'язані з цим відео, будуть видалені назавжди.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteVideoMutation.mutate()}
              disabled={deleteVideoMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteVideoMutation.isPending ? "Видалення..." : "Видалити"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
