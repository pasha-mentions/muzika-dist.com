import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { Upload, Music, Image, CheckCircle, AlertCircle, ArrowLeft, ArrowRight, FileText, Plus, Trash2, Search, Globe, Clock, CalendarIcon, Copy, Info, ChevronDown, Users, Sparkles, ExternalLink, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getDistributionAgreement } from "@/../../shared/agreements";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays, parseISO, startOfDay } from "date-fns";
import { enUS, uk, pl } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useReleaseDraft } from "@/hooks/useReleaseDraft";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ROLE_LABELS } from "@/lib/roleLabels";
import WayforpayWidget from "@/components/payment/WayforpayWidget";
import { AudioPlayer } from "@/components/ui/audio-player";
import { ReleaseSummaryDialog } from "@/components/release/release-summary-dialog";

interface FileUpload {
  file: File | null;
  isValid: boolean;
  error?: string;
  uploadedUrl?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  isUploading?: boolean;
  uploadProgress?: number; // 0-100
  uploadedBytes?: number;
  totalBytes?: number;
}

function extractFileIdFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const idMatch = url.match(/[?&]id=([^&]+)/);
  if (idMatch) return idMatch[1];
  const pathMatch = url.match(/\/d\/([^/]+)/);
  if (pathMatch) return pathMatch[1];
  return undefined;
}

// Required contributor roles that cannot be deleted (first occurrence protected)
// Note: main_performer is now in performers section only, not contributors
const REQUIRED_ROLES = [
  "composer",
  "lyricist",
  "arranger",
  "mixing_engineer",
  "mastering_engineer",
  "cover_designer"
];

// Validation schema factory for release metadata
const createReleaseMetadataSchema = (t: any) => z.object({
  language: z.string().min(1, t('newRelease.validation.languageRequired')),
  title: z.string().min(1, t('newRelease.validation.titleRequired')),
  albumVersion: z.string().optional(),
  primaryGenre: z.string().min(1, t('newRelease.validation.genreRequired')),
  secondaryGenre: z.string().optional(),
  originalReleaseDate: z.string().min(1, t('newRelease.validation.dateRequired')),
  releaseDate: z.string().min(1, t('newRelease.validation.releaseDateRequired')),
  subLabel: z.string().optional(),
  upc: z.string().optional(),
  performers: z.array(z.object({
    name: z.string().min(1, t('newRelease.validation.artistNameRequired')),
    role: z.string().min(1, t('newRelease.validation.roleRequired')),
  })).max(5, t('newRelease.validation.maxArtists')).optional(),
});

// Validation schema factory for track metadata
const createTrackMetadataSchema = (t: any) => z.object({
  title: z.string().min(1, t('newRelease.validation.songTitleRequired')),
  version: z.string().optional(),
  primaryGenre: z.string().min(1, t('newRelease.validation.genreRequired')),
  secondaryGenre: z.string().optional(),
  language: z.string().min(1, t('newRelease.validation.releaseLanguageRequired')),
  explicitContent: z.enum(["yes", "no", "censored"]),
  aiGenerated: z.boolean().default(false),
  previewStartTime: z.string().optional(),
  tiktokPreviewDate: z.string().optional(), // Date for TikTok preview before release
  isrc: z.string().optional(),
  iswc: z.string().optional(),
  pLine: z.string().optional(),
  cLine: z.string().optional(),
  performers: z.array(z.object({
    name: z.string().min(1, t('newRelease.validation.artistNameRequired')),
    role: z.string().min(1, t('newRelease.validation.roleRequired')),
  })).max(5, t('newRelease.validation.maxArtists')).optional(),
  contributors: z.array(z.object({
    name: z.string().min(1, t('newRelease.validation.artistNameRequired')),
    role: z.string().min(1, t('newRelease.validation.roleRequired')),
  })).optional(),
  hasNoMusic: z.boolean().default(false),
  hasNoLyrics: z.boolean().default(false),
  lyrics: z.string().optional(),
}).superRefine((data, ctx) => {
  // ISRC обов'язковий, якщо не запитано генерацію
  // Перевірка буде в контексті компонента з isrcRequested
  
  // Lyrics обов'язкові, якщо не встановлено hasNoLyrics
  if (!data.hasNoLyrics && (!data.lyrics || data.lyrics.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t('newRelease.tracksStep.lyricsRequired'),
      path: ["lyrics"],
    });
  }
  
  // Перевірка обов'язкових performers
  const performers = data.performers || [];
  if (performers.length === 0 || !performers[0]?.name || performers[0].name.trim() === "") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t('newRelease.tracksStep.mainPerformerRequired'),
      path: ["performers"],
    });
  }
  
  // Перевірка обов'язкових contributors
  const contributors = data.contributors || [];
  const roles = contributors.map(c => c.role);
  
  // Завжди обов'язкові ролі (використовуємо snake_case як в UI, без main_performer)
  const requiredRoles = ["arranger", "mixing_engineer", "mastering_engineer", "cover_designer"];
  const requiredRoleLabels: Record<string, string> = {
    "arranger": "Arranger",
    "mixing_engineer": "Mixing Engineer",
    "mastering_engineer": "Mastering Engineer",
    "cover_designer": "Cover Designer",
    "composer": "Composer",
    "lyricist": "Lyricist"
  };
  
  // Умовно обов'язкові ролі
  if (!data.hasNoMusic && !roles.includes("composer")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t('newRelease.tracksStep.composerRequired'),
      path: ["contributors"],
    });
  }
  
  if (!data.hasNoLyrics && !roles.includes("lyricist")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: t('newRelease.tracksStep.lyricistRequired'),
      path: ["contributors"],
    });
  }
  
  // Перевірка завжди обов'язкових ролей
  for (const role of requiredRoles) {
    if (!roles.includes(role)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${ROLE_LABELS[role as keyof typeof ROLE_LABELS]} ${t('newRelease.tracksStep.contributorRequired')}`,
        path: ["contributors"],
      });
    }
  }
  
  // Перевірка що всі обов'язкові ролі мають імена
  for (const contributor of contributors) {
    if (requiredRoles.includes(contributor.role) || 
        (!data.hasNoMusic && contributor.role === "composer") ||
        (!data.hasNoLyrics && contributor.role === "lyricist")) {
      if (!contributor.name || contributor.name.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${t('newRelease.tracksStep.contributorName')} ${t('newRelease.tracksStep.contributorRequired')} ${ROLE_LABELS[contributor.role as keyof typeof ROLE_LABELS] || contributor.role}`,
          path: ["contributors"],
        });
      }
    }
  }
});

type ReleaseMetadata = z.infer<ReturnType<typeof createReleaseMetadataSchema>>;
type TrackMetadata = z.infer<ReturnType<typeof createTrackMetadataSchema>>;

// Data structure for countries and continents
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

// Плавна карусель для анімованих обкладинок (MP4 відео)
function AnimatedArtworkCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const videos = [
    "/examples/animated_art_cover_1.mp4",
    "/examples/animated_art_cover_2.mp4",
    "/examples/animated_art_cover_3.mp4"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % videos.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [videos.length]);

  return (
    <div className="relative w-full h-full">
      <AnimatePresence mode="wait">
        <motion.video
          key={currentIndex}
          src={videos[currentIndex]}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-contain"
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ 
            duration: 1.2,
            ease: "easeInOut"
          }}
        />
      </AnimatePresence>
    </div>
  );
}

