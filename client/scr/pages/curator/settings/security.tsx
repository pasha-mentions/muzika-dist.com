import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CuratorSettingsLayout } from "@/components/curator/settings-layout";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function CuratorSettingsSecurity() {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to change password');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('curatorSettings.security.passwordChanged'),
        description: t('curatorSettings.security.passwordChangedDescription'),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast({
        title: t('common.error'),
        description: t('curatorSettings.security.passwordMismatch'),
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: t('common.error'),
        description: t('curatorSettings.security.passwordTooShort'),
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <CuratorSettingsLayout>
      <Card>
        <CardHeader>
          <CardTitle>{t('curatorSettings.security.title')}</CardTitle>
          <CardDescription>{t('curatorSettings.security.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="font-medium">{t('curatorSettings.security.changePassword')}</h3>
            <div className="space-y-2">
              <Label>{t('curatorSettings.security.currentPassword')}</Label>
              <Input 
                type="password" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('curatorSettings.security.newPassword')}</Label>
              <Input 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('curatorSettings.security.confirmPassword')}</Label>
              <Input 
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            <Button 
              type="submit" 
              variant="outline"
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('curatorSettings.security.updatePassword')}
            </Button>
          </form>

          <Separator />

          <div className="space-y-4">
            <h3 className="font-medium">{t('curatorSettings.security.twoFactor')}</h3>
            <p className="text-sm text-muted-foreground">{t('curatorSettings.security.twoFactorDescription')}</p>
            <Badge variant="outline">{t('curatorSettings.security.comingSoon')}</Badge>
          </div>
        </CardContent>
      </Card>
    </CuratorSettingsLayout>
  );
}
