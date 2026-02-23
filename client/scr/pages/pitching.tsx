import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePitchingDraft } from "@/hooks/usePitchingDraft";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { GiftMarker } from "@/components/holiday/GiftMarker";

interface Release {
  id: string;
  title: string;
  releaseDate: string;
  labelName?: string;
  artist: {
    name: string;
  };
  tracks: Array<{
    id: string;
    title: string;
  }>;
}

interface PitchingHistory {
  id: string;
  releaseId: string;
  releaseDescription: string;
  artistInfo: string;
  promoplan: string;
  focusTrack: string;
  budget: string;
  photosGoogleDrive: string;
  spotifyUrl: string | null;
  spotifyProfileMissing: boolean;
  appleMusicUrl: string | null;
  appleMusicProfileMissing: boolean;
  instagramUrl: string | null;
  instagramProfileMissing: boolean;
  status: string;
  createdAt: string;
  release: {
    title: string;
    releaseDate: string;
    artist: {
      name: string;
    };
  };
}

export default function Pitching() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { saveDraft, loadDraft, clearCurrentDraft, currentDraftId, drafts } = usePitchingDraft();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [step, setStep] = useState(1);
  const [maxStepReached, setMaxStepReached] = useState(1);
  const [availableReleases, setAvailableReleases] = useState<Release[]>([]);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDate, setEditedDate] = useState("");
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [pitchingHistory, setPitchingHistory] = useState<PitchingHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPitching, setSelectedPitching] = useState<PitchingHistory | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);

  const [formData, setFormData] = useState({
    releaseDescription: "",
    artistInfo: "",
    promoplan: "",
    focusTrack: "",
    budget: "",
    photosGoogleDrive: "",
    spotifyUrl: "",
    spotifyProfileMissing: false,
    appleMusicUrl: "",
    appleMusicProfileMissing: false,
    instagramUrl: "",
    instagramProfileMissing: false,
  });

  useEffect(() => {
    const initializePage = async () => {
      await fetchAvailableReleases();
      await fetchPitchingHistory();
      
      // Try to load existing draft after releases are loaded
      if (currentDraftId && drafts.length > 0) {
        const draft = loadDraft(currentDraftId);
        if (draft) {
          setStep(draft.currentStep);
          setMaxStepReached(draft.maxStepReached);
          setFormData(draft.formData);
          
          // Find and set selected release if available
          if (draft.selectedReleaseId) {
            // Wait a bit for releases to be set
            setTimeout(() => {
              const release = availableReleases.find(r => r.id === draft.selectedReleaseId);
              if (release) {
                setSelectedRelease(release);
              }
            }, 100);
          }
          
          toast({
            title: t("pitching.draftRestored") || "Draft restored",
            description: t("pitching.continueFromWhereLeft") || "Continue from where you left off",
          });
        }
      }
      
      setIsLoadingDraft(false);
    };
    
    initializePage();
  }, []);

  // Auto-populate social profiles from organization on first load (only if not loading draft)
  useEffect(() => {
    if (!isLoadingDraft && user?.organizations?.[0] && !formData.spotifyUrl && !formData.appleMusicUrl && !formData.instagramUrl) {
      const org = user.organizations[0];
      setFormData(prev => ({
        ...prev,
        spotifyUrl: org.spotifyUrl || "",
        appleMusicUrl: org.appleMusicUrl || "",
        instagramUrl: org.instagramUrl || "",
      }));
    }
  }, [user, isLoadingDraft]);

  // Auto-save draft with debounce (1 second delay)
  useEffect(() => {
    if (isLoadingDraft) return; // Don't save while loading
    
    // Clear previous timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      // Only save if there's meaningful progress (selected release or filled fields)
      if (selectedRelease || Object.values(formData).some(v => v !== "" && v !== false)) {
        saveDraft({
          currentStep: step,
          maxStepReached,
          selectedReleaseId: selectedRelease?.id || null,
          selectedReleaseTitle: selectedRelease?.title,
          selectedReleaseArtist: selectedRelease?.artist.name,
          formData,
        });
      }
    }, 1000); // 1 second debounce

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [step, maxStepReached, selectedRelease, formData, isLoadingDraft, saveDraft]);

  // Mobile-optimized autosave: handle browser/tab events
  useEffect(() => {
    if (isLoadingDraft) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && (selectedRelease || Object.values(formData).some(v => v !== "" && v !== false))) {
        // Clear timeout and save immediately when page becomes hidden
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        saveDraft({
          currentStep: step,
          maxStepReached,
          selectedReleaseId: selectedRelease?.id || null,
          selectedReleaseTitle: selectedRelease?.title,
          selectedReleaseArtist: selectedRelease?.artist.name,
          formData,
        });
      }
    };

    const handlePageHide = () => {
      if (selectedRelease || Object.values(formData).some(v => v !== "" && v !== false)) {
        saveDraft({
          currentStep: step,
          maxStepReached,
          selectedReleaseId: selectedRelease?.id || null,
          selectedReleaseTitle: selectedRelease?.title,
          selectedReleaseArtist: selectedRelease?.artist.name,
          formData,
        });
      }
    };

    const handleBeforeUnload = () => {
      if (selectedRelease || Object.values(formData).some(v => v !== "" && v !== false)) {
        saveDraft({
          currentStep: step,
          maxStepReached,
          selectedReleaseId: selectedRelease?.id || null,
          selectedReleaseTitle: selectedRelease?.title,
          selectedReleaseArtist: selectedRelease?.artist.name,
          formData,
        });
      }
    };

    const handleBlur = () => {
      if (selectedRelease || Object.values(formData).some(v => v !== "" && v !== false)) {
        saveDraft({
          currentStep: step,
          maxStepReached,
          selectedReleaseId: selectedRelease?.id || null,
          selectedReleaseTitle: selectedRelease?.title,
          selectedReleaseArtist: selectedRelease?.artist.name,
          formData,
        });
      }
    };

    // Add event listeners for various mobile/browser events
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleBlur);
    };
  }, [step, maxStepReached, selectedRelease, formData, isLoadingDraft, saveDraft]);

  const fetchAvailableReleases = async () => {
    try {
      const response = await fetch("/api/pitching/releases");
      if (response.ok) {
        const data = await response.json();
        setAvailableReleases(data);
      }
    } catch (error) {
      console.error("Failed to fetch releases:", error);
    }
  };

  const fetchPitchingHistory = async () => {
    try {
      const response = await fetch("/api/pitching/submissions");
      if (response.ok) {
        const data = await response.json();
        setPitchingHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch pitching history:", error);
    }
  };

  const validateStep = (stepToValidate: number): boolean => {
    if (stepToValidate === 1 && !selectedRelease) {
      toast({
        title: t("pitching.selectRelease"),
        description: t("pitching.selectReleaseDesc"),
        variant: "destructive",
      });
      return false;
    }

    if (stepToValidate === 2) {
      if (!selectedRelease) return false;
      const threeWeeksFromNow = new Date();
      threeWeeksFromNow.setDate(threeWeeksFromNow.getDate() + 21);
      const releaseDate = new Date(selectedRelease.releaseDate);
      
      if (releaseDate < threeWeeksFromNow) {
        toast({
          title: t("pitching.warning"),
          description: t("pitching.warningRecommendation"),
          variant: "default",
        });
      }
    }

    if (stepToValidate === 3) {
      const errors = new Set<string>();
      
      if (!formData.releaseDescription) errors.add('releaseDescription');
      if (!formData.artistInfo) errors.add('artistInfo');
      if (!formData.promoplan) errors.add('promoplan');
      if (!formData.focusTrack) errors.add('focusTrack');
      if (!formData.budget) errors.add('budget');
      if (!formData.photosGoogleDrive) errors.add('photosGoogleDrive');
      
      setValidationErrors(errors);
      
      if (errors.size > 0) {
        toast({
          title: t("pitching.fillAllFields"),
          description: t("pitching.allFieldsRequired"),
          variant: "destructive",
        });
        return false;
      }
    }

    // Clear errors if validation passes
    setValidationErrors(new Set());
    return true;
  };

  const handleNext = () => {
    if (!validateStep(step)) {
      return;
    }

    const nextStep = step + 1;
    setStep(nextStep);
    if (nextStep > maxStepReached) {
      setMaxStepReached(nextStep);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
  };

  const handleStepClick = (targetStep: number) => {
    // Allow going back without validation
    if (targetStep < step) {
      setStep(targetStep);
      return;
    }

    // Going forward or to the same step - validate current step first
    if (targetStep > step) {
      // Validate all steps between current and target
      for (let i = step; i < targetStep; i++) {
        if (!validateStep(i)) {
          return;
        }
      }
    }

    // Check if target step is accessible
    if (targetStep === 1) {
      setStep(1);
    } else if (targetStep >= 2 && targetStep <= maxStepReached && selectedRelease) {
      setStep(targetStep);
    } else if (targetStep > maxStepReached) {
      toast({
        title: t("pitching.stepUnavailable"),
        description: t("pitching.completeStepsFirst"),
        variant: "destructive",
      });
    } else if (!selectedRelease) {
      toast({
        title: t("pitching.selectReleaseTitle"),
        description: t("pitching.selectReleaseFirst2"),
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!selectedRelease) return;

    if (!formData.spotifyUrl && !formData.spotifyProfileMissing) {
      toast({
        title: t("pitching.fillSpotify"),
        description: t("pitching.spotifyOrCheckbox"),
        variant: "destructive",
      });
      return;
    }

    if (!formData.appleMusicUrl && !formData.appleMusicProfileMissing) {
      toast({
        title: t("pitching.fillAppleMusic"),
        description: t("pitching.appleMusicOrCheckbox"),
        variant: "destructive",
      });
      return;
    }

    if (!formData.instagramUrl && !formData.instagramProfileMissing) {
      toast({
        title: t("pitching.fillInstagram"),
        description: t("pitching.instagramOrCheckbox"),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/pitching", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseId: selectedRelease.id,
          ...formData,
        }),
      });

      if (response.ok) {
        // Clear draft after successful submission
        clearCurrentDraft();
        
        toast({
          title: t("pitching.success"),
          description: t("pitching.successDescription"),
        });
        // Refresh history and reset form
        await fetchPitchingHistory();
        setStep(1);
        setMaxStepReached(1);
        setSelectedRelease(null);
        setFormData({
          releaseDescription: "",
          artistInfo: "",
          promoplan: "",
          focusTrack: "",
          budget: "",
          photosGoogleDrive: "",
          spotifyUrl: "",
          spotifyProfileMissing: false,
          appleMusicUrl: "",
          appleMusicProfileMissing: false,
          instagramUrl: "",
          instagramProfileMissing: false,
        });
        setShowHistory(true);
        await fetchAvailableReleases();
      } else {
        throw new Error("Failed to submit pitching");
      }
    } catch (error) {
      toast({
        title: t("pitching.error"),
        description: t("pitching.errorDescription"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReleaseEdit = async () => {
    if (!selectedRelease) return;

    try {
      const releaseData: any = {};
      
      // Always include title if it's been edited
      if (editedTitle.trim()) {
        releaseData.title = editedTitle.trim();
      }
      
      // Always include date if it's been edited
      if (editedDate) {
        releaseData.releaseDate = new Date(editedDate).toISOString();
      }

      if (Object.keys(releaseData).length === 0) {
        toast({
          title: t("pitching.noChanges"),
          description: t("pitching.fillAtLeastOne"),
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`/api/releases/${selectedRelease.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(releaseData),
      });

      if (response.ok) {
        const updatedRelease = await response.json();
        // Update selected release with new data
        setSelectedRelease({ 
          ...selectedRelease, 
          title: updatedRelease.title || selectedRelease.title,
          releaseDate: updatedRelease.releaseDate || selectedRelease.releaseDate
        });
        toast({
          title: t("pitching.successUpdate"),
          description: t("pitching.releaseUpdated"),
        });
        setEditDialogOpen(false);
        await fetchAvailableReleases();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: t("pitching.errorUpdate"),
          description: errorData.message || t("pitching.failedToUpdate"),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error updating release:", error);
      toast({
        title: t("pitching.errorUpdate"),
        description: t("pitching.failedToUpdate"),
        variant: "destructive",
      });
    }
  };

  const handleReleaseEdit = async (releaseData: Partial<Release>) => {
    if (!selectedRelease) return;

    try {
      const response = await fetch(`/api/releases/${selectedRelease.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(releaseData),
      });

      if (response.ok) {
        const updated = await response.json();
        setSelectedRelease({ ...selectedRelease, ...updated });
        toast({
          title: "Реліз оновлено",
          description: "Дані релізу успішно оновлено. Адміністратор отримав сповіщення.",
        });
      }
    } catch (error) {
      toast({
        title: "Помилка",
        description: "Не вдалося оновити реліз",
        variant: "destructive",
      });
    }
  };

  const getLocale = () => {
    return i18n.language === "uk" ? "uk" : i18n.language === "pl" ? "pl" : "en-US";
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) {
      return t("pitching.dateNotSet") || "Not set";
    }
    
    const date = new Date(dateString);
    
    // Check if date is invalid or is Unix Epoch (01.01.1970)
    if (isNaN(date.getTime()) || date.getTime() === 0) {
      return t("pitching.dateNotSet") || "Not set";
    }
    
    const locale = getLocale();
    
    if (i18n.language === "uk" || i18n.language === "pl") {
      return format(date, "dd.MM.yyyy");
    }
    return format(date, "MM/dd/yyyy");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8 relative">
        <h1 className="text-3xl font-bold mb-2">{t("pitching.title")}</h1>
        <GiftMarker placementId="pitching-header" className="absolute top-0 right-0" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {[1, 2, 3, 4].map((s) => {
            const isAccessible = s === 1 || (s <= maxStepReached && selectedRelease);
            const isLocked = s > maxStepReached && s !== 1;
            
            return (
              <div key={s} className="flex items-center">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step === s 
                      ? "bg-primary text-primary-foreground" 
                      : step > s 
                      ? "bg-green-500 text-white" 
                      : "bg-muted"
                  } ${
                    isAccessible
                      ? "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all" 
                      : "opacity-50 cursor-not-allowed"
                  }`}
                  onClick={() => handleStepClick(s)}
                  title={
                    isLocked
                      ? t("pitching.stepLocked")
                      : s >= 2 && !selectedRelease 
                      ? t("pitching.selectReleaseFirst") 
                      : t("pitching.goToStep", { step: s })
                  }
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                {s < 4 && <div className={`w-12 h-1 ${step > s ? "bg-green-500" : "bg-muted"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {pitchingHistory.length > 0 && (
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            className="w-full"
          >
            {showHistory ? t("pitching.hideHistory") : t("pitching.showHistory")} ({pitchingHistory.length})
          </Button>
        </div>
      )}

      {showHistory && pitchingHistory.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("pitching.historyTitle")}</CardTitle>
            <CardDescription>{t("pitching.historyDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pitchingHistory.map((submission) => (
              <Card 
                key={submission.id} 
                className="border-muted cursor-pointer hover:border-primary transition-all"
                onClick={() => {
                  setSelectedPitching(submission);
                  setDetailsDialogOpen(true);
                }}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold">{submission.release.title}</h3>
                      <p className="text-sm text-muted-foreground">{t("pitching.artist")}: {submission.release.artist.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("pitching.releaseDate")}: {formatDate(submission.release.releaseDate)}
                      </p>
                      <p className="text-sm text-muted-foreground">{t("pitching.focusTrack")}: {submission.focusTrack}</p>
                      <p className="text-sm font-medium text-primary mt-2">
                        {t("pitching.submitted")}: {formatDate(submission.createdAt)} {new Date(submission.createdAt).toLocaleTimeString(getLocale(), { 
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2 italic">{t("pitching.clickToView")}</p>
                    </div>
                    <div className="ml-4">
                      <Badge className={submission.status === "SUBMITTED" ? "bg-blue-500 hover:bg-blue-600" : "bg-yellow-500 hover:bg-yellow-600"}>
                        {submission.status === "SUBMITTED" ? "Відправлено" : "На розгляді"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pitching.step1Title")}</CardTitle>
            <CardDescription>
              <div className="flex items-start gap-2 mt-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  {t("pitching.step1Warning")}
                </p>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {availableReleases.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">{t("pitching.noReleases")}</p>
            ) : (
              availableReleases.map((release) => (
                <Card
                  key={release.id}
                  className={`cursor-pointer transition-all ${selectedRelease?.id === release.id ? "border-primary ring-2 ring-primary" : "hover:border-gray-400"}`}
                  onClick={() => setSelectedRelease(release)}
                >
                  <CardContent className="p-4">
                    <h3 className="font-semibold">{release.title}</h3>
                    <p className="text-sm text-muted-foreground">{t("pitching.artist")}: {release.artist.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {t("pitching.releaseDate")}: {formatDate(release.releaseDate)}
                    </p>
                    {release.labelName && (
                      <p className="text-sm text-muted-foreground">{t("catalog.label")}: {release.labelName}</p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
            <div className="flex justify-end mt-6">
              <Button onClick={handleNext} disabled={!selectedRelease}>
                {t("pitching.submitToPitching")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && selectedRelease && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pitching.step2Title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("pitching.performer")}</Label>
                <p className="mt-1 font-medium">{selectedRelease.artist.name}</p>
              </div>
              <div>
                <Label>{t("pitching.albumName")}</Label>
                <p className="mt-1 font-medium">{selectedRelease.title}</p>
              </div>
              <div>
                <Label>{t("pitching.songName")}</Label>
                <p className="mt-1 font-medium">{selectedRelease.tracks[0]?.title || "—"}</p>
              </div>
              <div>
                <Label>{t("pitching.releaseDateLabel")}</Label>
                <p className="mt-1 font-medium">{formatDate(selectedRelease.releaseDate)}</p>
              </div>
            </div>

            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950 rounded-md">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>{t("pitching.note")}</strong> {t("pitching.noteText")}
              </p>
            </div>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => {
                    setEditedTitle(selectedRelease.title);
                    setEditedDate(selectedRelease.releaseDate ? selectedRelease.releaseDate.slice(0, 10) : "");
                    setEditDialogOpen(true);
                  }}
                >
                  {t("pitching.editRelease")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("pitching.editReleaseTitle")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>{t("pitching.releaseTitle")}</Label>
                    <Input 
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>{t("pitching.releaseDate")}</Label>
                    <Input 
                      type="date"
                      value={editedDate}
                      onChange={(e) => setEditedDate(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <DialogClose asChild>
                      <Button variant="outline">{t("pitching.cancel")}</Button>
                    </DialogClose>
                    <Button onClick={handleSaveReleaseEdit}>{t("pitching.saveChanges")}</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="space-y-3 mt-6">
              <div className="flex justify-between">
                <Button variant="outline" onClick={handleBack}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> {t("pitching.back")}
                </Button>
                <Button variant="outline" onClick={() => setStep(1)}>{t("pitching.cancelPitching")}</Button>
              </div>
              <Button onClick={handleNext} className="w-full">
                {t("pitching.continuePitching")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && selectedRelease && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("pitching.step3Title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-base">{t("pitching.releaseDescription")} <span className="text-red-500">{t("pitching.required")}</span></Label>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="link" size="sm">{t("pitching.promoplanExample")}</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>{t("pitching.promoplanExample")}</DialogTitle>
                      </DialogHeader>
                      <ScrollArea className="h-[400px] rounded-md border p-4">
                        <pre className="text-sm whitespace-pre-wrap">{t("pitching.promoplanExampleText")}</pre>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
              <Textarea
                className={`mt-2 min-h-[150px] ${validationErrors.has('releaseDescription') ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                placeholder={t("pitching.releaseDescriptionPlaceholder")}
                value={formData.releaseDescription}
                onChange={(e) => {
                  setFormData({ ...formData, releaseDescription: e.target.value });
                  if (validationErrors.has('releaseDescription')) {
                    const newErrors = new Set(validationErrors);
                    newErrors.delete('releaseDescription');
                    setValidationErrors(newErrors);
                  }
                }}
              />
              {validationErrors.has('releaseDescription') && (
                <p className="text-sm text-red-500 mt-1">{t("pitching.requiredField")}</p>
              )}
            </div>

            <div>
              <Label className="text-base">{t("pitching.artistInfo")} <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Textarea
                className={`mt-2 min-h-[150px] ${validationErrors.has('artistInfo') ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                placeholder={t("pitching.artistInfoPlaceholder")}
                value={formData.artistInfo}
                onChange={(e) => {
                  setFormData({ ...formData, artistInfo: e.target.value });
                  if (validationErrors.has('artistInfo')) {
                    const newErrors = new Set(validationErrors);
                    newErrors.delete('artistInfo');
                    setValidationErrors(newErrors);
                  }
                }}
              />
              {validationErrors.has('artistInfo') && (
                <p className="text-sm text-red-500 mt-1">{t("pitching.requiredField")}</p>
              )}
            </div>

            <div>
              <Label className="text-base">{t("pitching.promoplan")} <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Textarea
                className={`mt-2 min-h-[150px] ${validationErrors.has('promoplan') ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                placeholder={t("pitching.promoplanPlaceholder")}
                value={formData.promoplan}
                onChange={(e) => {
                  setFormData({ ...formData, promoplan: e.target.value });
                  if (validationErrors.has('promoplan')) {
                    const newErrors = new Set(validationErrors);
                    newErrors.delete('promoplan');
                    setValidationErrors(newErrors);
                  }
                }}
              />
              {validationErrors.has('promoplan') && (
                <p className="text-sm text-red-500 mt-1">{t("pitching.requiredField")}</p>
              )}
            </div>

            <div>
              <Label>{t("pitching.focusTrackLabel")} <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Select
                value={formData.focusTrack}
                onValueChange={(value) => {
                  setFormData({ ...formData, focusTrack: value });
                  if (validationErrors.has('focusTrack')) {
                    const newErrors = new Set(validationErrors);
                    newErrors.delete('focusTrack');
                    setValidationErrors(newErrors);
                  }
                }}
              >
                <SelectTrigger className={`mt-2 ${validationErrors.has('focusTrack') ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder={t("pitching.focusTrackPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {selectedRelease?.tracks.map((track) => (
                    <SelectItem key={track.id} value={track.title}>
                      {track.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validationErrors.has('focusTrack') && (
                <p className="text-sm text-red-500 mt-1">{t("pitching.requiredField")}</p>
              )}
            </div>

            <div>
              <Label>{t("pitching.budget")} <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Input
                className={`mt-2 ${validationErrors.has('budget') ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                placeholder={t("pitching.budgetPlaceholder")}
                value={formData.budget}
                onChange={(e) => {
                  setFormData({ ...formData, budget: e.target.value });
                  if (validationErrors.has('budget')) {
                    const newErrors = new Set(validationErrors);
                    newErrors.delete('budget');
                    setValidationErrors(newErrors);
                  }
                }}
              />
              {validationErrors.has('budget') && (
                <p className="text-sm text-red-500 mt-1">{t("pitching.requiredField")}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">{t("pitching.budgetHint")}</p>
            </div>

            <div>
              <Label>{t("pitching.artistPhotos")} <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Input
                className={`mt-2 ${validationErrors.has('photosGoogleDrive') ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                placeholder={t("pitching.photosPlaceholder")}
                value={formData.photosGoogleDrive}
                onChange={(e) => {
                  setFormData({ ...formData, photosGoogleDrive: e.target.value });
                  if (validationErrors.has('photosGoogleDrive')) {
                    const newErrors = new Set(validationErrors);
                    newErrors.delete('photosGoogleDrive');
                    setValidationErrors(newErrors);
                  }
                }}
              />
              {validationErrors.has('photosGoogleDrive') && (
                <p className="text-sm text-red-500 mt-1">{t("pitching.requiredField")}</p>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {t("pitching.photosHint")}
              </p>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {t("pitching.back")}
              </Button>
              <Button onClick={handleNext}>
                {t("pitching.next")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("pitching.step4Title")}</CardTitle>
            <CardDescription>{t("pitching.step4Description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Spotify <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Input
                className="mt-2"
                placeholder="https://open.spotify.com/artist/..."
                value={formData.spotifyUrl}
                onChange={(e) => setFormData({ ...formData, spotifyUrl: e.target.value, spotifyProfileMissing: false })}
                disabled={formData.spotifyProfileMissing}
              />
              <div className="flex items-center space-x-2 mt-2">
                <Checkbox
                  id="spotify-no-profile"
                  checked={formData.spotifyProfileMissing}
                  onCheckedChange={(checked) => setFormData({ ...formData, spotifyProfileMissing: checked as boolean, spotifyUrl: "" })}
                />
                <label htmlFor="spotify-no-profile" className="text-sm cursor-pointer">
                  {t("pitching.noProfileYet")}
                </label>
              </div>
            </div>

            <div>
              <Label>Apple Music <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Input
                className="mt-2"
                placeholder="https://music.apple.com/artist/..."
                value={formData.appleMusicUrl}
                onChange={(e) => setFormData({ ...formData, appleMusicUrl: e.target.value, appleMusicProfileMissing: false })}
                disabled={formData.appleMusicProfileMissing}
              />
              <div className="flex items-center space-x-2 mt-2">
                <Checkbox
                  id="apple-no-profile"
                  checked={formData.appleMusicProfileMissing}
                  onCheckedChange={(checked) => setFormData({ ...formData, appleMusicProfileMissing: checked as boolean, appleMusicUrl: "" })}
                />
                <label htmlFor="apple-no-profile" className="text-sm cursor-pointer">
                  {t("pitching.noProfileYet")}
                </label>
              </div>
            </div>

            <div>
              <Label>Instagram <span className="text-red-500">{t("pitching.required")}</span></Label>
              <Input
                className="mt-2"
                placeholder="https://instagram.com/..."
                value={formData.instagramUrl}
                onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value, instagramProfileMissing: false })}
                disabled={formData.instagramProfileMissing}
              />
              <div className="flex items-center space-x-2 mt-2">
                <Checkbox
                  id="instagram-no-profile"
                  checked={formData.instagramProfileMissing}
                  onCheckedChange={(checked) => setFormData({ ...formData, instagramProfileMissing: checked as boolean, instagramUrl: "" })}
                />
                <label htmlFor="instagram-no-profile" className="text-sm cursor-pointer">
                  {t("pitching.noProfileYet")}
                </label>
              </div>
            </div>

            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" /> {t("pitching.back")}
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? t("pitching.submitting") : t("pitching.finishPitching")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog для перегляду деталей пітчингу */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("pitching.detailsTitle")}</DialogTitle>
          </DialogHeader>
          {selectedPitching && (
            <div className="space-y-6">
              <div>
                <h3 className="font-semibold text-lg mb-2">{t("pitching.releaseInfo")}</h3>
                <div className="space-y-2 text-sm">
                  <p><strong>{t("pitching.releaseNameLabel")}:</strong> {selectedPitching.release.title}</p>
                  <p><strong>{t("pitching.artist")}:</strong> {selectedPitching.release.artist.name}</p>
                  <p><strong>{t("pitching.releaseDate")}:</strong> {formatDate(selectedPitching.release.releaseDate)}</p>
                  <p><strong>{t("pitching.focusTrack")}:</strong> {selectedPitching.focusTrack}</p>
                  <p><strong>{t("pitching.budgetLabel")}:</strong> ${selectedPitching.budget}</p>
                  <p><strong>{t("pitching.submittedDate")}:</strong> {formatDate(selectedPitching.createdAt)} {new Date(selectedPitching.createdAt).toLocaleTimeString(getLocale(), { 
                    hour: "2-digit",
                    minute: "2-digit"
                  })}</p>
                  <p>
                    <strong>{t("pitching.status")}:</strong> 
                    <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {selectedPitching.status === "SUBMITTED" ? t("pitching.statusSubmitted") : selectedPitching.status}
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">{t("pitching.releaseDescriptionLabel")}</h3>
                <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md">{selectedPitching.releaseDescription}</p>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">{t("pitching.artistInfoLabel")}</h3>
                <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md">{selectedPitching.artistInfo}</p>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">{t("pitching.promoplanLabel")}</h3>
                <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-md">{selectedPitching.promoplan}</p>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">{t("pitching.artistPhotosLabel")}</h3>
                <a 
                  href={selectedPitching.photosGoogleDrive} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {selectedPitching.photosGoogleDrive}
                </a>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">{t("pitching.socialProfiles")}</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Spotify:</strong> {selectedPitching.spotifyProfileMissing ? (
                      <span className="text-muted-foreground ml-2">{t("pitching.noProfileYet")}</span>
                    ) : selectedPitching.spotifyUrl ? (
                      <a href={selectedPitching.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                        {selectedPitching.spotifyUrl}
                      </a>
                    ) : (
                      <span className="text-muted-foreground ml-2">{t("pitching.notSpecified")}</span>
                    )}
                  </div>
                  <div>
                    <strong>Apple Music:</strong> {selectedPitching.appleMusicProfileMissing ? (
                      <span className="text-muted-foreground ml-2">{t("pitching.noProfileYet")}</span>
                    ) : selectedPitching.appleMusicUrl ? (
                      <a href={selectedPitching.appleMusicUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                        {selectedPitching.appleMusicUrl}
                      </a>
                    ) : (
                      <span className="text-muted-foreground ml-2">{t("pitching.notSpecified")}</span>
                    )}
                  </div>
                  <div>
                    <strong>Instagram:</strong> {selectedPitching.instagramProfileMissing ? (
                      <span className="text-muted-foreground ml-2">{t("pitching.noProfileYet")}</span>
                    ) : selectedPitching.instagramUrl ? (
                      <a href={selectedPitching.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-2">
                        {selectedPitching.instagramUrl}
                      </a>
                    ) : (
                      <span className="text-muted-foreground ml-2">{t("pitching.notSpecified")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={() => setDetailsDialogOpen(false)}>
                  {t("pitching.close")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
