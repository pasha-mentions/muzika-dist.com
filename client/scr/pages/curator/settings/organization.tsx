import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Loader2, ImageIcon, X, Video, Eye, Plus, Trash2, HelpCircle, ChevronUp, ChevronDown } from "lucide-react";
import { FaSpotify, FaInstagram, FaYoutube, FaTiktok } from "react-icons/fa";
import { CuratorSettingsLayout } from "@/components/curator/settings-layout";

const MUSIC_GENRES = [
  "Pop", "Electro-pop", "Indie-pop", "Hip-Hop", "R&B", "Rock", "Pop-rock",
  "Electronic", "Dance", "Indie", "Alternative", "Jazz", "Classical",
  "Country", "Folk", "Metal", "Punk", "Reggae", "Latin", "K-Pop", 
  "Lo-Fi", "Ambient", "Soul"
];

const TRACK_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "uk", name: "Ukrainian" },
  { code: "pl", name: "Polish" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
];

const safeJsonParse = (value: string | null | undefined, defaultValue: any[] = []): any[] => {
  if (!value) return defaultValue;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
};

export default function CuratorSettingsOrganization() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();

  const { data: currentOrg } = useQuery<any>({
    queryKey: ["/api/organizations/current"],
    enabled: isAuthenticated,
  });

  const [orgData, setOrgData] = useState({
    name: "",
    bio: "",
    aboutMe: "",
    bannerUrl: "",
    coverImageUrl: "",
    genres: [] as string[],
    languages: [] as string[],
    videoUrl: "",
    achievements: [] as string[],
    faqItems: [] as { question: string; answer: string }[],
    spotifyUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    tiktokUrl: "",
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingBanner, setIsDraggingBanner] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleBannerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBanner(true);
  };

  const handleBannerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBanner(false);
  };

  const handleBannerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingBanner(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleImageUpload(file, 'banner');
      } else {
        toast({
          title: t('common.error'),
          description: t('curatorSettings.invalidImageType'),
          variant: "destructive",
        });
      }
    }
  };

  useEffect(() => {
    if (currentOrg) {
      setOrgData({
        name: currentOrg.name || "",
        bio: currentOrg.curatorBio || "",
        aboutMe: currentOrg.curatorAboutMe || "",
        bannerUrl: currentOrg.curatorBannerUrl || "",
        coverImageUrl: currentOrg.curatorCoverImageUrl || "",
        genres: safeJsonParse(currentOrg.curatorGenres),
        languages: safeJsonParse(currentOrg.curatorLanguages),
        videoUrl: currentOrg.curatorVideoUrl || "",
        achievements: safeJsonParse(currentOrg.curatorAchievements),
        faqItems: safeJsonParse(currentOrg.curatorFaqItems),
        spotifyUrl: currentOrg.spotifyUrl || "",
        instagramUrl: currentOrg.instagramUrl || "",
        youtubeUrl: currentOrg.youtubeUrl || "",
        tiktokUrl: currentOrg.tiktokUrl || "",
      });
    }
  }, [currentOrg]);

  const handleImageUpload = async (file: File, type: 'banner' | 'cover') => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'curator_image');

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      const imageUrl = data.downloadUrl || data.url;
      
      if (type === 'banner') {
        setOrgData(prev => ({ ...prev, bannerUrl: imageUrl }));
      } else {
        setOrgData(prev => ({ ...prev, coverImageUrl: imageUrl }));
      }

      toast({
        title: t('common.success'),
        description: t('curatorSettings.imageUploaded'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('curatorSettings.uploadFailed'),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveOrganization = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/organizations/current/curator-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: orgData.name,
          curatorBio: orgData.bio,
          curatorAboutMe: orgData.aboutMe,
          curatorBannerUrl: orgData.bannerUrl,
          curatorCoverImageUrl: orgData.coverImageUrl,
          curatorGenres: JSON.stringify(orgData.genres),
          curatorLanguages: JSON.stringify(orgData.languages),
          curatorVideoUrl: orgData.videoUrl,
          curatorAchievements: JSON.stringify(orgData.achievements),
          curatorFaqItems: JSON.stringify(orgData.faqItems),
          spotifyUrl: orgData.spotifyUrl,
          instagramUrl: orgData.instagramUrl,
          youtubeUrl: orgData.youtubeUrl,
          tiktokUrl: orgData.tiktokUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Save failed');
      }

      queryClient.invalidateQueries({ queryKey: ["/api/organizations/current"] });
      
      toast({
        title: t('common.success'),
        description: t('curatorSettings.profileSaved'),
      });
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('curatorSettings.saveFailed'),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleGenre = (genre: string) => {
    setOrgData(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }));
  };

  const toggleLanguage = (langCode: string) => {
    setOrgData(prev => ({
      ...prev,
      languages: prev.languages.includes(langCode)
        ? prev.languages.filter(l => l !== langCode)
        : [...prev.languages, langCode]
    }));
  };

  const addFaqItem = () => {
    if (orgData.faqItems.length >= 10) return;
    setOrgData(prev => ({
      ...prev,
      faqItems: [...prev.faqItems, { question: "", answer: "" }]
    }));
  };

  const updateFaqItem = (index: number, field: 'question' | 'answer', value: string) => {
    setOrgData(prev => ({
      ...prev,
      faqItems: prev.faqItems.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const removeFaqItem = (index: number) => {
    setOrgData(prev => ({
      ...prev,
      faqItems: prev.faqItems.filter((_, i) => i !== index)
    }));
  };

  const moveFaqItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= orgData.faqItems.length) return;
    
    setOrgData(prev => {
      const items = [...prev.faqItems];
      [items[index], items[newIndex]] = [items[newIndex], items[index]];
      return { ...prev, faqItems: items };
    });
  };

  return (
    <CuratorSettingsLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('curatorSettings.organization.brandTitle')}</CardTitle>
            <CardDescription>{t('curatorSettings.organization.brandDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t('curatorSettings.organization.brandName')}</Label>
              <Input 
                value={orgData.name}
                onChange={(e) => setOrgData(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('curatorSettings.organization.brandNamePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('curatorSettings.organization.brandAvatar')}</Label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                  {orgData.coverImageUrl ? (
                    <img src={orgData.coverImageUrl} alt="Brand" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'cover')}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => coverInputRef.current?.click()} disabled={isUploading}>
                  {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {t('curatorSettings.organization.uploadAvatar')}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('curatorSettings.organization.banner')}</Label>
              <div 
                className={`relative w-full h-32 rounded-lg bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed cursor-pointer transition-colors ${
                  isDraggingBanner 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:border-primary/50'
                }`}
                onDragOver={handleBannerDragOver}
                onDragLeave={handleBannerDragLeave}
                onDrop={handleBannerDrop}
                onClick={() => !orgData.bannerUrl && bannerInputRef.current?.click()}
              >
                {orgData.bannerUrl ? (
                  <>
                    <img src={orgData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                    <Button 
                      variant="destructive" 
                      size="icon" 
                      className="absolute top-2 right-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrgData(prev => ({ ...prev, bannerUrl: "" }));
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <div className="text-center pointer-events-none">
                    <ImageIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">{t('curatorSettings.organization.bannerHint')}</p>
                  </div>
                )}
              </div>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'banner')}
                className="hidden"
              />
              <Button variant="outline" onClick={() => bannerInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {t('curatorSettings.organization.uploadBanner')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t('curatorSettings.organization.bio')}</Label>
              <Textarea 
                value={orgData.bio}
                onChange={(e) => setOrgData(prev => ({ ...prev, bio: e.target.value }))}
                placeholder={t('curatorSettings.organization.bioPlaceholder')}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">{t('curatorSettings.organization.bioHint')}</p>
            </div>

            <div className="space-y-2">
              <Label>{t('curatorSettings.organization.aboutMe')}</Label>
              <Textarea 
                value={orgData.aboutMe}
                onChange={(e) => setOrgData(prev => ({ ...prev, aboutMe: e.target.value }))}
                placeholder={t('curatorSettings.organization.aboutMePlaceholder')}
                rows={5}
              />
              <p className="text-xs text-muted-foreground">{t('curatorSettings.organization.aboutMeHint')}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('curatorSettings.organization.genresTitle')}</CardTitle>
            <CardDescription>{t('curatorSettings.organization.genresDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {MUSIC_GENRES.map(genre => (
                <Badge 
                  key={genre}
                  variant={orgData.genres.includes(genre) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('curatorSettings.organization.languagesTitle')}</CardTitle>
            <CardDescription>{t('curatorSettings.organization.languagesDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {TRACK_LANGUAGES.map(lang => (
                <Badge 
                  key={lang.code}
                  variant={orgData.languages.includes(lang.code) ? "default" : "outline"}
                  className="cursor-pointer transition-colors"
                  onClick={() => toggleLanguage(lang.code)}
                >
                  {lang.name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('curatorSettings.organization.socialTitle')}</CardTitle>
            <CardDescription>{t('curatorSettings.organization.socialDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FaSpotify className="text-[#1DB954]" />
                Spotify
              </Label>
              <Input 
                value={orgData.spotifyUrl}
                onChange={(e) => setOrgData(prev => ({ ...prev, spotifyUrl: e.target.value }))}
                placeholder="https://open.spotify.com/user/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FaInstagram className="text-[#E4405F]" />
                Instagram
              </Label>
              <Input 
                value={orgData.instagramUrl}
                onChange={(e) => setOrgData(prev => ({ ...prev, instagramUrl: e.target.value }))}
                placeholder="@username or https://instagram.com/..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FaYoutube className="text-[#FF0000]" />
                YouTube
              </Label>
              <Input 
                value={orgData.youtubeUrl}
                onChange={(e) => setOrgData(prev => ({ ...prev, youtubeUrl: e.target.value }))}
                placeholder="https://youtube.com/@..."
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FaTiktok />
                TikTok
              </Label>
              <Input 
                value={orgData.tiktokUrl}
                onChange={(e) => setOrgData(prev => ({ ...prev, tiktokUrl: e.target.value }))}
                placeholder="@username or https://tiktok.com/@..."
              />
            </div>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <Card>
          <CardHeader className="p-3 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-sm md:text-base">{t('curatorSettings.organization.faqTitle')}</CardTitle>
                  <CardDescription className="text-xs hidden sm:block">{t('curatorSettings.organization.faqDescription')}</CardDescription>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="h-8 text-xs w-full sm:w-auto"
                onClick={addFaqItem}
                disabled={orgData.faqItems.length >= 10}
              >
                <Plus className="w-3 h-3 mr-1" />
                {t('curatorSettings.organization.addFaq')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            {orgData.faqItems.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <HelpCircle className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t('curatorSettings.organization.noFaq')}</p>
                <p className="text-xs mt-1">{t('curatorSettings.organization.noFaqHint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orgData.faqItems.map((item, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveFaqItem(index, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => moveFaqItem(index, 'down')}
                          disabled={index === orgData.faqItems.length - 1}
                        >
                          <ChevronDown className="w-3 h-3" />
                        </Button>
                        <span className="text-xs text-muted-foreground ml-1">#{index + 1}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => removeFaqItem(index)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={item.question}
                        onChange={(e) => updateFaqItem(index, 'question', e.target.value)}
                        placeholder={t('curatorSettings.organization.faqQuestionPlaceholder')}
                        className="h-9 text-sm"
                      />
                      <Textarea
                        value={item.answer}
                        onChange={(e) => updateFaqItem(index, 'answer', e.target.value)}
                        placeholder={t('curatorSettings.organization.faqAnswerPlaceholder')}
                        rows={2}
                        className="text-sm min-h-[60px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {orgData.faqItems.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {orgData.faqItems.length}/10
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('curatorSettings.organization.videoTitle')}</CardTitle>
            <CardDescription>{t('curatorSettings.organization.videoDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Video className="w-4 h-4" />
                {t('curatorSettings.organization.videoUrl')}
              </Label>
              <Input 
                value={orgData.videoUrl}
                onChange={(e) => setOrgData(prev => ({ ...prev, videoUrl: e.target.value }))}
                placeholder="https://youtube.com/watch?v=... or https://tiktok.com/..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          {currentOrg?.id && (
            <Button
              variant="outline"
              onClick={() => window.open(`/c/${currentOrg.id}`, '_blank', 'noopener,noreferrer')}
            >
              <Eye className="w-4 h-4 mr-2" />
              {t('curatorSettings.organization.previewLanding')}
            </Button>
          )}
          <Button onClick={handleSaveOrganization} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t('common.save')}
          </Button>
        </div>
      </div>
    </CuratorSettingsLayout>
  );
}
