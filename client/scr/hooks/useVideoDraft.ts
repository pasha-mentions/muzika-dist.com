import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface VideoDraftPayload {
  currentStep: "files" | "metadata" | "distribution";
  
  videoFile: {
    fileId?: string;
    fileName?: string;
    fileSize?: number;
  };
  
  coverArt: {
    uploadedUrl?: string;
    fileName?: string;
  };
  
  videoMetadata: {
    title?: string;
    artist?: string;
    upc?: string;
    isrc?: string;
    primaryGenre?: string;
    secondaryGenre?: string;
    language?: string;
    metadataLanguage?: string;
    firstReleaseDate?: string;
    publicationDate?: string;
    explicitContent?: boolean;
    aiGeneratedContent?: boolean;
    hasNoMusic?: boolean;
    hasNoLyrics?: boolean;
    previewStart?: string;
    thumbnailTime?: string;
    performers?: Array<{ name: string; role: string; }>;
    contributors?: any[];
    linkedReleaseId?: string;
  };
  
  selectedTerritories: string[];
  selectedPlatforms: string[];
  upcRequested: boolean;
  isrcRequested: boolean;
  selectedOrgId?: string;
  
  videoTitle?: string;
  artistName?: string;
}

export interface VideoDraft {
  id: string;
  orgId: string;
  createdByUserId: string;
  updatedByUserId?: string | null;
  type: "VIDEO";
  title?: string | null;
  currentStep: number;
  payload: VideoDraftPayload;
  version: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  
  timestamp?: number;
  completionPercentage?: number;
  videoTitle?: string;
  artistName?: string;
}

export interface LegacyVideoDraft {
  id: string;
  timestamp: number;
  currentStep: "files" | "metadata" | "distribution";
  videoFile: {
    fileId?: string;
    fileName?: string;
    fileSize?: number;
  };
  coverArt: {
    uploadedUrl?: string;
    fileName?: string;
  };
  videoMetadata: {
    title?: string;
    artist?: string;
    upc?: string;
    isrc?: string;
    primaryGenre?: string;
    secondaryGenre?: string;
    language?: string;
    metadataLanguage?: string;
    firstReleaseDate?: string;
    publicationDate?: string;
    explicitContent?: boolean;
    aiGeneratedContent?: boolean;
    hasNoMusic?: boolean;
    hasNoLyrics?: boolean;
    previewStart?: string;
    thumbnailTime?: string;
    performers?: Array<{ name: string; role: string; }>;
    contributors?: any[];
    linkedReleaseId?: string;
  };
  selectedTerritories: string[];
  selectedPlatforms: string[];
  upcRequested: boolean;
  isrcRequested: boolean;
  selectedOrgId?: string;
  completionPercentage: number;
  videoTitle?: string;
  artistName?: string;
}

const LEGACY_STORAGE_KEY = 'muzika_video_drafts';
const LEGACY_CURRENT_DRAFT_KEY = 'muzika_current_video_draft_id';
const DEBOUNCE_MS = 2000;

