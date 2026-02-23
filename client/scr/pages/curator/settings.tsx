import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Shield, CreditCard, Bell, Upload, Loader2, ImageIcon, X, Plus, Video, Award, Globe, Music } from "lucide-react";
import { FaSpotify, FaInstagram, FaTelegram, FaYoutube, FaTiktok } from "react-icons/fa";
import { useLocation } from "wouter";

const MUSIC_GENRES = [
  "Pop", "Hip-Hop", "R&B", "Rock", "Electronic", "Dance", "Indie", 
  "Alternative", "Jazz", "Classical", "Country", "Folk", "Metal", 
  "Punk", "Reggae", "Latin", "K-Pop", "Lo-Fi", "Ambient", "Soul"
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

export default function CuratorSettings() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [location, navigate] = useLocation();

  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  const { data: currentOrg } = useQuery<any>({
    queryKey: ["/api/organizations/current"],
  });

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    language: "en",
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
    spotifyUrl: "",
    instagramUrl: "",
    youtubeUrl: "",
    tiktokUrl: "",
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        language: i18n.language || "en",
      });
    }
  }, [user, i18n.language]);

  const safeJsonParse = (value: string | null | undefined, defaultValue: any[] = []): any[] => {
    if (!value) return defaultValue;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
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
        spotifyUrl: currentOrg.spotifyUrl || "",
        instagramUrl: currentOrg.instagramUrl || "",
        youtubeUrl: currentOrg.youtubeUrl || "",
        tiktokUrl: currentOrg.tiktokUrl || "",
      });
    }
  }, [currentOrg]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    navigate(`/curator/settings?tab=${value}`);
  };

  const handleImageUpload = async (file: File, type: 'avatar' | 'banner' | 'cover') => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type === 'avatar' ? 'profile' : 'curator_image');

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      if (type === 'avatar') {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } else if (type === 'banner') {
        setOrgData(prev => ({ ...prev, bannerUrl: data.url }));
      } else {
        setOrgData(prev => ({ ...prev, coverImageUrl: data.url }));
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

  const userInitials = `${profileData.firstName?.[0] || ''}${profileData.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const avatarUrl = user?.profileImageFileId ? `/api/files/${user.profileImageFileId}/download` : undefined;

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('curatorSettings.title')}</h1>
        <p className="text-muted-foreground">{t('curatorSettings.description')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="hidden md:grid w-full grid-cols-5">
          <TabsTrigger value="profile">
            <User className="w-4 h-4 mr-2" />
            {t('curatorSettings.tabs.profile')}
          </TabsTrigger>
          <TabsTrigger value="organization">
            <Music className="w-4 h-4 mr-2" />
            {t('curatorSettings.tabs.organization')}
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="w-4 h-4 mr-2" />
            {t('curatorSettings.tabs.security')}
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="w-4 h-4 mr-2" />
            {t('curatorSettings.tabs.billing')}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="w-4 h-4 mr-2" />
            {t('curatorSettings.tabs.notifications')}
          </TabsTrigger>
        </TabsList>

        {/* Mobile Tabs */}
        <div className="md:hidden space-y-2">
          {[
            { value: 'profile', icon: User, label: t('curatorSettings.tabs.profile') },
            { value: 'organization', icon: Music, label: t('curatorSettings.tabs.organization') },
            { value: 'security', icon: Shield, label: t('curatorSettings.tabs.security') },
            { value: 'billing', icon: CreditCard, label: t('curatorSettings.tabs.billing') },
            { value: 'notifications', icon: Bell, label: t('curatorSettings.tabs.notifications') },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`w-full flex items-center gap-3 p-4 rounded-lg border transition-colors ${
                activeTab === tab.value 
                  ? 'bg-primary/10 border-primary text-primary' 
                  : 'bg-card border-border hover:bg-accent'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>{t('curatorSettings.profile.title')}</CardTitle>
              <CardDescription>{t('curatorSettings.profile.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={avatarUrl} alt="Profile" />
                  <AvatarFallback className="text-lg font-semibold">{userInitials}</AvatarFallback>
                </Avatar>
                <div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0], 'avatar')}
                    className="hidden"
                  />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    {t('curatorSettings.profile.changePhoto')}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('curatorSettings.profile.firstName')}</Label>
                  <Input value={profileData.firstName} disabled />
                </div>
                <div className="space-y-2">
                  <Label>{t('curatorSettings.profile.lastName')}</Label>
                  <Input value={profileData.lastName} disabled />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('curatorSettings.profile.email')}</Label>
                <Input value={profileData.email} disabled />
              </div>

              <div className="space-y-2">
                <Label>{t('curatorSettings.profile.language')}</Label>
                <Select value={i18n.language} onValueChange={(value) => i18n.changeLanguage(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="uk">Українська</SelectItem>
                    <SelectItem value="pl">Polski</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization Tab - Curator Landing Page */}
        <TabsContent value="organization">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('curatorSettings.organization.brandTitle')}</CardTitle>
                <CardDescription>{t('curatorSettings.organization.brandDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Brand Name */}
                <div className="space-y-2">
                  <Label>{t('curatorSettings.organization.brandName')}</Label>
                  <Input 
                    value={orgData.name}
                    onChange={(e) => setOrgData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder={t('curatorSettings.organization.brandNamePlaceholder')}
                  />
                </div>

                {/* Brand Avatar */}
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

                {/* Banner */}
                <div className="space-y-2">
                  <Label>{t('curatorSettings.organization.banner')}</Label>
                  <div className="relative w-full h-32 rounded-lg bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                    {orgData.bannerUrl ? (
                      <>
                        <img src={orgData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="absolute top-2 right-2"
                          onClick={() => setOrgData(prev => ({ ...prev, bannerUrl: "" }))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <div className="text-center">
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

                {/* Short Bio */}
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

                {/* About Me */}
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

            <div className="flex justify-end">
              <Button onClick={handleSaveOrganization} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {t('common.save')}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>{t('curatorSettings.security.title')}</CardTitle>
              <CardDescription>{t('curatorSettings.security.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium">{t('curatorSettings.security.changePassword')}</h3>
                <div className="space-y-2">
                  <Label>{t('curatorSettings.security.currentPassword')}</Label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <Label>{t('curatorSettings.security.newPassword')}</Label>
                  <Input type="password" />
                </div>
                <div className="space-y-2">
                  <Label>{t('curatorSettings.security.confirmPassword')}</Label>
                  <Input type="password" />
                </div>
                <Button variant="outline">{t('curatorSettings.security.updatePassword')}</Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium">{t('curatorSettings.security.twoFactor')}</h3>
                <p className="text-sm text-muted-foreground">{t('curatorSettings.security.twoFactorDescription')}</p>
                <Badge variant="outline">{t('curatorSettings.security.comingSoon')}</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing">
          <Card>
            <CardHeader>
              <CardTitle>{t('curatorSettings.billing.title')}</CardTitle>
              <CardDescription>{t('curatorSettings.billing.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="font-medium">{t('curatorSettings.billing.bankDetails')}</h3>
                <div className="space-y-2">
                  <Label>IBAN</Label>
                  <Input placeholder="UA..." />
                </div>
                <div className="space-y-2">
                  <Label>{t('curatorSettings.billing.bankName')}</Label>
                  <Input placeholder={t('curatorSettings.billing.bankNamePlaceholder')} />
                </div>
                <Button variant="outline">{t('curatorSettings.billing.saveDetails')}</Button>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium">{t('curatorSettings.billing.paymentHistory')}</h3>
                <p className="text-sm text-muted-foreground">{t('curatorSettings.billing.noPayments')}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>{t('curatorSettings.notifications.title')}</CardTitle>
              <CardDescription>{t('curatorSettings.notifications.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('curatorSettings.notifications.emailNotifications')}</p>
                    <p className="text-sm text-muted-foreground">{t('curatorSettings.notifications.emailDescription')}</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <FaTelegram className="text-[#0088cc]" />
                      Telegram
                    </p>
                    <p className="text-sm text-muted-foreground">{t('curatorSettings.notifications.telegramDescription')}</p>
                  </div>
                  <Button variant="outline" size="sm">{t('curatorSettings.notifications.connect')}</Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('curatorSettings.notifications.newApplications')}</p>
                    <p className="text-sm text-muted-foreground">{t('curatorSettings.notifications.newApplicationsDescription')}</p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('curatorSettings.notifications.statusUpdates')}</p>
                    <p className="text-sm text-muted-foreground">{t('curatorSettings.notifications.statusUpdatesDescription')}</p>
                  </div>
                  <Switch defaultChecked />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
