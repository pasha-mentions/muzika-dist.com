import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, X, CheckCircle, Music, Image as ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ROLE_LABELS } from "@/lib/roleLabels";

interface EditReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: any;
  onSuccess: () => void;
}

// Validation schema for release editing
const editReleaseSchema = z.object({
  title: z.string().min(1, "Album name is required"),
  albumVersion: z.string().optional(),
  primaryGenre: z.string().min(1, "Main genre is required"),
  secondaryGenre: z.string().optional(),
  language: z.string().min(1, "Language is required"),
  originalReleaseDate: z.string().min(1, "First release date is required"),
  releaseDate: z.string().optional(),
  subLabel: z.string().optional(),
  upc: z.string().optional(),
  performers: z.array(z.object({
    name: z.string().min(1, "Artist name is required"),
    role: z.string().min(1, "Role is required"),
  })).max(5, "You can add a maximum of 5 artists").optional(),
});

type EditReleaseFormData = z.infer<typeof editReleaseSchema>;

export function EditReleaseDialog({
  open,
  onOpenChange,
  release,
  onSuccess,
}: EditReleaseDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTab, setSelectedTab] = useState("metadata");
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  
  // Cover art state
  const [coverArt, setCoverArt] = useState<{
    file: File | null;
    uploadedUrl: string | null;
    fileId: string | null;
    isValid: boolean;
    isUploading: boolean;
    error: string | null;
  }>({
    file: null,
    uploadedUrl: release?.artworkUrl || null,
    fileId: release?.artworkFileId || null,
    isValid: !!release?.artworkUrl,
    isUploading: false,
    error: null,
  });

  // Performers state
  const [performers, setPerformers] = useState<Array<{ name: string; role: string }>>(
    release?.performers || []
  );

  // Tracks state
  const [tracks, setTracks] = useState<any[]>(release?.tracks || []);
  
  // Track audio upload state
  const [trackAudioUploads, setTrackAudioUploads] = useState<Record<string, {
    file: File | null;
    uploadedUrl: string | null;
    isUploading: boolean;
    error: string | null;
  }>>({});

  const form = useForm<EditReleaseFormData>({
    resolver: zodResolver(editReleaseSchema),
    defaultValues: {
      title: release?.title || "",
      albumVersion: release?.albumVersion || "",
      primaryGenre: release?.primaryGenre || "",
      secondaryGenre: release?.secondaryGenre || "",
      language: release?.language || "",
      originalReleaseDate: release?.originalReleaseDate?.slice(0, 10) || "",
      releaseDate: release?.releaseDate?.slice(0, 10) || "",
      subLabel: release?.subLabel || "",
      upc: release?.upc || "",
      performers: release?.performers || [],
    },
  });

  // Reset form when release changes
  useEffect(() => {
    if (release) {
      form.reset({
        title: release.title || "",
        albumVersion: release.albumVersion || "",
        primaryGenre: release.primaryGenre || "",
        secondaryGenre: release.secondaryGenre || "",
        language: release.language || "",
        originalReleaseDate: release.originalReleaseDate?.slice(0, 10) || "",
        releaseDate: release.releaseDate?.slice(0, 10) || "",
        subLabel: release.subLabel || "",
        upc: release.upc || "",
        performers: release.performers || [],
      });
      setPerformers(release.performers || []);
      setTracks(release.tracks || []);
      setCoverArt({
        file: null,
        uploadedUrl: release.artworkUrl || null,
        fileId: release.artworkFileId || null,
        isValid: !!release.artworkUrl,
        isUploading: false,
        error: null,
      });
    }
  }, [release, form]);

  // Validate cover art
  const validateCoverArt = (file: File): { isValid: boolean; error?: string } => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      return { isValid: false, error: 'Allowed formats: JPG, JPEG, PNG' };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { isValid: false, error: 'File size must not exceed 10MB.' };
    }

    return { isValid: true };
  };

  // Handle cover art upload
  const handleCoverArtChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateCoverArt(file);
    if (!validation.isValid) {
      setCoverArt({
        file: null,
        uploadedUrl: null,
        fileId: null,
        isValid: false,
        isUploading: false,
        error: validation.error || null,
      });
      toast({
        title: "Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    setCoverArt(prev => ({ ...prev, file, isUploading: true, error: null }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setCoverArt({
        file,
        uploadedUrl: data.downloadUrl,
        fileId: data.fileId || null,
        isValid: true,
        isUploading: false,
        error: null,
      });

      toast({
        title: "Success",
        description: "Cover art uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading cover art:", error);
      setCoverArt(prev => ({
        ...prev,
        isUploading: false,
        error: "Failed to upload cover art",
      }));
      toast({
        title: "Error",
        description: "Failed to upload cover art",
        variant: "destructive",
      });
    }
  };

  // Handle form submission
  const onSubmit = async (data: EditReleaseFormData) => {
    setIsSubmitting(true);

    try {
      // Helper function to safely convert date to ISO string
      const toISOString = (dateValue: string | undefined, fallback?: string): string | undefined => {
        if (!dateValue) return fallback;
        try {
          // If it's already in YYYY-MM-DD format, convert to ISO
          if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return new Date(dateValue + 'T00:00:00.000Z').toISOString();
          }
          // If it's already ISO format, return as is
          if (dateValue.includes('T') || dateValue.includes('Z')) {
            return dateValue;
          }
          // Otherwise try to parse
          const date = new Date(dateValue);
          return isNaN(date.getTime()) ? fallback : date.toISOString();
        } catch (err) {
          return fallback;
        }
      };

      const releaseData: any = {
        title: data.title,
        albumVersion: data.albumVersion || "",
        primaryGenre: data.primaryGenre,
        secondaryGenre: data.secondaryGenre || "",
        language: data.language,
        originalReleaseDate: toISOString(data.originalReleaseDate, release.originalReleaseDate),
        releaseDate: toISOString(data.releaseDate, release.releaseDate),
        subLabel: data.subLabel || "",
        performers: performers || [],
        upc: data.upc || release.upc || "",
      };

      // Handle artwork
      if (coverArt.uploadedUrl && coverArt.uploadedUrl !== release.artworkUrl) {
        releaseData.artworkUrl = coverArt.uploadedUrl;
        releaseData.artworkFileId = coverArt.fileId || "";
        releaseData.artworkOriginalName = coverArt.file?.name || "";
      } else if (release.artworkUrl) {
        releaseData.artworkUrl = release.artworkUrl;
        releaseData.artworkFileId = release.artworkFileId || "";
        releaseData.artworkOriginalName = release.artworkOriginalName || "";
      }

      const response = await fetch(`/api/releases/${release.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(releaseData),
      });

      if (!response.ok) {
        throw new Error("Failed to update release");
      }

      toast({
        title: "Успіх",
        description: "Реліз успішно оновлено",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating release:", error);
      toast({
        title: "Помилка",
        description: "Не вдалося оновити реліз",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle adding performer
  const handleAddPerformer = () => {
    if (performers.length < 5) {
      setPerformers([...performers, { name: "", role: "" }]);
    }
  };

  // Handle removing performer
  const handleRemovePerformer = (index: number) => {
    setPerformers(performers.filter((_, i) => i !== index));
  };

  // Handle performer change
  const handlePerformerChange = (index: number, field: "name" | "role", value: string) => {
    const updated = [...performers];
    updated[index][field] = value;
    setPerformers(updated);
  };

  // Handle track update
  const handleTrackUpdate = (trackId: string, field: string, value: any) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, [field]: value } : track
    ));
  };

  // Convert seconds to HH:MM:SS format
  const secondsToTimeString = (seconds: number | null | undefined): string => {
    if (!seconds) return "00:00:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Convert HH:MM:SS format to seconds
  const timeStringToSeconds = (timeString: string): number | null => {
    if (!timeString || timeString === "00:00:00") return null;
    const parts = timeString.split(':');
    if (parts.length === 3) {
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseInt(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    }
    return null;
  };

  // Validate audio file
  const validateAudioFile = (file: File): { isValid: boolean; error?: string } => {
    if (file.type !== 'audio/wav' && !file.name.toLowerCase().endsWith('.wav')) {
      return { isValid: false, error: 'Allowed format: WAV' };
    }

    if (file.size > 100 * 1024 * 1024) {
      return { isValid: false, error: 'The file size must not exceed 100MB' };
    }

    return { isValid: true };
  };

  // Handle audio file upload for tracks
  const handleTrackAudioUpload = async (trackId: string, file: File) => {
    const validation = validateAudioFile(file);
    if (!validation.isValid) {
      toast({
        title: "Error",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    setTrackAudioUploads(prev => ({
      ...prev,
      [trackId]: { file, uploadedUrl: null, isUploading: true, error: null }
    }));

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      
      setTrackAudioUploads(prev => ({
        ...prev,
        [trackId]: { file, uploadedUrl: data.downloadUrl, isUploading: false, error: null }
      }));

      handleTrackUpdate(trackId, "audioUrl", data.downloadUrl);
      handleTrackUpdate(trackId, "audioOriginalName", file.name);

      toast({
        title: "Success",
        description: "Audio file uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading audio:", error);
      setTrackAudioUploads(prev => ({
        ...prev,
        [trackId]: { ...prev[trackId], isUploading: false, error: "Failed to upload" }
      }));
      toast({
        title: "Error",
        description: "Failed to upload audio file",
        variant: "destructive",
      });
    }
  };

  // Save tracks updates
  const handleSaveTracksUpdates = async () => {
    setIsSubmitting(true);
    
    try {
      // Update each track individually
      for (const track of tracks) {
        const trackData: any = {
          title: track.title,
          version: track.version,
          explicit: track.explicit,
          aiGenerated: track.aiGenerated || false,
          lyrics: track.lyrics,
          isrc: track.isrc,
          participants: track.participants || [],
          tiktokClipStart: track.tiktokClipStart ?? null,
        };

        // Include updated audio URL if changed
        if (trackAudioUploads[track.id]?.uploadedUrl) {
          trackData.audioUrl = trackAudioUploads[track.id].uploadedUrl;
          trackData.audioOriginalName = trackAudioUploads[track.id].file?.name;
        }

        const response = await fetch(`/api/tracks/${track.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(trackData),
        });

        if (!response.ok) {
          throw new Error(`Failed to update track ${track.title}`);
        }
      }

      toast({
        title: "Успіх",
        description: "Треки успішно оновлено",
      });

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating tracks:", error);
      toast({
        title: "Помилка",
        description: "Не вдалося оновити треки",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>{t('editRelease.title')}</DialogTitle>
        </DialogHeader>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="metadata">{t('editRelease.metadata')}</TabsTrigger>
            <TabsTrigger value="tracks">{t('editRelease.tracksTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="metadata" className="space-y-6 mt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Cover Art Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      {t('editRelease.coverArt')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                      <div className="relative w-32 h-32 sm:w-48 sm:h-48 flex-shrink-0">
                        {coverArt.uploadedUrl || coverArt.file ? (
                          <img
                            src={coverArt.file ? URL.createObjectURL(coverArt.file) : coverArt.uploadedUrl!}
                            alt="Cover art"
                            className="w-full h-full object-cover rounded-lg border"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted rounded-lg border border-dashed flex items-center justify-center">
                            <div className="text-center text-muted-foreground">
                              <ImageIcon className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-2" />
                              <p className="text-xs sm:text-sm">Немає обкладинки</p>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2 w-full">
                        <Label htmlFor="cover-art-input" className="cursor-pointer">
                          <div className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-md inline-flex">
                            <Upload className="h-4 w-4" />
                            {coverArt.uploadedUrl ? t('editRelease.uploadCoverArt') : t('editRelease.uploadCoverArt')}
                          </div>
                        </Label>
                        <Input
                          id="cover-art-input"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png"
                          onChange={handleCoverArtChange}
                          className="hidden"
                        />
                        {coverArt.isUploading && (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent"></div>
                            <span className="text-sm text-muted-foreground">{t('editRelease.uploading')}</span>
                          </div>
                        )}
                        {coverArt.error && (
                          <p className="text-sm text-red-500">{coverArt.error}</p>
                        )}
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {t('editRelease.requirementsTitle')} {t('editRelease.coverArtRequirements')}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Release Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>* {t('editRelease.albumName')}</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-12" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="albumVersion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('editRelease.albumVersion')}</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-12" placeholder="Deluxe, Remastered..." />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryGenre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>* {t('editRelease.mainGenre')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Виберіть жанр" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="alternative">Alternative</SelectItem>
                            <SelectItem value="blues">Blues</SelectItem>
                            <SelectItem value="brazilian">Brazilian</SelectItem>
                            <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                            <SelectItem value="chill-out">Chill Out</SelectItem>
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
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="secondaryGenre"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('editRelease.secondaryGenre')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Виберіть жанр" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="alternative">Alternative</SelectItem>
                            <SelectItem value="blues">Blues</SelectItem>
                            <SelectItem value="brazilian">Brazilian</SelectItem>
                            <SelectItem value="chicago-blues">Chicago Blues</SelectItem>
                            <SelectItem value="chill-out">Chill Out</SelectItem>
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
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="language"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>* {t('editRelease.language')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12">
                              <SelectValue placeholder="Виберіть мову" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="ukrainian">Українська</SelectItem>
                            <SelectItem value="english">English</SelectItem>
                            <SelectItem value="russian">Російська</SelectItem>
                            <SelectItem value="spanish">Español</SelectItem>
                            <SelectItem value="french">Français</SelectItem>
                            <SelectItem value="german">Deutsch</SelectItem>
                            <SelectItem value="italian">Italiano</SelectItem>
                            <SelectItem value="portuguese">Português</SelectItem>
                            <SelectItem value="polish">Polski</SelectItem>
                            <SelectItem value="instrumental">Інструментальна</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('editRelease.subLabel')}</FormLabel>
                        <FormControl>
                          <Input {...field} className="h-12" placeholder="Опціонально" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="originalReleaseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>* {t('editRelease.firstReleaseDate')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            className="h-12 [color-scheme:dark]" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="releaseDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('editRelease.releaseDate')}</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            className="h-12 [color-scheme:dark]" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Performers */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('editRelease.mainPerformer')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {performers.map((performer, index) => (
                        <div key={index} className="space-y-2 p-4 border rounded-lg relative">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePerformer(index)}
                            className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          <div>
                            <Input
                              placeholder="Псевдонім артиста"
                              value={performer.name}
                              onChange={(e) => handlePerformerChange(index, "name", e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <div>
                            <Input
                              placeholder="Роль"
                              value={performer.role}
                              onChange={(e) => handlePerformerChange(index, "role", e.target.value)}
                              className="h-10"
                            />
                          </div>
                        </div>
                      ))}
                      {performers.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Виконавці не додані
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddPerformer}
                        disabled={performers.length >= 5}
                        className="w-full"
                      >
                        {t('editRelease.addPerformer')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={isSubmitting}
                  >
                    {t('editRelease.cancel')}
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t('editRelease.saving') : t('editRelease.saveMetadata')}
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          <TabsContent value="tracks" className="space-y-6 mt-6">
            <div className="space-y-4">
              {tracks.map((track) => (
                <Card key={track.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Music className="h-5 w-5" />
                        {track.trackIndex}. {track.title}
                      </CardTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTrackId(editingTrackId === track.id ? null : track.id)}
                      >
                        {editingTrackId === track.id ? t('editRelease.hide') : t('editRelease.edit')}
                      </Button>
                    </div>
                  </CardHeader>
                  {editingTrackId === track.id && (
                    <CardContent className="space-y-4">
                      {/* Track Title */}
                      <div>
                        <Label>* {t('editRelease.trackTitle')}</Label>
                        <Input
                          value={track.title}
                          onChange={(e) => handleTrackUpdate(track.id, "title", e.target.value)}
                          className="mt-2 h-12"
                        />
                      </div>

                      {/* Track Version */}
                      <div>
                        <Label>{t('editRelease.version')}</Label>
                        <Input
                          value={track.version || ""}
                          onChange={(e) => handleTrackUpdate(track.id, "version", e.target.value)}
                          className="mt-2 h-12"
                          placeholder="Original, Remix, Acoustic..."
                        />
                      </div>

                      {/* ISRC */}
                      <div>
                        <Label>ISRC</Label>
                        <Input
                          value={track.isrc || ""}
                          onChange={(e) => handleTrackUpdate(track.id, "isrc", e.target.value)}
                          className="mt-2 h-12"
                          placeholder="XX-XXX-XX-XXXXX"
                        />
                      </div>

                      {/* Preview Start Time */}
                      <div>
                        <Label>Preview Start Time (Optional)</Label>
                        <Input
                          value={secondsToTimeString(track.tiktokClipStart)}
                          onChange={(e) => {
                            const seconds = timeStringToSeconds(e.target.value);
                            handleTrackUpdate(track.id, "tiktokClipStart", seconds);
                          }}
                          className="mt-2 h-12"
                          placeholder="00:00:00"
                        />
                      </div>

                      {/* Explicit Content & AI Content */}
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`explicit-${track.id}`}
                            checked={track.explicit}
                            onChange={(e) => handleTrackUpdate(track.id, "explicit", e.target.checked)}
                            className="w-4 h-4"
                          />
                          <Label htmlFor={`explicit-${track.id}`} className="cursor-pointer">
                            {t('editRelease.explicitContent')}
                          </Label>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`ai-${track.id}`}
                            checked={track.aiGenerated || false}
                            onChange={(e) => handleTrackUpdate(track.id, "aiGenerated", e.target.checked)}
                            className="w-4 h-4"
                          />
                          <Label htmlFor={`ai-${track.id}`} className="cursor-pointer">
                            {t('editRelease.aiGenerated')}
                          </Label>
                        </div>
                      </div>

                      {/* Lyrics */}
                      <div>
                        <Label>{t('editRelease.lyrics')}</Label>
                        <Textarea
                          value={track.lyrics || ""}
                          onChange={(e) => handleTrackUpdate(track.id, "lyrics", e.target.value)}
                          className="mt-2 min-h-[150px]"
                          placeholder="Введіть текст пісні..."
                        />
                      </div>

                      {/* Contributors */}
                      <Card className="border-muted">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{t('editRelease.contributors')}</CardTitle>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const currentContributors = track.participants || [];
                                handleTrackUpdate(track.id, "participants", [
                                  ...currentContributors,
                                  { name: "", role: "main_performer" }
                                ]);
                              }}
                            >
                              {t('editRelease.addContributor')}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {(track.participants || []).map((contributor: any, index: number) => (
                            <div key={index} className="flex gap-2 items-start">
                              <div className="flex-1">
                                <Input
                                  placeholder="Ім'я"
                                  value={contributor.name || ""}
                                  onChange={(e) => {
                                    const currentContributors = [...(track.participants || [])];
                                    currentContributors[index].name = e.target.value;
                                    handleTrackUpdate(track.id, "participants", currentContributors);
                                  }}
                                  className="h-10"
                                />
                              </div>
                              <div className="flex-1">
                                <Select
                                  value={contributor.role || "main_performer"}
                                  onValueChange={(value) => {
                                    const currentContributors = [...(track.participants || [])];
                                    currentContributors[index].role = value;
                                    handleTrackUpdate(track.id, "participants", currentContributors);
                                  }}
                                >
                                  <SelectTrigger className="h-10">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="main_performer">{ROLE_LABELS.main_performer}</SelectItem>
                                    <SelectItem value="composer">{ROLE_LABELS.composer}</SelectItem>
                                    <SelectItem value="lyricist">{ROLE_LABELS.lyricist}</SelectItem>
                                    <SelectItem value="arranger">{ROLE_LABELS.arranger}</SelectItem>
                                    <SelectItem value="mixing_engineer">{ROLE_LABELS.mixing_engineer}</SelectItem>
                                    <SelectItem value="mastering_engineer">{ROLE_LABELS.mastering_engineer}</SelectItem>
                                    <SelectItem value="cover_designer">{ROLE_LABELS.cover_designer}</SelectItem>
                                    <SelectItem value="musician">{ROLE_LABELS.musician}</SelectItem>
                                    <SelectItem value="background_vocal">{ROLE_LABELS.background_vocal}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const currentContributors = [...(track.participants || [])];
                                  currentContributors.splice(index, 1);
                                  handleTrackUpdate(track.id, "participants", currentContributors);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          {(!track.participants || track.participants.length === 0) && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Немає доданих ролей
                            </p>
                          )}
                        </CardContent>
                      </Card>

                      {/* Audio File */}
                      <div>
                        <Label>{t('editRelease.audioFile')}</Label>
                        <div className="mt-2 space-y-2">
                          {track.audioUrl && !trackAudioUploads[track.id]?.uploadedUrl && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>{track.audioOriginalName || "Audio file uploaded"}</span>
                            </div>
                          )}
                          
                          {trackAudioUploads[track.id]?.uploadedUrl && (
                            <div className="flex items-center gap-2 text-sm text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span>{trackAudioUploads[track.id].file?.name} (Новий файл)</span>
                            </div>
                          )}
                          
                          {trackAudioUploads[track.id]?.isUploading && (
                            <div className="flex items-center gap-2 text-sm">
                              <div className="animate-spin rounded-full h-4 w-4 border-2 border-purple-500 border-t-transparent"></div>
                              <span>{t('editRelease.uploading')}</span>
                            </div>
                          )}

                          <Label htmlFor={`audio-${track.id}`} className="cursor-pointer">
                            <div className="flex items-center gap-2 bg-secondary hover:bg-secondary/80 px-4 py-2 rounded-md inline-flex">
                              <Upload className="h-4 w-4" />
                              {t('editRelease.uploadAudio')}
                            </div>
                          </Label>
                          <Input
                            id={`audio-${track.id}`}
                            type="file"
                            accept="audio/wav"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleTrackAudioUpload(track.id, file);
                              }
                            }}
                            className="hidden"
                          />
                          <p className="text-sm text-muted-foreground">
                            WAV формат • Макс 100MB
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}

              {tracks.length === 0 && (
                <Card>
                  <CardContent className="py-8">
                    <p className="text-center text-muted-foreground">
                      Треки не знайдено
                    </p>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  {t('newRelease.buttons.cancel')}
                </Button>
                <Button 
                  onClick={handleSaveTracksUpdates}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t('editRelease.saving') : t('editRelease.saveTrackChanges')}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
