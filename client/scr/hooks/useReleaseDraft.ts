import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface ReleaseDraftPayload {
  currentStep: "files" | "metadata" | "tracks" | "territories";
  
  releaseMetadata: any;
  tracksMetadata: any[];
  currentTrackIndex: number;
  
  coverArt: {
    uploadedUrl?: string;
    fileId?: string;
    fileName?: string;
  };
  animatedArtwork?: {
    wantsAnimatedArtwork: boolean;
    // New two-file format
    artwork3x4?: {
      uploadedUrl?: string;
      fileId?: string;
      fileName?: string;
      fileSize?: number;
    };
    artwork1x1?: {
      uploadedUrl?: string;
      fileId?: string;
      fileName?: string;
      fileSize?: number;
    };
    // Legacy fields (for backwards compatibility)
    uploadedUrl?: string;
    fileId?: string;
    fileName?: string;
    fileSize?: number;
  };
  audioFiles: {
    uploadedUrl?: string;
    fileName?: string;
  }[];
  
  selectedTerritories: string[];
  upcRequested: boolean;
  isrcRequested: boolean[];
  releaseTime: string;
  releaseTimezone: string;
  selectedOrgId?: string;
  
  releaseTitle?: string;
  artistName?: string;
}

export interface ReleaseDraft {
  id: string;
  orgId: string;
  createdByUserId: string;
  updatedByUserId?: string | null;
  type: "RELEASE" | "VIDEO";
  title?: string | null;
  currentStep: number;
  payload: ReleaseDraftPayload;
  version: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  
  timestamp?: number;
  completionPercentage?: number;
}

const LEGACY_STORAGE_KEY = 'muzika_release_drafts';
const LEGACY_CURRENT_DRAFT_KEY = 'muzika_current_draft_id';
const DEBOUNCE_MS = 2000;

