import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, Search, Music, Calendar, ChevronDown, ChevronUp, AlertCircle, Loader2, Info, CheckCircle, Settings } from "lucide-react";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useTranslation } from "react-i18next";
import { TrackSplitModal } from "@/components/finance/track-split-modal";

interface Track {
  id: string;
  title: string;
  isrc?: string;
}

interface Release {
  id: string;
  title: string;
  upc?: string;
  type: "SINGLE" | "EP" | "ALBUM";
  status: string;
  createdAt: string;
  originalReleaseDate?: string;
  releaseDate?: string;
  artworkUrl?: string;
  tracks?: Track[];
  artist: {
    name: string;
  };
}

export default function Splits() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set());
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<{ id: string; title: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: releasesData, isLoading: releasesLoading, error } = useQuery<{
    releases: Release[];
    total: number;
    page: number;
    totalPages: number;
  }>({
    queryKey: ["/api/releases", 1, debouncedSearch, "splits"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', '1');
      params.append('limit', '100');
      if (debouncedSearch) params.append('search', debouncedSearch);
      
      const response = await fetch(`/api/releases?${params}`);
      if (response.status === 401) {
        throw new Error('Unauthorized');
      }
      if (!response.ok) throw new Error('Failed to fetch releases');
      return response.json();
    },
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error as Error)) return false;
      return failureCount < 3;
    },
  });

  const releases = releasesData?.releases || [];

  const { data: allTrackSplits = [] } = useQuery<any[]>({
    queryKey: ["/api/track-splits-by-org"],
    queryFn: async () => {
      const response = await fetch('/api/track-splits-by-org', { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const trackSplitsMap = new Map<string, boolean>();
  allTrackSplits.forEach((split: any) => {
    if (split.trackId) {
      trackSplitsMap.set(split.trackId, true);
    }
  });

  const handleTrackClick = (track: Track, release: Release) => {
    setSelectedTrack(track);
    setSelectedRelease({ id: release.id, title: release.title });
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTrack(null);
    setSelectedRelease(null);
  };

  const handleSplitSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/track-splits-by-org"] });
  };

  if (error && isUnauthorizedError(error as Error)) {
    return null;
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return date.toLocaleDateString(i18n.language === 'uk' ? 'uk-UA' : i18n.language === 'pl' ? 'pl-PL' : 'en-US', {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  };

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

  if (releasesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => setLocation('/finance')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{t('splits.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('splits.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('splits.futureEarningsWarning')}
          </AlertDescription>
        </Alert>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder={t('splits.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
          />
        </div>

        {releases.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Music className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t('splits.noReleases')}
              </h3>
              <p className="text-muted-foreground">
                {t('splits.noReleasesDescription')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {releases.map((release) => (
              <Card key={release.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      {release.artworkUrl ? (
                        <img 
                          src={release.artworkUrl} 
                          alt={release.title}
                          className="w-14 h-14 md:w-16 md:h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold flex-shrink-0">
                          {release.title.charAt(0).toUpperCase()}
                        </div>
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-medium text-foreground truncate">{release.title}</h3>
                            <p className="text-sm text-muted-foreground truncate">{release.artist.name}</p>
                          </div>
                          
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center" title={t('splits.splitStatusPlaceholder')}>
                              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>{formatDate(release.originalReleaseDate || release.releaseDate)}</span>
                          </div>
                          {release.upc && (
                            <span className="font-mono text-xs">{release.upc}</span>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {release.type}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {release.tracks && release.tracks.length > 0 && (
                      <Collapsible 
                        open={expandedReleases.has(release.id)}
                        onOpenChange={() => {}}
                        className="mt-4"
                      >
                        <CollapsibleTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => toggleExpanded(release.id, e)}
                            className="text-sm font-medium gap-2 hover:bg-muted/50 px-2 w-full justify-start"
                          >
                            {expandedReleases.has(release.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                            {t('splits.tracks')}: {release.tracks.length}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="border-t pt-3 space-y-2">
                            {release.tracks.map((track, index) => {
                              const hasSplit = trackSplitsMap.has(track.id);
                              return (
                                <button 
                                  key={track.id} 
                                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors w-full text-left cursor-pointer"
                                  onClick={() => handleTrackClick(track, release)}
                                >
                                  <span className="text-sm text-muted-foreground w-6">{index + 1}.</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{track.title}</p>
                                    {track.isrc && (
                                      <p className="text-xs text-muted-foreground font-mono">{track.isrc}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {hasSplit ? (
                                      <Badge variant="default" className="gap-1 text-xs bg-green-600 hover:bg-green-700">
                                        <CheckCircle className="h-3 w-3" />
                                        {t('trackSplits.splitConfigured')}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="gap-1 text-xs">
                                        <Settings className="h-3 w-3" />
                                        {t('trackSplits.configureSplit')}
                                      </Badge>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {(!release.tracks || release.tracks.length === 0) && (
                      <div className="mt-4 pt-3 border-t">
                        <p className="text-sm text-muted-foreground">{t('splits.noTracks')}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <TrackSplitModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        track={selectedTrack}
        release={selectedRelease}
        onSuccess={handleSplitSuccess}
      />
    </div>
  );
}
