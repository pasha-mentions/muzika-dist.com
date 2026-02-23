import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Film, Play, Trash2, Users, X, Disc3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useReleaseDraft } from "@/hooks/useReleaseDraft";
import { useVideoDraft } from "@/hooks/useVideoDraft";
import { DraftList } from "@/components/release/draft-list";

import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const HOLIDAY_MODE = false;
const HolidayMusic = HOLIDAY_MODE ? Disc3 : Music;
const HolidayFilm = Film;

interface AdminOrganization {
  id: string;
  name: string;
  type: string;
}

export default function Releases() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPlatformAdmin } = useAuth();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  // Fetch organizations list for admins
  const { data: adminOrganizations = [] } = useQuery<AdminOrganization[]>({
    queryKey: ["/api/admin/organizations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/organizations", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organizations");
      return res.json();
    },
    enabled: isPlatformAdmin,
  });

  // Get selected organization info
  const selectedOrg = selectedOrgId 
    ? adminOrganizations.find(o => o.id === selectedOrgId) 
    : null;

  const { drafts, currentDraftId, loadDraft, deleteDraft } = useReleaseDraft("RELEASE", selectedOrgId);
  const { 
    drafts: videoDrafts, 
    currentDraftId: currentVideoDraftId, 
    loadDraft: loadVideoDraft, 
    deleteDraft: deleteVideoDraft 
  } = useVideoDraft();

  const handleSongSelect = () => {
    navigate("/releases/new");
  };

  const handleMusicVideoSelect = () => {
    navigate("/new-video");
  };

  return (
    <div className="py-6 relative">

      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8">
        {/* Admin Organization Selector */}
        {isPlatformAdmin && (
          <div className="mb-6 max-w-md mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Перегляд чернеток організації:</span>
            </div>
            <div className="flex gap-2">
              <Select
                value={selectedOrgId || ""}
                onValueChange={(value) => setSelectedOrgId(value || null)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Оберіть організацію..." />
                </SelectTrigger>
                <SelectContent>
                  {adminOrganizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOrgId && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => setSelectedOrgId(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Admin Acting Banner */}
        {selectedOrg && (
          <Alert className="mb-6 max-w-2xl mx-auto border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <Users className="h-4 w-4" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              Ви переглядаєте чернетки організації: <strong>{selectedOrg.name}</strong>
            </AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground mb-3">
            {t('releasesPage.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('releasesPage.description')}
          </p>
        </div>

        {/* Release Type Selection Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-12 max-w-2xl mx-auto">
          {/* Song Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg hover:border-primary transition-all duration-200 border-2 group"
            onClick={handleSongSelect}
          >
            <CardContent className="p-6 text-center">
              {/* Icon with gradient background */}
              <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <HolidayMusic className="w-8 h-8 text-white" strokeWidth={2} />
              </div>
              
              <h2 className="text-xl font-bold">{t('releasesPage.song')}</h2>
            </CardContent>
          </Card>

          {/* Music Video Card */}
          <Card 
            className="cursor-pointer hover:shadow-lg hover:border-primary transition-all duration-200 border-2 group"
            onClick={handleMusicVideoSelect}
          >
            <CardContent className="p-6 text-center">
              {/* Icon with gradient background */}
              <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-purple-400 to-pink-600 rounded-2xl flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
                <HolidayFilm className="w-8 h-8 text-white" strokeWidth={2} />
              </div>
              
              <h2 className="text-xl font-bold">{t('releasesPage.musicVideo')}</h2>
            </CardContent>
          </Card>
        </div>

        {/* Audio Releases Draft List */}
        {drafts.length > 0 && (
          <div className="max-w-4xl mx-auto mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <HolidayMusic className="w-5 h-5" />
              {t('releasesPage.audioDrafts', 'Розпочаті аудіо релізи')} ({drafts.length})
            </h2>
            <DraftList 
              drafts={drafts}
              currentDraftId={currentDraftId}
              onLoadDraft={(id) => {
                const params = new URLSearchParams({ draft: id });
                if (selectedOrgId) {
                  params.append('asAdmin', '1');
                  params.append('targetOrgId', selectedOrgId);
                }
                navigate(`/releases/new?${params.toString()}`);
              }}
              onDeleteDraft={deleteDraft}
            />
          </div>
        )}

        {/* Video Drafts List */}
        {videoDrafts.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <HolidayFilm className="w-5 h-5" />
              {t('releasesPage.videoDrafts', 'Розпочаті музичні відео')} ({videoDrafts.length})
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {videoDrafts.map((draft) => {
                const isCurrentDraft = draft.id === currentVideoDraftId;
                const title = draft.videoMetadata?.title || t('newRelease.drafts.untitled', 'Без назви');
                const artist = draft.videoMetadata?.artist;
                const completionPercentage = Math.round(
                  ((draft.videoFile?.fileId ? 20 : 0) +
                   (draft.coverArt?.uploadedUrl ? 10 : 0) +
                   (draft.videoMetadata?.title ? 15 : 0) +
                   (draft.videoMetadata?.artist ? 10 : 0) +
                   (draft.videoMetadata?.isrc ? 10 : 0) +
                   (draft.videoMetadata?.upc ? 10 : 0) +
                   (draft.videoMetadata?.primaryGenre ? 5 : 0) +
                   (draft.videoMetadata?.firstReleaseDate ? 5 : 0) +
                   (draft.videoMetadata?.contributors && draft.videoMetadata.contributors.length > 0 ? 10 : 0) +
                   (draft.selectedPlatforms && draft.selectedPlatforms.length > 0 ? 5 : 0))
                );

                return (
                  <Card 
                    key={draft.id}
                    className={`hover:shadow-md transition-shadow ${isCurrentDraft ? 'ring-2 ring-primary' : ''}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex gap-3">
                        {/* Cover Art */}
                        <div className="flex-shrink-0">
                          {draft.coverArt?.uploadedUrl ? (
                            <img
                              src={draft.coverArt.uploadedUrl}
                              alt={title}
                              className="w-20 h-20 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-pink-600 rounded-lg flex items-center justify-center">
                              <HolidayFilm className="w-8 h-8 text-white" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-medium text-sm truncate">
                              {title}
                            </h3>
                            <span className="text-xs font-semibold text-primary flex-shrink-0">
                              {completionPercentage}%
                            </span>
                          </div>
                          
                          {artist && (
                            <p className="text-xs text-muted-foreground truncate mb-2">
                              {artist}
                            </p>
                          )}
                          
                          <p className="text-xs text-muted-foreground mb-3">
                            {new Date(draft.timestamp).toLocaleDateString('uk-UA', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>

                          {/* Progress bar */}
                          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-400 to-pink-600 transition-all duration-300"
                              style={{ width: `${completionPercentage}%` }}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={isCurrentDraft ? "secondary" : "default"}
                              className="flex-1 h-8 text-xs"
                              onClick={() => {
                                loadVideoDraft(draft.id);
                                navigate("/new-video");
                              }}
                            >
                              <Play className="w-3 h-3 mr-1" />
                              {isCurrentDraft ? t('newRelease.drafts.current', 'Поточний') : t('newRelease.drafts.continue', 'Продовжити')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(t('newRelease.drafts.confirmDelete', 'Видалити цей чорновик?'))) {
                                  deleteVideoDraft(draft.id);
                                }
                              }}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