export function useReleaseDraft(draftType: "RELEASE" | "VIDEO" = "RELEASE", targetOrgId?: string | null) {
  const queryClient = useQueryClient();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [currentDraftOrgId, setCurrentDraftOrgId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictDraft, setConflictDraft] = useState<ReleaseDraft | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<ReleaseDraftPayload | null>(null);
  // Flag set when auto-save creates a new draft, cleared after first restore skip
  // This flag does NOT block future explicit loads - only skips the immediate restore
  const autoSaveInFlightRef = useRef(false);

  const { data: drafts = [], isLoading, refetch: refetchDrafts } = useQuery<ReleaseDraft[]>({
    queryKey: ['/api/drafts', draftType, targetOrgId],
    queryFn: async () => {
      const params = new URLSearchParams({ type: draftType });
      if (targetOrgId) {
        params.append('targetOrgId', targetOrgId);
      }
      const res = await fetch(`/api/drafts?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch drafts');
      return res.json();
    },
  });

  const createDraftMutation = useMutation({
    mutationFn: async (data: { type: string; payload: any; title?: string; currentStep?: number }) => {
      const res = await apiRequest('POST', '/api/drafts', data);
      return res.json();
    },
    onSuccess: (newDraft: ReleaseDraft) => {
      // Mark auto-save in flight to skip the next restore (prevent toast and form overwrite)
      autoSaveInFlightRef.current = true;
      setCurrentDraftId(newDraft.id);
      setCurrentVersion(newDraft.version);
      queryClient.invalidateQueries({ queryKey: ['/api/drafts'] });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async ({ id, payload, title, currentStep, version }: { 
      id: string; 
      payload?: any; 
      title?: string; 
      currentStep?: number;
      version: number;
    }) => {
      const res = await apiRequest('PATCH', `/api/drafts/${id}`, { payload, title, currentStep, version });
      if (res.status === 409) {
        const data = await res.json();
        throw { conflict: true, currentDraft: data.currentDraft };
      }
      if (!res.ok) throw new Error('Failed to update draft');
      return res.json();
    },
    onSuccess: (updatedDraft: ReleaseDraft) => {
      setCurrentVersion(updatedDraft.version);
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ['/api/drafts'] });
    },
    onError: (error: any) => {
      setIsSaving(false);
      if (error.conflict) {
        setHasConflict(true);
        setConflictDraft(error.currentDraft);
      }
    },
  });

  const archiveDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('POST', `/api/drafts/${id}/archive`);
      if (!res.ok) throw new Error('Failed to archive draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drafts'] });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/drafts/${id}`);
      if (!res.ok) throw new Error('Failed to delete draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drafts'] });
    },
  });

  useEffect(() => {
    migrateLegacyDrafts();
  }, []);

  const migrateLegacyDrafts = async () => {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return;

    try {
      const legacyDrafts = JSON.parse(stored);
      if (!Array.isArray(legacyDrafts) || legacyDrafts.length === 0) return;

      console.log(`Migrating ${legacyDrafts.length} legacy drafts to server...`);

      for (const legacyDraft of legacyDrafts) {
        try {
          const payload: ReleaseDraftPayload = {
            currentStep: legacyDraft.currentStep || "files",
            releaseMetadata: legacyDraft.releaseMetadata || {},
            tracksMetadata: legacyDraft.tracksMetadata || [],
            currentTrackIndex: legacyDraft.currentTrackIndex || 0,
            coverArt: legacyDraft.coverArt || {},
            audioFiles: legacyDraft.audioFiles || [],
            selectedTerritories: legacyDraft.selectedTerritories || [],
            upcRequested: legacyDraft.upcRequested || false,
            isrcRequested: legacyDraft.isrcRequested || [],
            releaseTime: legacyDraft.releaseTime || "",
            releaseTimezone: legacyDraft.releaseTimezone || "",
            selectedOrgId: legacyDraft.selectedOrgId,
            releaseTitle: legacyDraft.releaseTitle,
            artistName: legacyDraft.artistName,
          };

          await apiRequest('POST', '/api/drafts', {
            type: "RELEASE",
            payload,
            title: legacyDraft.releaseTitle || "Imported Draft",
            currentStep: stepToNumber(legacyDraft.currentStep),
          });
        } catch (err) {
          console.error('Failed to migrate draft:', err);
        }
      }

      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_CURRENT_DRAFT_KEY);
      console.log('Legacy drafts migration complete');
      
      queryClient.invalidateQueries({ queryKey: ['/api/drafts'] });
    } catch (e) {
      console.error('Failed to parse legacy drafts:', e);
    }
  };

  const saveDraft = useCallback((draftData: Omit<ReleaseDraftPayload, 'releaseTitle' | 'artistName'>) => {
    const payload: ReleaseDraftPayload = {
      ...draftData,
      releaseTitle: draftData.releaseMetadata?.title,
      artistName: draftData.releaseMetadata?.performers?.[0]?.name,
    };

    pendingPayloadRef.current = payload;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!pendingPayloadRef.current) return;
      
      setIsSaving(true);
      const payloadToSave = pendingPayloadRef.current;
      pendingPayloadRef.current = null;

      if (currentDraftId) {
        updateDraftMutation.mutate({
          id: currentDraftId,
          payload: payloadToSave,
          title: payloadToSave.releaseTitle,
          currentStep: stepToNumber(payloadToSave.currentStep),
          version: currentVersion,
        });
      } else {
        createDraftMutation.mutate({
          type: draftType,
          payload: payloadToSave,
          title: payloadToSave.releaseTitle,
          currentStep: stepToNumber(payloadToSave.currentStep),
        });
      }
    }, DEBOUNCE_MS);

    return currentDraftId || 'pending';
  }, [currentDraftId, currentVersion, draftType, createDraftMutation, updateDraftMutation]);

  const loadDraft = useCallback(async (id: string): Promise<ReleaseDraftPayload | null> => {
    try {
      const res = await fetch(`/api/drafts/${id}`, { credentials: 'include' });
      if (!res.ok) return null;
      
      const draft: ReleaseDraft = await res.json();
      setCurrentDraftId(draft.id);
      setCurrentVersion(draft.version);
      setCurrentDraftOrgId(draft.orgId);
      
      return draft.payload;
    } catch (error) {
      console.error('Failed to load draft:', error);
      return null;
    }
  }, []);

  const deleteDraft = useCallback((id: string) => {
    deleteDraftMutation.mutate(id);
    if (currentDraftId === id) {
      setCurrentDraftId(null);
      setCurrentVersion(1);
    }
  }, [currentDraftId, deleteDraftMutation]);

  const clearCurrentDraft = useCallback(() => {
    if (currentDraftId) {
      archiveDraftMutation.mutate(currentDraftId);
      setCurrentDraftId(null);
      setCurrentVersion(1);
      setCurrentDraftOrgId(null);
    }
  }, [currentDraftId, archiveDraftMutation]);

  const startNewDraft = useCallback(() => {
    setCurrentDraftId(null);
    setCurrentVersion(1);
    setCurrentDraftOrgId(null);
    setHasConflict(false);
    setConflictDraft(null);
  }, []);

  const resolveConflict = useCallback((useServer: boolean) => {
    if (useServer && conflictDraft) {
      setCurrentVersion(conflictDraft.version);
    }
    setHasConflict(false);
    setConflictDraft(null);
  }, [conflictDraft]);

  const draftsWithMeta = drafts.map(draft => ({
    ...(draft.payload || {}),
    ...draft,
    timestamp: new Date(draft.updatedAt).getTime(),
    completionPercentage: calculateCompletionPercentage(draft.payload),
  }));

  return {
    drafts: draftsWithMeta,
    currentDraftId,
    currentDraftOrgId,
    saveDraft,
    loadDraft,
    deleteDraft,
    clearCurrentDraft,
    startNewDraft,
    isLoading,
    isSaving,
    hasConflict,
    conflictDraft,
    resolveConflict,
    refetchDrafts,
    autoSaveInFlightRef, // For detecting auto-save vs explicit load
  };
}

function stepToNumber(step: string | undefined): number {
  switch (step) {
    case "files": return 0;
    case "metadata": return 1;
    case "tracks": return 2;
    case "territories": return 3;
    default: return 0;
  }
}

function calculateCompletionPercentage(payload: ReleaseDraftPayload | undefined): number {
  if (!payload) return 0;
  
  let filledFields = 0;
  let totalFields = 0;

  totalFields += 2;
  if (payload.coverArt?.uploadedUrl) filledFields += 1;
  if (payload.audioFiles?.some(f => f.uploadedUrl)) filledFields += 1;

  const metadata = payload.releaseMetadata || {};
  const metadataFields = ['title', 'language', 'primaryGenre', 'originalReleaseDate'];
  metadataFields.forEach(field => {
    totalFields += 1;
    if (metadata[field]) filledFields += 1;
  });
  
  totalFields += 1;
  if (metadata.performers?.length > 0 && metadata.performers[0]?.name) {
    filledFields += 1;
  }

  const tracksCount = payload.tracksMetadata?.length || 0;
  if (tracksCount > 0) {
    payload.tracksMetadata.forEach(track => {
      const trackFields = ['title', 'primaryGenre', 'language', 'explicitContent'];
      trackFields.forEach(field => {
        totalFields += 1;
        if (track[field]) filledFields += 1;
      });
      
      totalFields += 1;
      if (track.contributors?.length > 0) filledFields += 1;
    });
  }

  totalFields += 1;
  if (payload.selectedTerritories?.length > 0) filledFields += 1;

  const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  return Math.min(100, Math.max(0, percentage));
}