export default function NewRelease() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, isPlatformAdmin } = useAuth();
  const [currentStep, setCurrentStep] = useState<"files" | "metadata" | "tracks" | "territories">("files");
  const [tracksMetadata, setTracksMetadata] = useState<TrackMetadata[]>([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isGeneratingIsrc, setIsGeneratingIsrc] = useState(false);
  const [selectedTerritories, setSelectedTerritories] = useState<Set<string>>(new Set());
  const [territorySearchQuery, setTerritorySearchQuery] = useState("");
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [coverArt, setCoverArt] = useState<FileUpload>({ file: null, isValid: false });
  const [audioFiles, setAudioFiles] = useState<FileUpload[]>([{ file: null, isValid: false }]);
  const [isGeneratingUpc, setIsGeneratingUpc] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [upcRequested, setUpcRequested] = useState(false);
  const [isrcRequested, setIsrcRequested] = useState<boolean[]>([]);
  const [trackValidationErrors, setTrackValidationErrors] = useState<Record<number, Record<string, string>>>({});
  const [activeTrackTab, setActiveTrackTab] = useState<string>("info");
  const [showTimeZonePicker, setShowTimeZonePicker] = useState(false);
  const [releaseTime, setReleaseTime] = useState("00:00");
  const [releaseTimezone, setReleaseTimezone] = useState("Europe/Kiev");
  
  // Admin: Organization selection state
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  
  // Drag & Drop states
  const [isDraggingCover, setIsDraggingCover] = useState(false);
  const [isDraggingAudio, setIsDraggingAudio] = useState<number | null>(null);
  
  // Distribution Agreement Dialog state
  const [showAgreementDialog, setShowAgreementDialog] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [isAcceptingAgreement, setIsAcceptingAgreement] = useState(false);
  
  // Payment dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [createdReleaseId, setCreatedReleaseId] = useState<string | null>(null);
  const [createdReleaseTrackCount, setCreatedReleaseTrackCount] = useState(0);
  const [createdReleaseAnimatedArtworkFee, setCreatedReleaseAnimatedArtworkFee] = useState(0);
  
  // Release summary dialog state
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const [isCreatingRelease, setIsCreatingRelease] = useState(false);
  
  // Debut release and pitching states
  const [isDebut, setIsDebut] = useState<boolean | null>(null);
  const [willPitch, setWillPitch] = useState<boolean | null>(null);
  
  // Artist profile URLs (for non-debut releases)
  const [spotifyArtistUrl, setSpotifyArtistUrl] = useState<string>("");
  const [appleMusicArtistUrl, setAppleMusicArtistUrl] = useState<string>("");
  
  // Get current organization's artist profile URLs (for sync with settings)
  const currentOrganization = isPlatformAdmin 
    ? organizations.find(org => org.id === selectedOrgId)
    : user?.organizations?.[0];
  const orgHasSpotifyUrl = !!currentOrganization?.spotifyUrl;
  const orgHasAppleMusicUrl = !!currentOrganization?.appleMusicUrl;
  
  // Animated artwork state - two files: 3x4 (Album Page Motion) and 1x1 (Square)
  const [wantsAnimatedArtwork, setWantsAnimatedArtwork] = useState<boolean | null>(null);
  const [animatedArtwork3x4, setAnimatedArtwork3x4] = useState<FileUpload>({ file: null, isValid: false });
  const [animatedArtwork1x1, setAnimatedArtwork1x1] = useState<FileUpload>({ file: null, isValid: false });
  const [isDraggingAnimated3x4, setIsDraggingAnimated3x4] = useState(false);
  const [isDraggingAnimated1x1, setIsDraggingAnimated1x1] = useState(false);
  // Legacy state for backwards compatibility
  const [animatedArtwork, setAnimatedArtwork] = useState<FileUpload>({ file: null, isValid: false });
  const [isDraggingAnimated, setIsDraggingAnimated] = useState(false);

  // Check if agreement is accepted and control dialog visibility
  useEffect(() => {
    if (user && !user.agreementAccepted) {
      setShowAgreementDialog(true);
    } else if (user && user.agreementAccepted) {
      setShowAgreementDialog(false);
    }
  }, [user]);

  // Load organizations for Admin users
  useEffect(() => {
    const loadOrganizations = async () => {
      if (isPlatformAdmin) {
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
            variant: "destructive",
          });
        } finally {
          setIsLoadingOrgs(false);
        }
      }
    };

    loadOrganizations();
  }, [user, toast]);

  // Read draft ID and admin mode from URL query parameters (must be before useReleaseDraft)
  const searchString = useSearch();
  const { urlDraftId, isAdminMode, targetUserId, targetOrgId } = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return {
      urlDraftId: params.get('draft'),
      isAdminMode: params.get('asAdmin') === '1',
      targetUserId: params.get('targetUserId'),
      targetOrgId: params.get('targetOrgId'),
    };
  }, [searchString]);

  // Draft system - pass targetOrgId for admin access to other organization's drafts
  const { drafts, currentDraftId, currentDraftOrgId, saveDraft, loadDraft, deleteDraft, clearCurrentDraft, startNewDraft, autoSaveInFlightRef } = useReleaseDraft("RELEASE", isAdminMode && isPlatformAdmin ? targetOrgId : null);

  // Fetch target user info when in admin mode
  const { data: targetUserInfo } = useQuery<{ id: string; email: string; firstName?: string; lastName?: string }>({
    queryKey: ['/api/admin/users', targetUserId],
    queryFn: async () => {
      const res = await fetch('/api/admin/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch users');
      const users = await res.json();
      return users.find((u: any) => u.id === targetUserId);
    },
    enabled: isAdminMode && !!targetUserId && isPlatformAdmin,
  });

  // Get the organization ID to check for existing releases
  const orgIdForCheck = useMemo(() => {
    if (isPlatformAdmin && selectedOrgId) return selectedOrgId;
    if (user?.organizations?.[0]?.id) return user.organizations[0].id;
    return null;
  }, [isPlatformAdmin, selectedOrgId, user?.organizations]);

  // Check if organization has existing releases (for debut release detection)
  const { data: hasReleasesData } = useQuery<{ hasReleases: boolean }>({
    queryKey: [`/api/organizations/${orgIdForCheck}/has-releases`],
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${orgIdForCheck}/has-releases`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to check releases');
      return res.json();
    },
    enabled: !!orgIdForCheck,
  });

  const organizationHasReleases = hasReleasesData?.hasReleases ?? true; // Default to true (hide debut question if unknown)
  
  // Load draft from URL on mount or when URL draft ID changes
  const lastLoadedUrlDraftIdRef = useRef<string | null>(null);
  // Flag to show toast only for explicit user-initiated loads (URL navigation, draft picker)
  const showToastOnLoadRef = useRef(false);
  
  useEffect(() => {
    // Load if urlDraftId exists and is different from what we already loaded via URL
    if (urlDraftId && lastLoadedUrlDraftIdRef.current !== urlDraftId) {
      console.log('[URL DRAFT] Loading draft from URL:', urlDraftId);
      showToastOnLoadRef.current = true; // Show toast for URL-based loads
      // Clear auto-save flag since this is an explicit user load
      autoSaveInFlightRef.current = false;
      // Reset lastLoadedDraftIdRef to allow re-processing even if it was auto-saved before
      // This is needed because after auto-save skip, lastLoadedDraftIdRef points to the draft
      lastLoadedDraftIdRef.current = null;
      hasLoadedDraftRef.current = false;
      loadDraft(urlDraftId);
      lastLoadedUrlDraftIdRef.current = urlDraftId;
    }
  }, [urlDraftId, loadDraft]); // Note: refs don't need to be in deps

  const form = useForm<ReleaseMetadata>({
    resolver: zodResolver(createReleaseMetadataSchema(t)),
    defaultValues: {
      language: "",
      title: "",
      albumVersion: "",
      primaryGenre: "",
      secondaryGenre: "",
      originalReleaseDate: "",
      releaseDate: "",
      subLabel: "",
      upc: "",
      performers: [{ name: "", role: "" }],
    },
  });

  // Auto-save draft - use ref to avoid dependency issues
  const autoSaveDraftRef = useRef<() => void>();
  
  // Flag to prevent auto-save after successful submission
  // This prevents the draft from being re-saved when the page navigates away
  const isSubmittedSuccessfullyRef = useRef(false);
  
  autoSaveDraftRef.current = () => {
    // Skip auto-save if release was successfully submitted
    if (isSubmittedSuccessfullyRef.current) {
      return;
    }
    
    const releaseMetadata = form.getValues();
    
    // Only save if there's some meaningful data
    const hasData = releaseMetadata.title || 
                   releaseMetadata.primaryGenre || 
                   coverArt.uploadedUrl || 
                   audioFiles.some(f => f.uploadedUrl) ||
                   tracksMetadata.length > 0;
    
    if (hasData) {
      // Sanitize selectedOrgId before saving to prevent cross-user conflicts
      // Only save orgId if it belongs to the current user (for non-admins)
      let sanitizedOrgId = selectedOrgId;
      if (!isPlatformAdmin && sanitizedOrgId && user?.organizations) {
        const userOrgIds = user.organizations.map(org => org.id);
        if (!userOrgIds.includes(sanitizedOrgId)) {
          // Don't save stale orgId from another user
          sanitizedOrgId = "";
        }
      }
      
      saveDraft({
        currentStep,
        releaseMetadata,
        tracksMetadata,
        currentTrackIndex,
        coverArt: {
          uploadedUrl: coverArt.uploadedUrl,
          fileId: coverArt.fileId,
          fileName: coverArt.file?.name || (coverArt as any).fileName,
        },
        animatedArtwork: wantsAnimatedArtwork !== null ? {
          wantsAnimatedArtwork: wantsAnimatedArtwork || false,
          // 3x4 format
          artwork3x4: animatedArtwork3x4.uploadedUrl ? {
            uploadedUrl: animatedArtwork3x4.uploadedUrl,
            fileId: animatedArtwork3x4.fileId,
            fileName: animatedArtwork3x4.fileName,
            fileSize: animatedArtwork3x4.fileSize || animatedArtwork3x4.file?.size,
          } : undefined,
          // 1x1 format
          artwork1x1: animatedArtwork1x1.uploadedUrl ? {
            uploadedUrl: animatedArtwork1x1.uploadedUrl,
            fileId: animatedArtwork1x1.fileId,
            fileName: animatedArtwork1x1.fileName,
            fileSize: animatedArtwork1x1.fileSize || animatedArtwork1x1.file?.size,
          } : undefined,
        } : undefined,
        audioFiles: audioFiles.map(f => ({
          uploadedUrl: f.uploadedUrl,
          fileId: f.fileId,
          fileName: f.file?.name || f.fileName,
        })),
        selectedTerritories: Array.from(selectedTerritories),
        upcRequested,
        isrcRequested,
        releaseTime,
        releaseTimezone,
        selectedOrgId: sanitizedOrgId,
      });
    }
  };

  // Watch form changes to trigger auto-save when form fields change
  const formValues = form.watch();
  
  // Auto-save on state changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      autoSaveDraftRef.current?.();
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [currentStep, tracksMetadata, currentTrackIndex, coverArt, audioFiles, selectedTerritories, upcRequested, isrcRequested, releaseTime, releaseTimezone, selectedOrgId, formValues, wantsAnimatedArtwork, animatedArtwork3x4, animatedArtwork1x1]);

  // Mobile-friendly auto-save: handle browser events
  useEffect(() => {
    // Save draft when user leaves page, switches tabs, or minimizes browser
    // These events work reliably on mobile devices
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Page is hidden (user switched tabs or minimized browser)
        autoSaveDraftRef.current?.();
      }
    };

    const handlePageHide = () => {
      // Page is being unloaded (more reliable than beforeunload on mobile)
      autoSaveDraftRef.current?.();
    };

    const handleBeforeUnload = () => {
      // Desktop fallback
      autoSaveDraftRef.current?.();
    };

    const handleBlur = () => {
      // Window lost focus (user clicked outside browser)
      autoSaveDraftRef.current?.();
    };

    // Add all event listeners for maximum compatibility
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleBlur);

    return () => {
      // Cleanup
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Load draft on mount or when drafts/currentDraftId change
  // Use lastLoadedDraftIdRef to prevent re-loading the same draft on refetch
  const hasLoadedDraftRef = useRef(false);
  const lastLoadedDraftIdRef = useRef<string | null>(null);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  
  useEffect(() => {
    // Only process if:
    // 1. currentDraftId exists and drafts are available
    // 2. We haven't loaded ANY draft yet OR we're loading a DIFFERENT draft
    const shouldProcess = currentDraftId && 
                       drafts.length > 0 && 
                       (!hasLoadedDraftRef.current || lastLoadedDraftIdRef.current !== currentDraftId);
    
    if (shouldProcess) {
      const draft = drafts.find(d => d.id === currentDraftId);
      if (draft) {
        // Check if this is an auto-save that just created a new draft
        if (autoSaveInFlightRef.current) {
          // Auto-save created a new draft - skip restore to prevent overwriting current form state
          console.log('[DRAFT] Auto-save created draft, skipping restore:', draft.id);
          autoSaveInFlightRef.current = false; // Clear flag for future loads
          showToastOnLoadRef.current = false;
          // Update refs to prevent re-processing this draft on refetch
          hasLoadedDraftRef.current = true;
          lastLoadedDraftIdRef.current = currentDraftId;
          return;
        }
        
        // Check if we should show toast (only for explicit user-initiated loads)
        const shouldShowToast = showToastOnLoadRef.current;
        
        // Restore draft data
        console.log('[DRAFT RESTORE] Found draft:', draft.id);
        console.log('[DRAFT RESTORE] coverArt:', draft.coverArt);
        console.log('[DRAFT RESTORE] audioFiles:', draft.audioFiles);
        console.log('[DRAFT RESTORE] payload:', draft.payload);
        
        // Get file data from draft (may be in payload for server drafts)
        const draftCoverArt = draft.coverArt || draft.payload?.coverArt;
        const draftAudioFiles = draft.audioFiles || draft.payload?.audioFiles;
        
        console.log('[DRAFT RESTORE] Resolved coverArt:', draftCoverArt);
        console.log('[DRAFT RESTORE] Resolved audioFiles:', draftAudioFiles);
        
        // Restore form data
        const releaseMetadata = draft.releaseMetadata || draft.payload?.releaseMetadata;
        if (releaseMetadata) {
          Object.keys(releaseMetadata).forEach((key) => {
            form.setValue(key as any, releaseMetadata[key]);
          });
        }
        
        // Restore state - convert number/string to step name
        const stepNames: ("files" | "metadata" | "tracks" | "territories")[] = ["files", "metadata", "tracks", "territories"];
        const rawStep = draft.currentStep ?? draft.payload?.currentStep;
        let stepIndex = 0;
        if (typeof rawStep === 'number') {
          stepIndex = rawStep;
        } else if (typeof rawStep === 'string') {
          const idx = stepNames.indexOf(rawStep as any);
          stepIndex = idx >= 0 ? idx : 0;
        }
        setCurrentStep(stepNames[stepIndex] || "files");
        
        // Migrate old drafts: ensure all tracks have all 7 required contributors in correct order
        const tracksMetadataData = draft.tracksMetadata || draft.payload?.tracksMetadata || [];
        const migratedTracks = tracksMetadataData.map((track: any) => {
          const existingContributors = track.contributors || [];
          
          // Track which contributors we've already used (by index)
          const usedIndices = new Set<number>();
          
          // Create required contributors in REQUIRED_ROLES order, using first occurrence of each role
          const requiredContributors = REQUIRED_ROLES.map(role => {
            const index = existingContributors.findIndex((c: any) => c.role === role);
            if (index >= 0) {
              usedIndices.add(index);
              return existingContributors[index];
            }
            return { name: "", role };
          });
          
          // Add all remaining contributors (duplicates of required roles + optional roles)
          const additionalContributors = existingContributors.filter(
            (_: any, index: number) => !usedIndices.has(index)
          );
          
          return {
            ...track,
            contributors: [...requiredContributors, ...additionalContributors]
          };
        });
        
        setTracksMetadata(migratedTracks);
        setCurrentTrackIndex(draft.currentTrackIndex ?? draft.payload?.currentTrackIndex ?? 0);
        
        // Restore files - check both direct props and payload
        if (draftCoverArt?.uploadedUrl) {
          console.log('[DRAFT RESTORE] Setting coverArt with URL:', draftCoverArt.uploadedUrl);
          setCoverArt({
            file: null,
            isValid: true,
            uploadedUrl: draftCoverArt.uploadedUrl,
            fileId: draftCoverArt.fileId,
          });
        }
        
        // Restore animated artwork
        const draftAnimatedArtwork = draft.animatedArtwork || draft.payload?.animatedArtwork;
        if (draftAnimatedArtwork) {
          console.log('[DRAFT RESTORE] Setting animatedArtwork:', draftAnimatedArtwork);
          // Explicitly set wantsAnimatedArtwork to boolean or null
          const wantsValue = draftAnimatedArtwork.wantsAnimatedArtwork;
          setWantsAnimatedArtwork(wantsValue === true ? true : wantsValue === false ? false : null);
          // Restore 3x4 format
          if (draftAnimatedArtwork.artwork3x4?.uploadedUrl) {
            setAnimatedArtwork3x4({
              file: null,
              isValid: true,
              uploadedUrl: draftAnimatedArtwork.artwork3x4.uploadedUrl,
              fileId: draftAnimatedArtwork.artwork3x4.fileId,
              fileName: draftAnimatedArtwork.artwork3x4.fileName,
              fileSize: draftAnimatedArtwork.artwork3x4.fileSize,
            });
          }
          // Restore 1x1 format
          if (draftAnimatedArtwork.artwork1x1?.uploadedUrl) {
            setAnimatedArtwork1x1({
              file: null,
              isValid: true,
              uploadedUrl: draftAnimatedArtwork.artwork1x1.uploadedUrl,
              fileId: draftAnimatedArtwork.artwork1x1.fileId,
              fileName: draftAnimatedArtwork.artwork1x1.fileName,
              fileSize: draftAnimatedArtwork.artwork1x1.fileSize,
            });
          }
          // Legacy support: if old format with uploadedUrl directly
          if (draftAnimatedArtwork.uploadedUrl && !draftAnimatedArtwork.artwork3x4) {
            setAnimatedArtwork({
              file: null,
              isValid: true,
              uploadedUrl: draftAnimatedArtwork.uploadedUrl,
              fileId: draftAnimatedArtwork.fileId,
              fileName: draftAnimatedArtwork.fileName,
              fileSize: draftAnimatedArtwork.fileSize,
            });
          }
        } else {
          // Reset animated artwork state if not in draft
          setWantsAnimatedArtwork(null);
          setAnimatedArtwork3x4({ file: null, isValid: false });
          setAnimatedArtwork1x1({ file: null, isValid: false });
          setAnimatedArtwork({ file: null, isValid: false });
        }
        
        if (draftAudioFiles && draftAudioFiles.length > 0) {
          console.log('[DRAFT RESTORE] Setting audioFiles:', draftAudioFiles);
          setAudioFiles(draftAudioFiles.map((f: any) => ({
            file: null,
            isValid: !!(f.uploadedUrl || f.fileId),
            uploadedUrl: f.uploadedUrl,
            fileId: f.fileId,
            fileName: f.fileName,
          })));
        }
        
        // Restore territories
        const territories = draft.selectedTerritories || draft.payload?.selectedTerritories || [];
        setSelectedTerritories(new Set(territories));
        
        // Restore other state
        setUpcRequested(draft.upcRequested ?? draft.payload?.upcRequested ?? false);
        setIsrcRequested(draft.isrcRequested || draft.payload?.isrcRequested || []);
        setReleaseTime(draft.releaseTime || draft.payload?.releaseTime || "00:00");
        setReleaseTimezone(draft.releaseTimezone || draft.payload?.releaseTimezone || "Europe/Kiev");
        // Note: selectedOrgId is restored in a separate effect to handle async auth loading

        // Show toast only for explicit user-initiated loads (URL navigation, draft picker)
        if (shouldShowToast) {
          toast({
            title: t('newRelease.drafts.loaded', 'Чорновик завантажено'),
            description: `${draft.completionPercentage}% ${t('newRelease.drafts.completed', 'заповнено')}`,
          });
        }
        
        hasLoadedDraftRef.current = true;
        lastLoadedDraftIdRef.current = currentDraftId;
        showToastOnLoadRef.current = false; // Reset for next time
        setIsDraftLoaded(true); // Signal to the org restoration effect
      }
    }
  }, [currentDraftId, drafts, form, toast, t]); // drafts included but lastLoadedDraftIdRef prevents re-trigger on refetch

  // Separate effect to restore selectedOrgId after auth data is available
  // This handles the case where user/isPlatformAdmin load asynchronously
  const hasRestoredOrgIdRef = useRef(false);
  
  useEffect(() => {
    // Only proceed if draft is loaded and we haven't restored org ID yet
    if (!isDraftLoaded || hasRestoredOrgIdRef.current) {
      return;
    }
    
    // Wait for user data to be available
    if (!user && !isPlatformAdmin) {
      return; // Auth data not ready yet, effect will re-run when it changes
    }
    
    // Find the current draft to get selectedOrgId
    const draft = drafts.find(d => d.id === currentDraftId);
    if (!draft?.selectedOrgId) {
      hasRestoredOrgIdRef.current = true;
      return;
    }
    
    // Only restore selectedOrgId if it belongs to the current user's organizations
    // This prevents cross-user draft conflicts when different users share the same browser
    // Platform admins can access all organizations, so allow any selectedOrgId for them
    if (isPlatformAdmin) {
      // Platform admins can access all organizations
      setSelectedOrgId(draft.selectedOrgId);
    } else if (user?.organizations) {
      const userOrgIds = user.organizations.map(org => org.id);
      if (userOrgIds.includes(draft.selectedOrgId)) {
        setSelectedOrgId(draft.selectedOrgId);
      } else {
        // selectedOrgId doesn't belong to current user - skip it
        // The system will automatically use user.organizations[0].id as fallback
        console.log('⚠️ Draft selectedOrgId does not belong to current user, ignoring');
      }
    }
    
    hasRestoredOrgIdRef.current = true;
  }, [isDraftLoaded, currentDraftId, drafts, user, isPlatformAdmin]);

  // Валідація обкладинки
  const validateCoverArt = (file: File): { isValid: boolean; error?: string } => {
    // Перевірка типу файлу
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'Allowed formats: JPG, JPEG, PNG' };
    }

    // Перевірка розміру файлу (макс 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return { isValid: false, error: 'File size must not exceed 10MB.' };
    }

    return { isValid: true };
  };

  // Валідація аудіо файлу
  const validateAudioFile = (file: File): { isValid: boolean; error?: string } => {
    // Перевірка типу файлу - WAV або FLAC
    const isWav = file.type === 'audio/wav' || file.name.toLowerCase().endsWith('.wav');
    const isFlac = file.type === 'audio/flac' || file.name.toLowerCase().endsWith('.flac');
    
    if (!isWav && !isFlac) {
      return { isValid: false, error: 'Allowed formats: WAV or FLAC' };
    }

    // Перевірка розміру файлу (макс 500MB)
    if (file.size > 500 * 1024 * 1024) {
      return { isValid: false, error: 'The file size must not exceed 500MB' };
    }

    return { isValid: true };
  };

  // Перевірка розмірів зображення
  const checkImageDimensions = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      img.onload = () => {
        const isValid = img.width === 3000 && img.height === 3000;
        URL.revokeObjectURL(img.src);
        resolve(isValid);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(false);
      };
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle distribution agreement acceptance
  const handleAcceptAgreement = async () => {
    if (!agreementChecked) {
      toast({
        title: t('newRelease.agreement.notAccepted'),
        description: t('newRelease.agreement.checkboxText'),
        variant: "destructive",
      });
      return;
    }

    setIsAcceptingAgreement(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          agreementAccepted: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to accept agreement');
      }

      toast({
        title: t('newRelease.agreement.accepted'),
        description: t('newRelease.agreement.thanks'),
      });

      // Refresh to get updated user data - dialog will auto-close after reload
      window.location.reload();
    } catch (error) {
      toast({
        title: t('newRelease.agreement.error'),
        description: t('newRelease.agreement.errorDesc'),
        variant: "destructive",
      });
    } finally {
      setIsAcceptingAgreement(false);
    }
  };

  const handleCoverArtChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setCoverArt({ file: null, isValid: false });
      return;
    }

    const validation = validateCoverArt(file);
    if (!validation.isValid) {
      setCoverArt({ file: null, isValid: false, error: validation.error });
      toast({
        title: t('newRelease.filesStep.downloadError'),
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    // Перевірка розмірів
    const isDimensionsValid = await checkImageDimensions(file);
    if (!isDimensionsValid) {
      setCoverArt({ file: null, isValid: false, error: "Dimensions must be 3000x3000 pixels" });
      toast({
        title: t('newRelease.filesStep.invalidDimensions'),
        description: t('newRelease.filesStep.dimensionsRequired'),
        variant: "destructive",
      });
      return;
    }

    // Файл валідний, починаємо завантаження (isValid стає true тільки після успішного завантаження)
    setCoverArt({ 
      file, 
      isValid: false, 
      isUploading: true, 
      uploadedUrl: undefined, 
      error: undefined,
      uploadProgress: 0,
      uploadedBytes: 0,
      totalBytes: file.size
    });

    try {
      const { downloadUrl, fileId } = await uploadFileToServer(
        file, 
        'artwork',
        (progress, uploadedBytes, totalBytes) => {
          setCoverArt(prev => ({ 
            ...prev, 
            uploadProgress: progress,
            uploadedBytes,
            totalBytes
          }));
        }
      );
      setCoverArt({ file, isValid: true, uploadedUrl: downloadUrl, fileId, isUploading: false, error: undefined });
      toast({
        title: t('newRelease.filesStep.coverLoaded'),
        description: t('newRelease.filesStep.uploadSuccess'),
      });
    } catch (error) {
      setCoverArt({ 
        file: null, 
        isValid: false, 
        error: error instanceof Error ? error.message : t('newRelease.filesStep.errorUploadingFile'), 
        isUploading: false, 
        uploadedUrl: undefined 
      });
      toast({
        title: t('newRelease.filesStep.downloadError'),
        description: error instanceof Error ? error.message : t('newRelease.filesStep.uploadError'),
        variant: "destructive",
      });
    }
  };

  // Handle animated artwork upload - generic function for both formats
  const handleAnimatedArtworkUpload = async (
    file: File, 
    format: '3x4' | '1x1',
    setState: React.Dispatch<React.SetStateAction<FileUpload>>
  ) => {
    if (!file) {
      setState({ file: null, isValid: false });
      return;
    }

    // Validate file type and size - only MP4/MOV for video
    const allowedTypes = ['video/quicktime', 'video/mp4'];
    const maxSize = 250 * 1024 * 1024; // 250 MB

    if (!allowedTypes.includes(file.type)) {
      setState({ file: null, isValid: false, error: t('newRelease.filesStep.invalidFormat') + ': MP4, MOV' });
      toast({
        title: t('newRelease.filesStep.downloadError'),
        description: t('newRelease.filesStep.invalidFormat') + ': MP4, MOV',
        variant: "destructive",
      });
      return;
    }

    if (file.size > maxSize) {
      setState({ file: null, isValid: false, error: t('newRelease.filesStep.fileTooLarge') + ' 250 MB' });
      toast({
        title: t('newRelease.filesStep.downloadError'),
        description: t('newRelease.filesStep.fileTooLarge') + ' 250 MB',
        variant: "destructive",
      });
      return;
    }

    // Start upload
    setState({ 
      file, 
      isValid: false, 
      isUploading: true, 
      uploadedUrl: undefined, 
      error: undefined,
      uploadProgress: 0,
      uploadedBytes: 0,
      totalBytes: file.size,
      fileName: file.name
    });

    try {
      const { downloadUrl, fileId } = await uploadFileToServer(
        file, 
        'animated-artwork',
        (progress, uploadedBytes, totalBytes) => {
          setState(prev => ({ 
            ...prev, 
            uploadProgress: progress,
            uploadedBytes,
            totalBytes
          }));
        }
      );
      setState({ 
        file, 
        isValid: true, 
        uploadedUrl: downloadUrl, 
        fileId, 
        fileName: file.name,
        fileSize: file.size,
        isUploading: false, 
        error: undefined 
      });
      toast({
        title: t('newRelease.filesStep.animatedArtwork.uploaded'),
        description: `${format} - ${t('newRelease.filesStep.uploadSuccess')}`,
      });
    } catch (error) {
      setState({ 
        file: null, 
        isValid: false, 
        error: error instanceof Error ? error.message : t('newRelease.filesStep.animatedArtwork.uploadError'), 
        isUploading: false, 
        uploadedUrl: undefined 
      });
      toast({
        title: t('newRelease.filesStep.downloadError'),
        description: error instanceof Error ? error.message : t('newRelease.filesStep.uploadError'),
        variant: "destructive",
      });
    }
  };

  // Wrapper functions for each format
  const handleAnimatedArtwork3x4Change = (file: File) => handleAnimatedArtworkUpload(file, '3x4', setAnimatedArtwork3x4);
  const handleAnimatedArtwork1x1Change = (file: File) => handleAnimatedArtworkUpload(file, '1x1', setAnimatedArtwork1x1);

  // Legacy handler for backwards compatibility
  const handleAnimatedArtworkChange = async (file: File) => {
    // For legacy support, upload to both old state and 3x4 state
    handleAnimatedArtworkUpload(file, '3x4', setAnimatedArtwork);
  };

  // Функції для керування треками
  const addTrack = () => {
    if (audioFiles.length < 20) {
      setAudioFiles([...audioFiles, { file: null, isValid: false }]);
    }
  };

  const removeTrack = (index: number) => {
    if (audioFiles.length > 1) {
      setAudioFiles(audioFiles.filter((_, i) => i !== index));
    }
  };

  const handleAudioFileChange = async (e: React.ChangeEvent<HTMLInputElement>, trackIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) {
      const newAudioFiles = [...audioFiles];
      newAudioFiles[trackIndex] = { file: null, isValid: false };
      setAudioFiles(newAudioFiles);
      return;
    }

    const validation = validateAudioFile(file);
    const newAudioFiles = [...audioFiles];
    
    if (!validation.isValid) {
      newAudioFiles[trackIndex] = { file: null, isValid: false, error: validation.error };
      setAudioFiles(newAudioFiles);
      toast({
        title: "Download error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    // Файл валідний, починаємо завантаження (isValid стає true тільки після успішного завантаження)
    newAudioFiles[trackIndex] = { 
      file, 
      isValid: false, 
      isUploading: true, 
      uploadedUrl: undefined, 
      error: undefined,
      uploadProgress: 0,
      uploadedBytes: 0,
      totalBytes: file.size
    };
    setAudioFiles([...newAudioFiles]);

    try {
      const { downloadUrl, fileId } = await uploadFileToServer(
        file, 
        'audio',
        (progress, uploadedBytes, totalBytes) => {
          newAudioFiles[trackIndex] = { 
            ...newAudioFiles[trackIndex], 
            uploadProgress: progress,
            uploadedBytes,
            totalBytes
          };
          setAudioFiles([...newAudioFiles]);
        }
      );
      newAudioFiles[trackIndex] = { file, isValid: true, uploadedUrl: downloadUrl, fileId, isUploading: false, error: undefined };
      setAudioFiles([...newAudioFiles]);
      toast({
        title: "Audio file downloaded",
        description: "File successfully saved to storage",
      });
    } catch (error) {
      newAudioFiles[trackIndex] = { 
        file: null, 
        isValid: false, 
        error: error instanceof Error ? error.message : "Error uploading file to storage", 
        isUploading: false, 
        uploadedUrl: undefined 
      };
      setAudioFiles([...newAudioFiles]);
      toast({
        title: "Download error",
        description: error instanceof Error ? error.message : "File upload failed. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Функції для видалення та заміни файлів
  const handleRemoveCoverArt = () => {
    setCoverArt({ file: null, isValid: false, uploadedUrl: undefined });
    const input = document.getElementById('cover-art-input') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  };

  const handleReplaceCoverArt = () => {
    document.getElementById('cover-art-input')?.click();
  };

  const handleRemoveAudioFile = (trackIndex: number) => {
    const newAudioFiles = [...audioFiles];
    newAudioFiles[trackIndex] = { file: null, isValid: false, uploadedUrl: undefined };
    setAudioFiles(newAudioFiles);
    const input = document.getElementById(`audio-file-input-${trackIndex}`) as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  };

  const handleReplaceAudioFile = (trackIndex: number) => {
    document.getElementById(`audio-file-input-${trackIndex}`)?.click();
  };

  // Drag & Drop handlers for cover art
  const handleCoverDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCover(true);
  };

  const handleCoverDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the drop zone completely
    if (e.currentTarget === e.target) {
      setIsDraggingCover(false);
    }
  };

  const handleCoverDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCoverDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCover(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      const validation = validateCoverArt(file);
      if (!validation.isValid) {
        setCoverArt({ file: null, isValid: false, error: validation.error });
        toast({
          title: t('newRelease.filesStep.downloadError'),
          description: validation.error,
          variant: "destructive",
        });
        return;
      }

      // Перевірка розмірів
      const isDimensionsValid = await checkImageDimensions(file);
      if (!isDimensionsValid) {
        setCoverArt({ file: null, isValid: false, error: "Dimensions must be 3000x3000 pixels" });
        toast({
          title: t('newRelease.filesStep.downloadError'),
          description: "Dimensions must be 3000x3000 pixels",
          variant: "destructive",
        });
        return;
      }

      // Файл валідний, починаємо завантаження
      setCoverArt({ 
        file, 
        isValid: false, 
        isUploading: true, 
        uploadedUrl: undefined, 
        error: undefined,
        uploadProgress: 0,
        uploadedBytes: 0,
        totalBytes: file.size
      });

      try {
        const { downloadUrl, fileId } = await uploadFileToServer(
          file, 
          'artwork',
          (progress, uploadedBytes, totalBytes) => {
            setCoverArt(prev => ({ 
              ...prev, 
              uploadProgress: progress,
              uploadedBytes,
              totalBytes
            }));
          }
        );
        setCoverArt({ file, isValid: true, uploadedUrl: downloadUrl, fileId, isUploading: false, error: undefined });
        toast({
          title: "Cover art downloaded",
          description: "File successfully saved to storage",
        });
      } catch (error) {
        setCoverArt({ 
          file: null, 
          isValid: false, 
          error: error instanceof Error ? error.message : "Error uploading file to storage", 
          isUploading: false, 
          uploadedUrl: undefined 
        });
        toast({
          title: "Download error",
          description: error instanceof Error ? error.message : "File upload failed. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Drag & Drop handlers for audio files
  const handleAudioDragEnter = (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAudio(trackIndex);
  };

  const handleAudioDragLeave = (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to null if we're leaving the drop zone completely
    if (e.currentTarget === e.target) {
      setIsDraggingAudio(null);
    }
  };

  const handleAudioDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAudioDrop = async (e: React.DragEvent<HTMLDivElement>, trackIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingAudio(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];

      const validation = validateAudioFile(file);
      const newAudioFiles = [...audioFiles];
      
      if (!validation.isValid) {
        newAudioFiles[trackIndex] = { file: null, isValid: false, error: validation.error };
        setAudioFiles(newAudioFiles);
        toast({
          title: "Download error",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }

      // Файл валідний, починаємо завантаження
      newAudioFiles[trackIndex] = { 
        file, 
        isValid: false, 
        isUploading: true, 
        uploadedUrl: undefined, 
        error: undefined,
        uploadProgress: 0,
        uploadedBytes: 0,
        totalBytes: file.size
      };
      setAudioFiles([...newAudioFiles]);

      try {
        const { downloadUrl, fileId } = await uploadFileToServer(
          file, 
          'audio',
          (progress, uploadedBytes, totalBytes) => {
            newAudioFiles[trackIndex] = { 
              ...newAudioFiles[trackIndex], 
              uploadProgress: progress,
              uploadedBytes,
              totalBytes
            };
            setAudioFiles([...newAudioFiles]);
          }
        );
        newAudioFiles[trackIndex] = { file, isValid: true, uploadedUrl: downloadUrl, fileId, isUploading: false, error: undefined };
        setAudioFiles([...newAudioFiles]);
        toast({
          title: "Audio file downloaded",
          description: "File successfully saved to storage",
        });
      } catch (error) {
        newAudioFiles[trackIndex] = { 
          file: null, 
          isValid: false, 
          error: error instanceof Error ? error.message : "Error uploading file to storage", 
          isUploading: false, 
          uploadedUrl: undefined 
        };
        setAudioFiles([...newAudioFiles]);
        toast({
          title: "Download error",
          description: error instanceof Error ? error.message : "File upload failed. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Upload file to server using XMLHttpRequest with progress tracking
  const uploadFileToServer = async (
    file: File, 
    fileType: 'artwork' | 'audio' | 'animated-artwork',
    onProgress?: (progress: number, uploadedBytes: number, totalBytes: number) => void
  ): Promise<{ downloadUrl: string; fileId: string }> => {
    // Use Google Drive for all files (up to 500MB)
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append(fileType, file); // 'audio' or 'artwork'
      
      const xhr = new XMLHttpRequest();
      
      // Set longer timeout for large files (10 minutes)
      xhr.timeout = 600000; // 10 minutes in milliseconds

      // Track upload progress
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete, e.loaded, e.total);
        }
      });

      // Handle completion
      xhr.addEventListener('load', () => {
        console.log('[UPLOAD CLIENT] Upload complete, status:', xhr.status);
        console.log('[UPLOAD CLIENT] Response text:', xhr.responseText.substring(0, 200));
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const responseText = xhr.responseText;
            console.log('[UPLOAD CLIENT] Parsing response:', responseText);
            const data = JSON.parse(responseText);
            console.log('[UPLOAD CLIENT] Parsed data:', data);
            
            if (!data.downloadUrl || !data.fileId) {
              console.error('[UPLOAD CLIENT] No downloadUrl or fileId in response:', data);
              reject(new Error('Server response missing downloadUrl or fileId'));
              return;
            }
            
            resolve({ downloadUrl: data.downloadUrl, fileId: data.fileId });
          } catch (error) {
            console.error('[UPLOAD CLIENT] Parse error:', error);
            reject(new Error('Failed to parse server response'));
          }
        } else {
          let errorMessage = `Upload failed with status ${xhr.status}`;
          const responseText = xhr.responseText;
          console.log('[UPLOAD CLIENT] Error response:', responseText);
          
          // Try to parse as JSON
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.message || errorMessage;
          } catch (parseError) {
            // If not JSON, check if it's HTML error page
            if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
              errorMessage = 'Server error. Please check file format and size.';
            } else if (responseText) {
              errorMessage = responseText;
            }
          }
          reject(new Error(errorMessage));
        }
      });

      // Handle timeout
      xhr.addEventListener('timeout', () => {
        console.error('[UPLOAD] Timeout after 10 minutes');
        reject(new Error('Upload timeout - file too large or server is processing'));
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload - please check your connection'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      // Send request - use specific endpoint for animated artwork
      const uploadUrl = fileType === 'animated-artwork' ? '/api/upload/animated-artwork' : '/api/upload';
      xhr.open('POST', uploadUrl, true);
      xhr.withCredentials = true;
      xhr.send(formData);
    });
  };

  const handleNextStep = () => {
    const allAudioFilesUploaded = audioFiles.every(af => af.uploadedUrl);
    if (!coverArt.uploadedUrl || !allAudioFilesUploaded) {
      toast({
        title: "Download all files",
        description: "Please upload the cover and all audio files to the repository",
        variant: "destructive",
      });
      return;
    }
    setCurrentStep("metadata");
  };

  // Функція валідації етапу
  const validateStep = (step: "files" | "metadata" | "tracks"): { isValid: boolean; error?: string } => {
    if (step === "files") {
      const allAudioFilesUploaded = audioFiles.every(af => af.uploadedUrl);
      if (!coverArt.uploadedUrl) {
        return { isValid: false, error: "Please upload the cover art" };
      }
      if (!allAudioFilesUploaded) {
        return { isValid: false, error: "Please upload all audio files" };
      }
      return { isValid: true };
    }
    
    if (step === "metadata") {
      // Перевіряємо форму метаданих релізу
      const formValues = form.getValues();
      const result = createReleaseMetadataSchema(t).safeParse(formValues);
      if (!result.success) {
        return { isValid: false, error: "Please fill in all required fields in release metadata" };
      }
      return { isValid: true };
    }
    
    if (step === "tracks") {
      // Перевіряємо всі треки
      if (tracksMetadata.length !== audioFiles.length) {
        return { isValid: false, error: "Please fill in metadata for all tracks" };
      }
      
      for (let i = 0; i < tracksMetadata.length; i++) {
        const track = tracksMetadata[i];
        
        // ISRC перевірка - обов'язковий, якщо не запитано генерацію
        if (!isrcRequested[i] && (!track.isrc || track.isrc.trim() === "")) {
          return { isValid: false, error: `Track ${i + 1}: ISRC is required (or click "Generate")` };
        }
        
        const result = createTrackMetadataSchema(t).safeParse(track);
        if (!result.success) {
          const firstError = result.error.issues[0];
          return { isValid: false, error: `Track ${i + 1}: ${firstError.message}` };
        }
      }
      return { isValid: true };
    }
    
    return { isValid: true };
  };

  // Обробка кліку на індикатор кроку
  const handleStepClick = (targetStep: "files" | "metadata" | "tracks" | "territories") => {
    const stepOrder = ["files", "metadata", "tracks", "territories"];
    const currentIndex = stepOrder.indexOf(currentStep);
    const targetIndex = stepOrder.indexOf(targetStep);

    // Якщо клік на поточний крок - нічого не робимо
    if (targetStep === currentStep) return;

    // Дозволяємо вільно повертатися назад
    if (targetIndex < currentIndex) {
      setCurrentStep(targetStep);
      return;
    }

    // Для переходу вперед валідуємо всі етапи між поточним і цільовим
    for (let i = currentIndex; i < targetIndex; i++) {
      const stepToValidate = stepOrder[i];
      if (stepToValidate === "territories") continue; // territories не потребує валідації
      
      const validation = validateStep(stepToValidate as "files" | "metadata" | "tracks");
      if (!validation.isValid) {
        toast({
          title: "Please complete the current step",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }
    }

    // Ініціалізуємо території при переході до territories
    if (targetStep === "territories") {
      initializeTerritories();
    }

    // Якщо всі перевірки пройшли - переходимо
    setCurrentStep(targetStep);
  };

  const handleGenerateUpc = async () => {
    setUpcRequested(true);
    form.setValue("upc", "");
    toast({
      title: "UPC заплановано до генерації",
      description: "Адміністратор згенерує UPC код для вашого релізу",
    });
  };

  // Функції для керування виконавцями
  const addPerformer = () => {
    const currentPerformers = form.getValues("performers") || [];
    if (currentPerformers.length < 5) {
      form.setValue("performers", [...currentPerformers, { name: "", role: "" }]);
    }
  };

  const removePerformer = (index: number) => {
    const currentPerformers = form.getValues("performers") || [];
    if (currentPerformers.length > 1) {
      form.setValue("performers", currentPerformers.filter((_, i) => i !== index));
    }
  };

  // Ініціалізація метаданих треків при переході до кроку треків
  const initializeTracksMetadata = () => {
    if (tracksMetadata.length === 0) {
      // Отримуємо поточні значення з форми Release Information
      const releaseMetadata = form.getValues();
      const isSingleTrack = audioFiles.length === 1;
      
      // Для сингла: копіюємо виконавців з релізу, якщо вони є
      const releasePerformers = releaseMetadata.performers || [];
      const trackPerformers = isSingleTrack && releasePerformers.length > 0
        ? releasePerformers.map(p => ({ name: p.name || "", role: p.role || "" }))
        : [{ name: "", role: "main_performer" }];
      
      const initialTracks = audioFiles.map((_, index) => ({
        // Для сингла: копіюємо назву релізу, інакше - з назви файлу
        title: isSingleTrack 
          ? (releaseMetadata.title || audioFiles[index].file?.name?.replace(/\.[^/.]+$/, "") || `Трек ${index + 1}`)
          : (audioFiles[index].file?.name?.replace(/\.[^/.]+$/, "") || `Трек ${index + 1}`),
        version: "",
        // Автоматично копіюємо з Release Information
        primaryGenre: releaseMetadata.primaryGenre || "",
        secondaryGenre: releaseMetadata.secondaryGenre || "",
        language: releaseMetadata.language || "",
        explicitContent: "no" as const,
        aiGenerated: false,
        previewStartTime: "00:00",
        tiktokPreviewDate: undefined,
        isrc: "",
        iswc: "",
        pLine: "",
        cLine: "",
        performers: trackPerformers,
        contributors: [
          { name: "", role: "composer" },
          { name: "", role: "lyricist" },
          { name: "", role: "arranger" },
          { name: "", role: "mixing_engineer" },
          { name: "", role: "mastering_engineer" },
          { name: "", role: "cover_designer" },
        ],
        hasNoMusic: false,
        hasNoLyrics: false,
        lyrics: "",
      }));
      setTracksMetadata(initialTracks);
      setIsrcRequested(new Array(audioFiles.length).fill(false));
    }
  };

  const handleGenerateIsrc = async (trackIndex: number) => {
    const newIsrcRequested = [...isrcRequested];
    newIsrcRequested[trackIndex] = true;
    setIsrcRequested(newIsrcRequested);
    
    const newTracksMetadata = [...tracksMetadata];
    newTracksMetadata[trackIndex].isrc = "";
    setTracksMetadata(newTracksMetadata);
    
    toast({
      title: "ISRC заплановано до генерації",
      description: "Адміністратор згенерує ISRC код для цього треку",
    });
  };

  const handleCopyFromFirstTrack = () => {
    if (tracksMetadata.length < 2) {
      toast({
        title: "Недостатньо треків",
        description: "Потрібно мінімум 2 треки для копіювання",
        variant: "destructive",
      });
      return;
    }

    const firstTrack = tracksMetadata[0];
    const newTracksMetadata = [...tracksMetadata];

    // Копіюємо дані з першого треку на всі інші (починаючи з індексу 1)
    for (let i = 1; i < newTracksMetadata.length; i++) {
      newTracksMetadata[i] = {
        ...newTracksMetadata[i],
        primaryGenre: firstTrack.primaryGenre,
        secondaryGenre: firstTrack.secondaryGenre,
        language: firstTrack.language,
        explicitContent: firstTrack.explicitContent,
        aiGenerated: firstTrack.aiGenerated,
        performers: firstTrack.performers ? firstTrack.performers.map(c => ({ ...c })) : [], // Deep copy performers
        contributors: firstTrack.contributors ? firstTrack.contributors.map(c => ({ ...c })) : [], // Deep copy contributors
        hasNoMusic: firstTrack.hasNoMusic,
        hasNoLyrics: firstTrack.hasNoLyrics,
      };
    }

    setTracksMetadata(newTracksMetadata);
    
    toast({
      title: "Дані скопійовано",
      description: `Метадані з треку 1 скопійовано на ${newTracksMetadata.length - 1} ${newTracksMetadata.length - 1 === 1 ? 'трек' : 'треки'}`,
    });
  };

  // Ініціалізація всіх територій при переході до кроку територій
  const initializeTerritories = () => {
    if (selectedTerritories.size === 0) {
      const allTerritories = new Set<string>();
      Object.values(TERRITORIES_DATA).forEach(continentCountries => {
        continentCountries.forEach(country => allTerritories.add(country));
      });
      setSelectedTerritories(allTerritories);
    }
  };

  // Функції для роботи з виконавцями треків
  const addTrackPerformer = (trackIndex: number) => {
    const newTracksMetadata = [...tracksMetadata];
    if (newTracksMetadata[trackIndex]?.performers) {
      if (newTracksMetadata[trackIndex].performers.length >= 5) {
        toast({
          title: "Досягнуто максимум виконавців",
          description: "Максимум 5 виконавців на трек",
          variant: "destructive",
        });
        return;
      }
      newTracksMetadata[trackIndex].performers = [
        ...newTracksMetadata[trackIndex].performers,
        { name: "", role: "featuring" }
      ];
      setTracksMetadata(newTracksMetadata);
    }
  };

  const removeTrackPerformer = (trackIndex: number, performerIndex: number) => {
    if (performerIndex === 0) return; // Cannot remove first performer
    const newTracksMetadata = [...tracksMetadata];
    if (newTracksMetadata[trackIndex]?.performers) {
      newTracksMetadata[trackIndex].performers = 
        newTracksMetadata[trackIndex].performers.filter((_, i) => i !== performerIndex);
      setTracksMetadata(newTracksMetadata);
    }
  };

  const onSubmitMetadata = (data: ReleaseMetadata) => {
    setHasAttemptedSubmit(true);
    
    // Admin must select organization
    if (isPlatformAdmin && !selectedOrgId) {
      toast({
        title: "Оберіть організацію",
        description: "Для створення релізу оберіть організацію зі списку",
        variant: "destructive",
      });
      return;
    }
    
    console.log("Submitted metadata:", data);
    initializeTracksMetadata();
    setCurrentStep("tracks");
  };

  // Валідація всіх треків з показом помилок
  const validateAllTracks = (): boolean => {
    const newErrors: Record<number, Record<string, string>> = {};
    let hasErrors = false;

    tracksMetadata.forEach((track, index) => {
      const trackErrors: Record<string, string> = {};

      // Валідація основних полів метаданих треку
      if (!track.title || track.title.trim() === "") {
        trackErrors.title = "Назва пісні обов'язкова";
        hasErrors = true;
      }

      if (!track.primaryGenre || track.primaryGenre.trim() === "") {
        trackErrors.primaryGenre = "Основний жанр обов'язковий";
        hasErrors = true;
      }


      if (!track.explicitContent) {
        trackErrors.explicitContent = "Ненормативний контент обов'язковий";
        hasErrors = true;
      }

      if (track.aiGenerated === undefined || track.aiGenerated === null) {
        trackErrors.aiGenerated = "Контент згенерований АІ обов'язковий";
        hasErrors = true;
      }

      // Валідація ISRC
      if (!isrcRequested[index] && (!track.isrc || track.isrc.trim() === "")) {
        trackErrors.isrc = "ISRC обов'язковий (або натисніть 'Генерувати')";
        hasErrors = true;
      }

      // Валідація lyrics
      if (!track.hasNoLyrics && (!track.lyrics || track.lyrics.trim() === "")) {
        trackErrors.lyrics = "Текст пісні обов'язковий, якщо пісня містить текст";
        hasErrors = true;
      }

      // Валідація performers
      const performers = track.performers || [];
      if (performers.length === 0 || !performers[0]?.name || performers[0].name.trim() === "") {
        trackErrors.main_performer = "Основний виконавець обов'язковий";
        hasErrors = true;
      }

      // Валідація contributors
      const contributors = track.contributors || [];
      const roles = contributors.map(c => c.role);
      
      // Завжди обов'язкові ролі (без main_performer, він тепер у performers)
      const requiredRoles = ["arranger", "mixing_engineer", "mastering_engineer", "cover_designer"];
      
      // Умовно обов'язкові ролі
      if (!track.hasNoMusic && !roles.includes("composer")) {
        trackErrors.composer = "Composer обов'язковий, якщо пісня містить музику";
        hasErrors = true;
      }
      
      if (!track.hasNoLyrics && !roles.includes("lyricist")) {
        trackErrors.lyricist = "Lyricist обов'язковий, якщо пісня містить текст";
        hasErrors = true;
      }
      
      // Перевірка завжди обов'язкових ролей
      for (const role of requiredRoles) {
        if (!roles.includes(role)) {
          trackErrors[role] = `${role.replace(/_/g, " ")} обов'язковий`;
          hasErrors = true;
        }
      }

      // Перевірка що всі contributors мають імена та прізвища (мінімум 2 слова)
      contributors.forEach((contributor, cIndex) => {
        const isRequired = requiredRoles.includes(contributor.role) || 
            (!track.hasNoMusic && contributor.role === "composer") ||
            (!track.hasNoLyrics && contributor.role === "lyricist");
        
        if (!contributor.name || contributor.name.trim() === "") {
          // Порожнє ім'я - помилка тільки для обов'язкових ролей
          if (isRequired) {
            trackErrors[`contributor_${cIndex}_name`] = `Ім'я для ${contributor.role} обов'язкове`;
            hasErrors = true;
          }
        } else {
          // Ім'я заповнене - перевірка на два слова для ВСІХ contributors
          const words = contributor.name.trim().split(/\s+/).filter(w => w.length > 0);
          if (words.length < 2) {
            trackErrors[`contributor_${cIndex}_name`] = t('newRelease.tracksStep.contributorNameTwoWords');
            hasErrors = true;
          }
        }
      });

      if (Object.keys(trackErrors).length > 0) {
        newErrors[index] = trackErrors;
      }
    });

    setTrackValidationErrors(newErrors);

    if (hasErrors) {
      const firstErrorTrack = Object.keys(newErrors)[0];
      toast({
        title: "Заповніть обов'язкові поля",
        description: `Трек ${parseInt(firstErrorTrack) + 1}: не всі обов'язкові поля заповнені`,
        variant: "destructive",
      });
      
      // Переключити на перший трек з помилками
      if (firstErrorTrack) {
        const trackIdx = parseInt(firstErrorTrack);
        setCurrentTrackIndex(trackIdx);
        
        // Визначити перший таб з помилками для цього треку
        const trackErrs = newErrors[trackIdx];
        const infoFields = ['title', 'primaryGenre', 'language', 'explicitContent', 'aiGenerated', 'isrc'];
        const performersFields = ['composer', 'lyricist', 'main_performer', 'arranger', 'mixing_engineer', 'mastering_engineer', 'cover_designer'];
        
        const hasInfoError = infoFields.some(f => trackErrs[f]);
        const hasPerformersError = performersFields.some(f => trackErrs[f]) || 
          Object.keys(trackErrs).some(k => k.startsWith('contributor_'));
        const hasLyricsError = !!trackErrs.lyrics;
        
        if (hasInfoError) {
          setActiveTrackTab("info");
        } else if (hasPerformersError) {
          setActiveTrackTab("performers");
        } else if (hasLyricsError) {
          setActiveTrackTab("lyrics");
        }
      }
    }

    return !hasErrors;
  };

  const onCompleteTracksMetadata = () => {
    if (validateAllTracks()) {
      initializeTerritories();
      setCurrentStep("territories");
    }
  };

  // Логіка для роботи з територіями
  const toggleTerritory = (territory: string) => {
    const newSelected = new Set(selectedTerritories);
    if (newSelected.has(territory)) {
      newSelected.delete(territory);
    } else {
      newSelected.add(territory);
    }
    setSelectedTerritories(newSelected);
  };

  const toggleContinentSelection = (continent: string) => {
    const continentCountries = TERRITORIES_DATA[continent as keyof typeof TERRITORIES_DATA];
    const allSelected = continentCountries.every(country => selectedTerritories.has(country));
    
    const newSelected = new Set(selectedTerritories);
    if (allSelected) {
      // Скасувати всі країни континенту
      continentCountries.forEach(country => newSelected.delete(country));
    } else {
      // Вибрати всі країни континенту
      continentCountries.forEach(country => newSelected.add(country));
    }
    setSelectedTerritories(newSelected);
  };

  const toggleRegion = (region: string) => {
    const newExpanded = new Set(expandedRegions);
    if (newExpanded.has(region)) {
      newExpanded.delete(region);
    } else {
      newExpanded.add(region);
    }
    setExpandedRegions(newExpanded);
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

  const onCompleteRelease = async () => {
    console.log("🚀 onCompleteRelease function called!");
    console.log("Current step:", currentStep);
    console.log("Selected territories count:", selectedTerritories.size);
    console.log("Tracks metadata count:", tracksMetadata.length);
    
    try {
      // Determine organization ID with ownership validation
      let orgId = selectedOrgId; // Admin selected organization
      
      // In admin mode editing user's draft: always use the draft's organization
      if (isAdminMode && currentDraftOrgId) {
        orgId = currentDraftOrgId;
        console.log('👑 Admin mode: using draft orgId:', orgId);
      }
      // For regular users (not admins): validate that selectedOrgId belongs to them
      // This prevents cross-user conflicts when localStorage has stale data from another user
      else if (!isPlatformAdmin && orgId && user?.organizations) {
        const userOrgIds = user.organizations.map(org => org.id);
        if (!userOrgIds.includes(orgId)) {
          // selectedOrgId doesn't belong to current user - use their first org instead
          console.log('⚠️ Fixing stale orgId: was', orgId, 'now using', user.organizations[0]?.id);
          orgId = user.organizations[0]?.id || "";
        }
      }
      
      // Fallback if orgId is still empty (only for non-admin mode)
      if (!orgId && !isAdminMode && user?.organizations?.[0]) {
        orgId = user.organizations[0].id; // Regular user's organization
      }
      
      console.log("📦 Using organization ID:", orgId);
      
      // Використовуємо вже завантажені файли
      const artworkUrl = coverArt.uploadedUrl || "";
      const artworkFileId = coverArt.fileId || "";
      
      // Додаємо URLs до треків з вже завантажених файлів та прапорець isrcRequested
      const tracksWithFiles = tracksMetadata.map((track, index) => {
        const audioFile = audioFiles[index];
        
        // Convert previewStartTime (MM:SS format like 00:50) to seconds for tiktokClipStart
        let tiktokClipStart = null;
        if (track.previewStartTime && track.previewStartTime !== "00:00") {
          const parts = track.previewStartTime.split(':');
          if (parts.length === 2) {
            const minutes = parseInt(parts[0]) || 0;
            const seconds = parseInt(parts[1]) || 0;
            tiktokClipStart = minutes * 60 + seconds;
          } else if (parts.length === 3) {
            // Legacy support for HH:MM:SS format
            const hours = parseInt(parts[0]) || 0;
            const minutes = parseInt(parts[1]) || 0;
            const seconds = parseInt(parts[2]) || 0;
            tiktokClipStart = hours * 3600 + minutes * 60 + seconds;
          }
        }
        
        // Merge performers and contributors into a single contributors array for backend
        const allContributors = [
          ...(track.performers || []),
          ...(track.contributors || [])
        ];
        
        return {
          ...track,
          contributors: allContributors, // Combined array for backend
          performers: undefined, // Remove separate performers field
          audioFileUrl: audioFile?.uploadedUrl || "",
          isrcRequested: isrcRequested[index] || false,
          tiktokClipStart, // Add converted value
          tiktokPreviewDate: track.tiktokPreviewDate || null, // TikTok preview date before release
        };
      });

      // Створюємо реліз з URL файлів та прапорцем upcRequested
      const finalReleaseData = {
        releaseMetadata: {
          ...form.getValues(),
          artworkUrl,
          artworkFileId,
          upcRequested,
          // Include isDebut only for debut releases (when organization has no existing releases)
          ...(isDebut !== null && { isDebut }),
          // Include artist profile URLs for non-debut releases
          // Use organization URLs if available, otherwise use form values
          // Include if: 1) organization has releases (auto non-debut) OR 2) user selected non-debut
          ...((organizationHasReleases || isDebut === false) && {
            spotifyArtistUrl: currentOrganization?.spotifyUrl || spotifyArtistUrl || null,
            appleMusicArtistUrl: currentOrganization?.appleMusicUrl || appleMusicArtistUrl || null,
          }),
          // Include animated artwork data if user opted in (new two-file format)
          ...(wantsAnimatedArtwork && (animatedArtwork3x4.uploadedUrl || animatedArtwork1x1.uploadedUrl) && {
            // 3x4 Album Page Motion
            animatedArtwork3x4FileId: animatedArtwork3x4.fileId,
            animatedArtwork3x4FileName: animatedArtwork3x4.fileName,
            animatedArtwork3x4Size: animatedArtwork3x4.fileSize || animatedArtwork3x4.file?.size,
            // 1x1 Square
            animatedArtwork1x1FileId: animatedArtwork1x1.fileId,
            animatedArtwork1x1FileName: animatedArtwork1x1.fileName,
            animatedArtwork1x1Size: animatedArtwork1x1.fileSize || animatedArtwork1x1.file?.size,
          }),
        },
        tracksMetadata: tracksWithFiles,
        selectedTerritories: Array.from(selectedTerritories),
        ...(orgId && { orgId }) // Add orgId if available
      };

      console.log("✅ Final release data prepared:", finalReleaseData);

      toast({
        title: "Створення релізу",
        description: "Зберігаємо реліз...",
      });

      const response = await apiRequest("POST", "/api/releases", finalReleaseData);
      console.log("📡 Request sent, response status:", response.status);

      const result = await response.json();
      console.log("✅ Release created successfully:", result);

      const releaseId = result.release.id;
      const trackCount = tracksMetadata.length;
      
      // Mark as successfully submitted to prevent auto-save from re-creating draft
      isSubmittedSuccessfullyRef.current = true;
      
      // Clear draft after successful creation
      clearCurrentDraft();
      startNewDraft();

      // Set pitching prompt flag if user selected "yes" for pitching
      if (willPitch === true) {
        sessionStorage.setItem('showPitchingPrompt', 'true');
      }

      // Platform Admins and orgs with free releases skip payment and go directly to catalog
      if (isPlatformAdmin || result.release.paymentStatus === 'PAID') {
        toast({
          title: 'Реліз створено!',
          description: 'Ваш реліз успішно збережено та відправлено на перевірку.',
        });

        setTimeout(() => {
          window.location.href = "/catalog";
        }, 1500);
      } else {
        // Regular users: Show payment on same page, don't redirect until paid
        toast({
          title: 'Реліз створено!',
          description: 'Оплатіть реліз для відправки на модерацію.',
        });
        
        // Calculate animated artwork fee in UAH for display
        const animatedFeeUAH = result.release.animatedArtworkFeeApplied 
          ? Math.round(result.release.animatedArtworkFeeApplied / 100) 
          : 0;
        
        // Store payment info and show payment widget
        setCreatedReleaseId(releaseId);
        setCreatedReleaseTrackCount(trackCount);
        setCreatedReleaseAnimatedArtworkFee(animatedFeeUAH);
        setShowPaymentDialog(true);
      }

    } catch (error) {
      console.error("💥 Error creating release:", error);
      
      // Extract error message if available
      let errorMessage = "Не вдалося створити реліз. Спробуйте ще раз.";
      if (error instanceof Error) {
        // Error from apiRequest contains status and text: "500: Failed to create release"
        const match = error.message.match(/^\d+:\s*(.+)$/);
        if (match) {
          errorMessage = match[1]; // Extract just the message part
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Помилка",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  // Компонент InfoTooltip для підказок з підтримкою touch events для планшетів
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

  // Мапа підказок для полів (мультимовна з i18n)
  const fieldTooltips: Record<string, string> = {
    // Інформація про реліз
    language: t('newRelease.tooltips.language'),
    title: t('newRelease.tooltips.title'),
    albumVersion: t('newRelease.tooltips.albumVersion'),
    primaryGenre: t('newRelease.tooltips.primaryGenre'),
    secondaryGenre: t('newRelease.tooltips.secondaryGenre'),
    originalReleaseDate: t('newRelease.tooltips.originalReleaseDate'),
    releaseDate: t('newRelease.tooltips.releaseDate'),
    subLabel: t('newRelease.tooltips.subLabel'),
    upc: t('newRelease.tooltips.upc'),
    performers: t('newRelease.tooltips.performers'),
    
    // Метадані треків
    trackTitle: t('newRelease.tooltips.trackTitle'),
    trackVersion: t('newRelease.tooltips.trackVersion'),
    trackPrimaryGenre: t('newRelease.tooltips.trackPrimaryGenre'),
    trackSecondaryGenre: t('newRelease.tooltips.trackSecondaryGenre'),
    trackLanguage: t('newRelease.tooltips.trackLanguage'),
    explicitContent: t('newRelease.tooltips.explicitContent'),
    aiGenerated: t('newRelease.tooltips.aiGenerated'),
    previewStartTime: t('newRelease.tooltips.previewStartTime'),
    isrc: t('newRelease.tooltips.isrc'),
    iswc: t('newRelease.tooltips.iswc'),
    pLine: t('newRelease.tooltips.pLine'),
    cLine: t('newRelease.tooltips.cLine'),
    hasNoMusic: t('newRelease.tooltips.hasNoMusic'),
    hasNoLyrics: t('newRelease.tooltips.hasNoLyrics'),
    
    // Учасники треку
    contributors: t('newRelease.tooltips.contributors'),
    
    // Імена учасників
    contributorNameMainPerformer: t('newRelease.tooltips.contributorNameMainPerformer'),
    contributorNameOther: t('newRelease.tooltips.contributorNameOther'),
    
    // Текст пісні
    lyrics: t('newRelease.tooltips.lyrics'),
  };

  return (
    <>
      {/* Distribution Agreement Dialog */}
      <Dialog open={showAgreementDialog} onOpenChange={(open) => {
        if (!open && !user?.agreementAccepted) {
          // X button clicked - redirect to agreement page (same as Cancel button)
          window.location.href = '/agreement-required';
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">{t('newRelease.agreement.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="border-2">
              <CardContent className="p-4">
                <ScrollArea className="h-96 w-full rounded-md border p-4">
                  <div className="whitespace-pre-wrap text-sm">
                    {getDistributionAgreement(i18n.language as 'en' | 'uk' | 'pl')}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <div className="flex items-start space-x-3 pt-4">
              <Checkbox 
                id="agreement-popup"
                checked={agreementChecked}
                onCheckedChange={(checked) => setAgreementChecked(checked as boolean)}
              />
              <Label 
                htmlFor="agreement-popup" 
                className="text-sm font-medium leading-relaxed cursor-pointer"
              >
                {t('newRelease.agreement.readAndAccept')}
              </Label>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = '/agreement-required';
                }}
              >
                {t('newRelease.agreement.cancelButton')}
              </Button>
              <Button
                onClick={handleAcceptAgreement}
                disabled={!agreementChecked || isAcceptingAgreement}
              >
                {isAcceptingAgreement ? t('settings.saving') : t('newRelease.agreement.acceptButton')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="py-6">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 md:px-8">
          {/* Admin Mode Banner */}
          {isAdminMode && targetUserInfo && (
            <Alert className="mb-6 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <Users className="h-4 w-4" />
              <AlertDescription>
                Ви редагуєте чернетку від імені користувача: <strong>{targetUserInfo.firstName || ''} {targetUserInfo.lastName || ''}</strong> ({targetUserInfo.email})
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-foreground">{t('newRelease.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentStep === "files" 
                ? t('newRelease.filesStep.uploadAllFilesDesc')
                : currentStep === "metadata"
                  ? t('newRelease.metadataStep.releaseInfoDesc')
                  : currentStep === "tracks"
                    ? t('newRelease.tracksStep.fillAllTracks')
                    : t('newRelease.territoriesStep.selectTerritoriesDesc')
              }
            </p>
          </div>

        {/* Прогрес індикатор */}
        <div className="mb-8">
          <div className="space-y-4">
            {/* Перший рядок: Файли - Метадані */}
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => handleStepClick("files")}
                className={`flex items-center space-x-2 transition-colors hover:opacity-80 ${
                  currentStep === "files" ? "text-purple-500" : "text-muted-foreground"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === "files" 
                    ? "bg-purple-500 text-white" 
                    : (coverArt.uploadedUrl && audioFiles.every(af => af.uploadedUrl))
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {(coverArt.uploadedUrl && audioFiles.every(af => af.uploadedUrl)) ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    "1"
                  )}
                </div>
                <span className="text-sm font-medium">{t('newRelease.steps.files')}</span>
              </button>
              <div className="flex-1 h-px bg-border" />
              <button
                onClick={() => handleStepClick("metadata")}
                className={`flex items-center space-x-2 transition-colors hover:opacity-80 ${
                  currentStep === "metadata" ? "text-purple-500" : "text-muted-foreground"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === "metadata" 
                    ? "bg-purple-500 text-white" 
                    : currentStep === "tracks"
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {currentStep === "tracks" ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </div>
                <span className="text-sm font-medium">{t('newRelease.steps.metadata')}</span>
              </button>
            </div>
            
            {/* Другий рядок: Треки - Території */}
            <div className="flex items-center space-x-4">
              <button
                onClick={() => handleStepClick("tracks")}
                className={`flex items-center space-x-2 transition-colors hover:opacity-80 ${
                  currentStep === "tracks" ? "text-purple-500" : "text-muted-foreground"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === "tracks" 
                    ? "bg-purple-500 text-white" 
                    : currentStep === "territories"
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {currentStep === "territories" ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <Music className="h-4 w-4" />
                  )}
                </div>
                <span className="text-sm font-medium">{t('newRelease.steps.tracks')}</span>
              </button>
              <div className="flex-1 h-px bg-border" />
              <button
                onClick={() => handleStepClick("territories")}
                className={`flex items-center space-x-2 transition-colors hover:opacity-80 ${
                  currentStep === "territories" ? "text-purple-500" : "text-muted-foreground"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === "territories" 
                    ? "bg-purple-500 text-white" 
                    : "bg-muted text-muted-foreground"
                }`}>
                  4
                </div>
                <span className="text-sm font-medium">{t('newRelease.steps.territories')}</span>
              </button>
            </div>
          </div>
        </div>

        {currentStep === "files" && (
          <div className="space-y-6">
            {/* Завантаження обкладинки */}
            <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                {t('newRelease.filesStep.coverArtTitle')}
              </CardTitle>
              <CardDescription>
                {t('newRelease.filesStep.coverDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                    isDraggingCover
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-border hover:border-purple-500/50'
                  }`}
                  onDragEnter={handleCoverDragEnter}
                  onDragLeave={handleCoverDragLeave}
                  onDragOver={handleCoverDragOver}
                  onDrop={handleCoverDrop}
                >
                  <div className="flex flex-col items-center gap-4">
                    {!coverArt.file && !coverArt.uploadedUrl && !coverArt.isUploading && (
                      <>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Upload className="h-8 w-8" />
                        </div>
                        <p className="text-sm text-center text-muted-foreground">
                          {isDraggingCover 
                            ? t('newRelease.filesStep.dropHere') || "Drop the file here"
                            : t('newRelease.filesStep.dragOrClick') || "Drag and drop the cover art here or click to select"
                          }
                        </p>
                        <Label htmlFor="cover-art-input" className="cursor-pointer">
                          <div className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-md">
                            <Upload className="h-4 w-4" />
                            {t('newRelease.filesStep.selectFile')}
                          </div>
                        </Label>
                        <Input
                          id="cover-art-input"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png"
                          onChange={handleCoverArtChange}
                          className="hidden"
                          data-testid="cover-art-input"
                        />
                      </>
                    )}
                    
                    {coverArt.isUploading && (
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
                            <span className="text-sm text-muted-foreground">{t('newRelease.toast.uploading')}</span>
                          </div>
                          <span className="text-sm font-medium text-purple-500">
                            {coverArt.uploadProgress || 0}%
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 transition-all duration-300"
                            style={{ width: `${coverArt.uploadProgress || 0}%` }}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground text-center">
                          {((coverArt.uploadedBytes || 0) / (1024 * 1024)).toFixed(2)} MB / {((coverArt.totalBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    )}
                    
                    {(coverArt.file || coverArt.uploadedUrl) && !coverArt.isUploading && (
                      <div className="flex items-center gap-3 w-full">
                        {coverArt.isValid && coverArt.uploadedUrl ? (
                          <>
                            <CheckCircle className="h-5 w-5 text-green-500" />
                            <span className="text-sm flex-1">{coverArt.file?.name || t('newRelease.filesStep.coverLoaded')}</span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleReplaceCoverArt}
                                className="h-8"
                              >
                                {t('newRelease.filesStep.replaceFile')}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleRemoveCoverArt}
                                className="h-8 text-red-500 hover:text-red-700"
                              >
                                {t('newRelease.filesStep.removeFile')}
                              </Button>
                            </div>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            <span className="text-sm">{coverArt.file?.name || t('newRelease.filesStep.coverLoaded')}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {coverArt.error && (
                  <p className="text-sm text-red-500">{coverArt.error}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Анімована обкладинка Apple Music */}
          <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  {t('newRelease.filesStep.animatedArtwork.title')}
                </CardTitle>
                <CardDescription>
                  {t('newRelease.filesStep.animatedArtwork.question')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {wantsAnimatedArtwork === null && (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-12 border-purple-500/50 hover:bg-purple-500/10 hover:border-purple-500"
                        onClick={() => setWantsAnimatedArtwork(true)}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('newRelease.filesStep.animatedArtwork.yes')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-12"
                        onClick={() => setWantsAnimatedArtwork(false)}
                      >
                        {t('newRelease.filesStep.animatedArtwork.no')}
                      </Button>
                    </div>
                  )}
                  
                  {wantsAnimatedArtwork === false && (
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <span className="text-sm text-muted-foreground">
                        {t('newRelease.filesStep.animatedArtwork.no')}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setWantsAnimatedArtwork(null)}
                      >
                        {t('newRelease.filesStep.replaceFile')}
                      </Button>
                    </div>
                  )}
                  
                  {wantsAnimatedArtwork === true && (
                    <div className="space-y-4">
                      {/* Опис та приклади - горизонтальний layout */}
                      <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                          {/* Ліва частина - текст та кнопки */}
                          <div className="space-y-3">
                            <p className="text-sm">
                              {t('newRelease.filesStep.animatedArtwork.description')}
                            </p>
                            <div className="flex flex-col gap-2">
                              <a 
                                href="https://help.apple.com/itc/albummotionguide/#/bc5165604402"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-purple-500 hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                {t('newRelease.filesStep.animatedArtwork.guidelines')}
                              </a>
                              <a 
                                href="https://itunespartner.apple.com/music/assets/album-motion-partner-toolkit.zip"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-purple-500 hover:underline"
                              >
                                <Download className="h-3 w-3" />
                                After Effects шаблон для 3:4 Album Page Motion
                              </a>
                              <a 
                                href="https://itunespartner.apple.com/music/assets/album-motion-partner-toolkit.zip"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-purple-500 hover:underline"
                              >
                                <Download className="h-3 w-3" />
                                After Effects шаблон для 1:1 Square
                              </a>
                            </div>
                            {/* Бейдж оплати */}
                            <div className="pt-2">
                              {(() => {
                                const currentOrg = isPlatformAdmin 
                                  ? organizations.find(org => org.id === selectedOrgId)
                                  : user?.organizations?.[0];
                                
                                const badgeClass = "inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/60 text-purple-900 border border-purple-200 dark:bg-white/10 dark:text-white dark:border-purple-500/40 text-xs font-medium";
                                
                                if (currentOrg?.freeReleases) {
                                  return (
                                    <span className={badgeClass}>
                                      <Info className="h-3 w-3" />
                                      {t('newRelease.filesStep.animatedArtwork.feeNoticeFree')}
                                    </span>
                                  );
                                } else if (currentOrg?.type === 'AMBASSADOR') {
                                  return (
                                    <span className={badgeClass}>
                                      <Info className="h-3 w-3" />
                                      {t('newRelease.filesStep.animatedArtwork.feeNoticeAmbassador', { amount: '100' })}
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className={badgeClass}>
                                      <Info className="h-3 w-3" />
                                      {t('newRelease.filesStep.animatedArtwork.feeNotice', { amount: '250' })}
                                    </span>
                                  );
                                }
                              })()}
                            </div>
                          </div>
                          
                          {/* Права частина - GIF карусель */}
                          <div className="relative w-full max-w-[200px] mx-auto aspect-square overflow-hidden rounded-lg border bg-[#f6f6f6]">
                            <AnimatedArtworkCarousel />
                          </div>
                        </div>
                      </div>
                      
                      {/* Два поля для файлів - 3x4 та 1x1 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Поле 3x4 - Album Page Motion */}
                        <div className="space-y-2">
                          <div className="text-sm font-medium">3:4 Album Page Motion</div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>2048x2732 pixels</div>
                            <div>H.264 / Apple ProRes 422, 4444</div>
                            <div>.mp4 / .mov</div>
                          </div>
                          <div
                            className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                              isDraggingAnimated3x4
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-border hover:border-purple-500/50'
                            }`}
                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAnimated3x4(true); }}
                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAnimated3x4(false); }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsDraggingAnimated3x4(false);
                              const file = e.dataTransfer.files[0];
                              if (file) handleAnimatedArtwork3x4Change(file);
                            }}
                          >
                            <div className="flex flex-col items-center gap-3">
                              {!animatedArtwork3x4.file && !animatedArtwork3x4.uploadedUrl && !animatedArtwork3x4.isUploading && (
                                <>
                                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                                  <p className="text-xs text-center text-muted-foreground">
                                    {isDraggingAnimated3x4 ? t('newRelease.filesStep.dropHere') : t('newRelease.filesStep.animatedArtwork.dragOrClick')}
                                  </p>
                                  <Label htmlFor="animated-artwork-3x4-input" className="cursor-pointer">
                                    <div className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm">
                                      <Upload className="h-3 w-3" />
                                      {t('newRelease.filesStep.selectFile')}
                                    </div>
                                  </Label>
                                  <Input
                                    id="animated-artwork-3x4-input"
                                    type="file"
                                    accept="video/quicktime,video/mp4,.mov,.mp4"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleAnimatedArtwork3x4Change(file);
                                    }}
                                    className="hidden"
                                  />
                                </>
                              )}
                              {animatedArtwork3x4.isUploading && (
                                <div className="flex flex-col gap-2 w-full">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent"></div>
                                    <span className="text-xs font-medium text-purple-500">{animatedArtwork3x4.uploadProgress || 0}%</span>
                                  </div>
                                  <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                                    <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${animatedArtwork3x4.uploadProgress || 0}%` }} />
                                  </div>
                                </div>
                              )}
                              {(animatedArtwork3x4.file || animatedArtwork3x4.uploadedUrl) && !animatedArtwork3x4.isUploading && (
                                <div className="flex items-center gap-2 w-full">
                                  {animatedArtwork3x4.isValid && animatedArtwork3x4.uploadedUrl ? (
                                    <>
                                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                      <span className="text-xs flex-1 truncate">{animatedArtwork3x4.fileName}</span>
                                      <Button type="button" variant="ghost" size="sm" onClick={() => setAnimatedArtwork3x4({ file: null, isValid: false })} className="h-6 px-2 text-xs text-red-500">
                                        {t('newRelease.filesStep.removeFile')}
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="h-4 w-4 text-red-500" />
                                      <span className="text-xs text-red-500">{animatedArtwork3x4.error}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Поле 1x1 - Square */}
                        <div className="space-y-2">
                          <div className="text-sm font-medium">1:1 Square</div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div>3840x3840 pixels</div>
                            <div>H.264 / Apple ProRes 422, 4444</div>
                            <div>.mp4 / .mov</div>
                          </div>
                          <div
                            className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
                              isDraggingAnimated1x1
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-border hover:border-purple-500/50'
                            }`}
                            onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAnimated1x1(true); }}
                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingAnimated1x1(false); }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsDraggingAnimated1x1(false);
                              const file = e.dataTransfer.files[0];
                              if (file) handleAnimatedArtwork1x1Change(file);
                            }}
                          >
                            <div className="flex flex-col items-center gap-3">
                              {!animatedArtwork1x1.file && !animatedArtwork1x1.uploadedUrl && !animatedArtwork1x1.isUploading && (
                                <>
                                  <Sparkles className="h-6 w-6 text-muted-foreground" />
                                  <p className="text-xs text-center text-muted-foreground">
                                    {isDraggingAnimated1x1 ? t('newRelease.filesStep.dropHere') : t('newRelease.filesStep.animatedArtwork.dragOrClick')}
                                  </p>
                                  <Label htmlFor="animated-artwork-1x1-input" className="cursor-pointer">
                                    <div className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-3 py-1.5 rounded-md text-sm">
                                      <Upload className="h-3 w-3" />
                                      {t('newRelease.filesStep.selectFile')}
                                    </div>
                                  </Label>
                                  <Input
                                    id="animated-artwork-1x1-input"
                                    type="file"
                                    accept="video/quicktime,video/mp4,.mov,.mp4"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleAnimatedArtwork1x1Change(file);
                                    }}
                                    className="hidden"
                                  />
                                </>
                              )}
                              {animatedArtwork1x1.isUploading && (
                                <div className="flex flex-col gap-2 w-full">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent"></div>
                                    <span className="text-xs font-medium text-purple-500">{animatedArtwork1x1.uploadProgress || 0}%</span>
                                  </div>
                                  <div className="w-full bg-secondary rounded-full h-1.5 overflow-hidden">
                                    <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${animatedArtwork1x1.uploadProgress || 0}%` }} />
                                  </div>
                                </div>
                              )}
                              {(animatedArtwork1x1.file || animatedArtwork1x1.uploadedUrl) && !animatedArtwork1x1.isUploading && (
                                <div className="flex items-center gap-2 w-full">
                                  {animatedArtwork1x1.isValid && animatedArtwork1x1.uploadedUrl ? (
                                    <>
                                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                      <span className="text-xs flex-1 truncate">{animatedArtwork1x1.fileName}</span>
                                      <Button type="button" variant="ghost" size="sm" onClick={() => setAnimatedArtwork1x1({ file: null, isValid: false })} className="h-6 px-2 text-xs text-red-500">
                                        {t('newRelease.filesStep.removeFile')}
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <AlertCircle className="h-4 w-4 text-red-500" />
                                      <span className="text-xs text-red-500">{animatedArtwork1x1.error}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Кнопка відміни */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setWantsAnimatedArtwork(null);
                          setAnimatedArtwork3x4({ file: null, isValid: false });
                          setAnimatedArtwork1x1({ file: null, isValid: false });
                        }}
                        className="text-muted-foreground"
                      >
                        {t('newRelease.filesStep.animatedArtwork.no')}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

          {/* Завантаження аудіо файлів */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music className="h-5 w-5" />
                {t('newRelease.filesStep.audioFilesTitle')}
              </CardTitle>
              <CardDescription>
                {t('newRelease.filesStep.audioDescription')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {audioFiles.map((audioFile, index) => (
                  <div 
                    key={index} 
                    className={`border-2 border-dashed rounded-lg p-4 space-y-4 relative transition-colors ${
                      isDraggingAudio === index
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-border hover:border-purple-500/50'
                    }`}
                    onDragEnter={(e) => handleAudioDragEnter(e, index)}
                    onDragLeave={(e) => handleAudioDragLeave(e, index)}
                    onDragOver={handleAudioDragOver}
                    onDrop={(e) => handleAudioDrop(e, index)}
                  >
                    {index > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTrack(index)}
                        className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700 z-10"
                        data-testid={`remove-track-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    
                    <div className="flex flex-col gap-4">
                      {!audioFile.file && !audioFile.uploadedUrl && !audioFile.isUploading && (
                        <>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Music className="h-6 w-6" />
                            <span className="font-medium">{t('newRelease.filesStep.track')} {index + 1}</span>
                          </div>
                          <p className="text-sm text-center text-muted-foreground">
                            {isDraggingAudio === index
                              ? t('newRelease.filesStep.dropHere') || "Drop the audio file here"
                              : t('newRelease.filesStep.dragOrClickAudio') || "Drag and drop audio file here or click to select"
                            }
                          </p>
                          <Label htmlFor={`audio-file-input-${index}`} className="cursor-pointer mx-auto">
                            <div className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-md">
                              <Upload className="h-4 w-4" />
                              {t('newRelease.filesStep.selectFile')}
                            </div>
                          </Label>
                          <Input
                            id={`audio-file-input-${index}`}
                            type="file"
                            accept="audio/wav,.wav,audio/flac,.flac"
                            onChange={(e) => handleAudioFileChange(e, index)}
                            className="hidden"
                            data-testid={`audio-file-input-${index}`}
                          />
                        </>
                      )}
                      
                      {audioFile.isUploading && (
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-purple-500 border-t-transparent"></div>
                              <span className="text-sm text-muted-foreground">{t('newRelease.toast.uploading')}</span>
                            </div>
                            <span className="text-sm font-medium text-purple-500">
                              {audioFile.uploadProgress || 0}%
                            </span>
                          </div>
                          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                            <div 
                              className="h-full bg-purple-500 transition-all duration-300"
                              style={{ width: `${audioFile.uploadProgress || 0}%` }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground text-center">
                            {((audioFile.uploadedBytes || 0) / (1024 * 1024)).toFixed(2)} MB / {((audioFile.totalBytes || 0) / (1024 * 1024)).toFixed(2)} MB
                          </div>
                        </div>
                      )}
                      
                      {(audioFile.file || audioFile.uploadedUrl) && !audioFile.isUploading && (
                        <div className="flex flex-col gap-3 w-full">
                          <div className="flex items-center gap-3 w-full">
                            {audioFile.isValid && audioFile.uploadedUrl ? (
                              <>
                                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                                <span className="text-sm flex-1 truncate">{audioFile.file?.name || audioFile.fileName || t('newRelease.filesStep.audioLoaded')}</span>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleReplaceAudioFile(index)}
                                    className="h-8"
                                  >
                                    {t('newRelease.filesStep.replaceFile')}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRemoveAudioFile(index)}
                                    className="h-8 text-red-500 hover:text-red-700"
                                  >
                                    {t('newRelease.filesStep.removeFile')}
                                  </Button>
                                </div>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                                <span className="text-sm">{audioFile.file?.name || audioFile.fileName || t('newRelease.filesStep.audioLoaded')}</span>
                              </>
                            )}
                          </div>
                          {audioFile.isValid && (audioFile.fileId || audioFile.uploadedUrl) && (
                            <AudioPlayer 
                              src={`/api/files/download/${audioFile.fileId || extractFileIdFromUrl(audioFile.uploadedUrl)}`} 
                            />
                          )}
                        </div>
                      )}
                      
                      {audioFile.error && (
                        <p className="text-sm text-red-500 text-center">{audioFile.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {audioFiles.length < 20 && (
                <div className="flex flex-col items-end gap-2 mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addTrack}
                    disabled={audioFiles.length >= 20}
                    data-testid="add-track-button"
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    {t('newRelease.filesStep.addSong')}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {t('newRelease.filesStep.canAddMore', { count: 20 - audioFiles.length })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

            {/* Кнопка переходу до метаданих */}
            <div className="flex justify-end">
              <Button 
                onClick={handleNextStep}
                disabled={
                  !coverArt.uploadedUrl || 
                  !audioFiles.every(af => af.uploadedUrl) || 
                  coverArt.isUploading || 
                  audioFiles.some(af => af.isUploading)
                }
                data-testid="next-step-button"
              >
                {(coverArt.isUploading || audioFiles.some(af => af.isUploading)) ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    {t('newRelease.toast.uploading')}
                  </>
                ) : (
                  <>
                    {t('newRelease.buttons.next')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {currentStep === "metadata" && (
          <div className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitMetadata)} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Ліва панель з обкладинкою */}
                  <div className="lg:col-span-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">{t('newRelease.filesStep.coverArtTitle')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {(coverArt.file || coverArt.uploadedUrl) && coverArt.isValid ? (
                            <div className="relative aspect-square w-full max-w-[250px] mx-auto">
                              <img 
                                src={coverArt.file ? URL.createObjectURL(coverArt.file) : coverArt.uploadedUrl!} 
                                alt={t('newRelease.filesStep.coverArtTitle')}
                                className="w-full h-full object-cover rounded-lg border"
                              />
                              <div className="absolute top-2 right-2">
                                <CheckCircle className="h-6 w-6 text-green-500 bg-white rounded-full" />
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-square w-full max-w-[250px] mx-auto bg-muted rounded-lg border border-dashed flex items-center justify-center">
                              <div className="text-center text-muted-foreground">
                                <Image className="h-12 w-12 mx-auto mb-2" />
                                <p className="text-sm">{t('newRelease.filesStep.coverNotUploaded')}</p>
                              </div>
                            </div>
                          )}
                          <div className="text-center">
                            <Button 
                              type="button"
                              variant="outline" 
                              onClick={() => setCurrentStep("files")}
                              size="sm"
                            >
                              {t('newRelease.buttons.backToFiles')}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Права панель з формою */}
                  <div className="lg:col-span-2">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <FileText className="h-5 w-5" />
                          {t('newRelease.metadataStep.releaseInfo')}
                        </CardTitle>
                        <CardDescription>
                          {t('newRelease.metadataStep.releaseInfoDesc')}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-4">
                          {/* Admin: Organization Selection */}
                          {isPlatformAdmin && (
                            <div className="space-y-2 p-4 border-2 border-purple-500/50 rounded-lg bg-purple-500/5">
                              <Label className="text-base font-semibold flex items-center gap-2">
                                <Globe className="h-4 w-4 text-purple-500" />
                                * Оберіть організацію (Artist/Label)
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Реліз буде створено для обраної організації та з'явиться в їхньому каталозі
                              </p>
                              <Select 
                                value={selectedOrgId} 
                                onValueChange={setSelectedOrgId}
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
                              {hasAttemptedSubmit && !selectedOrgId && (
                                <p className="text-sm text-red-500">Оберіть організацію для створення релізу</p>
                              )}
                            </div>
                          )}
                          
                          {/* Це дебютний реліз? - показується тільки якщо немає існуючих релізів */}
                          {!organizationHasReleases && (
                            <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                              <Label className="text-base font-semibold">
                                * Це дебютний реліз?
                              </Label>
                              <p className="text-sm text-muted-foreground">
                                Дебютний реліз — це перша офіційна пісня артиста на стрімінгових платформах
                              </p>
                              <div className="flex gap-4">
                                <Button
                                  type="button"
                                  variant={isDebut === true ? "default" : "outline"}
                                  className={isDebut === true ? "bg-green-600 hover:bg-green-700" : ""}
                                  onClick={() => setIsDebut(true)}
                                >
                                  Так
                                </Button>
                                <Button
                                  type="button"
                                  variant={isDebut === false ? "default" : "outline"}
                                  className={isDebut === false ? "bg-primary" : ""}
                                  onClick={() => setIsDebut(false)}
                                >
                                  Ні
                                </Button>
                              </div>
                              {hasAttemptedSubmit && isDebut === null && (
                                <p className="text-sm text-red-500">Оберіть чи це дебютний реліз</p>
                              )}
                            </div>
                          )}

                          {/* Spotify/Apple Music Artist URLs - показуються для НЕ дебютних релізів І якщо URL відсутній в налаштуваннях організації */}
                          {/* Показуємо якщо: 1) організація вже має релізи (автоматично не дебют) АБО 2) користувач обрав "не дебют" */}
                          {(organizationHasReleases || isDebut === false) && (!orgHasSpotifyUrl || !orgHasAppleMusicUrl) && (
                            <div className="space-y-4 p-4 bg-muted/50 rounded-lg border">
                              <div className="text-sm text-muted-foreground mb-2">
                                {t('newRelease.metadataStep.artistProfilesDescription')}
                              </div>
                              <div className="space-y-3">
                                {/* Показувати поле Spotify тільки якщо немає в налаштуваннях організації */}
                                {!orgHasSpotifyUrl && (
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                      <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                                      </svg>
                                      Spotify
                                    </label>
                                    <Input
                                      placeholder="https://open.spotify.com/artist/..."
                                      value={spotifyArtistUrl}
                                      onChange={(e) => setSpotifyArtistUrl(e.target.value)}
                                      className="h-12"
                                    />
                                  </div>
                                )}
                                {/* Показувати поле Apple Music тільки якщо немає в налаштуваннях організації */}
                                {!orgHasAppleMusicUrl && (
                                  <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                      <svg className="w-5 h-5 text-pink-500" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.8.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.042-1.873-.134-2.66-.728a2.664 2.664 0 01-1.02-1.73c-.104-.625.02-1.22.322-1.77.402-.73 1.018-1.19 1.8-1.426.478-.144.97-.2 1.47-.2.34 0 .68.03 1.018.1.216.045.426.11.64.17.05.013.1.02.152.027v-4.334l-.006-.062c-.03-.35-.01-.7.11-1.038.157-.47.49-.817.93-1.012.195-.086.4-.14.61-.17.263-.04.527-.03.79-.03h.005l.09.002.08.004v4.088z"/>
                                      </svg>
                                      Apple Music
                                    </label>
                                    <Input
                                      placeholder="https://music.apple.com/artist/..."
                                      value={appleMusicArtistUrl}
                                      onChange={(e) => setAppleMusicArtistUrl(e.target.value)}
                                      className="h-12"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Мова метаданих */}
                          <FormField
                            control={form.control}
                            name="language"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  * {t('newRelease.metadataStep.metadataLanguage')}
                                  <InfoTooltip content={fieldTooltips.language} />
                                </FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger 
                                      data-testid="language-select" 
                                      className={`h-12 ${hasAttemptedSubmit && !field.value ? 'border-red-500 focus:border-red-600' : ''}`}
                                    >
                                      <SelectValue placeholder={t('newRelease.metadataStep.selectLanguage')} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="ukrainian">{t('newRelease.languages.ukrainian')}</SelectItem>
                                    <SelectItem value="english">{t('newRelease.languages.english')}</SelectItem>
                                    <SelectItem value="polish">{t('newRelease.languages.polish')}</SelectItem>
                                    <SelectItem value="german">{t('newRelease.languages.german')}</SelectItem>
                                    <SelectItem value="french">{t('newRelease.languages.french')}</SelectItem>
                                    <SelectItem value="spanish">{t('newRelease.languages.spanish')}</SelectItem>
                                    <SelectItem value="russian">{t('newRelease.languages.russian')}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Назва альбому */}
                          <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  * {t('newRelease.metadataStep.albumName')}
                                  <InfoTooltip content={fieldTooltips.title} />
                                </FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="" 
                                    {...field} 
                                    data-testid="release-title" 
                                    className={`h-12 ${hasAttemptedSubmit && !field.value ? 'border-red-500 focus:border-red-600' : ''}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Версія альбому */}
                          <FormField
                            control={form.control}
                            name="albumVersion"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {t('newRelease.metadataStep.albumVersion')} ({t('newRelease.metadataStep.optional')})
                                  <InfoTooltip content={fieldTooltips.albumVersion} />
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="" {...field} data-testid="album-version" className="h-12" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Жанри у дві колонки */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Головний жанр */}
                            <FormField
                              control={form.control}
                              name="primaryGenre"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    * {t('newRelease.metadataStep.mainGenre')}
                                    <InfoTooltip content={fieldTooltips.primaryGenre} />
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger 
                                        data-testid="primary-genre-select" 
                                        className={`h-12 ${hasAttemptedSubmit && !field.value ? 'border-red-500 focus:border-red-600' : ''}`}
                                      >
                                        <SelectValue placeholder={t('newRelease.genres.pop')} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="alternative">Alternative</SelectItem>
                                      <SelectItem value="blues">Blues</SelectItem>
                                      <SelectItem value="brazilian">Brazilian</SelectItem>
                                      <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                                      <SelectItem value="chill-out">Chill Out</SelectItem>
                                      <SelectItem value="christian">Christian</SelectItem>
                                      <SelectItem value="christian-gospel">Christian & Gospel</SelectItem>
                                      <SelectItem value="christian-metal">Christian Metal</SelectItem>
                                      <SelectItem value="christian-pop">Christian Pop</SelectItem>
                                      <SelectItem value="christian-rap">Christian Rap</SelectItem>
                                      <SelectItem value="christian-rap-hiphop">Christian Rap/Hip-Hop</SelectItem>
                                      <SelectItem value="christian-rock">Christian Rock</SelectItem>
                                      <SelectItem value="classic-rock">Classic Rock</SelectItem>
                                      <SelectItem value="country-rock">Country Rock</SelectItem>
                                      <SelectItem value="dance">Dance</SelectItem>
                                      <SelectItem value="electric-blues">Electric Blues</SelectItem>
                                      <SelectItem value="electro">Electro</SelectItem>
                                      <SelectItem value="electronic">Electronic</SelectItem>
                                      <SelectItem value="electro-pop">Electro Pop</SelectItem>
                                      <SelectItem value="experimental">Experimental</SelectItem>
                                      <SelectItem value="folk">Folk</SelectItem>
                                      <SelectItem value="funk">Funk</SelectItem>
                                      <SelectItem value="grunge">Grunge</SelectItem>
                                      <SelectItem value="hard-rock">Hard Rock</SelectItem>
                                      <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                                      <SelectItem value="house">House</SelectItem>
                                      <SelectItem value="indie-dance">Indie Dance</SelectItem>
                                      <SelectItem value="indie-rock">Indie Rock</SelectItem>
                                      <SelectItem value="instrumental">Instrumental</SelectItem>
                                      <SelectItem value="jazz">Jazz</SelectItem>
                                      <SelectItem value="latin">Latin</SelectItem>
                                      <SelectItem value="metal">Metal</SelectItem>
                                      <SelectItem value="new-wave">New Wave</SelectItem>
                                      <SelectItem value="pop">Pop</SelectItem>
                                      <SelectItem value="pop-dance">Pop Dance</SelectItem>
                                      <SelectItem value="pop-rock">Pop Rock</SelectItem>
                                      <SelectItem value="punk">Punk</SelectItem>
                                      <SelectItem value="reggae">Reggae</SelectItem>
                                      <SelectItem value="rnb">R'n'B</SelectItem>
                                      <SelectItem value="rock">Rock</SelectItem>
                                      <SelectItem value="shoegazing">Shoegazing</SelectItem>
                                      <SelectItem value="smooth">Smooth</SelectItem>
                                      <SelectItem value="soul">Soul</SelectItem>
                                      <SelectItem value="synthwave">Synthwave</SelectItem>
                                      <SelectItem value="trance">Trance</SelectItem>
                                      <SelectItem value="world">World</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Вторинний жанр */}
                            <FormField
                              control={form.control}
                              name="secondaryGenre"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {t('newRelease.metadataStep.secondaryGenre')} ({t('newRelease.metadataStep.optional')})
                                    <InfoTooltip content={fieldTooltips.secondaryGenre} />
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="secondary-genre-select" className="h-12">
                                        <SelectValue placeholder={t('newRelease.genres.hiphop')} />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="alternative">Alternative</SelectItem>
                                      <SelectItem value="blues">Blues</SelectItem>
                                      <SelectItem value="brazilian">Brazilian</SelectItem>
                                      <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                                      <SelectItem value="chill-out">Chill Out</SelectItem>
                                      <SelectItem value="christian">Christian</SelectItem>
                                      <SelectItem value="christian-gospel">Christian & Gospel</SelectItem>
                                      <SelectItem value="christian-metal">Christian Metal</SelectItem>
                                      <SelectItem value="christian-pop">Christian Pop</SelectItem>
                                      <SelectItem value="christian-rap">Christian Rap</SelectItem>
                                      <SelectItem value="christian-rap-hiphop">Christian Rap/Hip-Hop</SelectItem>
                                      <SelectItem value="christian-rock">Christian Rock</SelectItem>
                                      <SelectItem value="classic-rock">Classic Rock</SelectItem>
                                      <SelectItem value="country-rock">Country Rock</SelectItem>
                                      <SelectItem value="dance">Dance</SelectItem>
                                      <SelectItem value="electric-blues">Electric Blues</SelectItem>
                                      <SelectItem value="electro">Electro</SelectItem>
                                      <SelectItem value="electronic">Electronic</SelectItem>
                                      <SelectItem value="electro-pop">Electro Pop</SelectItem>
                                      <SelectItem value="experimental">Experimental</SelectItem>
                                      <SelectItem value="folk">Folk</SelectItem>
                                      <SelectItem value="funk">Funk</SelectItem>
                                      <SelectItem value="grunge">Grunge</SelectItem>
                                      <SelectItem value="hard-rock">Hard Rock</SelectItem>
                                      <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                                      <SelectItem value="house">House</SelectItem>
                                      <SelectItem value="indie-dance">Indie Dance</SelectItem>
                                      <SelectItem value="indie-rock">Indie Rock</SelectItem>
                                      <SelectItem value="instrumental">Instrumental</SelectItem>
                                      <SelectItem value="jazz">Jazz</SelectItem>
                                      <SelectItem value="latin">Latin</SelectItem>
                                      <SelectItem value="metal">Metal</SelectItem>
                                      <SelectItem value="new-wave">New Wave</SelectItem>
                                      <SelectItem value="pop">Pop</SelectItem>
                                      <SelectItem value="pop-dance">Pop Dance</SelectItem>
                                      <SelectItem value="pop-rock">Pop Rock</SelectItem>
                                      <SelectItem value="punk">Punk</SelectItem>
                                      <SelectItem value="reggae">Reggae</SelectItem>
                                      <SelectItem value="rnb">R'n'B</SelectItem>
                                      <SelectItem value="rock">Rock</SelectItem>
                                      <SelectItem value="shoegazing">Shoegazing</SelectItem>
                                      <SelectItem value="smooth">Smooth</SelectItem>
                                      <SelectItem value="soul">Soul</SelectItem>
                                      <SelectItem value="synthwave">Synthwave</SelectItem>
                                      <SelectItem value="trance">Trance</SelectItem>
                                      <SelectItem value="world">World</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Подаватимеш заявку на пітчинг? */}
                          <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                            <Label className="text-base font-semibold">
                              * Подаватимеш заявку на пітчинг?
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Пітчинг — це можливість потрапити до редакційних плейлистів стрімінгових платформ
                            </p>
                            <div className="flex gap-4">
                              <Button
                                type="button"
                                variant={willPitch === true ? "default" : "outline"}
                                className={willPitch === true ? "bg-green-600 hover:bg-green-700" : ""}
                                onClick={() => setWillPitch(true)}
                              >
                                Так
                              </Button>
                              <Button
                                type="button"
                                variant={willPitch === false ? "default" : "outline"}
                                className={willPitch === false ? "bg-primary" : ""}
                                onClick={() => setWillPitch(false)}
                              >
                                Ні
                              </Button>
                            </div>
                            {willPitch !== null && (
                              <div className="mt-3 p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
                                <p className="text-sm text-blue-400">
                                  {willPitch 
                                    ? `Обирай дату релізу не раніше ніж ${format(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), 'dd.MM.yyyy')} (3 тижні від сьогодні)`
                                    : `Обирай дату релізу не раніше ніж ${format(new Date(Date.now() + ((!organizationHasReleases && isDebut === true) ? 10 : 5) * 24 * 60 * 60 * 1000), 'dd.MM.yyyy')} (${(!organizationHasReleases && isDebut === true) ? '10' : '5'} днів від сьогодні)`
                                  }
                                </p>
                              </div>
                            )}
                            {hasAttemptedSubmit && willPitch === null && (
                              <p className="text-sm text-red-500">Оберіть чи плануєте подавати на пітчинг</p>
                            )}
                          </div>

                          {/* Дати у дві колонки */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Дата першого випуску */}
                            <FormField
                              control={form.control}
                              name="originalReleaseDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    * {t('newRelease.metadataStep.originalReleaseDate')}
                                    <InfoTooltip content={fieldTooltips.originalReleaseDate} />
                                  </FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="date" 
                                      {...field} 
                                      onChange={(e) => {
                                        field.onChange(e);
                                        const selectedDate = e.target.value;
                                        if (selectedDate) {
                                          const today = new Date();
                                          today.setHours(0, 0, 0, 0);
                                          const selected = new Date(selectedDate);
                                          if (selected > today) {
                                            form.setValue("releaseDate", selectedDate);
                                          }
                                        }
                                      }}
                                      data-testid="original-release-date" 
                                      className={`h-12 [color-scheme:dark] ${hasAttemptedSubmit && !field.value ? 'border-red-500 focus:border-red-600' : ''}`}
                                      placeholder={t('newRelease.metadataStep.datePlaceholder')}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Дата майбутнього релізу */}
                            <FormField
                              control={form.control}
                              name="releaseDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    * {t('newRelease.metadataStep.futureReleaseDate')}
                                    <InfoTooltip content={fieldTooltips.releaseDate} />
                                  </FormLabel>
                                  <div className="relative">
                                    <FormControl>
                                      <Input 
                                        type="date" 
                                        {...field} 
                                        data-testid="release-date" 
                                        className="h-12 pr-10 [color-scheme:dark]" 
                                        placeholder={t('newRelease.metadataStep.datePlaceholder')}
                                      />
                                    </FormControl>
                                    <Clock 
                                      className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-white cursor-pointer hover:text-gray-300 transition-colors"
                                      onClick={() => setShowTimeZonePicker(true)}
                                    />
                                  </div>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Саб-лейбл - показувати тільки для лейблів */}
                          {user?.organizations?.some(org => org.type === "LABEL") && (
                            <FormField
                              control={form.control}
                              name="subLabel"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    {t('newRelease.metadataStep.subLabel')} ({t('newRelease.metadataStep.optional')})
                                    <InfoTooltip content={fieldTooltips.subLabel} />
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="sub-label-select" className="h-12">
                                        <SelectValue placeholder="" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="label1">Label 1</SelectItem>
                                      <SelectItem value="label2">Label 2</SelectItem>
                                      <SelectItem value="label3">Label 3</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {/* UPC */}
                          <FormField
                            control={form.control}
                            name="upc"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  * {t('newRelease.metadataStep.upc')}
                                  <InfoTooltip content={fieldTooltips.upc} />
                                </FormLabel>
                                <div className="flex flex-col sm:flex-row gap-3">
                                  <FormControl>
                                    <Input 
                                      placeholder={upcRequested ? t('newRelease.metadataStep.generating') : t('newRelease.metadataStep.upcPlaceholder')} 
                                      {...field} 
                                      data-testid="upc-input"
                                      disabled={upcRequested && user?.role !== "ADMIN"}
                                      className={`flex-1 h-12 ${hasAttemptedSubmit && !field.value ? 'border-red-500 focus:border-red-600' : ''}`}
                                    />
                                  </FormControl>
                                  <Button 
                                    type="button" 
                                    onClick={handleGenerateUpc}
                                    disabled={upcRequested}
                                    data-testid="generate-upc-button"
                                    className="h-12 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 whitespace-nowrap"
                                  >
                                    {upcRequested ? t('newRelease.metadataStep.generating') : t('newRelease.metadataStep.generateUpc')}
                                  </Button>
                                </div>
                                {upcRequested && user?.role !== "ADMIN" && (
                                  <p className="text-sm text-blue-600">{t('newRelease.metadataStep.upcGenerated')}</p>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {/* Виконавці */}
                          <div className="space-y-4">
                            <div className="flex justify-between items-center">
                              <h3 className="text-lg font-medium">{t('newRelease.metadataStep.performers')}</h3>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addPerformer}
                                disabled={(form.watch("performers") || []).length >= 5}
                                data-testid="add-performer-button"
                                className="flex items-center gap-2"
                              >
                                <Plus className="h-4 w-4" />
                                {t('newRelease.metadataStep.addPerformer')}
                              </Button>
                            </div>
                            
                            {(form.watch("performers") || []).map((_, index) => (
                              <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg relative">
                                {index > 0 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removePerformer(index)}
                                    className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                    data-testid={`remove-performer-${index}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                                
                                {/* Ім'я виконавця */}
                                <FormField
                                  control={form.control}
                                  name={`performers.${index}.name`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>{t('newRelease.metadataStep.performerName')}</FormLabel>
                                      <FormControl>
                                        <Input 
                                          placeholder={t('newRelease.metadataStep.performerName')} 
                                          {...field} 
                                          data-testid={`performer-name-${index}`}
                                          className="h-12"
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Посада виконавця */}
                                <FormField
                                  control={form.control}
                                  name={`performers.${index}.role`}
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>{t('newRelease.metadataStep.role')}</FormLabel>
                                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                          <SelectTrigger 
                                            data-testid={`performer-role-${index}`}
                                            className="h-12"
                                          >
                                            <SelectValue placeholder={t('newRelease.metadataStep.selectRole')} />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="main_performer">{ROLE_LABELS.main_performer}</SelectItem>
                                          <SelectItem value="featuring">{ROLE_LABELS.featuring}</SelectItem>
                                          <SelectItem value="remixer">{ROLE_LABELS.remixer}</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {/* Кнопки навігації */}
                <div className="flex justify-between">
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={() => setCurrentStep("files")}
                    data-testid="back-button"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('newRelease.buttons.back')}
                  </Button>
                  <Button 
                    type="submit"
                    data-testid="submit-metadata-button"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {t('newRelease.buttons.continueToTracks')}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {currentStep === "tracks" && (
          <div className="space-y-6">
            {/* Навігація між треками */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h2 className="text-xl font-semibold">{t('newRelease.tracksStep.trackMetadata')}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {audioFiles.map((_, index) => (
                  <Button
                    key={index}
                    variant={currentTrackIndex === index ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setCurrentTrackIndex(index);
                      // Reset to "info" tab when switching tracks (or if lyrics tab not available)
                      if (tracksMetadata[index]?.hasNoLyrics && activeTrackTab === "lyrics") {
                        setActiveTrackTab("info");
                      }
                    }}
                    data-testid={`track-nav-${index}`}
                  >
                    {t('newRelease.tracksStep.trackNumber')} {index + 1}
                  </Button>
                ))}
              </div>
            </div>

            {/* Кнопка копіювання з першого треку */}
            {audioFiles.length > 1 && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyFromFirstTrack}
                  className="gap-2"
                  data-testid="copy-from-first-track"
                >
                  <Copy className="h-4 w-4" />
                  Копіювати з 1-го треку
                </Button>
              </div>
            )}

            {/* Вкладки для поточного треку */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  {audioFiles[currentTrackIndex]?.file?.name || audioFiles[currentTrackIndex]?.fileName || `${t('newRelease.tracksStep.trackNumber')} ${currentTrackIndex + 1}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activeTrackTab} onValueChange={setActiveTrackTab} className="w-full">
                  <TabsList className="flex flex-wrap justify-center md:grid md:grid-cols-3 w-full gap-2">
                    <TabsTrigger 
                      value="info" 
                      data-testid="info-tab" 
                      className={`flex-1 min-w-[120px] ${
                        trackValidationErrors[currentTrackIndex]?.title ||
                        trackValidationErrors[currentTrackIndex]?.primaryGenre ||
                        trackValidationErrors[currentTrackIndex]?.language ||
                        trackValidationErrors[currentTrackIndex]?.explicitContent ||
                        trackValidationErrors[currentTrackIndex]?.aiGenerated
                          ? 'border-2 border-red-500' 
                          : ''
                      }`}
                    >
                      {t('newRelease.tracksStep.trackMetadata')}
                    </TabsTrigger>
                    <TabsTrigger 
                      value="performers" 
                      data-testid="performers-tab" 
                      className={`flex-1 min-w-[120px] ${
                        trackValidationErrors[currentTrackIndex]?.composer ||
                        trackValidationErrors[currentTrackIndex]?.lyricist ||
                        trackValidationErrors[currentTrackIndex]?.main_performer ||
                        trackValidationErrors[currentTrackIndex]?.arranger ||
                        trackValidationErrors[currentTrackIndex]?.mixing_engineer ||
                        trackValidationErrors[currentTrackIndex]?.mastering_engineer ||
                        trackValidationErrors[currentTrackIndex]?.cover_designer ||
                        Object.keys(trackValidationErrors[currentTrackIndex] || {}).some(key => key.startsWith('contributor_'))
                          ? 'border-2 border-red-500' 
                          : ''
                      }`}
                    >
                      {t('newRelease.tracksStep.contributors')}
                    </TabsTrigger>
                    {!tracksMetadata[currentTrackIndex]?.hasNoLyrics && (
                      <TabsTrigger 
                        value="lyrics" 
                        data-testid="lyrics-tab" 
                        className={`flex-1 min-w-[120px] ${
                          trackValidationErrors[currentTrackIndex]?.lyrics 
                            ? 'border-2 border-red-500' 
                            : ''
                        }`}
                      >
                        {t('newRelease.tracksStep.lyrics')}
                      </TabsTrigger>
                    )}
                  </TabsList>
                  
                  <TabsContent value="info" className="space-y-6 mt-12">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Назва пісні */}
                      <div className="md:col-span-2">
                        <Label htmlFor="track-title">
                          * {t('newRelease.tracksStep.songTitle')}
                          <InfoTooltip content={fieldTooltips.trackTitle} />
                        </Label>
                        <Input
                          id="track-title"
                          value={tracksMetadata[currentTrackIndex]?.title || ""}
                          onChange={(e) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].title = e.target.value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                          className={`h-12 ${trackValidationErrors[currentTrackIndex]?.title ? 'border-red-500 focus:border-red-600' : ''}`}
                          data-testid="track-title-input"
                        />
                        {trackValidationErrors[currentTrackIndex]?.title && (
                          <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex].title}</p>
                        )}
                      </div>

                      {/* Версія пісні */}
                      <div className="md:col-span-2">
                        <Label htmlFor="track-version">
                          {t('newRelease.tracksStep.version')} ({t('newRelease.metadataStep.optional')})
                          <InfoTooltip content={fieldTooltips.trackVersion} />
                        </Label>
                        <Input
                          id="track-version"
                          value={tracksMetadata[currentTrackIndex]?.version || ""}
                          onChange={(e) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].version = e.target.value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                          className="h-12"
                          data-testid="track-version-input"
                        />
                      </div>

                      {/* Жанри */}
                      <div>
                        <Label htmlFor="track-primary-genre">
                          * {t('newRelease.metadataStep.mainGenre')}
                          <InfoTooltip content={fieldTooltips.trackPrimaryGenre} />
                        </Label>
                        <Select
                          value={tracksMetadata[currentTrackIndex]?.primaryGenre || ""}
                          onValueChange={(value) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].primaryGenre = value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                        >
                          <SelectTrigger className={`h-12 ${trackValidationErrors[currentTrackIndex]?.primaryGenre ? 'border-red-500 focus:border-red-600' : ''}`} data-testid="track-primary-genre">
                            <SelectValue placeholder={t('newRelease.genres.pop')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alternative">Alternative</SelectItem>
                            <SelectItem value="blues">Blues</SelectItem>
                            <SelectItem value="brazilian">Brazilian</SelectItem>
                            <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                            <SelectItem value="chill-out">Chill Out</SelectItem>
                            <SelectItem value="christian">Christian</SelectItem>
                            <SelectItem value="christian-gospel">Christian & Gospel</SelectItem>
                            <SelectItem value="christian-metal">Christian Metal</SelectItem>
                            <SelectItem value="christian-pop">Christian Pop</SelectItem>
                            <SelectItem value="christian-rap">Christian Rap</SelectItem>
                            <SelectItem value="christian-rap-hiphop">Christian Rap/Hip-Hop</SelectItem>
                            <SelectItem value="christian-rock">Christian Rock</SelectItem>
                            <SelectItem value="classic-rock">Classic Rock</SelectItem>
                            <SelectItem value="country-rock">Country Rock</SelectItem>
                            <SelectItem value="dance">Dance</SelectItem>
                            <SelectItem value="electric-blues">Electric Blues</SelectItem>
                            <SelectItem value="electro">Electro</SelectItem>
                            <SelectItem value="electronic">Electronic</SelectItem>
                            <SelectItem value="electro-pop">Electro Pop</SelectItem>
                            <SelectItem value="experimental">Experimental</SelectItem>
                            <SelectItem value="folk">Folk</SelectItem>
                            <SelectItem value="funk">Funk</SelectItem>
                            <SelectItem value="grunge">Grunge</SelectItem>
                            <SelectItem value="hard-rock">Hard Rock</SelectItem>
                            <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                            <SelectItem value="house">House</SelectItem>
                            <SelectItem value="indie-dance">Indie Dance</SelectItem>
                            <SelectItem value="indie-rock">Indie Rock</SelectItem>
                            <SelectItem value="instrumental">Instrumental</SelectItem>
                            <SelectItem value="jazz">Jazz</SelectItem>
                            <SelectItem value="latin">Latin</SelectItem>
                            <SelectItem value="metal">Metal</SelectItem>
                            <SelectItem value="new-wave">New Wave</SelectItem>
                            <SelectItem value="pop">Pop</SelectItem>
                            <SelectItem value="pop-dance">Pop Dance</SelectItem>
                            <SelectItem value="pop-rock">Pop Rock</SelectItem>
                            <SelectItem value="punk">Punk</SelectItem>
                            <SelectItem value="reggae">Reggae</SelectItem>
                            <SelectItem value="rnb">R'n'B</SelectItem>
                            <SelectItem value="rock">Rock</SelectItem>
                            <SelectItem value="shoegazing">Shoegazing</SelectItem>
                            <SelectItem value="smooth">Smooth</SelectItem>
                            <SelectItem value="soul">Soul</SelectItem>
                            <SelectItem value="synthwave">Synthwave</SelectItem>
                            <SelectItem value="trance">Trance</SelectItem>
                            <SelectItem value="world">World</SelectItem>
                          </SelectContent>
                        </Select>
                        {trackValidationErrors[currentTrackIndex]?.primaryGenre && (
                          <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex].primaryGenre}</p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="track-secondary-genre">
                          {t('newRelease.metadataStep.secondaryGenre')} ({t('newRelease.metadataStep.optional')})
                          <InfoTooltip content={fieldTooltips.trackSecondaryGenre} />
                        </Label>
                        <Select
                          value={tracksMetadata[currentTrackIndex]?.secondaryGenre || ""}
                          onValueChange={(value) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].secondaryGenre = value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                        >
                          <SelectTrigger className="h-12" data-testid="track-secondary-genre">
                            <SelectValue placeholder={t('newRelease.genres.hiphop')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alternative">Alternative</SelectItem>
                            <SelectItem value="blues">Blues</SelectItem>
                            <SelectItem value="brazilian">Brazilian</SelectItem>
                            <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                            <SelectItem value="chill-out">Chill Out</SelectItem>
                            <SelectItem value="christian">Christian</SelectItem>
                            <SelectItem value="christian-gospel">Christian & Gospel</SelectItem>
                            <SelectItem value="christian-metal">Christian Metal</SelectItem>
                            <SelectItem value="christian-pop">Christian Pop</SelectItem>
                            <SelectItem value="christian-rap">Christian Rap</SelectItem>
                            <SelectItem value="christian-rap-hiphop">Christian Rap/Hip-Hop</SelectItem>
                            <SelectItem value="christian-rock">Christian Rock</SelectItem>
                            <SelectItem value="classic-rock">Classic Rock</SelectItem>
                            <SelectItem value="country-rock">Country Rock</SelectItem>
                            <SelectItem value="dance">Dance</SelectItem>
                            <SelectItem value="electric-blues">Electric Blues</SelectItem>
                            <SelectItem value="electro">Electro</SelectItem>
                            <SelectItem value="electronic">Electronic</SelectItem>
                            <SelectItem value="electro-pop">Electro Pop</SelectItem>
                            <SelectItem value="experimental">Experimental</SelectItem>
                            <SelectItem value="folk">Folk</SelectItem>
                            <SelectItem value="funk">Funk</SelectItem>
                            <SelectItem value="grunge">Grunge</SelectItem>
                            <SelectItem value="hard-rock">Hard Rock</SelectItem>
                            <SelectItem value="hip-hop">Hip-Hop/Rap</SelectItem>
                            <SelectItem value="house">House</SelectItem>
                            <SelectItem value="indie-dance">Indie Dance</SelectItem>
                            <SelectItem value="indie-rock">Indie Rock</SelectItem>
                            <SelectItem value="instrumental">Instrumental</SelectItem>
                            <SelectItem value="jazz">Jazz</SelectItem>
                            <SelectItem value="latin">Latin</SelectItem>
                            <SelectItem value="metal">Metal</SelectItem>
                            <SelectItem value="new-wave">New Wave</SelectItem>
                            <SelectItem value="pop">Pop</SelectItem>
                            <SelectItem value="pop-dance">Pop Dance</SelectItem>
                            <SelectItem value="pop-rock">Pop Rock</SelectItem>
                            <SelectItem value="punk">Punk</SelectItem>
                            <SelectItem value="reggae">Reggae</SelectItem>
                            <SelectItem value="rnb">R'n'B</SelectItem>
                            <SelectItem value="rock">Rock</SelectItem>
                            <SelectItem value="shoegazing">Shoegazing</SelectItem>
                            <SelectItem value="smooth">Smooth</SelectItem>
                            <SelectItem value="soul">Soul</SelectItem>
                            <SelectItem value="synthwave">Synthwave</SelectItem>
                            <SelectItem value="trance">Trance</SelectItem>
                            <SelectItem value="world">World</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Відвертий вміст */}
                      <div>
                        <Label>
                          * {t('newRelease.tracksStep.explicitContent')}
                          <InfoTooltip content={fieldTooltips.explicitContent} />
                        </Label>
                        <div className={`flex gap-4 mt-2 ${trackValidationErrors[currentTrackIndex]?.explicitContent ? 'p-2 border-2 border-red-500 rounded-md' : ''}`}>
                          {[
                            { value: "yes", label: t('newRelease.tracksStep.yes') },
                            { value: "no", label: t('newRelease.tracksStep.no') },
                            { value: "censored", label: t('newRelease.tracksStep.censored') }
                          ].map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              variant={tracksMetadata[currentTrackIndex]?.explicitContent === option.value ? "default" : "outline"}
                              onClick={() => {
                                const newTracksMetadata = [...tracksMetadata];
                                if (newTracksMetadata[currentTrackIndex]) {
                                  newTracksMetadata[currentTrackIndex].explicitContent = option.value as "yes" | "no" | "censored";
                                  setTracksMetadata(newTracksMetadata);
                                }
                              }}
                              data-testid={`explicit-${option.value}`}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                        {trackValidationErrors[currentTrackIndex]?.explicitContent && (
                          <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex].explicitContent}</p>
                        )}
                      </div>

                      {/* AI Generated */}
                      <div>
                        <Label>
                          * {t('newRelease.tracksStep.aiGenerated')} 🤖
                          <InfoTooltip content={fieldTooltips.aiGenerated} />
                        </Label>
                        <div className={`flex gap-4 mt-2 ${trackValidationErrors[currentTrackIndex]?.aiGenerated ? 'p-2 border-2 border-red-500 rounded-md' : ''}`}>
                          {[
                            { value: true, label: t('newRelease.tracksStep.yes') },
                            { value: false, label: t('newRelease.tracksStep.no') }
                          ].map((option) => (
                            <Button
                              key={option.value.toString()}
                              type="button"
                              variant={tracksMetadata[currentTrackIndex]?.aiGenerated === option.value ? "default" : "outline"}
                              onClick={() => {
                                const newTracksMetadata = [...tracksMetadata];
                                if (newTracksMetadata[currentTrackIndex]) {
                                  newTracksMetadata[currentTrackIndex].aiGenerated = option.value;
                                  setTracksMetadata(newTracksMetadata);
                                }
                              }}
                              data-testid={`ai-generated-${option.value}`}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                        {trackValidationErrors[currentTrackIndex]?.aiGenerated && (
                          <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex].aiGenerated}</p>
                        )}
                      </div>

                      {/* TikTok Preview Date */}
                      <div className="md:col-span-1">
                        <Label>
                          {t('newRelease.tracksStep.tiktokPreviewDate')} ({t('newRelease.metadataStep.optional')})
                          <InfoTooltip content={t('newRelease.tooltips.tiktokPreviewDate', { minDate: format(addDays(new Date(), 4), 'dd.MM.yyyy') })} />
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left font-normal h-12 mt-2"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {tracksMetadata[currentTrackIndex]?.tiktokPreviewDate
                                ? format(parseISO(tracksMetadata[currentTrackIndex].tiktokPreviewDate!), 'dd.MM.yyyy')
                                : t('newRelease.metadataStep.selectDate')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={tracksMetadata[currentTrackIndex]?.tiktokPreviewDate 
                                ? parseISO(tracksMetadata[currentTrackIndex].tiktokPreviewDate!) 
                                : undefined}
                              onSelect={(date) => {
                                const newTracksMetadata = [...tracksMetadata];
                                if (newTracksMetadata[currentTrackIndex]) {
                                  newTracksMetadata[currentTrackIndex].tiktokPreviewDate = date ? format(date, 'yyyy-MM-dd') : undefined;
                                  setTracksMetadata(newTracksMetadata);
                                }
                              }}
                              disabled={(date) => {
                                const minDate = startOfDay(addDays(new Date(), 4));
                                const releaseDateStr = form.getValues('releaseDate');
                                const maxDate = releaseDateStr ? startOfDay(parseISO(releaseDateStr)) : undefined;
                                const checkDate = startOfDay(date);
                                return checkDate < minDate || (maxDate ? checkDate >= maxDate : false);
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* Час початку прослуховувань */}
                      <div className="md:col-span-1">
                        <Label htmlFor="preview-start">
                          {t('newRelease.tracksStep.previewStart')} ({t('newRelease.metadataStep.optional')})
                          <InfoTooltip content={fieldTooltips.previewStartTime} />
                        </Label>
                        <Input
                          id="preview-start"
                          value={tracksMetadata[currentTrackIndex]?.previewStartTime || "00:00"}
                          onChange={(e) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].previewStartTime = e.target.value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                          placeholder="00:50"
                          className="h-12 mt-2"
                          data-testid="preview-start-input"
                        />
                      </div>

                      {/* ISRC */}
                      <div className="md:col-span-2">
                        <Label htmlFor="track-isrc">
                          * {t('newRelease.tracksStep.isrc')}
                          <InfoTooltip content={fieldTooltips.isrc} />
                        </Label>
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Input
                            id="track-isrc"
                            value={tracksMetadata[currentTrackIndex]?.isrc || ""}
                            onChange={(e) => {
                              const newTracksMetadata = [...tracksMetadata];
                              if (newTracksMetadata[currentTrackIndex]) {
                                newTracksMetadata[currentTrackIndex].isrc = e.target.value;
                                setTracksMetadata(newTracksMetadata);
                              }
                            }}
                            placeholder={isrcRequested[currentTrackIndex] ? t('newRelease.metadataStep.generating') : t('newRelease.tracksStep.isrcPlaceholder')}
                            disabled={isrcRequested[currentTrackIndex] && user?.role !== "ADMIN"}
                            className={`flex-1 h-12 ${trackValidationErrors[currentTrackIndex]?.isrc ? "border-red-500" : ""}`}
                            data-testid="track-isrc-input"
                          />
                          <Button
                            type="button"
                            onClick={() => handleGenerateIsrc(currentTrackIndex)}
                            disabled={isrcRequested[currentTrackIndex]}
                            className="h-12 bg-blue-600 hover:bg-blue-700 text-white px-4 sm:px-6 whitespace-nowrap"
                            data-testid="generate-isrc-button"
                          >
                            {isrcRequested[currentTrackIndex] ? t('newRelease.metadataStep.generating') : t('newRelease.tracksStep.generateIsrc')}
                          </Button>
                        </div>
                        {trackValidationErrors[currentTrackIndex]?.isrc && (
                          <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex].isrc}</p>
                        )}
                        {isrcRequested[currentTrackIndex] && user?.role !== "ADMIN" && (
                          <p className="text-sm text-blue-600 mt-1">{t('newRelease.tracksStep.isrcGenerated')}</p>
                        )}
                      </div>

                      {/* ISWC */}
                      <div className="md:col-span-2">
                        <Label htmlFor="track-iswc">
                          {t('newRelease.tracksStep.iswc')} ({t('newRelease.metadataStep.optional')})
                          <InfoTooltip content={fieldTooltips.iswc} />
                        </Label>
                        <Input
                          id="track-iswc"
                          value={tracksMetadata[currentTrackIndex]?.iswc || ""}
                          onChange={(e) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].iswc = e.target.value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                          className="h-12"
                          data-testid="track-iswc-input"
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="performers" className="space-y-6 mt-12">
                    {/* Performers Section */}
                    <div className="space-y-4">
                      <h4 className="text-lg font-medium">{t('newRelease.metadataStep.performers')}</h4>
                      
                      {(tracksMetadata[currentTrackIndex]?.performers || []).map((performer, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg relative">
                          {index > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeTrackPerformer(currentTrackIndex, index)}
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
                              onChange={(e) => {
                                const newTracksMetadata = [...tracksMetadata];
                                if (newTracksMetadata[currentTrackIndex]?.performers?.[index]) {
                                  newTracksMetadata[currentTrackIndex].performers[index].name = e.target.value;
                                  setTracksMetadata(newTracksMetadata);
                                }
                              }}
                              placeholder={performer.role === 'main_performer' 
                                ? t('newRelease.tracksStep.pseudonym')
                                : t('newRelease.metadataStep.performerName')
                              }
                              className="h-12"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`performer-role-${index}`}>{t('newRelease.metadataStep.role')}</Label>
                            {index === 0 ? (
                              <div className="h-12 px-3 py-2 bg-muted/30 rounded-md border flex items-center">
                                <span className="text-sm">{ROLE_LABELS.main_performer}</span>
                              </div>
                            ) : (
                              <Select
                                value={performer.role}
                                onValueChange={(value) => {
                                  const newTracksMetadata = [...tracksMetadata];
                                  if (newTracksMetadata[currentTrackIndex]?.performers?.[index]) {
                                    newTracksMetadata[currentTrackIndex].performers[index].role = value;
                                    setTracksMetadata(newTracksMetadata);
                                  }
                                }}
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
                        onClick={() => addTrackPerformer(currentTrackIndex)}
                        disabled={(tracksMetadata[currentTrackIndex]?.performers || []).length >= 5}
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
                            id="no-music"
                            checked={tracksMetadata[currentTrackIndex]?.hasNoMusic || false}
                            onCheckedChange={(checked) => {
                              const newTracksMetadata = [...tracksMetadata];
                              if (newTracksMetadata[currentTrackIndex]) {
                                newTracksMetadata[currentTrackIndex].hasNoMusic = !!checked;
                                setTracksMetadata(newTracksMetadata);
                              }
                            }}
                            data-testid="no-music-checkbox"
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor="no-music"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {t('newRelease.tracksStep.hasNoMusic')}
                            </label>
                          </div>
                        </div>
                        
                        <div className="flex items-start space-x-3">
                          <Checkbox 
                            id="no-lyrics"
                            checked={tracksMetadata[currentTrackIndex]?.hasNoLyrics || false}
                            onCheckedChange={(checked) => {
                              const newTracksMetadata = [...tracksMetadata];
                              if (newTracksMetadata[currentTrackIndex]) {
                                newTracksMetadata[currentTrackIndex].hasNoLyrics = !!checked;
                                setTracksMetadata(newTracksMetadata);
                              }
                            }}
                            data-testid="no-lyrics-checkbox"
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor="no-lyrics"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {t('newRelease.tracksStep.hasNoLyrics')}
                            </label>
                          </div>
                        </div>
                      </div>

                    <div className="space-y-4">
                      {(tracksMetadata[currentTrackIndex]?.contributors || []).map((contributor, index) => {
                        // Приховуємо поля composer та arranger якщо hasNoMusic = true
                        if (tracksMetadata[currentTrackIndex]?.hasNoMusic && 
                            (contributor.role === "composer" || contributor.role === "arranger")) {
                          return null;
                        }
                        
                        // Приховуємо поле lyricist якщо hasNoLyrics = true
                        if (tracksMetadata[currentTrackIndex]?.hasNoLyrics && contributor.role === "lyricist") {
                          return null;
                        }
                        
                        // Only allow deletion of optional roles and duplicate required roles
                        // The first occurrence of each required role (initial 7) cannot be deleted
                        const isRequiredRole = REQUIRED_ROLES.includes(contributor.role);
                        const contributorsWithSameRole = (tracksMetadata[currentTrackIndex]?.contributors || []).filter(c => c.role === contributor.role);
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
                                const newTracksMetadata = [...tracksMetadata];
                                if (newTracksMetadata[currentTrackIndex]?.contributors) {
                                  newTracksMetadata[currentTrackIndex].contributors = 
                                    newTracksMetadata[currentTrackIndex].contributors.filter((_, i) => i !== index);
                                  setTracksMetadata(newTracksMetadata);
                                }
                              }}
                              className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                              data-testid={`remove-contributor-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          
                          <div>
                            <Label htmlFor={`contributor-name-${index}`}>
                              {t('newRelease.tracksStep.contributorName')}
                              {(contributor.role === "composer" || contributor.role === "lyricist" || contributor.role === "arranger" || contributor.role === "mixing_engineer" || contributor.role === "mastering_engineer" || contributor.role === "cover_designer") && " *"}
                              <InfoTooltip 
                                content={fieldTooltips.contributorNameOther} 
                              />
                            </Label>
                            <Input
                              id={`contributor-name-${index}`}
                              value={contributor.name}
                              onChange={(e) => {
                                const newTracksMetadata = [...tracksMetadata];
                                if (newTracksMetadata[currentTrackIndex]?.contributors?.[index]) {
                                  newTracksMetadata[currentTrackIndex].contributors[index].name = e.target.value;
                                  setTracksMetadata(newTracksMetadata);
                                }
                              }}
                              className={`h-12 ${trackValidationErrors[currentTrackIndex]?.[`contributor_${index}_name`] ? "border-red-500" : ""}`}
                              data-testid={`contributor-name-${index}`}
                            />
                            {trackValidationErrors[currentTrackIndex]?.[`contributor_${index}_name`] && (
                              <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex][`contributor_${index}_name`]}</p>
                            )}
                          </div>
                          
                          <div>
                            <Label htmlFor={`contributor-role-${index}`}>{t('newRelease.metadataStep.role')}</Label>
                            {isFirstOfRequiredRole ? (
                              <div className="h-12 px-3 py-2 border rounded-md bg-muted/30 flex items-center text-sm">
                                {ROLE_LABELS[contributor.role as keyof typeof ROLE_LABELS]}
                              </div>
                            ) : (
                              <Select
                                value={contributor.role}
                                onValueChange={(value) => {
                                  const newTracksMetadata = [...tracksMetadata];
                                  if (newTracksMetadata[currentTrackIndex]?.contributors?.[index]) {
                                    newTracksMetadata[currentTrackIndex].contributors[index].role = value;
                                    setTracksMetadata(newTracksMetadata);
                                  }
                                }}
                              >
                                <SelectTrigger className="h-12" data-testid={`contributor-role-${index}`}>
                                  <SelectValue placeholder={t('newRelease.metadataStep.selectRole')} />
                                </SelectTrigger>
                                <SelectContent>
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
                          const newTracksMetadata = [...tracksMetadata];
                          if (newTracksMetadata[currentTrackIndex]) {
                            if (!newTracksMetadata[currentTrackIndex].contributors) {
                              newTracksMetadata[currentTrackIndex].contributors = [];
                            }
                            newTracksMetadata[currentTrackIndex].contributors.push({ name: "", role: "musician" });
                            setTracksMetadata(newTracksMetadata);
                          }
                        }}
                        className="flex items-center gap-2"
                        data-testid="add-contributor-button"
                      >
                        <Plus className="h-4 w-4" />
                        {t('newRelease.tracksStep.addContributor')}
                      </Button>
                    </div>
                    </div>
                  </TabsContent>
                  
                  {!tracksMetadata[currentTrackIndex]?.hasNoLyrics && (
                    <TabsContent value="lyrics" className="space-y-6 mt-12">
                      <div>
                        <Label htmlFor="track-lyrics">
                          {t('newRelease.tracksStep.lyrics')} {!tracksMetadata[currentTrackIndex]?.hasNoLyrics && "*"}
                          <InfoTooltip content={fieldTooltips.lyrics} />
                        </Label>
                        <Textarea
                          id="track-lyrics"
                          value={tracksMetadata[currentTrackIndex]?.lyrics || ""}
                          onChange={(e) => {
                            const newTracksMetadata = [...tracksMetadata];
                            if (newTracksMetadata[currentTrackIndex]) {
                              newTracksMetadata[currentTrackIndex].lyrics = e.target.value;
                              setTracksMetadata(newTracksMetadata);
                            }
                          }}
                          placeholder={t('newRelease.tracksStep.lyricsPlaceholder')}
                          className={`min-h-[400px] resize-none ${trackValidationErrors[currentTrackIndex]?.lyrics ? "border-red-500" : ""}`}
                          data-testid="track-lyrics-textarea"
                        />
                        {trackValidationErrors[currentTrackIndex]?.lyrics && (
                          <p className="text-sm text-red-500 mt-1">{trackValidationErrors[currentTrackIndex].lyrics}</p>
                        )}
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>

            {/* Кнопки навігації */}
            <div className="flex justify-between">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setCurrentStep("metadata")}
                data-testid="back-to-metadata-button"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('newRelease.buttons.backToMetadata')}
              </Button>
              <Button 
                onClick={onCompleteTracksMetadata}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="continue-to-territories-button"
              >
                {t('newRelease.buttons.continueToTerritories')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {currentStep === "territories" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  {t('newRelease.territoriesStep.selectTerritories')}
                </CardTitle>
                <CardDescription>
                  {t('newRelease.territoriesStep.selectTerritoriesDesc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Пошук країн */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder={t('newRelease.territoriesStep.searchCountries')}
                    value={territorySearchQuery}
                    onChange={(e) => setTerritorySearchQuery(e.target.value)}
                    className="pl-10 h-12"
                    data-testid="territory-search"
                  />
                </div>

                {/* Списки країн по континентах */}
                <div className="space-y-4">
                  {Object.entries(getFilteredCountries()).map(([continent, countries]) => {
                    const selectedCount = countries.filter(country => selectedTerritories.has(country)).length;
                    const totalCount = countries.length;
                    const allSelected = selectedCount === totalCount;
                    const isExpanded = expandedRegions.has(continent);

                    return (
                      <Collapsible
                        key={continent}
                        open={isExpanded}
                        onOpenChange={() => toggleRegion(continent)}
                      >
                        {/* Заголовок континенту */}
                        <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
                          <CollapsibleTrigger className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity">
                            <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "transform rotate-180" : ""}`} />
                            <span className="text-sm font-medium text-blue-600">
                              {selectedCount}/{totalCount}
                            </span>
                            <h3 className="font-semibold">{t(`newRelease.territoriesStep.continents.${continent.replace(/\s+/g, '')}`)}</h3>
                          </CollapsibleTrigger>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleContinentSelection(continent);
                            }}
                            className="text-blue-600 hover:text-blue-700"
                            data-testid={`select-all-${continent.toLowerCase()}`}
                          >
                            {allSelected ? t('newRelease.territoriesStep.deselectAll') : t('newRelease.territoriesStep.selectAll')}
                            <CheckCircle className={`ml-2 h-4 w-4 ${allSelected ? "text-green-600" : ""}`} />
                          </Button>
                        </div>

                        {/* Сітка країн */}
                        <CollapsibleContent>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
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
                                  data-testid={`territory-${country.toLowerCase().replace(/\s+/g, '-')}`}
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
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>

                {/* Підсумок вибору */}
                <div className="bg-muted/30 p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    {selectedTerritories.size} {t('newRelease.territoriesStep.selectedCount')}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Кнопки навігації */}
            <div className="flex justify-between">
              <Button 
                type="button"
                variant="outline" 
                onClick={() => setCurrentStep("tracks")}
                data-testid="back-to-tracks-button"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('newRelease.buttons.backToTracks')}
              </Button>
              <Button
                type="button"

                onClick={() => setShowSummaryDialog(true)}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="complete-release-button"
              >
                {t('newRelease.buttons.completeRelease')}
                <CheckCircle className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Time Zone Picker Dialog */}
      <Dialog open={showTimeZonePicker} onOpenChange={setShowTimeZonePicker}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('newRelease.metadataStep.releaseTime')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Time Input */}
            <div>
              <Label className="text-sm font-medium mb-2 block">{t('newRelease.metadataStep.releaseTime')}</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={releaseTime}
                  onChange={(e) => setReleaseTime(e.target.value)}
                  className="pl-10 h-12 text-lg"
                />
              </div>
            </div>

            {/* Timezone Select */}
            <div>
              <Label className="text-sm font-medium mb-2 block">{t('newRelease.metadataStep.selectTimezone')}</Label>
              <Select value={releaseTimezone} onValueChange={setReleaseTimezone}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Europe/Kiev">Europe/Kiev</SelectItem>
                  <SelectItem value="Europe/London">Europe/London</SelectItem>
                  <SelectItem value="America/New_York">America/New York</SelectItem>
                  <SelectItem value="America/Los_Angeles">America/Los Angeles</SelectItem>
                  <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                  <SelectItem value="Australia/Sydney">Australia/Sydney</SelectItem>
                  <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                  <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
                  <SelectItem value="Asia/Dubai">Asia/Dubai</SelectItem>
                  <SelectItem value="Asia/Singapore">Asia/Singapore</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Offset Display */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Offset</Label>
              <div className="bg-muted/30 p-4 rounded-lg">
                <p className="text-2xl font-semibold text-center">
                  {getTimezoneOffset(releaseTimezone)}
                </p>
              </div>
            </div>

            {/* World Times Preview */}
            <div>
              <Label className="text-sm font-medium mb-2 block">Твоя годинна публікації в світіс:</Label>
              <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">New York:</span>
                  <span className="text-sm font-semibold">{convertTime(releaseTime, releaseTimezone, "America/New_York")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">London:</span>
                  <span className="text-sm font-semibold">{convertTime(releaseTime, releaseTimezone, "Europe/London")}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Tokyo:</span>
                  <span className="text-sm font-semibold">{convertTime(releaseTime, releaseTimezone, "Asia/Tokyo")}</span>
                </div>
              </div>
            </div>

            <Button 
              onClick={() => setShowTimeZonePicker(false)}
              className="w-full h-12"
            >
              {t('newRelease.buttons.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Release Summary Dialog - Final review before submission */}
      <ReleaseSummaryDialog
        open={showSummaryDialog}
        onOpenChange={setShowSummaryDialog}
        releaseMetadata={form.getValues()}
        tracksMetadata={tracksMetadata}
        audioFiles={audioFiles?.map(f => ({ fileId: f.fileId })) ?? []}
        coverArtUrl={coverArt.uploadedUrl}
        selectedTerritories={selectedTerritories}
        onEdit={(step) => {
          setShowSummaryDialog(false);
          setCurrentStep(step);
        }}
        onConfirm={async () => {
          setIsCreatingRelease(true);
          try {
            await onCompleteRelease();
            setShowSummaryDialog(false);
          } catch (error) {
            // Keep dialog open on error so user can see error and retry
            console.error("Release creation failed:", error);
          } finally {
            setIsCreatingRelease(false);
          }
        }}
        isSubmitting={isCreatingRelease}
      />

      {/* Payment Widget - auto-starts immediately after release creation */}
      {showPaymentDialog && createdReleaseId && (
        <WayforpayWidget
          entityType="release"
          entityId={createdReleaseId}
          paymentStatus="PENDING"
          amount={`${(createdReleaseTrackCount === 1 ? 1000 : 2000) + createdReleaseAnimatedArtworkFee} грн`}
          autoStart={true}
          onPaymentSuccess={() => {
            setShowPaymentDialog(false);
            toast({
              title: 'Оплату підтверджено!',
              description: 'Ваш реліз відправлено на модерацію.',
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
    </>
  );
}

// Helper function to get timezone offset
function getTimezoneOffset(timezone: string): string {
  const offsets: Record<string, string> = {
    "Europe/Kiev": "+03:00",
    "Europe/London": "+00:00",
    "America/New_York": "-05:00",
    "America/Los_Angeles": "-08:00",
    "Asia/Tokyo": "+09:00",
    "Australia/Sydney": "+11:00",
    "Europe/Paris": "+01:00",
    "Europe/Berlin": "+01:00",
    "Asia/Dubai": "+04:00",
    "Asia/Singapore": "+08:00",
  };
  return offsets[timezone] || "+00:00";
}

// Helper function to convert time between timezones
function convertTime(time: string, fromTz: string, toTz: string): string {
  if (!time) return "00:00";
  
  const [hours, minutes] = time.split(':').map(Number);
  const fromOffset = parseInt(getTimezoneOffset(fromTz).split(':')[0]);
  const toOffset = parseInt(getTimezoneOffset(toTz).split(':')[0]);
  
  let newHours = hours + (toOffset - fromOffset);
  
  if (newHours < 0) newHours += 24;
  if (newHours >= 24) newHours -= 24;
  
  return `${String(newHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
