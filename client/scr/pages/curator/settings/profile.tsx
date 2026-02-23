import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2 } from "lucide-react";
import { CuratorSettingsLayout } from "@/components/curator/settings-layout";

export default function CuratorSettingsProfile() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    language: "en",
  });

  const [isUploading, setIsUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  const handleImageUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'profile');

      const response = await fetch('/api/upload/image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      // Update user profile with the new image file ID
      const updateResponse = await fetch('/api/users/profile-image', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ profileImageFileId: data.fileId }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update profile');
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

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

  const userInitials = `${profileData.firstName?.[0] || ''}${profileData.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const avatarUrl = user?.profileImageFileId ? `/api/files/download/${user.profileImageFileId}` : undefined;

  return (
    <CuratorSettingsLayout>
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
                onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
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
    </CuratorSettingsLayout>
  );
}