export function useVideoDraft(targetOrgId?: string | null) {
  const queryClient = useQueryClient();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [currentDraftOrgId, setCurrentDraftOrgId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictDraft, setConflictDraft] = useState<VideoDraft | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPayloadRef = useRef<VideoDraftPayload | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const lastAttemptedPayloadRef = useRef<VideoDraftPayload | null>(null);
  const [wasCreatedByAutoSave, setWasCreatedByAutoSave] = useState(false);

  const { data: drafts = [], isLoading, refetch: refetchDrafts } = useQuery<VideoDraft[]>({
    queryKey: ['/api/drafts', 'VIDEO', targetOrgId],
    queryFn: async () => {
      const params = new URLSearchParams({ type: 'VIDEO' });
      if (targetOrgId) {
        params.append('targetOrgId', targetOrgId);
      }
      const res = await fetch(`/api/drafts?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch drafts');
      return res.json();
    },
  });

  const isInitialized = !isLoading;

  // Auto-select the most recent draft if none is selected
  useEffect(() => {
    if (!isLoading && drafts.length > 0 && !currentDraftId) {
      // Find the most recent draft by updatedAt
      const mostRecentDraft = drafts.reduce((latest, draft) => {
        if (!latest) return draft;
        return new Date(draft.updatedAt) > new Date(latest.updatedAt) ? draft : latest;
      }, drafts[0]);
      
      if (mostRecentDraft) {
        console.log('[VIDEO DRAFT] Auto-selecting most recent draft:', mostRecentDraft.id);
        setCurrentDraftId(mostRecentDraft.id);
        setCurrentVersion(mostRecentDraft.version);
        setCurrentDraftOrgId(mostRecentDraft.orgId);
      }
    }
  }, [isLoading, drafts, currentDraftId]);

  const createDraftMutation = useMutation({
    mutationFn: async (data: { type: string; payload: any; title?: string; currentStep?: number }) => {
      const res = await apiRequest('POST', '/api/drafts', data);
      return res.json();
    },
    onSuccess: (newDraft: VideoDraft) => {
      setWasCreatedByAutoSave(true); // Mark that this ID came from auto-save
      setCurrentDraftId(newDraft.id);
      setCurrentVersion(newDraft.version);
      setCurrentDraftOrgId(newDraft.orgId);
      setIsSaving(false);
      autoSaveInFlightRef.current = false; // Reset after successful creation
      lastAttemptedPayloadRef.current = null; // Clear on success
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === '/api/drafts' && key[1] === 'VIDEO';
        }
      });
      
      // If there's a pending payload from edits during creation, save it now
      if (pendingPayloadRef.current) {
        console.log('[VIDEO DRAFT] Saving pending payload after creation');
        const pendingPayload = pendingPayloadRef.current;
        pendingPayloadRef.current = null;
        setIsSaving(true);
        updateDraftMutation.mutate({
          id: newDraft.id,
          payload: pendingPayload,
          title: pendingPayload.videoTitle,
          currentStep: videoStepToNumber(pendingPayload.currentStep),
          version: newDraft.version,
        });
      }
    },
    onError: () => {
      setIsSaving(false);
      autoSaveInFlightRef.current = false; // Reset on error to allow retry
      
      // Restore payload and schedule retry for failed creation
      // Keep lastAttemptedPayloadRef so subsequent retries still have the payload
      const payloadToRetry = lastAttemptedPayloadRef.current;
      if (payloadToRetry) {
        console.log('[VIDEO DRAFT] Creation failed - scheduling retry');
        
        // Schedule a retry after delay
        setTimeout(() => {
          // Use lastAttemptedPayloadRef directly as it persists across retries
          if (lastAttemptedPayloadRef.current && !autoSaveInFlightRef.current) {
            autoSaveInFlightRef.current = true;
            setIsSaving(true);
            createDraftMutation.mutate({
              type: "VIDEO",
              payload: lastAttemptedPayloadRef.current,
              title: lastAttemptedPayloadRef.current.videoTitle,
              currentStep: videoStepToNumber(lastAttemptedPayloadRef.current.currentStep),
            });
          }
        }, DEBOUNCE_MS * 2);
      }
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
    onSuccess: (updatedDraft: VideoDraft) => {
      setCurrentVersion(updatedDraft.version);
      setIsSaving(false);
      lastAttemptedPayloadRef.current = null; // Clear on success
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === '/api/drafts' && key[1] === 'VIDEO';
        }
      });
    },
    onError: (error: any) => {
      setIsSaving(false);
      if (error.conflict) {
        setHasConflict(true);
        setConflictDraft(error.currentDraft);
        lastAttemptedPayloadRef.current = null; // Clear only on conflict
      } else {
        // For non-conflict errors, schedule retry
        // Keep lastAttemptedPayloadRef so subsequent retries still have the payload
        if (lastAttemptedPayloadRef.current) {
          console.log('[VIDEO DRAFT] Update failed - scheduling retry');
          // Schedule a retry after delay
          setTimeout(() => {
            // Use lastAttemptedPayloadRef directly as it persists across retries
            if (lastAttemptedPayloadRef.current && currentDraftId) {
              setIsSaving(true);
              updateDraftMutation.mutate({
                id: currentDraftId,
                payload: lastAttemptedPayloadRef.current,
                title: lastAttemptedPayloadRef.current.videoTitle,
                currentStep: videoStepToNumber(lastAttemptedPayloadRef.current.currentStep),
                version: currentVersion,
              });
            }
          }, DEBOUNCE_MS * 2); // Retry after double the normal debounce
        }
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
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === '/api/drafts' && key[1] === 'VIDEO';
        }
      });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/drafts/${id}`);
      if (!res.ok) throw new Error('Failed to delete draft');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === '/api/drafts' && key[1] === 'VIDEO';
        }
      });
    },
  });

  useEffect(() => {
    migrateLegacyDrafts();
  }, []);

  const migrateLegacyDrafts = async () => {
    const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return;

    try {
      const legacyDrafts: LegacyVideoDraft[] = JSON.parse(stored);
      if (!Array.isArray(legacyDrafts) || legacyDrafts.length === 0) return;

      console.log(`Migrating ${legacyDrafts.length} legacy video drafts to server...`);

      for (const legacyDraft of legacyDrafts) {
        try {
          const payload: VideoDraftPayload = {
            currentStep: legacyDraft.currentStep || "files",
            videoFile: legacyDraft.videoFile || {},
            coverArt: legacyDraft.coverArt || {},
            videoMetadata: legacyDraft.videoMetadata || {},
            selectedTerritories: legacyDraft.selectedTerritories || [],
            selectedPlatforms: legacyDraft.selectedPlatforms || [],
            upcRequested: legacyDraft.upcRequested || false,
            isrcRequested: legacyDraft.isrcRequested || false,
            selectedOrgId: legacyDraft.selectedOrgId,
            videoTitle: legacyDraft.videoMetadata?.title,
            artistName: legacyDraft.videoMetadata?.artist,
          };

          await apiRequest('POST', '/api/drafts', {
            type: "VIDEO",
            payload,
            title: legacyDraft.videoMetadata?.title || "Imported Video Draft",
            currentStep: videoStepToNumber(legacyDraft.currentStep),
          });
        } catch (err) {
          console.error('Failed to migrate video draft:', err);
        }
      }

      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LEGACY_CURRENT_DRAFT_KEY);
      console.log('Legacy video drafts migration complete');
      
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === '/api/drafts' && key[1] === 'VIDEO';
        }
      });
    } catch (e) {
      console.error('Failed to parse legacy video drafts:', e);
    }
  };

  const saveDraft = useCallback((draftData: Omit<LegacyVideoDraft, 'id' | 'timestamp' | 'completionPercentage'>) => {
    const payload: VideoDraftPayload = {
      currentStep: draftData.currentStep || "files",
      videoFile: draftData.videoFile || {},
      coverArt: draftData.coverArt || {},
      videoMetadata: draftData.videoMetadata || {},
      selectedTerritories: draftData.selectedTerritories || [],
      selectedPlatforms: draftData.selectedPlatforms || [],
      upcRequested: draftData.upcRequested || false,
      isrcRequested: draftData.isrcRequested || false,
      selectedOrgId: draftData.selectedOrgId,
      videoTitle: draftData.videoMetadata?.title,
      artistName: draftData.videoMetadata?.artist,
    };

    pendingPayloadRef.current = payload;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      if (!pendingPayloadRef.current) return;
      
      // Prevent duplicate draft creation when no ID exists yet
      // Keep payload pending so it can be saved after creation completes
      if (!currentDraftId && autoSaveInFlightRef.current) {
        console.log('[VIDEO DRAFT] Creation in progress - payload will be saved after creation');
        return; // pendingPayloadRef stays set, will be picked up by onSuccess
      }
      
      setIsSaving(true);
      const payloadToSave = pendingPayloadRef.current;
      pendingPayloadRef.current = null;

      if (currentDraftId) {
        // Store payload for retry if update fails
        lastAttemptedPayloadRef.current = payloadToSave;
        updateDraftMutation.mutate({
          id: currentDraftId,
          payload: payloadToSave,
          title: payloadToSave.videoTitle,
          currentStep: videoStepToNumber(payloadToSave.currentStep),
          version: currentVersion,
        });
      } else {
        // Mark that creation is in flight to prevent duplicates
        // Store payload for retry if creation fails
        autoSaveInFlightRef.current = true;
        lastAttemptedPayloadRef.current = payloadToSave;
        createDraftMutation.mutate({
          type: "VIDEO",
          payload: payloadToSave,
          title: payloadToSave.videoTitle,
          currentStep: videoStepToNumber(payloadToSave.currentStep),
        });
      }
    }, DEBOUNCE_MS);

    return currentDraftId || 'pending';
  }, [currentDraftId, currentVersion, createDraftMutation, updateDraftMutation]);

  const loadDraft = useCallback(async (id: string): Promise<LegacyVideoDraft | null> => {
    try {
      const res = await fetch(`/api/drafts/${id}`, { credentials: 'include' });
      if (!res.ok) return null;
      
      const draft: VideoDraft = await res.json();
      setCurrentDraftId(draft.id);
      setCurrentVersion(draft.version);
      setCurrentDraftOrgId(draft.orgId);
      
      const payload = draft.payload;
      return {
        id: draft.id,
        timestamp: new Date(draft.updatedAt).getTime(),
        currentStep: payload.currentStep || "files",
        videoFile: payload.videoFile || {},
        coverArt: payload.coverArt || {},
        videoMetadata: payload.videoMetadata || {},
        selectedTerritories: payload.selectedTerritories || [],
        selectedPlatforms: payload.selectedPlatforms || [],
        upcRequested: payload.upcRequested || false,
        isrcRequested: payload.isrcRequested || false,
        selectedOrgId: payload.selectedOrgId,
        completionPercentage: calculateCompletionPercentage(payload),
        videoTitle: payload.videoTitle,
        artistName: payload.artistName,
      };
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

  const getCurrentDraft = useCallback((): LegacyVideoDraft | null => {
    if (!currentDraftId) return null;
    const draft = drafts.find(d => d.id === currentDraftId);
    if (!draft) return null;
    
    const payload = draft.payload;
    return {
      id: draft.id,
      timestamp: new Date(draft.updatedAt).getTime(),
      currentStep: payload.currentStep || "files",
      videoFile: payload.videoFile || {},
      coverArt: payload.coverArt || {},
      videoMetadata: payload.videoMetadata || {},
      selectedTerritories: payload.selectedTerritories || [],
      selectedPlatforms: payload.selectedPlatforms || [],
      upcRequested: payload.upcRequested || false,
      isrcRequested: payload.isrcRequested || false,
      selectedOrgId: payload.selectedOrgId,
      completionPercentage: calculateCompletionPercentage(payload),
      videoTitle: payload.videoTitle,
      artistName: payload.artistName,
    };
  }, [currentDraftId, drafts]);

  const draftsWithMeta = drafts.map(draft => {
    const payload = draft.payload || {} as VideoDraftPayload;
    return {
      id: draft.id,
      timestamp: new Date(draft.updatedAt).getTime(),
      currentStep: payload.currentStep || "files",
      videoFile: payload.videoFile || {},
      coverArt: payload.coverArt || {},
      videoMetadata: payload.videoMetadata || {},
      selectedTerritories: payload.selectedTerritories || [],
      selectedPlatforms: payload.selectedPlatforms || [],
      upcRequested: payload.upcRequested || false,
      isrcRequested: payload.isrcRequested || false,
      selectedOrgId: payload.selectedOrgId,
      completionPercentage: calculateCompletionPercentage(payload),
      videoTitle: payload.videoTitle || payload.videoMetadata?.title,
      artistName: payload.artistName || payload.videoMetadata?.artist,
    };
  });

  const clearWasCreatedByAutoSave = useCallback(() => {
    setWasCreatedByAutoSave(false);
  }, []);

  return {
    drafts: draftsWithMeta,
    currentDraftId,
    currentDraftOrgId,
    isInitialized,
    saveDraft,
    loadDraft,
    deleteDraft,
    clearCurrentDraft,
    startNewDraft,
    getCurrentDraft,
    isLoading,
    isSaving,
    hasConflict,
    conflictDraft,
    resolveConflict,
    refetchDrafts,
    autoSaveInFlightRef,
    wasCreatedByAutoSave,
    clearWasCreatedByAutoSave,
  };
}

function videoStepToNumber(step: string | undefined): number {
  switch (step) {
    case "files": return 0;
    case "metadata": return 1;
    case "distribution": return 2;
    default: return 0;
  }
}

function calculateCompletionPercentage(payload: VideoDraftPayload | undefined): number {
  if (!payload) return 0;
  
  let filledFields = 0;
  let totalFields = 0;

  totalFields += 2;
  if (payload.videoFile?.fileId) filledFields += 1;
  if (payload.coverArt?.uploadedUrl) filledFields += 1;

  const metadata = payload.videoMetadata || {};
  const metadataFields = ['title', 'artist', 'primaryGenre', 'language'];
  metadataFields.forEach(field => {
    totalFields += 1;
    if (metadata[field as keyof typeof metadata]) filledFields += 1;
  });
  
  totalFields += 2;
  if (metadata.upc) filledFields += 1;
  if (metadata.isrc) filledFields += 1;
  
  totalFields += 1;
  if (metadata.contributors && metadata.contributors.length >= 6) {
    filledFields += 1;
  }

  totalFields += 1;
  if (payload.selectedTerritories?.length > 0) filledFields += 1;

  const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  return Math.min(100, Math.max(0, percentage));
}
