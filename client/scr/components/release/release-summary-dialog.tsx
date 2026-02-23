import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AudioPlayer } from "@/components/ui/audio-player";
import { 
  Calendar, 
  User, 
  Disc, 
  Check,
  FileAudio,
  Users,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  FileText,
  Globe,
  Music,
  Hash
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROLE_LABELS } from "@/lib/roleLabels";

interface Performer {
  name: string;
  role: string;
}

interface Contributor {
  name: string;
  role: string;
}

interface TrackMetadata {
  title: string;
  version?: string;
  primaryGenre: string;
  secondaryGenre?: string;
  language: string;
  explicitContent: string;
  aiGenerated: boolean;
  isrc?: string;
  performers?: Performer[];
  contributors?: Contributor[];
  hasNoLyrics?: boolean;
  hasNoMusic?: boolean;
  lyrics?: string;
  previewStartTime?: string;
}

interface ReleaseMetadata {
  title: string;
  albumVersion?: string;
  primaryGenre: string;
  secondaryGenre?: string;
  language: string;
  originalReleaseDate: string;
  releaseDate: string;
  upc?: string;
  subLabel?: string;
  performers?: Performer[];
}

interface AudioFile {
  fileId?: string;
}

interface ReleaseSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseMetadata: ReleaseMetadata;
  tracksMetadata: TrackMetadata[];
  audioFiles?: AudioFile[];
  coverArtUrl?: string;
  selectedTerritories?: Set<string> | string[];
  onEdit?: (step: "files" | "metadata" | "tracks" | "territories") => void;
  onConfirm: () => void | Promise<void>;
  isSubmitting?: boolean;
}

