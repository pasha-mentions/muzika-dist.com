import { useState, useEffect, useCallback } from 'react';

export interface PitchingDraft {
  id: string;
  timestamp: number;
  currentStep: number;
  maxStepReached: number;
  
  // Selected release
  selectedReleaseId: string | null;
  selectedReleaseTitle?: string;
  selectedReleaseArtist?: string;
  
  // Form data
  formData: {
    releaseDescription: string;
    artistInfo: string;
    promoplan: string;
    focusTrack: string;
    budget: string;
    photosGoogleDrive: string;
    spotifyUrl: string;
    spotifyProfileMissing: boolean;
    appleMusicUrl: string;
    appleMusicProfileMissing: boolean;
    instagramUrl: string;
    instagramProfileMissing: boolean;
  };
  
  // Metadata for display
  completionPercentage: number;
}

const STORAGE_KEY = 'muzika_pitching_drafts';
const CURRENT_DRAFT_KEY = 'muzika_current_pitching_draft_id';

export function usePitchingDraft() {
  const [drafts, setDrafts] = useState<PitchingDraft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);

  // Load drafts from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setDrafts(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse pitching drafts:', e);
      }
    }
    
    const currentId = localStorage.getItem(CURRENT_DRAFT_KEY);
    if (currentId) {
      setCurrentDraftId(currentId);
    }
  }, []);

  // Save drafts to localStorage
  const saveDrafts = useCallback((newDrafts: PitchingDraft[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newDrafts));
    setDrafts(newDrafts);
  }, []);

  // Create or update draft
  const saveDraft = useCallback((draftData: Omit<PitchingDraft, 'id' | 'timestamp' | 'completionPercentage'>) => {
    const id = currentDraftId || `pitching_draft_${Date.now()}`;
    const timestamp = Date.now();
    
    // Calculate completion percentage
    const completionPercentage = calculateCompletionPercentage(draftData);
    
    const draft: PitchingDraft = {
      id,
      timestamp,
      completionPercentage,
      ...draftData,
    };

    const existingIndex = drafts.findIndex(d => d.id === id);
    let newDrafts: PitchingDraft[];
    
    if (existingIndex >= 0) {
      newDrafts = [...drafts];
      newDrafts[existingIndex] = draft;
    } else {
      newDrafts = [...drafts, draft];
    }
    
    saveDrafts(newDrafts);
    setCurrentDraftId(id);
    localStorage.setItem(CURRENT_DRAFT_KEY, id);
    
    return id;
  }, [drafts, currentDraftId, saveDrafts]);

  // Load draft
  const loadDraft = useCallback((id: string) => {
    const draft = drafts.find(d => d.id === id);
    if (draft) {
      setCurrentDraftId(id);
      localStorage.setItem(CURRENT_DRAFT_KEY, id);
      return draft;
    }
    return null;
  }, [drafts]);

  // Delete draft
  const deleteDraft = useCallback((id: string) => {
    const newDrafts = drafts.filter(d => d.id !== id);
    saveDrafts(newDrafts);
    
    if (currentDraftId === id) {
      setCurrentDraftId(null);
      localStorage.removeItem(CURRENT_DRAFT_KEY);
    }
  }, [drafts, currentDraftId, saveDrafts]);

  // Clear current draft (after successful submission)
  const clearCurrentDraft = useCallback(() => {
    if (currentDraftId) {
      deleteDraft(currentDraftId);
    }
  }, [currentDraftId, deleteDraft]);

  // Start new draft
  const startNewDraft = useCallback(() => {
    setCurrentDraftId(null);
    localStorage.removeItem(CURRENT_DRAFT_KEY);
  }, []);

  return {
    drafts,
    currentDraftId,
    saveDraft,
    loadDraft,
    deleteDraft,
    clearCurrentDraft,
    startNewDraft,
  };
}

// Calculate completion percentage based on filled fields
function calculateCompletionPercentage(draft: Omit<PitchingDraft, 'id' | 'timestamp' | 'completionPercentage'>): number {
  let filledFields = 0;
  let totalFields = 0;

  // Step 1: Release selection
  totalFields += 1;
  if (draft.selectedReleaseId) filledFields += 1;

  // Step 2: Release date (automatically valid if release is selected)
  // No additional fields to check

  // Step 3: Form data (main content)
  const requiredFields = [
    'releaseDescription',
    'artistInfo',
    'promoplan',
    'focusTrack',
    'budget',
    'photosGoogleDrive'
  ];
  
  requiredFields.forEach(field => {
    totalFields += 1;
    if (draft.formData[field as keyof typeof draft.formData]) filledFields += 1;
  });

  // Step 4: Social profiles (optional but count if filled)
  const socialFields = ['spotifyUrl', 'appleMusicUrl', 'instagramUrl'];
  socialFields.forEach(field => {
    totalFields += 1;
    const value = draft.formData[field as keyof typeof draft.formData];
    const missingFlag = draft.formData[`${field.replace('Url', 'ProfileMissing')}` as keyof typeof draft.formData];
    if (value || missingFlag) filledFields += 1;
  });

  const percentage = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
  return Math.min(100, Math.max(0, percentage));
}
