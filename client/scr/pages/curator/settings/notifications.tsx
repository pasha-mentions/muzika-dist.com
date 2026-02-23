import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FaTelegram } from "react-icons/fa";
import { CuratorSettingsLayout } from "@/components/curator/settings-layout";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Copy, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CuratorOrganization {
  id: string;
  name: string;
}

interface NotificationPreferences {
  emailNotifications: boolean;
  newApplications: boolean;
  statusUpdates: boolean;
}

export default function CuratorSettingsNotifications() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [telegramCodeExpiry, setTelegramCodeExpiry] = useState<Date | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const { data: curatorOrg } = useQuery<CuratorOrganization>({
    queryKey: ["/api/curator/organization"],
    queryFn: async () => {
      const res = await fetch("/api/curator/organization", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch curator organization");
      return res.json();
    },
  });

  const { data: notificationPrefs, isLoading: prefsLoading } = useQuery<NotificationPreferences>({
    queryKey: ["/api/curator/notification-preferences"],
    queryFn: async () => {
      const res = await fetch("/api/curator/notification-preferences", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notification preferences");
      return res.json();
    },
  });

  const updatePrefsMutation = useMutation({
    mutationFn: async (prefs: Partial<NotificationPreferences>) => {
      const res = await fetch("/api/curator/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to update preferences");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/notification-preferences"] });
      toast({
        title: t('common.saved'),
        description: t('curatorSettings.notifications.preferencesSaved'),
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        description: t('curatorSettings.notifications.preferencesError'),
      });
    },
  });

  const { data: telegramStatus, refetch: refetchTelegramStatus } = useQuery({
    queryKey: ['/api/organizations', curatorOrg?.id, 'telegram', 'status'],
    enabled: !!curatorOrg?.id,
    queryFn: async () => {
      const response = await fetch(`/api/organizations/${curatorOrg!.id}/telegram/status`, {
        credentials: 'include'
      });
      return response.json();
    }
  });

  const handleGenerateTelegramCode = async () => {
    if (!curatorOrg?.id) return;
    setIsGeneratingCode(true);
    try {
      const response = await fetch(`/api/organizations/${curatorOrg.id}/telegram/generate-code`, {
        method: 'POST',
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setTelegramCode(data.code);
        setTelegramCodeExpiry(new Date(data.expiresAt));
      } else {
        toast({
          variant: "destructive",
          description: t('settings.telegram.generateError'),
        });
      }
    } catch (error) {
      console.error('Error generating Telegram code:', error);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    if (!curatorOrg?.id) return;
    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/organizations/${curatorOrg.id}/telegram`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (response.ok) {
        refetchTelegramStatus();
        queryClient.invalidateQueries({ queryKey: ['/api/organizations', curatorOrg.id, 'telegram', 'status'] });
        toast({
          title: t('settings.telegram.disconnected'),
          description: t('settings.telegram.disconnectedDesc'),
        });
      }
    } catch (error) {
      console.error('Error disconnecting Telegram:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleCopyCode = () => {
    if (telegramCode) {
      navigator.clipboard.writeText(telegramCode);
      toast({
        title: t('common.copied'),
        description: t('settings.telegram.codeCopied'),
      });
    }
  };

  const handleToggle = (key: keyof NotificationPreferences, value: boolean) => {
    updatePrefsMutation.mutate({ [key]: value });
  };

  return (
    <CuratorSettingsLayout>
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
              <Switch 
                checked={notificationPrefs?.emailNotifications ?? true}
                onCheckedChange={(checked) => handleToggle('emailNotifications', checked)}
                disabled={prefsLoading || updatePrefsMutation.isPending}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <FaTelegram className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium">Telegram</p>
                  <p className="text-sm text-muted-foreground">
                    {telegramStatus?.connected 
                      ? t('settings.telegram.connectedStatus')
                      : t('curatorSettings.notifications.telegramDescription')
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {telegramStatus?.connected ? (
                  <>
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle className="w-3 h-3 text-green-500" />
                      {t('settings.telegram.connected')}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDisconnectTelegram}
                      disabled={isDisconnecting}
                    >
                      {isDisconnecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        t('settings.telegram.disconnect')
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTelegramModalOpen(true);
                      handleGenerateTelegramCode();
                    }}
                  >
                    {t('curatorSettings.notifications.connect')}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t('curatorSettings.notifications.newApplications')}</p>
                <p className="text-sm text-muted-foreground">{t('curatorSettings.notifications.newApplicationsDescription')}</p>
              </div>
              <Switch 
                checked={notificationPrefs?.newApplications ?? true}
                onCheckedChange={(checked) => handleToggle('newApplications', checked)}
                disabled={prefsLoading || updatePrefsMutation.isPending}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{t('curatorSettings.notifications.statusUpdates')}</p>
                <p className="text-sm text-muted-foreground">{t('curatorSettings.notifications.statusUpdatesDescription')}</p>
              </div>
              <Switch 
                checked={notificationPrefs?.statusUpdates ?? true}
                onCheckedChange={(checked) => handleToggle('statusUpdates', checked)}
                disabled={prefsLoading || updatePrefsMutation.isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={telegramModalOpen} onOpenChange={setTelegramModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FaTelegram className="w-5 h-5 text-blue-500" />
              {t('settings.telegram.modalTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.telegram.modalDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('settings.telegram.step1')}</p>
              <a 
                href="https://t.me/muzika_distribution_bot" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <FaTelegram className="w-5 h-5 text-blue-500" />
                <span className="font-medium">@muzika_distribution_bot</span>
                <ExternalLink className="w-4 h-4 ml-auto text-muted-foreground" />
              </a>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('settings.telegram.step2')}</p>
              <p className="text-sm text-muted-foreground">{t('settings.telegram.step2Desc')}</p>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">{t('settings.telegram.step3')}</p>
              {isGeneratingCode ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : telegramCode ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-3 bg-muted rounded-lg font-mono text-lg text-center tracking-wider">
                    {telegramCode}
                  </div>
                  <Button variant="outline" size="icon" onClick={handleCopyCode}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ) : null}
              {telegramCodeExpiry && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('settings.telegram.codeExpiry', { 
                    time: format(telegramCodeExpiry, 'HH:mm') 
                  })}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTelegramModalOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CuratorSettingsLayout>
  );
}
