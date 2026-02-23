import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Target, Copy, Calendar, User, Building2, Hash, DollarSign, Image as ImageIcon, Music, Edit, X, Save, Table } from "lucide-react";
import { format } from "date-fns";

interface PitchingDetailsModalProps {
  submission: PitchingSubmission | null;
  isOpen: boolean;
  onClose: () => void;
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
    releaseDate?: string | null;
    artist: {
      name: string;
    };
    organization: {
      name: string;
    };
  };
}

export default function PitchingDetailsModal({ submission, isOpen, onClose }: PitchingDetailsModalProps) {
  const { toast } = useToast();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<Partial<PitchingSubmission>>({});

  // Reset edit mode when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsEditMode(false);
      setEditedData({});
    }
  }, [isOpen]);

  // Initialize edited data when entering edit mode
  useEffect(() => {
    if (isEditMode && submission) {
      setEditedData({
        focusTrack: submission.focusTrack,
        releaseDescription: submission.releaseDescription,
        artistInfo: submission.artistInfo,
        promoplan: submission.promoplan,
        budget: submission.budget,
        photosGoogleDrive: submission.photosGoogleDrive,
        spotifyUrl: submission.spotifyUrl || "",
        appleMusicUrl: submission.appleMusicUrl || "",
        instagramUrl: submission.instagramUrl || "",
        status: submission.status,
      });
    }
  }, [isEditMode, submission]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<PitchingSubmission>) => {
      if (!submission) throw new Error("No submission");
      return await apiRequest("PATCH", `/api/admin/pitching/${submission.id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pitching"] });
      toast({
        title: "Збережено",
        description: "Зміни успішно збережено",
      });
      setIsEditMode(false);
      setEditedData({});
    },
    onError: (error: any) => {
      toast({
        title: "Помилка",
        description: error.message || "Не вдалося зберегти зміни",
        variant: "destructive",
      });
    },
  });

  if (!submission) return null;

  const displayData = isEditMode ? { ...submission, ...editedData } : submission;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопійовано",
      description: `${label} скопійовано в буфер обміну`,
    });
  };

  const copyAsTable = () => {
    if (!submission) return;
    
    const releaseDateFormatted = submission.release.releaseDate 
      ? format(new Date(submission.release.releaseDate), "dd.MM.yyyy")
      : "";
    
    const columns = [
      submission.focusTrack || "",
      submission.release.artist.name || "",
      releaseDateFormatted,
      submission.photosGoogleDrive || "",
      submission.releaseDescription?.replace(/\n/g, " ") || "",
      submission.artistInfo?.replace(/\n/g, " ") || "",
      submission.promoplan?.replace(/\n/g, " ") || "",
      submission.budget || "",
      submission.instagramUrl || "",
    ];
    
    const tsv = columns.join("\t");
    navigator.clipboard.writeText(tsv);
    toast({
      title: "Таблицю скопійовано",
      description: "Дані готові для вставки в Google Sheets / Excel",
    });
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd.MM.yyyy HH:mm");
  };

  const getStatusLabel = (status: string) => {
    const statusLabels: Record<string, string> = {
      PENDING: "На розгляді",
      SUBMITTED: "Відправлено",
    };
    return statusLabels[status] || status;
  };

  const getStatusBadge = (status: string) => {
    const statusColors: Record<string, string> = {
      PENDING: "bg-yellow-500 hover:bg-yellow-600",
      SUBMITTED: "bg-blue-500 hover:bg-blue-600",
    };
    return statusColors[status] || "bg-gray-500 hover:bg-gray-600";
  };

  const handleSave = () => {
    updateMutation.mutate(editedData);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    setEditedData({});
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Деталі заявки на пітчинг
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyAsTable}
                className="gap-2"
                title="Копіювати як таблицю для Google Sheets / Excel"
              >
                <Table className="h-4 w-4" />
                Копіювати таблицю
              </Button>
              {!isEditMode ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditMode(true)}
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Редагувати
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancel}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Скасувати
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {updateMutation.isPending ? "Збереження..." : "Зберегти"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* БЛОК 1: Header + Фокус трек */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl mb-2">{submission.release.title}</CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{submission.release.artist.name}</span>
                    <span>•</span>
                    <Building2 className="h-4 w-4" />
                    <span>{submission.release.organization.name}</span>
                  </div>
                </div>
                {isEditMode ? (
                  <Select
                    value={displayData.status || submission.status}
                    onValueChange={(value) => setEditedData({ ...editedData, status: value })}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">На розгляді</SelectItem>
                      <SelectItem value="SUBMITTED">Відправлено</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge className={getStatusBadge(displayData.status || submission.status)}>
                    {getStatusLabel(displayData.status || submission.status)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Створено</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatDate(submission.createdAt)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(formatDate(submission.createdAt), "Дата створення")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Оновлено</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatDate(submission.updatedAt)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(formatDate(submission.updatedAt), "Дата оновлення")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* UPC */}
              {submission.release.upc && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hash className="h-4 w-4" />
                    <span>UPC</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium">{submission.release.upc}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(submission.release.upc!, "UPC")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Фокус трек */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Music className="h-4 w-4" />
                  <span>Фокус трек</span>
                </div>
                {isEditMode ? (
                  <Input
                    value={displayData.focusTrack || ""}
                    onChange={(e) => setEditedData({ ...editedData, focusTrack: e.target.value })}
                    placeholder="Введіть фокус трек"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{displayData.focusTrack}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(displayData.focusTrack || "", "Фокус трек")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* БЛОК 2: Описи (Release Description, Artist Info, Promo Plan) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Описи</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Release Description */}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Опис релізу</div>
                {isEditMode ? (
                  <Textarea
                    value={displayData.releaseDescription || ""}
                    onChange={(e) => setEditedData({ ...editedData, releaseDescription: e.target.value })}
                    placeholder="Введіть опис релізу"
                    rows={4}
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">{displayData.releaseDescription}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.releaseDescription || "", "Опис релізу")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Artist Info */}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Інформація про артиста</div>
                {isEditMode ? (
                  <Textarea
                    value={displayData.artistInfo || ""}
                    onChange={(e) => setEditedData({ ...editedData, artistInfo: e.target.value })}
                    placeholder="Введіть інформацію про артиста"
                    rows={4}
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">{displayData.artistInfo}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.artistInfo || "", "Інформація про артиста")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Promo Plan */}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Промо-план</div>
                {isEditMode ? (
                  <Textarea
                    value={displayData.promoplan || ""}
                    onChange={(e) => setEditedData({ ...editedData, promoplan: e.target.value })}
                    placeholder="Введіть промо-план"
                    rows={4}
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="text-sm whitespace-pre-wrap flex-1">{displayData.promoplan}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.promoplan || "", "Промо-план")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* БЛОК 3: Бюджет + Google Drive */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Фінансова інформація</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Budget */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="h-4 w-4" />
                  <span>Бюджет</span>
                </div>
                {isEditMode ? (
                  <Input
                    value={displayData.budget || ""}
                    onChange={(e) => setEditedData({ ...editedData, budget: e.target.value })}
                    placeholder="Введіть бюджет"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{displayData.budget}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(displayData.budget || "", "Бюджет")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Google Drive */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4" />
                  <span>Google Drive з фото</span>
                </div>
                {isEditMode ? (
                  <Input
                    value={displayData.photosGoogleDrive || ""}
                    onChange={(e) => setEditedData({ ...editedData, photosGoogleDrive: e.target.value })}
                    placeholder="Введіть посилання на Google Drive"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <a 
                      href={displayData.photosGoogleDrive} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline break-all"
                    >
                      {displayData.photosGoogleDrive}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.photosGoogleDrive || "", "Google Drive посилання")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* БЛОК 4: Соціальні мережі */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Соціальні профілі</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Spotify */}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Spotify</div>
                {isEditMode ? (
                  <Input
                    value={displayData.spotifyUrl || ""}
                    onChange={(e) => setEditedData({ ...editedData, spotifyUrl: e.target.value })}
                    placeholder="Введіть URL Spotify"
                  />
                ) : displayData.spotifyUrl ? (
                  <div className="flex items-center gap-2">
                    <a 
                      href={displayData.spotifyUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline break-all"
                    >
                      {displayData.spotifyUrl}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.spotifyUrl!, "Spotify URL")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Не вказано</p>
                )}
              </div>

              {/* Apple Music */}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Apple Music</div>
                {isEditMode ? (
                  <Input
                    value={displayData.appleMusicUrl || ""}
                    onChange={(e) => setEditedData({ ...editedData, appleMusicUrl: e.target.value })}
                    placeholder="Введіть URL Apple Music"
                  />
                ) : displayData.appleMusicUrl ? (
                  <div className="flex items-center gap-2">
                    <a 
                      href={displayData.appleMusicUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline break-all"
                    >
                      {displayData.appleMusicUrl}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.appleMusicUrl!, "Apple Music URL")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Не вказано</p>
                )}
              </div>

              {/* Instagram */}
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">Instagram</div>
                {isEditMode ? (
                  <Input
                    value={displayData.instagramUrl || ""}
                    onChange={(e) => setEditedData({ ...editedData, instagramUrl: e.target.value })}
                    placeholder="Введіть URL Instagram"
                  />
                ) : displayData.instagramUrl ? (
                  <div className="flex items-center gap-2">
                    <a 
                      href={displayData.instagramUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline break-all"
                    >
                      {displayData.instagramUrl}
                    </a>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => copyToClipboard(displayData.instagramUrl!, "Instagram URL")}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Не вказано</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
