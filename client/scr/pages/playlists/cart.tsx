import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { getProxiedImageUrl } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShoppingCart, Trash2, ArrowLeft, Users, Camera, Music, Instagram, Upload, X, Check, ImageIcon, MessageSquare, Link2, AlertCircle, Calendar } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays } from "date-fns";
import { uk, pl, enUS } from "date-fns/locale";
import { FaSpotify } from "react-icons/fa";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface CartItem {
  id: string;
  playlistId: number;
  packageId: number;
  createdAt: string;
  playlistName: string;
  playlistImageUrl: string | null;
  playlistFollowerCount: number | null;
  packageName: string;
  packagePrice: number;
  packageCurrency: string;
  packageBenefits: string[];
  packageIncludesPhoto: boolean;
}

interface Track {
  id: string;
  title: string;
  releaseId: string;
  releaseTitle?: string;
}

interface Release {
  id: string;
  title: string;
  tracks?: Track[];
}

export default function PlaylistCart() {
  const { t } = useTranslation();
  const { user, isAuthenticated, currentOrg } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTrackId, setSelectedTrackId] = useState<string>("");
  const [proposedPlacementDate, setProposedPlacementDate] = useState<Date | undefined>(undefined);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([]);
  const [spotifyLink, setSpotifyLink] = useState("");
  const [instagramLink, setInstagramLink] = useState("");
  const [comment, setComment] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const hasInitializedLinks = useRef(false);
  
  const { i18n } = useTranslation();
  const dateLocale = i18n.language === 'uk' ? uk : i18n.language === 'pl' ? pl : enUS;
  const minPlacementDate = addDays(new Date(), 3);

  useEffect(() => {
    if (currentOrg && !hasInitializedLinks.current) {
      hasInitializedLinks.current = true;
      if (currentOrg.spotifyUrl) {
        setSpotifyLink(currentOrg.spotifyUrl);
      }
      if (currentOrg.instagramUrl) {
        setInstagramLink(currentOrg.instagramUrl);
      }
    }
  }, [currentOrg]);

  const { data: cartItems = [], isLoading } = useQuery<CartItem[]>({
    queryKey: ["/api/playlists/cart"],
    enabled: isAuthenticated,
  });

  const { data: releases = [] } = useQuery<Release[]>({
    queryKey: ["/api/releases"],
    enabled: isAuthenticated,
    select: (data: any) => data.releases || data || [],
  });

  const organizationTracks = useMemo(() => {
    const tracks: Track[] = [];
    releases.forEach((release: Release) => {
      if (release.tracks && Array.isArray(release.tracks)) {
        release.tracks.forEach((track: Track) => {
          tracks.push({
            ...track,
            releaseTitle: release.title,
          });
        });
      }
    });
    return tracks;
  }, [releases]);

  const removeFromCartMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const res = await fetch(`/api/playlists/cart/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove from cart');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists/cart"] });
      toast({
        title: t('playlists.cart.itemRemoved'),
        description: t('playlists.cart.itemRemovedDesc'),
      });
    },
  });

  const submitApplicationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/pitching-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackId: selectedTrackId,
          proposedPlacementDate: proposedPlacementDate?.toISOString() || null,
          spotifyLink: spotifyLink || null,
          instagramLink: instagramLink || null,
          comment: comment || null,
          photos: uploadedPhotoIds,
          cartItemIds: cartItems.map(item => item.id),
        }),
      });
      if (!res.ok) throw new Error('Failed to submit application');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists/cart"] });
      toast({
        title: t('playlists.cart.applicationSubmitted'),
        description: t('playlists.cart.applicationSubmittedDesc'),
      });
      navigate('/playlists');
    },
    onError: () => {
      setIsUploading(false);
      setUploadProgress(0);
      toast({
        title: t('playlists.cart.submitError'),
        description: t('playlists.cart.submitErrorDesc'),
        variant: 'destructive',
      });
    },
  });

  const formatFollowers = (count: number | null) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const total = cartItems.reduce((sum, item) => sum + item.packagePrice, 0);
  const currency = cartItems[0]?.packageCurrency || 'UAH';
  const hasPhotoPackage = cartItems.some(item => item.packageIncludesPhoto);

  const uploadFileWithProgress = (file: File, index: number, total: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload');
      xhr.withCredentials = true;

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const fileProgress = (event.loaded / event.total) * 100;
          const overallProgress = ((index * 100) + fileProgress) / total;
          setUploadProgress(Math.round(overallProgress));
        }
      });

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText);
            const fileId = response.fileId || response.id;
            console.log('Photo uploaded successfully:', fileId);
            resolve(fileId);
          } catch {
            console.error('Failed to parse upload response');
            resolve(null);
          }
        } else {
          console.error('Upload failed with status:', xhr.status);
          resolve(null);
        }
      };

      xhr.onerror = () => {
        console.error('Upload error');
        resolve(null);
      };

      xhr.send(formData);
    });
  };

  const handlePhotoSelect = async (files: FileList | null) => {
    if (!files || isUploading) return;
    
    const newFiles = Array.from(files).slice(0, 3 - photos.length);
    const validFiles: File[] = [];
    
    for (const file of newFiles) {
      if (file.type.startsWith('image/')) {
        if (file.size <= 10 * 1024 * 1024) {
          validFiles.push(file);
        } else {
          toast({
            title: t('playlists.cart.photoTooLarge'),
            description: t('playlists.cart.maxPhotoSize'),
            variant: "destructive",
          });
        }
      }
    }

    if (validFiles.length === 0) return;

    // Start uploading immediately to Google Drive
    setIsUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const previewUrl = URL.createObjectURL(file);
      
      // Add preview immediately
      setPhotos(prev => [...prev, file]);
      setPhotoPreviewUrls(prev => [...prev, previewUrl]);

      try {
        const fileId = await uploadFileWithProgress(file, i, validFiles.length);
        if (fileId) {
          setUploadedPhotoIds(prev => [...prev, fileId]);
        } else {
          // Remove the photo if upload failed
          toast({
            title: t('playlists.cart.uploadError') || 'Upload failed',
            description: t('playlists.cart.uploadErrorDesc') || 'Failed to upload photo to server',
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Photo upload error:', error);
      }
    }

    setIsUploading(false);
    setUploadProgress(100);
  };

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(photoPreviewUrls[index]);
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index));
    setUploadedPhotoIds(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handlePhotoSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const validateSpotifyLink = (link: string) => {
    if (!link || !link.trim()) return false;
    return link.includes('spotify.com') || link.includes('open.spotify.com');
  };

  const validateInstagramLink = (link: string) => {
    if (!link || !link.trim()) return false;
    return link.includes('instagram.com') || link.startsWith('@');
  };

  const isFormValid = () => {
    return (
      selectedTrackId &&
      proposedPlacementDate &&
      validateSpotifyLink(spotifyLink) &&
      validateInstagramLink(instagramLink) &&
      (!hasPhotoPackage || photos.length >= 1)
    );
  };

  const stepComplete = {
    playlists: cartItems.length > 0,
    details: selectedTrackId && (!hasPhotoPackage || photos.length >= 1),
    links: validateSpotifyLink(spotifyLink) && validateInstagramLink(instagramLink),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate('/playlists')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-xl">
              <ShoppingCart className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t('playlists.cart.title')}</h1>
              <p className="text-muted-foreground text-sm">
                {t('playlists.cart.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {cartItems.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="p-4 bg-muted rounded-full mb-4">
                <ShoppingCart className="w-12 h-12 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-medium mb-2">{t('playlists.cart.empty')}</h3>
              <p className="text-muted-foreground text-center mb-6 max-w-sm">
                {t('playlists.cart.emptyDescription')}
              </p>
              <Button onClick={() => navigate('/playlists')} className="gap-2">
                <Music className="w-4 h-4" />
                {t('playlists.cart.browsePlaylists')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="overflow-hidden border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-purple-600/5 border-b">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                    1
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{t('playlists.cart.selectedPlaylists')}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {cartItems.length} {t('playlists.cart.playlistsSelected')}
                    </p>
                  </div>
                  {stepComplete.playlists && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10">
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex gap-4 p-4 hover:bg-muted/50 transition-colors">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 ring-1 ring-border">
                      {item.playlistImageUrl ? (
                        <img 
                          src={getProxiedImageUrl(item.playlistImageUrl)!} 
                          alt={item.playlistName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                          <Music className="w-6 h-6 text-purple-400/60" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{item.playlistName}</h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        {item.playlistFollowerCount && (
                          <div className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {formatFollowers(item.playlistFollowerCount)}
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1 text-xs">
                          {item.packageName}
                        </Badge>
                        {item.packageIncludesPhoto && (
                          <Badge variant="outline" className="gap-1 text-xs text-purple-600 border-purple-200 bg-purple-50">
                            <Camera className="w-3 h-3" />
                            {t('playlists.cart.includesPhoto')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end justify-between">
                      <div className="text-lg font-bold text-primary">
                        {item.packagePrice.toLocaleString()} {item.packageCurrency}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 px-2"
                        onClick={() => removeFromCartMutation.mutate(item.id)}
                        disabled={removeFromCartMutation.isPending}
                      >
                        {removeFromCartMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-purple-600/5 border-b">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                    2
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{t('playlists.cart.applicationDetails')}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t('playlists.cart.applicationDetailsDesc')}
                    </p>
                  </div>
                  {stepComplete.details && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10">
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-base font-medium">
                    <Music className="w-4 h-4 text-primary" />
                    {t('playlists.cart.selectTrack')}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Select value={selectedTrackId} onValueChange={setSelectedTrackId}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder={t('playlists.cart.selectTrackPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {organizationTracks.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground">
                          <Music className="w-8 h-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">{t('playlists.cart.noTracksAvailable')}</p>
                        </div>
                      ) : (
                        organizationTracks.map((track) => (
                          <SelectItem key={track.id} value={track.id}>
                            <div className="flex flex-col">
                              <span>{track.title}</span>
                              {track.releaseTitle && (
                                <span className="text-xs text-muted-foreground">{track.releaseTitle}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-base font-medium">
                    <Calendar className="w-4 h-4 text-primary" />
                    {t('playlists.cart.proposedPlacementDate')}
                    <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('playlists.cart.proposedPlacementDateDesc')}
                  </p>
                  <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={`w-full h-12 justify-start text-left font-normal ${
                          !proposedPlacementDate ? 'text-muted-foreground' : ''
                        } ${proposedPlacementDate ? 'border-green-500/50' : ''}`}
                      >
                        <Calendar className="mr-2 h-4 w-4" />
                        {proposedPlacementDate ? (
                          format(proposedPlacementDate, 'PPP', { locale: dateLocale })
                        ) : (
                          t('playlists.cart.selectDate')
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={proposedPlacementDate}
                        onSelect={(date) => {
                          setProposedPlacementDate(date);
                          setDatePickerOpen(false);
                        }}
                        disabled={(date) => date < minPlacementDate}
                        initialFocus
                        locale={dateLocale}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {hasPhotoPackage && (
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-base font-medium">
                      <Camera className="w-4 h-4 text-primary" />
                      {t('playlists.cart.uploadPhotos')}
                      <span className="text-destructive">*</span>
                      <span className="text-sm font-normal text-muted-foreground ml-auto">
                        {photos.length}/3
                      </span>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t('playlists.cart.uploadPhotosDesc')}
                    </p>
                    
                    {photos.length < 3 && (
                      <div
                        className={`relative border-2 border-dashed rounded-xl p-8 transition-all cursor-pointer hover:border-primary/50 ${
                          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                        }`}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onClick={() => document.getElementById('photo-input')?.click()}
                      >
                        <input
                          id="photo-input"
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handlePhotoSelect(e.target.files)}
                        />
                        <div className="flex flex-col items-center text-center">
                          <div className="p-3 bg-primary/10 rounded-full mb-3">
                            <Upload className="w-6 h-6 text-primary" />
                          </div>
                          <p className="font-medium">{t('playlists.cart.dragDropPhotos')}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t('playlists.cart.orClickToUpload')}
                          </p>
                        </div>
                      </div>
                    )}

                    {photoPreviewUrls.length > 0 && (
                      <div className="grid grid-cols-3 gap-3">
                        {photoPreviewUrls.map((url, index) => (
                          <div key={index} className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-border group">
                            <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                            <button
                              onClick={() => removePhoto(index)}
                              className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white font-medium">
                              {index + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {isUploading && (
                      <div className="space-y-2 mt-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{t('playlists.cart.uploadingPhotos')}</span>
                          <span className="font-medium text-primary">{uploadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary transition-all duration-300 ease-out"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-primary/5 to-purple-600/5 border-b">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                    3
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-lg">{t('playlists.cart.socialLinks')}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {t('playlists.cart.socialLinksDesc')}
                    </p>
                  </div>
                  {stepComplete.links && (
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10">
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FaSpotify className="w-4 h-4 text-green-500" />
                    {t('playlists.cart.spotifyLink')}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={spotifyLink}
                    onChange={(e) => setSpotifyLink(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className={`h-11 ${!validateSpotifyLink(spotifyLink) ? 'border-destructive/50 focus-visible:ring-destructive' : 'border-green-500/50'}`}
                  />
                  {!validateSpotifyLink(spotifyLink) && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {t('playlists.cart.invalidSpotifyLink')}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 text-pink-500" />
                    {t('playlists.cart.instagramLink')}
                    <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={instagramLink}
                    onChange={(e) => setInstagramLink(e.target.value)}
                    placeholder="https://instagram.com/... або @username"
                    className={`h-11 ${!validateInstagramLink(instagramLink) ? 'border-destructive/50 focus-visible:ring-destructive' : 'border-green-500/50'}`}
                  />
                  {!validateInstagramLink(instagramLink) && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {t('playlists.cart.invalidInstagramLink')}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-2">
                  <Label className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    {t('playlists.cart.comment')}
                    <span className="text-xs text-muted-foreground font-normal">({t('playlists.cart.optional')})</span>
                  </Label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t('playlists.cart.commentPlaceholder')}
                    className="min-h-[100px] resize-none"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden border-0 shadow-xl bg-gradient-to-br from-primary/5 via-background to-purple-600/5">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">{t('playlists.cart.total')}</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                      {total.toLocaleString()} {currency}
                    </p>
                  </div>
                  <Button 
                    size="lg" 
                    className="h-12 px-8 text-base gap-2 shadow-lg"
                    disabled={!isFormValid() || submitApplicationMutation.isPending}
                    onClick={() => submitApplicationMutation.mutate()}
                  >
                    {submitApplicationMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ShoppingCart className="w-5 h-5" />
                    )}
                    {t('playlists.cart.submitApplication')}
                  </Button>
                </div>
                
                {!isFormValid() && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {!selectedTrackId && t('playlists.cart.selectTrackRequired')}
                      {selectedTrackId && hasPhotoPackage && photos.length === 0 && t('playlists.cart.photosRequired')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
