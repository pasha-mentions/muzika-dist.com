import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, ChevronRight, Check, Upload, Play, Globe, Search, CheckCircle, ChevronDown, Trash2, Plus, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { countries } from "@/../../shared/countries";
import { CardDescription } from "@/components/ui/card";
import { useVideoDraft } from "@/hooks/useVideoDraft";
import { ROLE_LABELS } from "@/lib/roleLabels";
import WayforpayWidget from "@/components/payment/WayforpayWidget";

const genres = [
  { value: "alternative", label: "Alternative" },
  { value: "blues", label: "Blues" },
  { value: "brazilian", label: "Brazilian" },
  { value: "chicago-blues", label: "Chicago Blues" },
  { value: "chill-out", label: "Chill Out" },
  { value: "christian", label: "Christian" },
  { value: "christian-gospel", label: "Christian & Gospel" },
  { value: "christian-metal", label: "Christian Metal" },
  { value: "christian-pop", label: "Christian Pop" },
  { value: "christian-rap", label: "Christian Rap" },
  { value: "christian-rap-hiphop", label: "Christian Rap/Hip-Hop" },
  { value: "christian-rock", label: "Christian Rock" },
  { value: "classic-rock", label: "Classic Rock" },
  { value: "country", label: "Country" },
  { value: "country-rock", label: "Country Rock" },
  { value: "dance", label: "Dance" },
  { value: "electric-blues", label: "Electric Blues" },
  { value: "electro", label: "Electro" },
  { value: "electronic", label: "Electronic" },
  { value: "electro-pop", label: "Electro Pop" },
  { value: "experimental", label: "Experimental" },
  { value: "folk", label: "Folk" },
  { value: "funk", label: "Funk" },
  { value: "grunge", label: "Grunge" },
  { value: "hard-rock", label: "Hard Rock" },
  { value: "hip-hop", label: "Hip-Hop/Rap" },
  { value: "house", label: "House" },
  { value: "indie-dance", label: "Indie Dance" },
  { value: "indie-rock", label: "Indie Rock" },
  { value: "instrumental", label: "Instrumental" },
  { value: "jazz", label: "Jazz" },
  { value: "latin", label: "Latin" },
  { value: "metal", label: "Metal" },
  { value: "new-wave", label: "New Wave" },
  { value: "pop", label: "Pop" },
  { value: "pop-dance", label: "Pop Dance" },
  { value: "pop-rock", label: "Pop Rock" },
  { value: "punk", label: "Punk" },
  { value: "reggae", label: "Reggae" },
  { value: "rnb", label: "R'n'B" },
  { value: "rock", label: "Rock" },
  { value: "shoegazing", label: "Shoegazing" },
  { value: "smooth", label: "Smooth" },
  { value: "soul", label: "Soul" },
  { value: "synthwave", label: "Synthwave" },
  { value: "trance", label: "Trance" },
  { value: "world", label: "World" },
];

// Required contributor roles that cannot be removed
const REQUIRED_ROLES = [
  "composer",
  "lyricist",
  "arranger",
  "mixing_engineer",
  "mastering_engineer",
  "cover_designer"
];

// Helper function to normalize legacy genre values to new format
const normalizeGenre = (genre: string): string => {
  if (!genre) return "";
  
  // Check if it's already a valid new value
  if (genres.some(g => g.value === genre)) {
    return genre;
  }
  
  // Legacy format was capitalized labels like "Pop", "Hip Hop", "R&B"
  // New format uses slugs like "pop", "hip-hop", "rnb"
  const legacyMapping: Record<string, string> = {
    // Old simple labels
    "Electronic": "electronic",
    "electronic": "electronic",
    "Pop": "pop",
    "Rock": "rock",
    "Hip Hop": "hip-hop",
    "hip hop": "hip-hop",
    "Hip-Hop": "hip-hop",
    "Hip-Hop/Rap": "hip-hop",
    "hip-hop/rap": "hip-hop",
    "R&B": "rnb",
    "r&b": "rnb",
    "RnB": "rnb",
    "R'n'B": "rnb",
    "Country": "country",
    "country": "country",
    "Jazz": "jazz",
    "jazz": "jazz",
    "Classical": "instrumental",
    "classical": "instrumental",
    "Folk": "folk",
    "folk": "folk",
    "Reggae": "reggae",
    "reggae": "reggae",
    "Blues": "blues",
    "blues": "blues",
    "Alternative": "alternative",
    "alternative": "alternative",
    "Indie": "indie-rock",
    "indie": "indie-rock",
    "Dance": "dance",
    "dance": "dance",
    "House": "house",
    "house": "house",
    "Techno": "electro",
    "techno": "electro",
    "Ambient": "chill-out",
    "ambient": "chill-out",
    "World": "world",
    "world": "world",
    "Christian": "christian",
    "christian": "christian",
    "Christian & Gospel": "christian-gospel",
    "christian & gospel": "christian-gospel",
    // Additional common variations
    "Soul": "soul",
    "Funk": "funk",
    "Metal": "metal",
    "Punk": "punk",
    "Latin": "latin",
    "New Wave": "new-wave",
    "Shoegazing": "shoegazing",
    "Synthwave": "synthwave",
  };
  
  // Check if it's a legacy value
  if (legacyMapping[genre]) {
    return legacyMapping[genre];
  }
  
  // Fallback: return empty to force user re-selection (safer than inventing slugs)
  return "";
};

// Helper function to map language full names to codes
const mapLanguageToCode = (language: string): string => {
  const languageMap: Record<string, string> = {
    "english": "en",
    "ukrainian": "uk",
    "polish": "pl",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "italian": "it",
    "portuguese": "pt",
    "russian": "ru",
    "japanese": "ja",
    "chinese": "zh",
    "korean": "ko",
    "arabic": "ar",
    "hindi": "hi"
  };
  
  if (!language) return "";
  const lowerLang = language.toLowerCase();
  return languageMap[lowerLang] || language;
};