export function ReleaseSummaryDialog({
  open,
  onOpenChange,
  releaseMetadata,
  tracksMetadata,
  audioFiles,
  coverArtUrl,
  selectedTerritories,
  onEdit,
  onConfirm,
  isSubmitting = false,
}: ReleaseSummaryDialogProps) {
  const { t } = useTranslation();
  const [expandedLyrics, setExpandedLyrics] = useState<number[]>([]);

  const toggleLyrics = (index: number) => {
    setExpandedLyrics(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index) 
        : [...prev, index]
    );
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleDateString("uk-UA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const getReleaseType = () => {
    const count = tracksMetadata.length;
    if (count === 1) return "Single";
    if (count >= 2 && count <= 6) return "EP";
    return "Album";
  };

  const getTerritoriesCount = () => {
    if (!selectedTerritories) return 0;
    if (selectedTerritories instanceof Set) return selectedTerritories.size;
    return selectedTerritories.length;
  };

  const getMainArtist = () => {
    const mainPerformer = releaseMetadata.performers?.find(p => p.role === "main_performer" || p.role === "primary");
    return mainPerformer?.name || releaseMetadata.performers?.[0]?.name || "—";
  };

  const getPerformersWithRoles = (track: TrackMetadata) => {
    return (track.performers || []).filter(p => p.name).map(p => ({
      name: p.name,
      role: ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] || p.role
    }));
  };

  const getContributorsWithRoles = (track: TrackMetadata) => {
    return (track.contributors || []).filter(c => c.name).map(c => ({
      name: c.name,
      role: ROLE_LABELS[c.role as keyof typeof ROLE_LABELS] || c.role
    }));
  };

  const getExplicitBadge = (value: string) => {
    switch (value) {
      case "yes": 
        return <Badge variant="destructive" className="text-xs">Explicit</Badge>;
      case "no": 
        return <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">Clean</Badge>;
      case "censored": 
        return <Badge variant="outline" className="text-xs">Censored</Badge>;
      default: 
        return null;
    }
  };

  const hasLyrics = (track: TrackMetadata) => {
    return track.lyrics && track.lyrics.trim().length > 0 && !track.hasNoLyrics;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl font-semibold flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            Перевірка релізу перед відправкою
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-6 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-1">
                {coverArtUrl ? (
                  <img
                    src={coverArtUrl}
                    alt="Cover art"
                    className="w-full aspect-square object-cover rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                    <Disc className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-2xl font-bold leading-tight">
                      {releaseMetadata.title || "Без назви"}
                      {releaseMetadata.albumVersion && (
                        <span className="text-muted-foreground font-normal text-lg"> ({releaseMetadata.albumVersion})</span>
                      )}
                    </h2>
                    <p className="text-base text-muted-foreground flex items-center gap-1 mt-0.5">
                      <User className="h-4 w-4" />
                      {getMainArtist()}
                    </p>
                  </div>
                  <Badge variant="outline" className="flex-shrink-0 text-sm font-medium">
                    <Music className="h-3.5 w-3.5 mr-1" />
                    {getReleaseType()}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <span className="text-muted-foreground block text-xs">Жанр</span>
                    <span className="font-medium text-sm">{releaseMetadata.primaryGenre || "—"}</span>
                    {releaseMetadata.secondaryGenre && (
                      <span className="text-muted-foreground text-xs"> / {releaseMetadata.secondaryGenre}</span>
                    )}
                  </div>
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <span className="text-muted-foreground block text-xs">Мова</span>
                    <span className="font-medium text-sm">{releaseMetadata.language || "—"}</span>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <span className="text-muted-foreground block text-xs">Дата релізу</span>
                    <span className="font-medium text-sm flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(releaseMetadata.releaseDate)}
                    </span>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <span className="text-muted-foreground block text-xs">Оригінальна дата</span>
                    <span className="font-medium text-sm">{formatDate(releaseMetadata.originalReleaseDate)}</span>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <span className="text-muted-foreground block text-xs">UPC</span>
                    <span className="font-medium font-mono text-xs">{releaseMetadata.upc || "Буде згенеровано"}</span>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2.5">
                    <span className="text-muted-foreground block text-xs">Території</span>
                    <span className="font-medium text-sm flex items-center gap-1">
                      <Globe className="h-3 w-3" />
                      {getTerritoriesCount()} країн
                    </span>
                  </div>
                </div>

                {releaseMetadata.subLabel && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Саб-лейбл: </span>
                    <span className="font-medium">{releaseMetadata.subLabel}</span>
                  </div>
                )}

                {releaseMetadata.performers && releaseMetadata.performers.filter(p => p.name).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {releaseMetadata.performers.filter(p => p.name).map((performer, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {performer.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold flex items-center gap-2 mb-3 text-base">
                <FileAudio className="h-4 w-4" />
                Треки ({tracksMetadata.length})
              </h3>

              <div className="space-y-2">
                {tracksMetadata.map((track, index) => {
                  const performers = getPerformersWithRoles(track);
                  const contributors = getContributorsWithRoles(track);
                  const isLyricsExpanded = expandedLyrics.includes(index);
                  const trackHasLyrics = hasLyrics(track);

                  return (
                    <div
                      key={index}
                      className="bg-muted/30 border rounded-lg overflow-hidden"
                    >
                      <div className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                              {index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm leading-tight">
                                {track.title || `Трек ${index + 1}`}
                                {track.version && (
                                  <span className="text-muted-foreground font-normal"> ({track.version})</span>
                                )}
                              </p>
                              {track.isrc && (
                                <p className="text-xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                                  <Hash className="h-3 w-3" />
                                  {track.isrc}
                                </p>
                              )}
                              {audioFiles?.[index]?.fileId && (
                                <div className="mt-2">
                                  <AudioPlayer 
                                    src={`/api/files/download/${audioFiles[index].fileId}`}
                                    className="bg-background/50 rounded-md px-2 py-1"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {getExplicitBadge(track.explicitContent)}
                            {track.aiGenerated && (
                              <Badge variant="outline" className="text-xs gap-0.5 px-1.5">
                                <Sparkles className="h-3 w-3" />
                                AI
                              </Badge>
                            )}
                          </div>
                        </div>

                        {performers.length > 0 && (
                          <div className="ml-8 text-xs">
                            <span className="text-muted-foreground">Виконавці: </span>
                            {performers.map((p, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                <span className="text-foreground">{p.name}</span>
                                <span className="text-muted-foreground/70"> ({p.role})</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {contributors.length > 0 && (
                          <div className="ml-8 text-xs">
                            <span className="text-muted-foreground">Автори: </span>
                            {contributors.map((c, i) => (
                              <span key={i}>
                                {i > 0 && ", "}
                                <span className="text-foreground">{c.name}</span>
                                <span className="text-muted-foreground/70"> ({c.role})</span>
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-8 text-xs text-muted-foreground">
                          {track.primaryGenre && (
                            <span>
                              Жанр: {track.primaryGenre}
                              {track.secondaryGenre && ` / ${track.secondaryGenre}`}
                            </span>
                          )}
                          {track.language && (
                            <span>Мова: {track.language}</span>
                          )}
                          {track.previewStartTime && track.previewStartTime !== "00:00" && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              TikTok: {track.previewStartTime}
                            </span>
                          )}
                          {track.hasNoLyrics && (
                            <span className="text-amber-500">Без тексту</span>
                          )}
                          {track.hasNoMusic && (
                            <span className="text-amber-500">Без музики</span>
                          )}
                        </div>

                        {trackHasLyrics && (
                          <Collapsible 
                            open={isLyricsExpanded} 
                            onOpenChange={() => toggleLyrics(index)}
                            className="ml-8"
                          >
                            <CollapsibleTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <FileText className="h-3 w-3 mr-1" />
                                {isLyricsExpanded ? "Сховати текст" : "Показати текст"}
                                {isLyricsExpanded ? (
                                  <ChevronUp className="h-3 w-3 ml-1" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 ml-1" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-1.5">
                              <div className="bg-background/50 rounded-md p-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto border">
                                {track.lyrics}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t bg-muted/30">
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:justify-between">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Повернутися до редагування
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Створення релізу...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Підтвердити і продовжити
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
