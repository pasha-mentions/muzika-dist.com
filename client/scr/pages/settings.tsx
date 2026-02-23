import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Shield, CreditCard, Users, Key, Bell, Globe, Upload, Loader2, Music, Link as LinkIcon, Plus, Trash2, Check } from "lucide-react";
import { FaSpotify, FaApple, FaYoutube, FaTiktok, FaInstagram, FaTelegram } from "react-icons/fa";
import { Plug, Copy, ExternalLink, CheckCircle, XCircle } from "lucide-react";
import { countries } from "@/../../shared/countries";
import { getDistributionAgreement } from "@/../../shared/agreements";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { validateUkrainianIBAN, validateTaxId, formatIBAN } from "@/lib/validation";
import { GiftMarker } from "@/components/holiday/GiftMarker";

// Set Password Form Component
function SetPasswordForm({ user }: { user: any }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8 || pwd.length > 32) return false;
    if (!/\d/.test(pwd)) return false;  // Must have at least one digit
    if (!/[a-zA-Z]/.test(pwd)) return false;  // Must have at least one letter
    return true;
  };

  const handleSetPassword = async () => {
    if (!password || !confirmPassword) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    if (!validatePassword(password)) {
      toast({
        title: "Error",
        description: "Password must be 8-32 characters long and contain at least one letter and one digit",
        variant: "destructive",
      });
      return;
    }

    setIsSettingPassword(true);
    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to set password');
      }

      toast({
        title: "Success",
        description: user?.passwordHash 
          ? "Password updated successfully" 
          : "Password set successfully. You can now login with email and password.",
      });

      // Clear form
      setPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set password",
        variant: "destructive",
      });
    } finally {
      setIsSettingPassword(false);
    }
  };

  return (
    <div className="space-y-4 max-w-md">
      <div className="space-y-2">
        <Label htmlFor="newPassword">New Password</Label>
        <Input
          id="newPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter new password"
        />
        <p className="text-xs text-muted-foreground">
          8-32 characters, at least one letter and one digit
        </p>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
        />
      </div>

      <Button 
        onClick={handleSetPassword}
        disabled={isSettingPassword}
      >
        {isSettingPassword ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Setting Password...
          </>
        ) : (
          user?.passwordHash ? "Update Password" : "Set Password"
        )}
      </Button>
    </div>
  );
}

interface PaymentDetail {
  id: number;
  recipientName: string;
  iban: string;
  taxId?: string;
  bankName: string;
  isPrimary: boolean;
  createdAt: string;
}

function BillingSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPaymentDetail, setSelectedPaymentDetail] = useState<PaymentDetail | null>(null);
  const [formData, setFormData] = useState({
    recipientName: "",
    iban: "",
    taxId: "",
    bankName: "",
    isPrimary: false,
  });
  const [ibanError, setIbanError] = useState("");

  const { data: paymentDetails = [], isLoading } = useQuery<PaymentDetail[]>({
    queryKey: ["/api/payment-details"],
  });

  const addPaymentDetailMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetch("/api/payment-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to add payment details");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-details"] });
      toast({
        title: t("settings.billingDetails.paymentDetailAdded"),
        description: t("settings.billingDetails.paymentDetailAddedDesc"),
      });
      setAddDialogOpen(false);
      setFormData({ recipientName: "", iban: "", taxId: "", bankName: "", isPrimary: false });
      setIbanError("");
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePaymentDetailMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/payment-details/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete payment details");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-details"] });
      toast({
        title: t("settings.billingDetails.paymentDetailDeleted"),
        description: t("settings.billingDetails.paymentDetailDeletedDesc"),
      });
      setDeleteDialogOpen(false);
      setSelectedPaymentDetail(null);
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/payment-details/${id}/primary`, {
        method: "PUT",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to set primary payment details");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-details"] });
      toast({
        title: t("settings.billingDetails.primaryUpdated"),
        description: t("settings.billingDetails.primaryUpdatedDesc"),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddSubmit = () => {
    if (!formData.recipientName || !formData.iban || !formData.taxId || !formData.bankName) {
      toast({
        title: t("common.error"),
        description: t("settings.billingDetails.fillAllFields"),
        variant: "destructive",
      });
      return;
    }

    const validation = validateUkrainianIBAN(formData.iban);
    if (!validation.valid) {
      setIbanError(validation.error || "Invalid IBAN");
      toast({
        title: t("common.error"),
        description: validation.error || "Invalid IBAN",
        variant: "destructive",
      });
      return;
    }

    const taxIdValidation = validateTaxId(formData.taxId);
    if (!taxIdValidation.valid) {
      toast({
        title: t("common.error"),
        description: taxIdValidation.error || "Invalid Tax ID (РНОКПП)",
        variant: "destructive",
      });
      return;
    }

    addPaymentDetailMutation.mutate(formData);
  };

  const handleDelete = () => {
    if (selectedPaymentDetail) {
      deletePaymentDetailMutation.mutate(selectedPaymentDetail.id);
    }
  };

  const handleSetPrimary = (id: number) => {
    setPrimaryMutation.mutate(id);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.billingDetails.savedPaymentDetails")}</CardTitle>
          <CardDescription>{t("settings.billingDetails.savedPaymentDetailsDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : paymentDetails.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">{t("settings.billingDetails.noPaymentDetails")}</p>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("settings.billingDetails.addPaymentDetails")}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paymentDetails.map((detail) => (
                  <Card key={detail.id} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{detail.recipientName}</h4>
                            {detail.isPrimary && (
                              <Badge variant="default" className="bg-primary">
                                <Check className="h-3 w-3 mr-1" />
                                {t("settings.billingDetails.primary")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground font-mono">
                            {formatIBAN(detail.iban)}
                          </p>
                          <p className="text-sm text-muted-foreground">{detail.bankName}</p>
                        </div>
                        <div className="flex gap-2">
                          {!detail.isPrimary && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetPrimary(detail.id)}
                              disabled={setPrimaryMutation.isPending}
                            >
                              {t("settings.billingDetails.setPrimary")}
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              setSelectedPaymentDetail(detail);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deletePaymentDetailMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button onClick={() => setAddDialogOpen(true)} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                {t("settings.billingDetails.addPaymentDetails")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.billingDetails.addPaymentDetails")}</DialogTitle>
            <DialogDescription>{t("settings.billingDetails.addPaymentDetailsDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recipientName">
                {t("settings.billingDetails.recipientName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="recipientName"
                value={formData.recipientName}
                onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                placeholder={t("settings.billingDetails.recipientNamePlaceholder")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iban">
                {t("settings.billingDetails.iban")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="iban"
                value={formData.iban}
                onChange={(e) => {
                  setFormData({ ...formData, iban: e.target.value });
                  setIbanError("");
                }}
                placeholder="UA123456789012345678901234567"
                className={ibanError ? "border-destructive" : ""}
                required
              />
              {ibanError && <p className="text-sm text-destructive">{ibanError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">
                РНОКПП <span className="text-destructive">*</span>
              </Label>
              <Input
                id="taxId"
                value={formData.taxId}
                maxLength={10}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setFormData({ ...formData, taxId: value });
                }}
                placeholder="0000000000"
                required
              />
              <p className="text-xs text-muted-foreground">10 цифр (обов'язково)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">
                {t("settings.billingDetails.bankName")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bankName"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                placeholder={t("settings.billingDetails.bankNamePlaceholder")}
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPrimary"
                checked={formData.isPrimary}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isPrimary: checked as boolean })
                }
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">
                {t("settings.billingDetails.setAsPrimary")}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddDialogOpen(false);
                setFormData({ recipientName: "", iban: "", taxId: "", bankName: "", isPrimary: false });
                setIbanError("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleAddSubmit} disabled={addPaymentDetailMutation.isPending}>
              {addPaymentDetailMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.billingDetails.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.billingDetails.deleteConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    sms: false,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchCountry, setSearchCountry] = useState("");
  
  const urlParams = new URLSearchParams(window.location.search);
  const tabFromUrl = urlParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Update URL when tab changes
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('tab', value);
    window.history.pushState({}, '', newUrl.toString());
  };
  
  useEffect(() => {
    const checkUrlChange = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') || 'profile';
      if (tab !== activeTab) {
        setActiveTab(tab);
      }
    };

    const interval = setInterval(checkUrlChange, 100);
    
    return () => {
      clearInterval(interval);
    };
  }, [activeTab]);
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    country: "",
    address: "",
    city: "",
    postalCode: "",
    agreementAccepted: false,
  });
  const [orgData, setOrgData] = useState({
    name: "",
    type: "ARTIST_ORG" as "ARTIST_ORG" | "LABEL",
    spotifyUrl: "",
    appleMusicUrl: "",
    youtubeUrl: "",
    tiktokUrl: "",
    instagramUrl: "",
  });

  // Telegram integration state
  const [telegramModalOpen, setTelegramModalOpen] = useState(false);
  const [telegramCode, setTelegramCode] = useState<string | null>(null);
  const [telegramCodeExpiry, setTelegramCodeExpiry] = useState<Date | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Fetch Telegram status
  const currentOrg = user?.organizations?.[0];
  const { data: telegramStatus, refetch: refetchTelegramStatus } = useQuery({
    queryKey: ['/api/organizations', currentOrg?.id, 'telegram', 'status'],
    queryFn: async () => {
      if (!currentOrg?.id) return { connected: false };
      const response = await fetch(`/api/organizations/${currentOrg.id}/telegram/status`, {
        credentials: 'include',
      });
      if (!response.ok) return { connected: false };
      return response.json();
    },
    enabled: !!currentOrg?.id,
  });

  const handleGenerateTelegramCode = async () => {
    if (!currentOrg?.id) return;
    setIsGeneratingCode(true);
    try {
      const response = await fetch(`/api/organizations/${currentOrg.id}/telegram/generate-code`, {
        method: 'POST',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setTelegramCode(data.code);
        setTelegramCodeExpiry(new Date(data.expiresAt));
      } else {
        toast({
          title: t('toast.error'),
          description: t('settings.telegram.generateError'),
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error generating code:', error);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    if (!currentOrg?.id) return;
    setIsDisconnecting(true);
    try {
      const response = await fetch(`/api/organizations/${currentOrg.id}/telegram`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (response.ok) {
        refetchTelegramStatus();
        toast({
          title: t('settings.telegram.disconnected'),
          description: t('settings.telegram.disconnectedDesc'),
        });
      }
    } catch (error) {
      console.error('Error disconnecting:', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleCopyCode = () => {
    if (telegramCode) {
      navigator.clipboard.writeText(telegramCode);
      toast({
        title: t('toast.copied'),
        description: t('settings.telegram.codeCopied'),
      });
    }
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: t('toast.unauthorized'),
        description: t('toast.unauthorizedDesc'),
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast, t]);

  // Initialize profile data from user
  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        country: user.country || "",
        address: user.address || "",
        city: user.city || "",
        postalCode: user.postalCode || "",
        agreementAccepted: user.agreementAccepted || false,
      });
    }
  }, [user]);

  // Initialize organization data from current org
  useEffect(() => {
    const userOrg = user?.organizations?.[0];
    if (userOrg) {
      setOrgData({
        name: userOrg.name || "",
        type: (userOrg.type as "ARTIST_ORG" | "LABEL") || "ARTIST_ORG",
        spotifyUrl: (userOrg as any).spotifyUrl || "",
        appleMusicUrl: (userOrg as any).appleMusicUrl || "",
        youtubeUrl: (userOrg as any).youtubeUrl || "",
        tiktokUrl: (userOrg as any).tiktokUrl || "",
        instagramUrl: (userOrg as any).instagramUrl || "",
      });
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/gif'].includes(file.type)) {
      toast({
        title: t('toast.invalidFormat'),
        description: t('toast.invalidFormatDesc'),
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: t('toast.fileTooLarge'),
        description: t('toast.fileTooLargeDesc'),
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/user/avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload avatar');
      }

      const { avatarUrl } = await response.json();
      
      toast({
        title: t('toast.avatarUpdated'),
        description: t('toast.avatarUpdatedDesc'),
      });

      // Refresh page to show new avatar
      window.location.reload();
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('toast.avatarUploadError'),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      // Don't send agreementAccepted if already accepted (to preserve timestamp)
      const { agreementAccepted, ...restData } = profileData;
      const dataToSend = user?.agreementAccepted 
        ? restData 
        : profileData;
      
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(dataToSend),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      toast({
        title: t('toast.profileUpdated'),
        description: t('toast.profileUpdatedDesc'),
      });

      // Refresh to get updated user data
      window.location.reload();
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('toast.profileUpdateError'),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!currentOrg?.id) return;
    
    setIsSaving(true);
    try {
      const response = await fetch(`/api/organizations/${currentOrg.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(orgData),
      });

      if (!response.ok) {
        throw new Error('Failed to update organization');
      }

      toast({
        title: t('toast.orgUpdated'),
        description: t('toast.orgUpdatedDesc'),
      });

      // Refresh to get updated org data
      window.location.reload();
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: t('toast.orgUpdateError'),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationChange = (type: string, enabled: boolean) => {
    toast({
      title: t('toast.featureInDevelopment'),
      description: t('toast.featureInDevelopmentDesc'),
      variant: "default",
    });
  };

  const handleInDevelopmentClick = () => {
    toast({
      title: t('toast.featureInDevelopment'),
      description: t('toast.featureInDevelopmentDesc'),
      variant: "default",
    });
  };

  const handle2FAClick = () => {
    toast({
      title: t('toast.featureInDevelopment'),
      description: t('toast.featureInDevelopmentDesc'),
      variant: "default",
    });
  };

  const handleDownloadDataClick = () => {
    toast({
      title: t('toast.featureInDevelopment'),
      description: t('toast.featureInDevelopmentDesc'),
      variant: "default",
    });
  };

  const handleDeleteAccountClick = () => {
    toast({
      title: t('toast.requestSent'),
      description: t('toast.deleteAccountRequest'),
      variant: "default",
    });
  };

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchCountry.toLowerCase())
  );

  // Fetch transaction history
  const { data: transactions = [], isError } = useQuery<any[]>({
    queryKey: ["/api/releases/paid/history"],
    queryFn: async () => {
      const res = await fetch("/api/releases/paid/history", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch transaction history");
      return res.json();
    },
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const userInitials = user?.firstName && user?.lastName 
    ? `${user.firstName[0]}${user.lastName[0]}` 
    : user?.email?.[0]?.toUpperCase() || 'U';
  
  // Get avatar URL - use download endpoint if fileId exists
  const avatarUrl = (user as any)?.profileImageFileId 
    ? `/api/files/download/${(user as any).profileImageFileId}`
    : user?.profileImageUrl || undefined;

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="mb-8 hidden md:block relative">
          <h1 className="text-2xl font-semibold text-foreground">{t('settings.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('settings.description')}
          </p>
          <GiftMarker placementId="settings-banner" className="absolute top-0 right-0" />
        </div>
        {/* Mobile-visible gift marker for settings */}
        <div className="md:hidden relative mb-4">
          <GiftMarker placementId="settings-banner" className="absolute top-0 right-0" />
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="hidden md:grid w-full grid-cols-5">
            <TabsTrigger value="profile" data-testid="tab-profile" data-tour="profile-tab">
              <User className="w-4 h-4 mr-2" />
              {t('settings.profile')}
            </TabsTrigger>
            <TabsTrigger value="organization" data-testid="tab-organization" data-tour="organization-tab">
              <Users className="w-4 h-4 mr-2" />
              {t('settings.organization')}
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security" data-tour="security-tab">
              <Shield className="w-4 h-4 mr-2" />
              {t('settings.security')}
            </TabsTrigger>
            <TabsTrigger value="billing" data-testid="tab-billing" data-tour="billing-tab">
              <CreditCard className="w-4 h-4 mr-2" />
              {t('settings.billing')}
            </TabsTrigger>
            <TabsTrigger value="notifications" data-testid="tab-notifications" data-tour="notifications-tab">
              <Bell className="w-4 h-4 mr-2" />
              {t('settings.notifications')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.profileInfo")}</CardTitle>
                <CardDescription>{t("settings.profileDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6" data-tour="profile-section">
                <div className="flex items-center space-x-4">
                  <Avatar className="w-20 h-20">
                    <AvatarImage src={avatarUrl} alt="Profile" />
                    <AvatarFallback className="text-lg font-semibold">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/gif"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isUploading}
                      data-testid="button-change-photo"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {t("settings.uploading")}
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          {t("settings.updatePhoto")}
                        </>
                      )}
                    </Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      {t("settings.photoRequirements")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">{t("settings.firstName")}</Label>
                    <Input 
                      id="firstName" 
                      value={profileData.firstName}
                      disabled
                      data-testid="input-first-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact admin to change your name
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">{t("settings.lastName")}</Label>
                    <Input 
                      id="lastName" 
                      value={profileData.lastName}
                      disabled
                      data-testid="input-last-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Contact admin to change your name
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    defaultValue={user?.email || ""} 
                    disabled
                    data-testid="input-email"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("settings.emailCannotChange")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">Language</Label>
                  <Select 
                    value={i18n.language || 'en'}
                    onValueChange={async (value) => {
                      i18n.changeLanguage(value);
                      localStorage.setItem('language', value);
                      
                      try {
                        const response = await fetch('/api/user/profile', {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          credentials: 'include',
                          body: JSON.stringify({ preferredLanguage: value }),
                        });
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('Failed to save language preference:', errorText);
                          toast({
                            variant: "destructive",
                            title: t("toast.error"),
                            description: "Failed to save language preference",
                          });
                        }
                      } catch (error) {
                        console.error('Failed to save language preference:', error);
                        toast({
                          variant: "destructive",
                          title: t("toast.error"),
                          description: "Failed to save language preference",
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="uk">Українська</SelectItem>
                      <SelectItem value="pl">Polski</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t("settings.addressSection")}</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="country">{t("common.country")}</Label>
                    <Select 
                      value={profileData.country}
                      onValueChange={(value) => setProfileData({ ...profileData, country: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("settings.selectCountry")} />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="p-2">
                          <Input 
                            placeholder={t("settings.searchCountry")} 
                            value={searchCountry}
                            onChange={(e) => setSearchCountry(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <ScrollArea className="h-72">
                          {filteredCountries.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </ScrollArea>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">{t("settings.addressSection")}</Label>
                    <Input 
                      id="address" 
                      placeholder={t("settings.addressPlaceholder")}
                      value={profileData.address}
                      onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("settings.city")}</Label>
                      <Input 
                        id="city" 
                        value={profileData.city}
                        onChange={(e) => setProfileData({ ...profileData, city: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postalCode">{t("settings.postalCode")}</Label>
                      <Input 
                        id="postalCode" 
                        value={profileData.postalCode}
                        onChange={(e) => setProfileData({ ...profileData, postalCode: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t("settings.distributionAgreement")}</h3>
                  <Card className="border-2">
                    <CardContent className="p-4">
                      <ScrollArea className="h-64 w-full rounded-md border p-4">
                        <div className="whitespace-pre-wrap text-sm">
                          {getDistributionAgreement(i18n.language as 'en' | 'uk' | 'pl')}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="agreement"
                      checked={profileData.agreementAccepted}
                      disabled={user?.agreementAccepted || false}
                      onCheckedChange={(checked) => {
                        if (!user?.agreementAccepted && typeof checked === 'boolean') {
                          setProfileData({ ...profileData, agreementAccepted: checked })
                        }
                      }}
                    />
                    <Label 
                      htmlFor="agreement" 
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {t("settings.agreementText")}
                      {user?.agreementAccepted && user?.agreementAcceptedAt && (
                        <span className="block text-xs text-muted-foreground mt-1">
                          {t("settings.acceptedOn")} {new Date(user.agreementAcceptedAt).toLocaleDateString('uk-UA', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </Label>
                  </div>
                </div>

                <Button 
                  onClick={handleSaveProfile} 
                  disabled={isSaving}
                  data-testid="button-save-profile"
                  className="w-full md:w-auto"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("settings.saving")}
                    </>
                  ) : (
                    t("settings.saveChanges")
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="organization">
            <Card>
              <CardHeader>
                <CardTitle>{t('settings.organizationSettings')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="orgName">{t('settings.artistOrOrgName')}</Label>
                  <Input 
                    id="orgName" 
                    value={orgData.name}
                    disabled
                    data-testid="input-org-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.assignedByAdmin')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgType">{t('settings.organizationType')}</Label>
                  <Select 
                    value={orgData.type}
                    disabled
                  >
                    <SelectTrigger data-testid="select-org-type" disabled>
                      <SelectValue placeholder={t('settings.selectOrgType')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ARTIST_ORG">{t('settings.orgTypes.artist')}</SelectItem>
                      <SelectItem value="LABEL">{t('settings.orgTypes.label')}</SelectItem>
                      <SelectItem value="TEAM">{t('settings.orgTypes.team')}</SelectItem>
                      <SelectItem value="ADMIN">{t('settings.orgTypes.admin')}</SelectItem>
                      <SelectItem value="PLAYLIST_CURATOR">{t('settings.orgTypes.curator')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.assignedByAdmin')}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.currentPlan')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {t(`settings.planTypes.${currentOrg?.planType || 'FREE'}`)} {t('settings.plan')}
                    </p>
                  </div>
                  <Badge variant="secondary" data-testid="badge-plan-type">
                    {t(`settings.planTypes.${currentOrg?.planType || 'FREE'}`)}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>{t('settings.monthlyReleaseLimit')}</Label>
                    <p className="text-sm text-muted-foreground">
                      {currentOrg?.monthlyReleaseLimit || 2} {t('settings.releasesPerMonth')}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">{t('settings.teamMembers')}</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={avatarUrl} />
                          <AvatarFallback className="text-sm">
                            {userInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">
                            {user?.firstName} {user?.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">{t('settings.owner')}</Badge>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full mt-3" data-testid="button-invite-member">
                    {t('settings.inviteTeamMember')}
                  </Button>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" />
                    {t('settings.myLinks')}
                  </h4>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="spotifyUrl" className="flex items-center gap-2">
                          <FaSpotify className="w-4 h-4 text-green-500" />
                          Spotify
                        </Label>
                        <Input
                          id="spotifyUrl"
                          placeholder="https://open.spotify.com/artist/..."
                          value={orgData.spotifyUrl}
                          onChange={(e) => setOrgData({ ...orgData, spotifyUrl: e.target.value })}
                          data-testid="input-spotify-url"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="appleMusicUrl" className="flex items-center gap-2">
                          <FaApple className="w-4 h-4" />
                          Apple Music
                        </Label>
                        <Input
                          id="appleMusicUrl"
                          placeholder="https://music.apple.com/artist/..."
                          value={orgData.appleMusicUrl}
                          onChange={(e) => setOrgData({ ...orgData, appleMusicUrl: e.target.value })}
                          data-testid="input-apple-music-url"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="youtubeUrl" className="flex items-center gap-2">
                          <FaYoutube className="w-4 h-4 text-red-500" />
                          YouTube
                        </Label>
                        <Input
                          id="youtubeUrl"
                          placeholder="https://youtube.com/@..."
                          value={orgData.youtubeUrl}
                          onChange={(e) => setOrgData({ ...orgData, youtubeUrl: e.target.value })}
                          data-testid="input-youtube-url"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tiktokUrl" className="flex items-center gap-2">
                          <FaTiktok className="w-4 h-4" />
                          TikTok
                        </Label>
                        <Input
                          id="tiktokUrl"
                          placeholder="https://tiktok.com/@..."
                          value={orgData.tiktokUrl}
                          onChange={(e) => setOrgData({ ...orgData, tiktokUrl: e.target.value })}
                          data-testid="input-tiktok-url"
                        />
                      </div>

                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="instagramUrl" className="flex items-center gap-2">
                          <FaInstagram className="w-4 h-4 text-pink-500" />
                          Instagram
                        </Label>
                        <Input
                          id="instagramUrl"
                          placeholder="https://instagram.com/..."
                          value={orgData.instagramUrl}
                          onChange={(e) => setOrgData({ ...orgData, instagramUrl: e.target.value })}
                          data-testid="input-instagram-url"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Integrations Section */}
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Plug className="w-4 h-4" />
                    {t('settings.integrations.title')}
                  </h4>
                  <div className="space-y-4">
                    {/* Telegram Integration */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                          <FaTelegram className="w-5 h-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="font-medium">Telegram</p>
                          <p className="text-sm text-muted-foreground">
                            {telegramStatus?.connected 
                              ? t('settings.telegram.connectedStatus')
                              : t('settings.telegram.description')
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
                            {t('settings.telegram.connect')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Telegram Connection Modal */}
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

                <Button 
                  onClick={handleSaveOrganization}
                  disabled={isSaving}
                  data-testid="button-save-org"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t("settings.saving")}
                    </>
                  ) : (
                    t('settings.saveOrgSettings')
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-3">Password</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    {user?.passwordHash 
                      ? "Update your password for email/password login" 
                      : "Set a password to enable email/password login"}
                  </p>
                  <SetPasswordForm user={user} />
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">Two-Factor Authentication</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add an extra layer of security to your account
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={handle2FAClick}
                    data-testid="button-setup-2fa"
                  >
                    Setup 2FA
                  </Button>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">Active Sessions</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    These are the devices currently logged into your account
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Current Session</p>
                        <p className="text-xs text-muted-foreground">
                          Browser • {new Date().toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="secondary">Active</Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-3">Account Actions</h4>
                  <div className="space-y-3">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start" 
                      onClick={handleDownloadDataClick}
                      data-testid="button-download-data"
                    >
                      <Globe className="w-4 h-4 mr-2" />
                      Download Your Data
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="w-full justify-start" 
                      onClick={handleDeleteAccountClick}
                      data-testid="button-delete-account"
                    >
                      <User className="w-4 h-4 mr-2" />
                      Delete Account
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing">
            <BillingSection />
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-4">Release Notifications</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Email Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified about release status updates via email
                        </p>
                      </div>
                      <Switch
                        disabled
                        checked={notifications.email}
                        onCheckedChange={(checked) => handleNotificationChange('email', checked)}
                        data-testid="switch-email-notifications"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Push Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive push notifications in your browser
                        </p>
                      </div>
                      <Switch
                        disabled
                        checked={notifications.push}
                        onCheckedChange={(checked) => handleNotificationChange('push', checked)}
                        data-testid="switch-push-notifications"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>SMS Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Get text messages for important updates
                        </p>
                      </div>
                      <Switch
                        disabled
                        checked={notifications.sms}
                        onCheckedChange={(checked) => handleNotificationChange('sms', checked)}
                        data-testid="switch-sms-notifications"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="text-sm font-medium mb-4">Revenue Notifications</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Monthly Reports</Label>
                        <p className="text-sm text-muted-foreground">
                          Receive monthly revenue reports
                        </p>
                      </div>
                      <Switch 
                        disabled
                        onCheckedChange={handleInDevelopmentClick} 
                        data-testid="switch-monthly-reports" 
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>Payout Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified when payouts are processed
                        </p>
                      </div>
                      <Switch 
                        disabled
                        onCheckedChange={handleInDevelopmentClick} 
                        data-testid="switch-payout-notifications" 
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Legal Information Section */}
        <div className="mt-8 pt-6 border-t border-border">
          <h4 className="text-sm font-medium mb-4 text-muted-foreground">{t('legal.title')}</h4>
          <div className="flex flex-wrap gap-4">
            <a href="/legal/privacy" className="text-sm text-primary hover:underline">
              {t('legal.privacy.title')}
            </a>
            <a href="/legal/offer" className="text-sm text-primary hover:underline">
              {t('legal.offer.title')}
            </a>
            <a href="/legal/terms" className="text-sm text-primary hover:underline">
              {t('legal.terms.title')}
            </a>
            <a href="/legal/refund" className="text-sm text-primary hover:underline">
              {t('legal.refund.title')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