const languages = [
  { code: "en", name: "English" },
  { code: "uk", name: "Ukrainian" },
  { code: "pl", name: "Polish" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

const TERRITORIES_DATA = {
  "Europe": [
    "Åland Islands", "Albania", "Andorra", "Austria", "Belarus", "Belgium", 
    "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", 
    "Denmark", "Estonia", "Faroe Islands", "Finland", "Macedonia", "France", 
    "Germany", "Gibraltar", "Greece", "Guernsey", "Vatican", "Hungary", 
    "Iceland", "Ireland", "Isle of Man", "Italy", "Jersey", "Latvia", 
    "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco", 
    "Montenegro", "Netherlands", "Norway", "Poland", "Portugal", "Romania", 
    "Russian Federation", "San Marino", "Serbia", "Slovakia", "Slovenia", 
    "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom"
  ],
  "Asia": [
    "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan", 
    "British Indian Ocean Territory", "Brunei Darussalam", "Cambodia", "China", 
    "Christmas Island", "Cocos (Keeling) Islands", "Georgia", "Hong Kong", 
    "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan", 
    "Kazakhstan", "Kuwait", "Kyrgyzstan", "Lao People's Democratic Republic", 
    "Lebanon", "Macao", "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", 
    "North Korea", "Oman", "Pakistan", "Philippines", "Qatar", "Russian Federation", 
    "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Palestine", 
    "Syria", "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey", 
    "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"
  ],
  "North America": [
    "Anguilla", "Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Bermuda", 
    "Canada", "Cayman Islands", "Costa Rica", "Cuba", "Dominica", "Dominican Republic", 
    "El Salvador", "Greenland", "Grenada", "Guatemala", "Haiti", "Honduras", 
    "Jamaica", "Martinique", "Mexico", "Montserrat", "Nicaragua", "Panama", 
    "Puerto Rico", "Saint Barthélemy", "Saint Kitts and Nevis", "Saint Lucia", 
    "Saint Pierre and Miquelon", "Saint Vincent and the Grenadines", "Sint Maarten", 
    "Turks and Caicos Islands", "United States", "Virgin Islands"
  ],
  "South America": [
    "Argentina", "Aruba", "Bolivia", "Bonaire", "Brazil", "Chile", "Colombia", 
    "Curaçao", "Ecuador", "Falkland Islands (Malvinas)", "Guyana", "French Guiana", 
    "Suriname", "Paraguay", "Peru", "Trinidad and Tobago", "Uruguay", "Venezuela"
  ],
  "Africa": [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", 
    "Cape Verde", "Cameroon", "Central African Republic", "Chad", "Comoros", 
    "Congo, the Democratic Republic", "Djibouti", "Egypt", "Equatorial Guinea", 
    "Eritrea", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", 
    "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", 
    "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", 
    "Namibia", "Niger", "Nigeria", "Congo", "Rwanda", "Sao Tome and Principe", 
    "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa", 
    "South Sudan", "Sudan", "Swaziland", "Tanzania", "Togo", "Tunisia", 
    "Uganda", "Western Sahara", "Zambia", "Zimbabwe"
  ],
  "Oceania": [
    "American Samoa", "Australia", "Cook Islands", "Micronesia", "Fiji", 
    "French Polynesia", "Guam", "Kiribati", "Marshall Islands", "Nauru", 
    "New Zealand", "Niue", "Norfolk Island", "Northern Mariana Islands", 
    "Palau", "Papua New Guinea", "Pitcairn", "Samoa", "Solomon Islands", 
    "Tokelau", "Tonga", "Tuvalu", "Vanuatu"
  ]
};

interface Contributor {
  name: string;
  role: string;
}

interface VideoFormData {
  linkToRelease: boolean;
  releaseId?: string;
  videoFileId?: string;
  videoFileName?: string;
  metadataLanguage: string;
  title: string;
  artist: string;
  isrc: string;
  upc: string;
  primaryGenre: string;
  secondaryGenre: string;
  contentLanguage: string;
  explicitContent: boolean;
  aiGeneratedContent: boolean;
  hasNoMusic?: boolean;
  hasNoLyrics?: boolean;
  previewStart?: string;
  thumbnailTime?: string;
  firstReleaseDate: string;
  publicationDate: string;
  performers?: Array<{ name: string; role: string; }>;
  contributors: Contributor[];
  platforms: string[];
  territories: string[];
}

export default function NewVideo() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isPlatformAdmin } = useAuth();
  const queryClient = useQueryClient();
  
  // Admin organization selection states
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  
  // Draft system
  const { currentDraftId, isInitialized, saveDraft, loadDraft, clearCurrentDraft, drafts, wasCreatedByAutoSave, clearWasCreatedByAutoSave } = useVideoDraft();
  const [draftLoaded, setDraftLoaded] = useState(false);
  const lastLoadedDraftIdRef = useRef<string | null>(null);
  
  // Reset draftLoaded when currentDraftId changes (for switching or clearing drafts)
  // BUT only if this is an explicit user action (switching drafts), not auto-save creating new draft
  useEffect(() => {
    // Case 1: Auto-save created new draft - DON'T reset, just update ref
    if (wasCreatedByAutoSave && currentDraftId !== null) {
      console.log('[VIDEO DRAFT] Auto-save created draft - keeping form state');
      lastLoadedDraftIdRef.current = currentDraftId;
      clearWasCreatedByAutoSave(); // Clear the flag
      return;
    }
    
    // Case 2: User cleared draft (existingId → null) - allow reset
    if (currentDraftId === null && lastLoadedDraftIdRef.current !== null) {
      console.log('[VIDEO DRAFT] Draft cleared - resetting form');
      setDraftLoaded(false);
      lastLoadedDraftIdRef.current = null;
      return;
    }
    
    // Case 3: Different draft selected (either initial load or manual switch)
    if (currentDraftId !== lastLoadedDraftIdRef.current) {
      console.log('[VIDEO DRAFT] Different draft - allow loading');
      setDraftLoaded(false);
    }
  }, [currentDraftId, wasCreatedByAutoSave, clearWasCreatedByAutoSave]);
  
  const [currentStep, setCurrentStep] = useState(0);
  const [coverArtUrl, setCoverArtUrl] = useState<string>("");
  const [coverArtFileName, setCoverArtFileName] = useState<string>("");
  
  // Generation request states
  const [upcRequested, setUpcRequested] = useState(false);
  const [isrcRequested, setIsrcRequested] = useState(false);
  
  // Payment processing state
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Payment dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [createdVideoId, setCreatedVideoId] = useState<string | null>(null);
  
  // Validation state - shows red borders on empty required fields after submit attempt
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  
  const [formData, setFormData] = useState<Partial<VideoFormData>>({
    linkToRelease: false,
    platforms: [],
    territories: [],
    performers: [{ name: "", role: "main_performer" }],
    contributors: [
      { name: "", role: "composer" },
      { name: "", role: "lyricist" },
      { name: "", role: "arranger" },
      { name: "", role: "mixing_engineer" },
      { name: "", role: "mastering_engineer" },
      { name: "", role: "cover_designer" }
    ],
    metadataLanguage: "en",
    explicitContent: false,
    aiGeneratedContent: false,
    hasNoMusic: false,
    hasNoLyrics: false
  });

  // Load draft on mount - WAIT for isInitialized and for auto-select to complete
  useEffect(() => {
    if (!isInitialized) {
      console.log('[VIDEO DRAFT] Waiting for initialization...');
      return; // Wait until hook is hydrated from server
    }
    
    // Wait for auto-select if there are drafts but no currentDraftId yet
    if (drafts.length > 0 && !currentDraftId) {
      console.log('[VIDEO DRAFT] Waiting for auto-select...');
      return;
    }
    
    if (!draftLoaded) {
      console.log('[VIDEO DRAFT] System initialized. currentDraftId:', currentDraftId);
      
      const loadAndRestoreDraft = async () => {
        if (currentDraftId) {
          const draft = await loadDraft(currentDraftId);
          console.log('[VIDEO DRAFT] Loaded draft:', draft);
          
          if (draft) {
            // Restore form state from draft
            setCurrentStep(draft.currentStep === "files" ? 0 : draft.currentStep === "metadata" ? 1 : 2);
            
            if (draft.coverArt?.uploadedUrl) {
              setCoverArtUrl(draft.coverArt.uploadedUrl);
              setCoverArtFileName(draft.coverArt.fileName || "");
            }
            
            // Restore generation request states
            if (draft.upcRequested) {
              setUpcRequested(true);
            }
            if (draft.isrcRequested) {
              setIsrcRequested(true);
            }
            
            setFormData({
              videoFileId: draft.videoFile?.fileId,
              videoFileName: draft.videoFile?.fileName,
              linkToRelease: !!draft.videoMetadata?.linkedReleaseId,
              releaseId: draft.videoMetadata?.linkedReleaseId || undefined,
              title: draft.videoMetadata?.title || "",
              artist: draft.videoMetadata?.artist || "",
              upc: draft.videoMetadata?.upc || "",
              isrc: draft.videoMetadata?.isrc || "",
              primaryGenre: normalizeGenre(draft.videoMetadata?.primaryGenre || ""),
              secondaryGenre: normalizeGenre(draft.videoMetadata?.secondaryGenre || ""),
              contentLanguage: draft.videoMetadata?.language || "",
              metadataLanguage: draft.videoMetadata?.metadataLanguage || "en",
              firstReleaseDate: draft.videoMetadata?.firstReleaseDate || "",
              publicationDate: draft.videoMetadata?.publicationDate || "",
              explicitContent: draft.videoMetadata?.explicitContent || false,
              aiGeneratedContent: draft.videoMetadata?.aiGeneratedContent || false,
              hasNoMusic: draft.videoMetadata?.hasNoMusic || false,
              hasNoLyrics: draft.videoMetadata?.hasNoLyrics || false,
              previewStart: draft.videoMetadata?.previewStart || "",
              thumbnailTime: draft.videoMetadata?.thumbnailTime || "",
              performers: draft.videoMetadata?.performers || [{ name: "", role: "main_performer" }],
              contributors: draft.videoMetadata?.contributors || [
                { name: "", role: "composer" },
                { name: "", role: "lyricist" },
                { name: "", role: "arranger" },
                { name: "", role: "mixing_engineer" },
                { name: "", role: "mastering_engineer" },
                { name: "", role: "cover_designer" }
              ],
              territories: draft.selectedTerritories || [],
              platforms: draft.selectedPlatforms || ["spotify", "appleMusic", "tidal"]
            });
            
            toast({
              title: t('toast.success'),
              description: t('releases.draftRestored'),
            });
          } else {
            console.log('[VIDEO DRAFT] No draft found for id:', currentDraftId);
          }
        } else {
          console.log('[VIDEO DRAFT] No currentDraftId and no drafts, starting fresh');
          // Reset form to initial state when starting fresh or clearing draft
          setCurrentStep(0);
          setCoverArtUrl("");
          setCoverArtFileName("");
          setUpcRequested(false);
          setIsrcRequested(false);
          setFormData({
            linkToRelease: false,
            platforms: [],
            territories: [],
            performers: [{ name: "", role: "main_performer" }],
            contributors: [
              { name: "", role: "composer" },
              { name: "", role: "lyricist" },
              { name: "", role: "arranger" },
              { name: "", role: "mixing_engineer" },
              { name: "", role: "mastering_engineer" },
              { name: "", role: "cover_designer" }
            ],
            metadataLanguage: "en",
            explicitContent: false,
            aiGeneratedContent: false,
            hasNoMusic: false,
            hasNoLyrics: false
          });
        }
        
        lastLoadedDraftIdRef.current = currentDraftId;
        setDraftLoaded(true);
      };
      
      loadAndRestoreDraft();
    }
  }, [isInitialized, currentDraftId, draftLoaded, drafts.length, loadDraft, t, toast]);

  // Initialize all territories and platforms by default
  useEffect(() => {
    if (draftLoaded || !currentDraftId) {
      const allTerritories: string[] = [];
      Object.values(TERRITORIES_DATA).forEach(countries => {
        allTerritories.push(...countries);
      });
      setFormData(prev => ({
        ...prev,
        platforms: prev.platforms?.length ? prev.platforms : ["spotify", "appleMusic", "tidal"],
        territories: prev.territories?.length ? prev.territories : allTerritories
      }));
    }
  }, [draftLoaded, currentDraftId]);

  // Load organizations for platform admins
  useEffect(() => {
    if (isPlatformAdmin) {
      const loadOrganizations = async () => {
        setIsLoadingOrgs(true);
        try {
          const response = await apiRequest("GET", "/api/admin/organizations");
          const data = await response.json();
          setOrganizations(data);
          console.log("✅ Loaded organizations for Admin:", data);
        } catch (error) {
          console.error("❌ Failed to load organizations:", error);
          toast({
            title: "Помилка",
            description: "Не вдалося завантажити список організацій",
            variant: "destructive"
          });
        } finally {
          setIsLoadingOrgs(false);
        }
      };
      loadOrganizations();
    }
  }, [isPlatformAdmin, toast]);

  // Helper function to save draft
  const saveDraftData = useCallback(() => {
    const hasData = 
      formData.videoFileId ||
      coverArtUrl ||
      formData.title ||
      formData.artist ||
      formData.upc ||
      formData.isrc ||
      (formData.contributors && formData.contributors.some(c => c.name));
    
    console.log('[VIDEO DRAFT] saveDraftData called. hasData:', hasData, 'draftLoaded:', draftLoaded);
    
    if (hasData) {
      const stepName = currentStep === 0 ? "files" : currentStep === 1 ? "metadata" : "distribution";
      
      const draftData = {
        currentStep: stepName as "files" | "metadata" | "distribution",
        videoFile: {
          fileId: formData.videoFileId,
          fileName: formData.videoFileName,
          fileSize: 0,
        },
        coverArt: {
          uploadedUrl: coverArtUrl,
          fileName: coverArtFileName,
        },
        videoMetadata: {
          title: formData.title,
          artist: formData.artist || formData.performers?.[0]?.name || "",
          upc: formData.upc,
          isrc: formData.isrc,
          primaryGenre: formData.primaryGenre,
          secondaryGenre: formData.secondaryGenre,
          language: formData.contentLanguage,
          metadataLanguage: formData.metadataLanguage,
          firstReleaseDate: formData.firstReleaseDate,
          publicationDate: formData.publicationDate,
          explicitContent: formData.explicitContent,
          aiGeneratedContent: formData.aiGeneratedContent,
          hasNoMusic: formData.hasNoMusic,
          hasNoLyrics: formData.hasNoLyrics,
          previewStart: formData.previewStart,
          thumbnailTime: formData.thumbnailTime,
          performers: formData.performers,
          contributors: formData.contributors,
          linkedReleaseId: formData.releaseId?.toString(),
        },
        selectedTerritories: formData.territories || [],
        selectedPlatforms: formData.platforms || [],
        upcRequested,
        isrcRequested,
        selectedOrgId: undefined,
      };
      
      console.log('[VIDEO DRAFT] Saving draft:', draftData);
      const draftId = saveDraft(draftData);
      console.log('[VIDEO DRAFT] Draft saved with ID:', draftId);
    }
  }, [formData, currentStep, coverArtUrl, coverArtFileName, upcRequested, isrcRequested, saveDraft, draftLoaded]);

  // Auto-save draft when form data changes
  useEffect(() => {
    if (!draftLoaded) return; // Don't save until draft is loaded
    saveDraftData();
  }, [formData, currentStep, coverArtUrl, coverArtFileName, draftLoaded]);

  // Mobile optimization: save on page visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && draftLoaded) {
        saveDraftData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [draftLoaded, saveDraftData]);

  // Save draft before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (draftLoaded) {
        saveDraftData();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draftLoaded, saveDraftData]);

  const steps = [
    { id: 0, name: t('musicVideo.steps.files') },
    { id: 1, name: t('musicVideo.steps.metadata') },
    { id: 2, name: t('musicVideo.steps.distribution') },
  ];

  const updateFormData = (data: Partial<VideoFormData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate("/releases");
    }
  };

  const handleStepClick = (stepIndex: number) => {
    setCurrentStep(stepIndex);
  };

  const handleSubmit = async () => {
    // Enable validation error display
    setShowValidationErrors(true);
    
    // Validate organization selection for platform admins
    if (isPlatformAdmin && !selectedOrgId) {
      toast({
        title: t('toast.error'),
        description: "Оберіть організацію для створення відео",
        variant: "destructive",
      });
      setCurrentStep(1); // Go back to metadata step
      return;
    }

    // Validate all required fields before submission
    // Allow empty ISRC/UPC if they were requested for generation
    const hasEmptyPerformer = (formData.performers || []).some(p => !p.name?.trim());
    const hasEmptyRequiredContributor = (formData.contributors || []).some(c => 
      REQUIRED_ROLES.includes(c.role) && !c.name?.trim() &&
      !(formData.hasNoMusic && (c.role === 'composer' || c.role === 'arranger')) &&
      !(formData.hasNoLyrics && c.role === 'lyricist')
    );
    
    if (!formData.title || (!formData.isrc && !isrcRequested) || (!formData.upc && !upcRequested) ||
        !formData.publicationDate || hasEmptyPerformer || hasEmptyRequiredContributor) {
      toast({
        title: t('toast.error'),
        description: t('common.requiredFields'),
        variant: "destructive",
      });
      setCurrentStep(1); // Go back to metadata step
      return;
    }

    if (!formData.platforms || formData.platforms.length === 0) {
      toast({
        title: t('toast.error'),
        description: t('musicVideo.payment.selectPlatform'),
        variant: "destructive",
      });
      return;
    }

    if (!formData.territories || formData.territories.length === 0) {
      toast({
        title: t('toast.error'),
        description: t('musicVideo.payment.selectTerritory'),
        variant: "destructive",
      });
      return;
    }

    try {
      setIsProcessingPayment(true);

      // Save music video to database
      // Use first performer's name as artist if no explicit artist name is set
      const artistName = formData.artist || formData.performers?.[0]?.name || "";
      
      const videoData = {
        title: formData.title,
        artist: artistName,
        videoFileId: formData.videoFileId,
        videoFileName: formData.videoFileName,
        videoSize: formData.videoFileId ? 0 : undefined,
        coverArtFileId: coverArtUrl ? undefined : undefined,
        coverArtUrl: coverArtUrl,
        coverArtFileName: coverArtFileName,
        upc: formData.upc,
        upcRequested,
        isrc: formData.isrc,
        isrcRequested,
        primaryGenre: formData.primaryGenre,
        secondaryGenre: formData.secondaryGenre,
        contentLanguage: formData.contentLanguage,
        metadataLanguage: formData.metadataLanguage || 'en',
        firstReleaseDate: formData.firstReleaseDate,
        publicationDate: formData.publicationDate,
        explicitContent: formData.explicitContent,
        aiGenerated: formData.aiGeneratedContent,
        hasNoMusic: formData.hasNoMusic,
        hasNoLyrics: formData.hasNoLyrics,
        previewStart: formData.previewStart,
        thumbnailTime: formData.thumbnailTime,
        performers: formData.performers,
        contributors: formData.contributors,
        territories: formData.territories,
        platforms: formData.platforms,
        releaseId: formData.releaseId,
        organizationId: isPlatformAdmin ? selectedOrgId : undefined,
      };

      console.log('[VIDEO SUBMIT] Saving video to database:', videoData);

      const createResponse = await fetch('/api/music-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(videoData),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to save music video');
      }

      const createdVideo = await createResponse.json();
      const videoId = createdVideo.id;

      console.log('[VIDEO SUBMIT] Video created with ID:', videoId);

      // Clear draft after successful submission
      clearCurrentDraft();

      // Platform Admins and orgs with free releases skip payment and go directly to catalog
      if (isPlatformAdmin || createdVideo.paymentStatus === 'PAID') {
        toast({
          title: t('toast.success'),
          description: t('musicVideo.videoCreatedSuccess'),
        });

        setTimeout(() => {
          window.location.href = "/catalog";
        }, 1500);
      } else {
        // Regular users: Show payment on same page, don't redirect until paid
        toast({
          title: t('musicVideo.videoCreatedSuccess', 'Відео створено!'),
          description: 'Оплатіть відео для відправки на модерацію.',
        });
        
        // Store payment info and show payment widget
        setCreatedVideoId(videoId);
        setShowPaymentDialog(true);
      }
    } catch (error) {
      console.error('[VIDEO SUBMIT] Error:', error);
      toast({
        title: t('toast.error'),
        description: error instanceof Error ? error.message : 'Failed to process payment',
        variant: "destructive",
      });
      setIsProcessingPayment(false);
    }
  };

  // Handle UPC generation request
  const handleGenerateUpc = () => {
    setUpcRequested(true);
    updateFormData({ upc: "" });
    toast({
      title: t('toast.success'),
      description: "UPC заплановано до генерації. Адміністратор згенерує UPC код для вашого відео",
    });
  };

  // Handle ISRC generation request
  const handleGenerateIsrc = () => {
    setIsrcRequested(true);
    updateFormData({ isrc: "" });
    toast({
      title: t('toast.success'),
      description: "ISRC заплановано до генерації. Адміністратор згенерує ISRC код для вашого відео",
    });
  };

  // Performer management
  const addPerformer = () => {
    const currentPerformers = formData.performers || [];
    if (currentPerformers.length < 5) {
      updateFormData({
        performers: [...currentPerformers, { name: "", role: "main_performer" }],
      });
    }
  };

  const removePerformer = (index: number) => {
    const currentPerformers = formData.performers || [];
    if (currentPerformers.length > 1) {
      updateFormData({
        performers: currentPerformers.filter((_, i) => i !== index),
      });
    }
  };

  const updatePerformer = (index: number, field: 'name' | 'role', value: string) => {
    const currentPerformers = formData.performers || [];
    const updatedPerformers = [...currentPerformers];
    updatedPerformers[index] = { ...updatedPerformers[index], [field]: value };
    updateFormData({ performers: updatedPerformers });
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{t('musicVideo.title')}</CardTitle>
            
            <div className="mt-6">
              <Progress value={progress} className="h-2 mb-4" />
              
              <div className="flex justify-between">
                {steps.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => handleStepClick(index)}
                    className={`flex flex-col items-center gap-2 flex-1 cursor-pointer transition-all hover:text-primary ${
                      index === currentStep ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                        index === currentStep
                          ? 'bg-primary text-primary-foreground border-primary'
                          : index < currentStep
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      {index < currentStep ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <span className="text-sm font-medium hidden sm:block">{step.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {currentStep === 0 && (
              <FilesStep formData={formData} updateFormData={updateFormData} />
            )}
            {currentStep === 1 && (
              <MetadataStep 
                formData={formData} 
                updateFormData={updateFormData}
                isrcRequested={isrcRequested}
                upcRequested={upcRequested}
                onGenerateIsrc={handleGenerateIsrc}
                onGenerateUpc={handleGenerateUpc}
                onAddPerformer={addPerformer}
                onRemovePerformer={removePerformer}
                onUpdatePerformer={updatePerformer}
                isPlatformAdmin={isPlatformAdmin}
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectOrg={setSelectedOrgId}
                isLoadingOrgs={isLoadingOrgs}
                showValidationErrors={showValidationErrors}
              />
            )}
            {currentStep === 2 && (
              <DistributionStep formData={formData} updateFormData={updateFormData} />
            )}

            <div className="flex justify-between mt-8">
              <Button
                variant="outline"
                onClick={handleBack}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                {currentStep === 0 ? t('common.cancel') : t('common.back')}
              </Button>

              <Button onClick={handleNext}>
                {currentStep === steps.length - 1 ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    {t('musicVideo.payment.title')}
                  </>
                ) : (
                  <>
                    {t('common.next')}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Payment Widget - auto-starts immediately after video creation */}
      {showPaymentDialog && createdVideoId && (
        <WayforpayWidget
          entityType="video"
          entityId={createdVideoId}
          paymentStatus="PENDING"
          amount="1000 грн"
          autoStart={true}
          onPaymentSuccess={() => {
            setShowPaymentDialog(false);
            toast({
              title: 'Оплату підтверджено!',
              description: 'Ваше відео відправлено на модерацію.',
            });
            // Redirect to dashboard after successful payment
            window.location.href = '/dashboard';
          }}
          onWidgetClose={() => {
            // User closed widget without paying - stay on page, keep widget available
            // Don't redirect, let them try again or go to catalog manually
          }}
          className="hidden"
        />
      )}
    </div>
  );
}

function FilesStep({ formData, updateFormData }: { 
  formData: Partial<VideoFormData>; 
  updateFormData: (data: Partial<VideoFormData>) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Cleanup object URL on unmount or when URL changes
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
    };
  }, [videoPreviewUrl]);

  // Fetch user releases
  const { data: releasesData } = useQuery<{ releases: any[]; total: number; page: number; totalPages: number }>({
    queryKey: ["/api/releases"],
    enabled: formData.linkToRelease === true,
  });
  const releases = releasesData?.releases || [];

  const [uploadStatus, setUploadStatus] = useState<'idle' | 'initializing' | 'uploading' | 'finalizing'>('idle');
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks

  const uploadFile = async (file: File) => {
    if (!file.name.match(/\.(mp4|mov)$/i)) {
      toast({
        title: t('musicVideo.filesStep.invalidVideoFormat'),
        description: t('musicVideo.filesStep.invalidVideoFormatDesc'),
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024 * 1024) {
      toast({
        title: t('musicVideo.filesStep.videoTooLarge'),
        description: t('musicVideo.filesStep.videoTooLargeDesc'),
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('initializing');
    setCurrentChunk(0);

    const numChunks = Math.ceil(file.size / CHUNK_SIZE);
    setTotalChunks(numChunks);

    try {
      console.log('[CHUNKED UPLOAD] Initializing upload for:', file.name, 'size:', file.size, 'chunks:', numChunks);
      
      const initResponse = await fetch('/api/music-videos/init-chunked-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'video/mp4',
          fileSize: file.size
        })
      });

      if (!initResponse.ok) {
        const error = await initResponse.json();
        throw new Error(error.error || 'Failed to initialize upload');
      }

      const { sessionKey } = await initResponse.json();
      console.log('[CHUNKED UPLOAD] Session created, starting chunk upload');

      setUploadStatus('uploading');

      let uploadedBytes = 0;
      let fileId: string | undefined;

      for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
        const startByte = chunkIndex * CHUNK_SIZE;
        const endByte = Math.min(startByte + CHUNK_SIZE, file.size) - 1;
        const chunk = file.slice(startByte, endByte + 1);

        setCurrentChunk(chunkIndex + 1);
        console.log('[CHUNKED UPLOAD] Uploading chunk', chunkIndex + 1, '/', numChunks, 'bytes', startByte, '-', endByte);

        const formData = new FormData();
        formData.append('chunk', chunk, `chunk_${chunkIndex}`);
        formData.append('sessionKey', sessionKey);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('startByte', startByte.toString());
        formData.append('endByte', endByte.toString());

        let retries = 3;
        let lastError: Error | null = null;

        while (retries > 0) {
          try {
            const chunkResponse = await fetch('/api/music-videos/upload-chunk', {
              method: 'POST',
              body: formData
            });

            if (!chunkResponse.ok) {
              const errorData = await chunkResponse.json();
              throw new Error(errorData.error || 'Chunk upload failed');
            }

            const result = await chunkResponse.json();
            uploadedBytes = result.uploadedBytes;
            
            const progress = Math.round((uploadedBytes / file.size) * 100);
            setUploadProgress(progress);

            if (result.status === 'complete') {
              fileId = result.fileId;
              console.log('[CHUNKED UPLOAD] All chunks uploaded, fileId:', fileId);
            }

            break;
          } catch (err: any) {
            lastError = err;
            retries--;
            if (retries > 0) {
              console.log('[CHUNKED UPLOAD] Chunk failed, retrying...', retries, 'left');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (retries === 0 && lastError) {
          throw lastError;
        }
      }

      if (!fileId) {
        throw new Error('Upload completed but no fileId received');
      }

      setUploadStatus('finalizing');
      console.log('[CHUNKED UPLOAD] Completing upload...');

      const completeResponse = await fetch('/api/music-videos/complete-chunked-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey })
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json();
        throw new Error(errorData.error || 'Failed to finalize upload');
      }

      updateFormData({
        videoFileId: fileId,
        videoFileName: file.name,
      });

      // Revoke old preview URL if exists to prevent memory leak
      if (videoPreviewUrl) {
        URL.revokeObjectURL(videoPreviewUrl);
      }
      // Create object URL for video preview
      const previewUrl = URL.createObjectURL(file);
      setVideoPreviewUrl(previewUrl);

      toast({
        title: t('musicVideo.filesStep.videoUploaded'),
        description: file.name,
      });

      console.log('[CHUNKED UPLOAD] Upload complete!');

    } catch (error: any) {
      console.error('[CHUNKED UPLOAD] Error:', error);
      toast({
        title: t('toast.error'),
        description: error.message || t('toast.uploadError'),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadStatus('idle');
      setCurrentChunk(0);
      setTotalChunks(0);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    await uploadFile(file);
  };

  const handleReleaseSelection = async (releaseId: string) => {
    try {
      const response = await fetch(`/api/releases/${releaseId}`);
      if (!response.ok) throw new Error("Failed to fetch release");
      
      const release = await response.json();
      
      // Get contributors from release tracks (first track with participants)
      let contributorsFromRelease: Contributor[] = [];
      if (release.tracks && release.tracks.length > 0) {
        const firstTrack = release.tracks[0];
        if (firstTrack.participants && Array.isArray(firstTrack.participants)) {
          contributorsFromRelease = firstTrack.participants.map((p: any) => ({
            name: p.name || "",
            role: p.role
          }));
        }
      }

      // Merge logic: prioritize release data, preserve user duplicates and optional roles
      const existingContributors = formData.contributors || [];
      
      // Track which user contributors we've consumed (by index)
      const usedIndices = new Set<number>();
      
      // Build required contributors: always use release data if available, fallback to user data
      const requiredContributors = REQUIRED_ROLES.map(role => {
        const fromRelease = contributorsFromRelease.find(c => c.role === role);
        if (fromRelease && fromRelease.name) {
          // Release has this role with data - use it
          return fromRelease;
        }
        
        // No release data - check if user entered something (first occurrence only)
        const userIndex = existingContributors.findIndex((c: any) => c.role === role && c.name && c.name.trim());
        if (userIndex >= 0) {
          usedIndices.add(userIndex); // Mark as consumed
          return existingContributors[userIndex];
        }
        
        return { name: "", role };
      });
      
      // Add remaining contributors: optional roles + unused user-added duplicates of required roles
      const additionalContributors = existingContributors.filter((c: any, index: number) => {
        // Skip if already used in requiredContributors
        if (usedIndices.has(index)) return false;
        
        // Keep if it's an optional role (not in REQUIRED_ROLES)
        if (!REQUIRED_ROLES.includes(c.role)) return true;
        
        // For required roles: only keep if it has user-entered data (as a duplicate)
        // Skip empty placeholders
        return c.name && c.name.trim();
      });
      
      // Get ISRC from first track if available
      const firstTrackIsrc = release.tracks?.[0]?.isrc || "";
      
      // Convert API data to correct format for form
      const primaryGenre = normalizeGenre(release.primaryGenre || "");
      const secondaryGenre = normalizeGenre(release.secondaryGenre || "");
      const languageCode = mapLanguageToCode(release.language || "");
      
      console.log("Converted data:", {
        primaryGenre,
        secondaryGenre,
        languageCode,
      });
      
      updateFormData({
        releaseId: releaseId,
        title: release.title,
        isrc: firstTrackIsrc,
        primaryGenre: primaryGenre,
        secondaryGenre: secondaryGenre,
        metadataLanguage: languageCode,
        contentLanguage: languageCode,
        firstReleaseDate: release.originalReleaseDate,
        publicationDate: release.releaseDate,
        performers: release.performers || [{ name: "", role: "main_performer" }],
        contributors: [...requiredContributors, ...additionalContributors],
        explicitContent: release.explicitContent || false,
      });

      toast({
        title: t('common.success'),
        description: t('musicVideo.filesStep.metadataLoaded'),
      });
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('musicVideo.filesStep.loadReleaseFailed'),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">{t('musicVideo.filesStep.title')}</h3>
        <p className="text-sm text-muted-foreground mt-2">{t('musicVideo.filesStep.description')}</p>
      </div>
      
      {/* Link to Release */}
      <div className="space-y-4">
        <Label>{t('musicVideo.filesStep.linkToRelease')}</Label>
        <RadioGroup 
          value={formData.linkToRelease ? "yes" : "no"}
          onValueChange={(value) => updateFormData({ linkToRelease: value === "yes" })}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="link-yes" />
            <Label htmlFor="link-yes" className="cursor-pointer">{t('musicVideo.filesStep.yes')}</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="link-no" />
            <Label htmlFor="link-no" className="cursor-pointer">{t('musicVideo.filesStep.no')}</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Release Selection */}
      {formData.linkToRelease && (
        <div className="space-y-2">
          <Label htmlFor="release">{t('musicVideo.filesStep.selectRelease')}</Label>
          <Select
            value={formData.releaseId?.toString()}
            onValueChange={handleReleaseSelection}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('musicVideo.filesStep.selectReleasePlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {releases.length > 0 ? (
                releases.map((release: any) => (
                  <SelectItem key={release.id} value={release.id.toString()}>
                    {release.title}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="none" disabled>
                  {t('musicVideo.filesStep.noReleasesAvailable')}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Video Upload - Side by side layout when video is uploaded */}
      {videoPreviewUrl && formData.videoFileName ? (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
          {/* Left: Replace file box */}
          <div className="space-y-2">
            <Label>{t('musicVideo.filesStep.uploadVideo')}</Label>
            <div
              onClick={() => !uploading && videoInputRef.current?.click()}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-all h-[200px] flex flex-col items-center justify-center ${
                isDragging 
                  ? 'border-primary bg-primary/5 scale-105' 
                  : uploading
                  ? 'border-border cursor-default'
                  : 'border-border cursor-pointer hover:border-primary'
              }`}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                  <p className="text-sm text-muted-foreground">
                    {uploadStatus === 'initializing' && t('musicVideo.filesStep.preparingUpload', 'Підготовка завантаження...')}
                    {uploadStatus === 'uploading' && t('common.uploading')}
                    {uploadStatus === 'finalizing' && t('musicVideo.filesStep.finalizingUpload', 'Завершення завантаження...')}
                  </p>
                  <div className="w-full max-w-xs">
                    <Progress value={uploadStatus === 'uploading' ? uploadProgress : uploadStatus === 'finalizing' ? 100 : 0} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-2">
                      {uploadStatus === 'uploading' ? `${uploadProgress}%` : uploadStatus === 'finalizing' ? '100%' : '...'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Play className="w-12 h-12 text-primary" />
                  <p className="font-medium text-sm truncate max-w-full">{formData.videoFileName}</p>
                  <p className="text-xs text-muted-foreground">{t('musicVideo.filesStep.clickToReplace')}</p>
                </div>
              )}
            </div>
            <input
              ref={videoInputRef}
              type="file"
              accept=".mp4,.mov"
              onChange={handleVideoUpload}
              className="hidden"
            />
          </div>

          {/* Right: Video Preview Player */}
          <div className="space-y-2">
            <Label>{t('musicVideo.filesStep.videoPreview', 'Попередній перегляд')}</Label>
            <div className="rounded-lg overflow-hidden border bg-black h-[200px] flex items-center justify-center">
              <video
                src={videoPreviewUrl}
                controls
                className="w-full h-full object-contain"
                preload="metadata"
              >
                {t('musicVideo.filesStep.videoNotSupported', 'Ваш браузер не підтримує відео.')}
              </video>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>{t('musicVideo.filesStep.uploadVideo')}</Label>
          <div
            onClick={() => !uploading && videoInputRef.current?.click()}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              isDragging 
                ? 'border-primary bg-primary/5 scale-105' 
                : uploading
                ? 'border-border cursor-default'
                : 'border-border cursor-pointer hover:border-primary'
            }`}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                <p className="text-sm text-muted-foreground">
                  {uploadStatus === 'initializing' && t('musicVideo.filesStep.preparingUpload', 'Підготовка завантаження...')}
                  {uploadStatus === 'uploading' && t('common.uploading')}
                  {uploadStatus === 'finalizing' && t('musicVideo.filesStep.finalizingUpload', 'Завершення завантаження...')}
                </p>
                <div className="w-full max-w-xs">
                  <Progress value={uploadStatus === 'uploading' ? uploadProgress : uploadStatus === 'finalizing' ? 100 : 0} className="h-2" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {uploadStatus === 'uploading' ? `${uploadProgress}%` : uploadStatus === 'finalizing' ? '100%' : '...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className={`w-12 h-12 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className={`transition-colors ${isDragging ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                  {isDragging ? t('musicVideo.filesStep.dropHere') : t('musicVideo.filesStep.uploadVideo')}
                </p>
                <p className="text-sm text-muted-foreground">{t('musicVideo.filesStep.videoHint')}</p>
              </div>
            )}
          </div>
          <input
            ref={videoInputRef}
            type="file"
            accept=".mp4,.mov"
            onChange={handleVideoUpload}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
}

function MetadataStep({ 
  formData, 
  updateFormData, 
  isrcRequested,
  upcRequested,
  onGenerateIsrc,
  onGenerateUpc,
  onAddPerformer,
  onRemovePerformer,
  onUpdatePerformer,
  isPlatformAdmin,
  organizations,
  selectedOrgId,
  onSelectOrg,
  isLoadingOrgs,
  showValidationErrors
}: { 
  formData: Partial<VideoFormData>; 
  updateFormData: (data: Partial<VideoFormData>) => void;
  isrcRequested: boolean;
  upcRequested: boolean;
  onGenerateIsrc: () => void;
  onGenerateUpc: () => void;
  onAddPerformer: () => void;
  onRemovePerformer: (index: number) => void;
  onUpdatePerformer: (index: number, field: 'name' | 'role', value: string) => void;
  isPlatformAdmin: boolean;
  organizations: any[];
  selectedOrgId: string;
  onSelectOrg: (id: string) => void;
  isLoadingOrgs: boolean;
  showValidationErrors: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const InfoTooltip = ({ content }: { content: string }) => {
    const [open, setOpen] = useState(false);

    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center ml-1 p-0 border-0 bg-transparent"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(!open);
              }}
              aria-label="Show information"
            >
              <Info className="h-4 w-4 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent 
            side="top" 
            align="start"
            className="max-w-[min(280px,calc(100vw-32px))] z-50" 
            collisionPadding={16}
            sideOffset={8}
          >
            <p className="text-sm">{content}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">{t('musicVideo.metadataStep.title')}</h3>

      {isPlatformAdmin && (
        <div className="space-y-2 p-4 border-2 border-purple-500/50 rounded-lg bg-purple-500/5">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Globe className="h-4 w-4 text-purple-500" />
            * Оберіть організацію (Artist/Label)
          </Label>
          <p className="text-sm text-muted-foreground">
            Музичне відео буде створено для обраної організації та з'явиться в їхньому каталозі
          </p>
          <Select 
            value={selectedOrgId} 
            onValueChange={onSelectOrg}
            disabled={isLoadingOrgs}
          >
            <SelectTrigger className="h-12 border-purple-500/50">
              <SelectValue placeholder={isLoadingOrgs ? "Завантаження..." : "Оберіть організацію"} />
            </SelectTrigger>
            <SelectContent>
              {organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  {org.name} ({org.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Tabs defaultValue="video" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="video">{t('musicVideo.metadataStep.videoData')}</TabsTrigger>
          <TabsTrigger value="artist">{t('musicVideo.metadataStep.artistData')}</TabsTrigger>
        </TabsList>

        {/* Video Data Tab */}
        <TabsContent value="video" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="metadataLanguage" className="flex items-center">
              {t('musicVideo.metadataStep.metadataLanguage')}
              <InfoTooltip content={t('musicVideo.tooltips.metadataLanguage')} />
            </Label>
            <Select
              value={formData.metadataLanguage}
              onValueChange={(value) => updateFormData({ metadataLanguage: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title" className="flex items-center">
              {t('musicVideo.metadataStep.videoTitle')} *
              <InfoTooltip content={t('musicVideo.tooltips.title')} />
            </Label>
            <Input
              id="title"
              value={formData.title || ""}
              onChange={(e) => updateFormData({ title: e.target.value })}
              placeholder="Video title"
              className={showValidationErrors && !formData.title?.trim() ? "border-red-500" : ""}
            />
            {showValidationErrors && !formData.title?.trim() && (
              <p className="text-sm text-red-500">{t('common.requiredField')}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="isrc" className="flex items-center">
                {t('musicVideo.metadataStep.isrc')} *
                <InfoTooltip content={t('musicVideo.tooltips.isrc')} />
              </Label>
              <Input
                id="isrc"
                value={formData.isrc || ""}
                onChange={(e) => updateFormData({ isrc: e.target.value })}
                placeholder={isrcRequested ? t('newRelease.metadataStep.generating') : "ISRC code"}
                disabled={isrcRequested}
                className={showValidationErrors && !isrcRequested && !formData.isrc?.trim() ? "border-red-500" : ""}
              />
              {isrcRequested && (
                <p className="text-sm text-blue-600">{t('newRelease.metadataStep.upcGenerated')}</p>
              )}
              {showValidationErrors && !isrcRequested && !formData.isrc?.trim() && (
                <p className="text-sm text-red-500">{t('common.requiredField')}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="opacity-0 select-none">Placeholder</Label>
              <Button 
                type="button"
                onClick={onGenerateIsrc}
                disabled={isrcRequested}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isrcRequested ? t('newRelease.metadataStep.generating') : t('newRelease.tracksStep.generateIsrc')}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="upc" className="flex items-center">
                {t('musicVideo.metadataStep.upc')} *
                <InfoTooltip content={t('musicVideo.tooltips.upc')} />
              </Label>
              <Input
                id="upc"
                value={formData.upc || ""}
                onChange={(e) => updateFormData({ upc: e.target.value })}
                placeholder={upcRequested ? t('newRelease.metadataStep.generating') : "UPC code"}
                disabled={upcRequested}
                className={showValidationErrors && !upcRequested && !formData.upc?.trim() ? "border-red-500" : ""}
              />
              {upcRequested && (
                <p className="text-sm text-blue-600">{t('newRelease.metadataStep.upcGenerated')}</p>
              )}
              {showValidationErrors && !upcRequested && !formData.upc?.trim() && (
                <p className="text-sm text-red-500">{t('common.requiredField')}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="opacity-0 select-none">Placeholder</Label>
              <Button 
                type="button"
                onClick={onGenerateUpc}
                disabled={upcRequested}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {upcRequested ? t('newRelease.metadataStep.generating') : t('musicVideo.metadataStep.generateUpc')}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryGenre" className="flex items-center">
                {t('musicVideo.metadataStep.primaryGenre')}
                <InfoTooltip content={t('musicVideo.tooltips.primaryGenre')} />
              </Label>
              <Select
                value={formData.primaryGenre}
                onValueChange={(value) => updateFormData({ primaryGenre: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select genre" />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre.value} value={genre.value}>
                      {genre.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="secondaryGenre" className="flex items-center">
                {t('musicVideo.metadataStep.secondaryGenre')}
                <InfoTooltip content={t('musicVideo.tooltips.secondaryGenre')} />
              </Label>
              <Select
                value={formData.secondaryGenre}
                onValueChange={(value) => updateFormData({ secondaryGenre: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select genre" />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre.value} value={genre.value}>
                      {genre.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contentLanguage" className="flex items-center">
              {t('musicVideo.metadataStep.contentLanguage')}
              <InfoTooltip content={t('musicVideo.tooltips.contentLanguage')} />
            </Label>
            <Select
              value={formData.contentLanguage}
              onValueChange={(value) => updateFormData({ contentLanguage: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="explicit"
                checked={formData.explicitContent}
                onCheckedChange={(checked) => updateFormData({ explicitContent: checked as boolean })}
              />
              <Label htmlFor="explicit" className="cursor-pointer flex items-center">
                {t('musicVideo.metadataStep.explicitContent')}
                <InfoTooltip content={t('musicVideo.tooltips.explicitContent')} />
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="aiGenerated"
                checked={formData.aiGeneratedContent}
                onCheckedChange={(checked) => updateFormData({ aiGeneratedContent: checked as boolean })}
              />
              <Label htmlFor="aiGenerated" className="cursor-pointer flex items-center">
                Контент створений ШІ 🤖
                <InfoTooltip content={t('musicVideo.tooltips.aiGeneratedContent')} />
              </Label>
            </div>
          </div>

          {/* Release Dates - highlighted section */}
          <div className="border border-primary/30 rounded-lg p-4 bg-primary/5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstReleaseDate" className="flex items-center">
                  {t('musicVideo.metadataStep.firstReleaseDate')}
                  <InfoTooltip content={t('musicVideo.tooltips.firstReleaseDate')} />
                </Label>
                <Input
                  id="firstReleaseDate"
                  type="date"
                  value={formData.firstReleaseDate || ""}
                  onChange={(e) => updateFormData({ firstReleaseDate: e.target.value })}
                  className="[&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="publicationDate" className="flex items-center">
                  {t('musicVideo.metadataStep.publicationDate')} *
                  <InfoTooltip content={t('musicVideo.tooltips.publicationDate')} />
                </Label>
                <Input
                  id="publicationDate"
                  type="date"
                  value={formData.publicationDate || ""}
                  onChange={(e) => updateFormData({ publicationDate: e.target.value })}
                  className={`[&::-webkit-calendar-picker-indicator]:filter [&::-webkit-calendar-picker-indicator]:invert ${showValidationErrors && !formData.publicationDate ? "border-red-500" : ""}`}
                />
                {showValidationErrors && !formData.publicationDate && (
                  <p className="text-sm text-red-500">{t('common.requiredField')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Preview Start and Thumbnail Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="previewStart" className="flex items-center">
                {t('musicVideo.metadataStep.previewStart')}
                <InfoTooltip content={t('musicVideo.tooltips.previewStart')} />
              </Label>
              <Input
                id="previewStart"
                placeholder="00:00:50"
                value={formData.previewStart || ""}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^\d:]/g, '');
                  if (value.length === 2 && !value.includes(':')) value += ':';
                  if (value.length === 5 && value.split(':').length === 2) value += ':';
                  if (value.length <= 8) {
                    updateFormData({ previewStart: value });
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thumbnailTime" className="flex items-center">
                {t('musicVideo.metadataStep.thumbnailTime')}
                <InfoTooltip content={t('musicVideo.tooltips.thumbnailTime')} />
              </Label>
              <Input
                id="thumbnailTime"
                placeholder="00:00:50"
                value={formData.thumbnailTime || ""}
                onChange={(e) => {
                  let value = e.target.value.replace(/[^\d:]/g, '');
                  if (value.length === 2 && !value.includes(':')) value += ':';
                  if (value.length === 5 && value.split(':').length === 2) value += ':';
                  if (value.length <= 8) {
                    updateFormData({ thumbnailTime: value });
                  }
                }}
              />
            </div>
          </div>
        </TabsContent>

        {/* Contributors Tab */}
        <TabsContent value="artist" className="space-y-6 mt-6">
          {/* Performers Section */}
          <div className="space-y-4">
            <h4 className="text-lg font-medium">{t('newRelease.metadataStep.performers')}</h4>
            
            {(formData.performers || []).map((performer, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg relative">
                {index > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemovePerformer(index)}
                    className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                
                <div className="space-y-2">
                  <Label htmlFor={`performer-name-${index}`}>
                    {performer.role === 'main_performer' 
                      ? t('newRelease.tracksStep.pseudonym')
                      : t('newRelease.metadataStep.performerName')
                    } *
                  </Label>
                  <Input
                    id={`performer-name-${index}`}
                    value={performer.name}
                    onChange={(e) => onUpdatePerformer(index, 'name', e.target.value)}
                    placeholder={performer.role === 'main_performer' 
                      ? t('newRelease.tracksStep.pseudonym')
                      : t('newRelease.metadataStep.performerName')
                    }
                    className={`h-12 ${showValidationErrors && !performer.name?.trim() ? "border-red-500" : ""}`}
                  />
                  {showValidationErrors && !performer.name?.trim() && (
                    <p className="text-sm text-red-500">{t('common.requiredField')}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`performer-role-${index}`}>{t('newRelease.metadataStep.role')}</Label>
                  {index === 0 ? (
                    // Show role as fixed text for first performer (main performer)
                    <div className="h-12 px-3 py-2 bg-muted/30 rounded-md border flex items-center">
                      <span className="text-sm">{ROLE_LABELS.main_performer}</span>
                    </div>
                  ) : (
                    // Show dropdown for additional performers
                    <Select
                      value={performer.role}
                      onValueChange={(value) => onUpdatePerformer(index, 'role', value)}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder={t('newRelease.metadataStep.selectRole')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main_performer">{ROLE_LABELS.main_performer}</SelectItem>
                        <SelectItem value="featuring">{ROLE_LABELS.featuring}</SelectItem>
                        <SelectItem value="remixer">{ROLE_LABELS.remixer}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              onClick={onAddPerformer}
              disabled={(formData.performers || []).length >= 5}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('newRelease.metadataStep.addPerformer')}
            </Button>
          </div>

          {/* Contributors Section */}
          <div className="space-y-4 pt-6 border-t">
            <h4 className="text-lg font-medium">{t('newRelease.tracksStep.contributors')}</h4>
            
            {/* Conditional visibility checkboxes */}
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="hasNoMusic"
                  checked={formData.hasNoMusic || false}
                  onCheckedChange={(checked) => {
                    updateFormData({ hasNoMusic: checked as boolean });
                  }}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="hasNoMusic"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {t('newRelease.tracksStep.hasNoMusic')}
                  </label>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="hasNoLyrics"
                  checked={formData.hasNoLyrics || false}
                  onCheckedChange={(checked) => {
                    updateFormData({ hasNoLyrics: checked as boolean });
                  }}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="hasNoLyrics"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {t('newRelease.tracksStep.hasNoLyrics')}
                  </label>
                </div>
              </div>
            </div>
            
            {(formData.contributors || []).map((contributor, index) => {
              // Hide composer and arranger if hasNoMusic is true
              if (formData.hasNoMusic && (contributor.role === 'composer' || contributor.role === 'arranger')) {
                return null;
              }
              
              // Hide lyricist if hasNoLyrics is true
              if (formData.hasNoLyrics && contributor.role === 'lyricist') {
                return null;
              }
              
              // Only allow deletion of optional roles and duplicate required roles
              // The first occurrence of each required role (initial 7) cannot be deleted
              const isRequiredRole = REQUIRED_ROLES.includes(contributor.role);
              const contributorsWithSameRole = (formData.contributors || []).filter(c => c.role === contributor.role);
              const isFirstOfRequiredRole = isRequiredRole && contributorsWithSameRole.findIndex(c => c === contributor) === 0;
              const canDelete = !isFirstOfRequiredRole;
              
              return (
              <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg relative">
                {canDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const newContributors = [...(formData.contributors || [])];
                      newContributors.splice(index, 1);
                      updateFormData({ contributors: newContributors });
                    }}
                    className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                
                <div className="space-y-1">
                  <Label htmlFor={`contributor-name-${index}`}>
                    {t('newRelease.tracksStep.contributorName')} {REQUIRED_ROLES.includes(contributor.role) && "*"}
                  </Label>
                  <Input
                    id={`contributor-name-${index}`}
                    value={contributor.name}
                    onChange={(e) => {
                      const newContributors = [...(formData.contributors || [])];
                      newContributors[index] = { ...newContributors[index], name: e.target.value };
                      updateFormData({ contributors: newContributors });
                    }}
                    className={`h-12 ${showValidationErrors && REQUIRED_ROLES.includes(contributor.role) && !contributor.name?.trim() ? "border-red-500" : ""}`}
                  />
                  {showValidationErrors && REQUIRED_ROLES.includes(contributor.role) && !contributor.name?.trim() && (
                    <p className="text-sm text-red-500">{t('common.requiredField')}</p>
                  )}
                </div>
                
                <div>
                  <Label htmlFor={`contributor-role-${index}`}>{t('newRelease.metadataStep.role')}</Label>
                  {isFirstOfRequiredRole ? (
                    // Show role as fixed text for required roles
                    <div className="h-12 px-3 py-2 bg-muted/30 rounded-md border flex items-center">
                      <span className="text-sm">{ROLE_LABELS[contributor.role as keyof typeof ROLE_LABELS]}</span>
                    </div>
                  ) : (
                    // Show dropdown for user-added roles
                    <Select
                      value={contributor.role}
                      onValueChange={(value) => {
                        const newContributors = [...(formData.contributors || [])];
                        newContributors[index] = { ...newContributors[index], role: value };
                        updateFormData({ contributors: newContributors });
                      }}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder={ROLE_LABELS.main_performer} />
                      </SelectTrigger>
                      <SelectContent>
                      <SelectItem value="main_performer">{ROLE_LABELS.main_performer}</SelectItem>
                      <SelectItem value="composer">{ROLE_LABELS.composer}</SelectItem>
                      <SelectItem value="lyricist">{ROLE_LABELS.lyricist}</SelectItem>
                      <SelectItem value="arranger">{ROLE_LABELS.arranger}</SelectItem>
                      <SelectItem value="mixing_engineer">{ROLE_LABELS.mixing_engineer}</SelectItem>
                      <SelectItem value="mastering_engineer">{ROLE_LABELS.mastering_engineer}</SelectItem>
                      <SelectItem value="cover_designer">{ROLE_LABELS.cover_designer}</SelectItem>
                      <SelectItem value="producer">{ROLE_LABELS.producer}</SelectItem>
                      <SelectItem value="background_vocal">{ROLE_LABELS.background_vocal}</SelectItem>
                      <SelectItem value="musician">{ROLE_LABELS.musician}</SelectItem>
                      <SelectItem value="additional_engineer">{ROLE_LABELS.additional_engineer}</SelectItem>
                      <SelectItem value="additional_producer">{ROLE_LABELS.additional_producer}</SelectItem>
                      <SelectItem value="art_production">{ROLE_LABELS.art_production}</SelectItem>
                      <SelectItem value="assistant_editing_engineer">{ROLE_LABELS.assistant_editing_engineer}</SelectItem>
                      <SelectItem value="assistant_engineer">{ROLE_LABELS.assistant_engineer}</SelectItem>
                      <SelectItem value="assistant_recording_engineer">{ROLE_LABELS.assistant_recording_engineer}</SelectItem>
                      <SelectItem value="assistant_strings_engineer">{ROLE_LABELS.assistant_strings_engineer}</SelectItem>
                      <SelectItem value="associate_producer">{ROLE_LABELS.associate_producer}</SelectItem>
                      <SelectItem value="audio_processing">{ROLE_LABELS.audio_processing}</SelectItem>
                      <SelectItem value="audio_restoration">{ROLE_LABELS.audio_restoration}</SelectItem>
                      <SelectItem value="audio_technician">{ROLE_LABELS.audio_technician}</SelectItem>
                      <SelectItem value="balance_engineer">{ROLE_LABELS.balance_engineer}</SelectItem>
                      <SelectItem value="bass_technician">{ROLE_LABELS.bass_technician}</SelectItem>
                      <SelectItem value="camera_operator">{ROLE_LABELS.camera_operator}</SelectItem>
                      <SelectItem value="choreography">{ROLE_LABELS.choreography}</SelectItem>
                      <SelectItem value="cinematography">{ROLE_LABELS.cinematography}</SelectItem>
                      <SelectItem value="co_producer">{ROLE_LABELS.co_producer}</SelectItem>
                      <SelectItem value="compilation_producer">{ROLE_LABELS.compilation_producer}</SelectItem>
                      <SelectItem value="computer_graphics">{ROLE_LABELS.computer_graphics}</SelectItem>
                      <SelectItem value="concert_producer">{ROLE_LABELS.concert_producer}</SelectItem>
                      <SelectItem value="costume_design">{ROLE_LABELS.costume_design}</SelectItem>
                      <SelectItem value="cover_art">{ROLE_LABELS.cover_art}</SelectItem>
                      <SelectItem value="cover_photography">{ROLE_LABELS.cover_photography}</SelectItem>
                      <SelectItem value="creative_director">{ROLE_LABELS.creative_director}</SelectItem>
                      <SelectItem value="drawing">{ROLE_LABELS.drawing}</SelectItem>
                      <SelectItem value="drum_technician">{ROLE_LABELS.drum_technician}</SelectItem>
                      <SelectItem value="editing_engineer">{ROLE_LABELS.editing_engineer}</SelectItem>
                      <SelectItem value="engineer">{ROLE_LABELS.engineer}</SelectItem>
                      <SelectItem value="engraving">{ROLE_LABELS.engraving}</SelectItem>
                      <SelectItem value="equipment_technician">{ROLE_LABELS.equipment_technician}</SelectItem>
                      <SelectItem value="film_director">{ROLE_LABELS.film_director}</SelectItem>
                      <SelectItem value="film_editor">{ROLE_LABELS.film_editor}</SelectItem>
                      <SelectItem value="film_producer">{ROLE_LABELS.film_producer}</SelectItem>
                      <SelectItem value="graphic_design">{ROLE_LABELS.graphic_design}</SelectItem>
                      <SelectItem value="guitar_technician">{ROLE_LABELS.guitar_technician}</SelectItem>
                      <SelectItem value="harpsichord_technician">{ROLE_LABELS.harpsichord_technician}</SelectItem>
                      <SelectItem value="harpsichord_tuner">{ROLE_LABELS.harpsichord_tuner}</SelectItem>
                      <SelectItem value="illustrator">{ROLE_LABELS.illustrator}</SelectItem>
                      <SelectItem value="keyboard_technician">{ROLE_LABELS.keyboard_technician}</SelectItem>
                      <SelectItem value="lighting_design">{ROLE_LABELS.lighting_design}</SelectItem>
                      <SelectItem value="lithography">{ROLE_LABELS.lithography}</SelectItem>
                      <SelectItem value="live_mixing_engineer">{ROLE_LABELS.live_mixing_engineer}</SelectItem>
                      <SelectItem value="live_production">{ROLE_LABELS.live_production}</SelectItem>
                      <SelectItem value="live_recording_engineer">{ROLE_LABELS.live_recording_engineer}</SelectItem>
                      <SelectItem value="music_supervisor">{ROLE_LABELS.music_supervisor}</SelectItem>
                      <SelectItem value="organ_technician">{ROLE_LABELS.organ_technician}</SelectItem>
                      <SelectItem value="original_engineering">{ROLE_LABELS.original_engineering}</SelectItem>
                      <SelectItem value="original_producer">{ROLE_LABELS.original_producer}</SelectItem>
                      <SelectItem value="other_pe">{ROLE_LABELS.other_pe}</SelectItem>
                      <SelectItem value="package_design">{ROLE_LABELS.package_design}</SelectItem>
                      <SelectItem value="paintings">{ROLE_LABELS.paintings}</SelectItem>
                      <SelectItem value="photo_editor">{ROLE_LABELS.photo_editor}</SelectItem>
                      <SelectItem value="photography">{ROLE_LABELS.photography}</SelectItem>
                      <SelectItem value="piano_technician">{ROLE_LABELS.piano_technician}</SelectItem>
                      <SelectItem value="piano_tuner">{ROLE_LABELS.piano_tuner}</SelectItem>
                      <SelectItem value="portraits">{ROLE_LABELS.portraits}</SelectItem>
                      <SelectItem value="post_production_assistant">{ROLE_LABELS.post_production_assistant}</SelectItem>
                      <SelectItem value="post_production_director">{ROLE_LABELS.post_production_director}</SelectItem>
                      <SelectItem value="post_production_editor">{ROLE_LABELS.post_production_editor}</SelectItem>
                      <SelectItem value="post_production_engineer">{ROLE_LABELS.post_production_engineer}</SelectItem>
                      <SelectItem value="post_production_mixing_engineer">{ROLE_LABELS.post_production_mixing_engineer}</SelectItem>
                      <SelectItem value="post_production_supervisor">{ROLE_LABELS.post_production_supervisor}</SelectItem>
                      <SelectItem value="recording_engineer">{ROLE_LABELS.recording_engineer}</SelectItem>
                      <SelectItem value="recording_supervisor">{ROLE_LABELS.recording_supervisor}</SelectItem>
                      <SelectItem value="recording_technician">{ROLE_LABELS.recording_technician}</SelectItem>
                      <SelectItem value="reissue_producer">{ROLE_LABELS.reissue_producer}</SelectItem>
                      <SelectItem value="remix_producer">{ROLE_LABELS.remix_producer}</SelectItem>
                      <SelectItem value="research">{ROLE_LABELS.research}</SelectItem>
                      <SelectItem value="score_producer">{ROLE_LABELS.score_producer}</SelectItem>
                      <SelectItem value="set_designer">{ROLE_LABELS.set_designer}</SelectItem>
                      <SelectItem value="sound_design">{ROLE_LABELS.sound_design}</SelectItem>
                      <SelectItem value="soundtrack_producer">{ROLE_LABELS.soundtrack_producer}</SelectItem>
                      <SelectItem value="spatial_audio_engineer">{ROLE_LABELS.spatial_audio_engineer}</SelectItem>
                      <SelectItem value="spatial_mastering_engineer">{ROLE_LABELS.spatial_mastering_engineer}</SelectItem>
                      <SelectItem value="spatial_mixing_engineer">{ROLE_LABELS.spatial_mixing_engineer}</SelectItem>
                      <SelectItem value="special_effects">{ROLE_LABELS.special_effects}</SelectItem>
                      <SelectItem value="stage_director">{ROLE_LABELS.stage_director}</SelectItem>
                      <SelectItem value="stage_manager">{ROLE_LABELS.stage_manager}</SelectItem>
                      <SelectItem value="stage_technician">{ROLE_LABELS.stage_technician}</SelectItem>
                      <SelectItem value="strings_engineer">{ROLE_LABELS.strings_engineer}</SelectItem>
                      <SelectItem value="studio_personnel">{ROLE_LABELS.studio_personnel}</SelectItem>
                      <SelectItem value="studio_technician">{ROLE_LABELS.studio_technician}</SelectItem>
                      <SelectItem value="stylist">{ROLE_LABELS.stylist}</SelectItem>
                      <SelectItem value="tape_editor">{ROLE_LABELS.tape_editor}</SelectItem>
                      <SelectItem value="tape_operator">{ROLE_LABELS.tape_operator}</SelectItem>
                      <SelectItem value="tape_preparation">{ROLE_LABELS.tape_preparation}</SelectItem>
                      <SelectItem value="transfer_engineer">{ROLE_LABELS.transfer_engineer}</SelectItem>
                      <SelectItem value="typesetting">{ROLE_LABELS.typesetting}</SelectItem>
                      <SelectItem value="typography">{ROLE_LABELS.typography}</SelectItem>
                      <SelectItem value="video_director">{ROLE_LABELS.video_director}</SelectItem>
                      <SelectItem value="video_editor">{ROLE_LABELS.video_editor}</SelectItem>
                      <SelectItem value="video_production">{ROLE_LABELS.video_production}</SelectItem>
                      <SelectItem value="videographer">{ROLE_LABELS.videographer}</SelectItem>
                      <SelectItem value="vocalist">{ROLE_LABELS.vocalist}</SelectItem>
                      <SelectItem value="vocal_mixing_engineer">{ROLE_LABELS.vocal_mixing_engineer}</SelectItem>
                      <SelectItem value="vocal_recording_engineer">{ROLE_LABELS.vocal_recording_engineer}</SelectItem>
                      <SelectItem value="wardrobe">{ROLE_LABELS.wardrobe}</SelectItem>
                    </SelectContent>
                  </Select>
                  )}
                </div>
              </div>
            );
          })}
            
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const newContributors = [...(formData.contributors || [])];
                newContributors.push({ name: "", role: "musician" });
                updateFormData({ contributors: newContributors });
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {t('newRelease.tracksStep.addContributor')}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DistributionStep({ formData, updateFormData }: { 
  formData: Partial<VideoFormData>; 
  updateFormData: (data: Partial<VideoFormData>) => void;
}) {
  const { t } = useTranslation();
  const [territorySearchQuery, setTerritorySearchQuery] = useState("");
  const [territoriesOpen, setTerritoriesOpen] = useState(false);

  // Convert formData.territories array to Set for compatibility
  const selectedTerritories = new Set(formData.territories || []);

  const toggleTerritory = (territory: string) => {
    const newSelected = new Set(selectedTerritories);
    if (newSelected.has(territory)) {
      newSelected.delete(territory);
    } else {
      newSelected.add(territory);
    }
    updateFormData({ territories: Array.from(newSelected) });
  };

  const toggleContinentSelection = (continent: string) => {
    const continentCountries = TERRITORIES_DATA[continent as keyof typeof TERRITORIES_DATA];
    const allSelected = continentCountries.every(country => selectedTerritories.has(country));
    
    const newSelected = new Set(selectedTerritories);
    if (allSelected) {
      continentCountries.forEach(country => newSelected.delete(country));
    } else {
      continentCountries.forEach(country => newSelected.add(country));
    }
    updateFormData({ territories: Array.from(newSelected) });
  };

  const getFilteredCountries = () => {
    if (!territorySearchQuery) return TERRITORIES_DATA;
    
    const filtered: Record<string, string[]> = {};
    Object.entries(TERRITORIES_DATA).forEach(([continent, countries]) => {
      const filteredCountries = countries.filter(country =>
        country.toLowerCase().includes(territorySearchQuery.toLowerCase())
      );
      if (filteredCountries.length > 0) {
        filtered[continent] = filteredCountries;
      }
    });
    return filtered;
  };

  return (
    <div className="space-y-6">
      {/* Platforms - Read Only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t('musicVideo.distributionStep.platforms')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Spotify */}
            <div className="flex flex-row items-center gap-2 p-3 border rounded-lg">
              <img 
                src="https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png" 
                alt="Spotify"
                className="w-6 h-6 object-contain flex-shrink-0"
              />
              <span className="font-medium">{t('musicVideo.distributionStep.spotify')}</span>
            </div>
            {/* Apple Music Video */}
            <div className="flex flex-row items-center gap-2 p-3 border rounded-lg">
              <img 
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Apple_Music_icon.svg/2048px-Apple_Music_icon.svg.png" 
                alt="Apple Music"
                className="w-6 h-6 object-contain flex-shrink-0"
              />
              <span className="font-medium">{t('musicVideo.distributionStep.appleMusic')}</span>
            </div>
            {/* Tidal */}
            <div className="flex flex-row items-center gap-2 p-3 border rounded-lg">
              <img 
                src="https://images.icon-icons.com/2429/PNG/512/tidal_logo_icon_147227.png" 
                alt="Tidal"
                className="w-6 h-6 object-contain flex-shrink-0"
              />
              <span className="font-medium">{t('musicVideo.distributionStep.tidal')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Territories */}
      <Collapsible open={territoriesOpen} onOpenChange={setTerritoriesOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {t('newRelease.territoriesStep.selectTerritories')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">
                    {selectedTerritories.size} {t('newRelease.territoriesStep.selectedCount')}
                  </span>
                  <ChevronDown className={`h-5 w-5 transition-transform ${territoriesOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder={t('newRelease.territoriesStep.searchCountries')}
              value={territorySearchQuery}
              onChange={(e) => setTerritorySearchQuery(e.target.value)}
              className="pl-10 h-12"
            />
          </div>

          {/* Continents and Countries */}
          <div className="space-y-6">
            {Object.entries(getFilteredCountries()).map(([continent, countries]) => {
              const selectedCount = countries.filter(country => selectedTerritories.has(country)).length;
              const totalCount = countries.length;
              const allSelected = selectedCount === totalCount;

              return (
                <div key={continent} className="space-y-4">
                  <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-blue-600">
                        {selectedCount}/{totalCount}
                      </span>
                      <h3 className="font-semibold">{t(`newRelease.territoriesStep.continents.${continent.replace(/\s+/g, '')}`)}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleContinentSelection(continent)}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      {allSelected ? t('newRelease.territoriesStep.deselectAll') : t('newRelease.territoriesStep.selectAll')}
                      <CheckCircle className={`ml-2 h-4 w-4 ${allSelected ? "text-green-600" : ""}`} />
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {countries.map((country) => {
                      const isSelected = selectedTerritories.has(country);
                      return (
                        <button
                          key={country}
                          onClick={() => toggleTerritory(country)}
                          className={`
                            flex items-center gap-3 p-3 rounded-lg border transition-all text-left
                            ${isSelected 
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" 
                              : "border-border hover:border-border/80 hover:bg-muted/50"
                            }
                          `}
                        >
                          <div className={`
                            w-4 h-4 rounded-full flex-shrink-0
                            ${isSelected ? "bg-blue-500" : "bg-muted-foreground/30"}
                          `} />
                          <span className={`
                            text-sm font-medium truncate
                            ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-foreground"}
                          `}>
                            {country}
                          </span>
                          {isSelected && (
                            <CheckCircle className="h-4 w-4 text-blue-500 ml-auto flex-shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
