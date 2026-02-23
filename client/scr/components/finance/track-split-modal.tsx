import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  validateUkrainianIBAN,
  validateTaxId,
  formatIBAN,
} from "@/lib/validation";
import {
  Loader2,
  Plus,
  Trash2,
  Info,
  Music,
  AlertTriangle,
  Settings,
} from "lucide-react";

interface PaymentDetail {
  id: string;
  recipientName: string;
  iban: string;
  taxId?: string;
  bankName: string;
  isPrimary: boolean;
}

interface Track {
  id: string;
  title: string;
  isrc?: string;
}

interface Release {
  id: string;
  title: string;
}

interface SplitParticipant {
  id: string;
  name: string;
  iban: string;
  taxId: string;
  bankName: string;
  percentage: number;
}

interface TrackSplitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: Track | null;
  release: Release | null;
  onSuccess?: () => void;
}

interface RoyaltySplitTemplate {
  id: string;
  name: string;
  splits: Array<{
    name: string;
    iban: string;
    taxId: string;
    bankName: string;
    percentage: number;
  }>;
}

export function TrackSplitModal({
  open,
  onOpenChange,
  track,
  release,
  onSuccess,
}: TrackSplitModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [splits, setSplits] = useState<SplitParticipant[]>([]);
  const [ibanErrors, setIbanErrors] = useState<Record<string, string>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  const { data: paymentDetails = [] } = useQuery<PaymentDetail[]>({
    queryKey: ["/api/payment-details"],
    enabled: open,
  });

  const primaryPaymentDetail = paymentDetails.find((pd) => pd.isPrimary);

  const { data: existingSplit, isLoading: isLoadingExisting } = useQuery<any>({
    queryKey: ["/api/track-splits", track?.id],
    queryFn: async () => {
      if (!track?.id) return null;
      const response = await fetch(`/api/track-splits/${track.id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Failed to fetch track split");
      }
      return response.json();
    },
    enabled: open && !!track?.id,
  });

  const { data: savedTemplates = [] } = useQuery<RoyaltySplitTemplate[]>({
    queryKey: ["/api/royalty-split-templates"],
    enabled: open,
  });

  const saveSplitMutation = useMutation({
    mutationFn: async (data: { trackId: string; releaseId: string; splits: any[] }) => {
      const response = await fetch("/api/track-splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save split configuration");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('trackSplits.saved'),
        description: t('trackSplits.savedDescription'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/track-splits"] });
      onSuccess?.();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('trackSplits.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (open && !isInitialized) {
      if (existingSplit?.splits && Array.isArray(existingSplit.splits)) {
        setSplits(
          existingSplit.splits.map((s: any, index: number) => ({
            id: `existing-${index}-${Date.now()}`,
            name: s.name || "",
            iban: s.iban || "",
            taxId: s.taxId || "",
            bankName: s.bankName || "",
            percentage: s.percentage || 0,
          }))
        );
      } else {
        setSplits([]);
      }
      setIsInitialized(true);
    }
  }, [open, existingSplit, isInitialized]);

  useEffect(() => {
    if (!open) {
      setIsInitialized(false);
      setIbanErrors({});
    }
  }, [open]);

  const handleAddSplit = () => {
    if (splits.length >= 10) {
      toast({
        title: t('trackSplits.limitReached'),
        description: t('trackSplits.maxParticipants'),
        variant: "destructive",
      });
      return;
    }

    setSplits([
      ...splits,
      {
        id: Date.now().toString(),
        name: "",
        iban: "",
        taxId: "",
        bankName: "",
        percentage: 0,
      },
    ]);
  };

  const handleRemoveSplit = (id: string) => {
    setSplits(splits.filter((s) => s.id !== id));
    const newErrors = { ...ibanErrors };
    delete newErrors[id];
    setIbanErrors(newErrors);
  };

  const handleUpdateSplit = (id: string, field: keyof SplitParticipant, value: any) => {
    setSplits(
      splits.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );

    if (field === "iban") {
      const newErrors = { ...ibanErrors };
      delete newErrors[id];
      setIbanErrors(newErrors);
    }
  };

  const handleLoadTemplate = (template: RoyaltySplitTemplate) => {
    const loadedSplits = template.splits.map((split, index) => ({
      ...split,
      id: `template-${index}-${Date.now()}`,
    }));
    setSplits(loadedSplits);
    toast({
      title: t('trackSplits.templateLoaded'),
      description: t('trackSplits.templateLoadedDescription', { name: template.name, count: template.splits.length }),
    });
  };

  const validateSplits = (): boolean => {
    if (splits.length === 0) {
      return true;
    }

    let hasError = false;
    const errors: Record<string, string> = {};
    const missingFields: string[] = [];

    splits.forEach((split, index) => {
      if (!split.name.trim()) {
        missingFields.push(`${t('trackSplits.participant')} ${index + 1}: ${t('trackSplits.name')}`);
        hasError = true;
      }

      if (!split.iban.trim()) {
        missingFields.push(`${t('trackSplits.participant')} ${index + 1}: IBAN`);
        hasError = true;
      } else {
        const ibanValidation = validateUkrainianIBAN(split.iban);
        if (!ibanValidation.valid) {
          errors[split.id] = ibanValidation.error || t('trackSplits.invalidIban');
          hasError = true;
        }
      }

      if (split.taxId.trim()) {
        const taxIdValidation = validateTaxId(split.taxId);
        if (!taxIdValidation.valid) {
          missingFields.push(`${t('trackSplits.participant')} ${index + 1}: ${t('trackSplits.invalidTaxId')}`);
          hasError = true;
        }
      }

      if (!split.bankName.trim()) {
        missingFields.push(`${t('trackSplits.participant')} ${index + 1}: ${t('trackSplits.bankName')}`);
        hasError = true;
      }

      if (split.percentage <= 0 || split.percentage > 100) {
        missingFields.push(`${t('trackSplits.participant')} ${index + 1}: ${t('trackSplits.validPercentage')}`);
        hasError = true;
      }
    });

    setIbanErrors(errors);

    if (hasError) {
      toast({
        title: t('trackSplits.validationError'),
        description: missingFields.length > 0
          ? `${t('trackSplits.pleaseFillIn')}: ${missingFields.join("; ")}`
          : t('trackSplits.fixErrors'),
        variant: "destructive",
      });
      return false;
    }

    const totalPercentage = splits.reduce(
      (sum, split) => sum + split.percentage,
      0
    );
    if (totalPercentage > 100) {
      toast({
        title: t('trackSplits.validationError'),
        description: t('trackSplits.percentageExceeds'),
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSave = () => {
    if (!track?.id || !release?.id) return;

    if (!validateSplits()) return;

    const splitsData = splits.map((split) => ({
      name: split.name,
      iban: split.iban,
      taxId: split.taxId,
      bankName: split.bankName,
      percentage: split.percentage,
    }));

    saveSplitMutation.mutate({
      trackId: track.id,
      releaseId: release.id,
      splits: splitsData,
    });
  };

  const getTotalSplitPercentage = () => {
    return splits.reduce((sum, split) => sum + (split.percentage || 0), 0);
  };

  const getRemainingPercentage = () => {
    return 100 - getTotalSplitPercentage();
  };

  if (!track || !release) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {t('trackSplits.configureTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('trackSplits.splitInfo')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold">
                  {track.title.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="font-medium">{track.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {release.title} {track.isrc && `• ${track.isrc}`}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {savedTemplates.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t('trackSplits.savedTemplates')}</CardTitle>
                <CardDescription className="text-xs">
                  {t('trackSplits.loadTemplateDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {savedTemplates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-2 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {template.splits.length} {t('trackSplits.participantCount')}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLoadTemplate(template)}
                      >
                        {t('trackSplits.load')}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!primaryPaymentDetail ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{t('trackSplits.noBillingDetails')}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    setLocation('/settings?tab=billing');
                  }}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {t('trackSplits.goToSettings')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  {t('trackSplits.organizationOwner')}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({t('trackSplits.remainingPercentage')})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{primaryPaymentDetail.recipientName}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatIBAN(primaryPaymentDetail.iban)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {primaryPaymentDetail.bankName}
                      {primaryPaymentDetail.taxId && ` • ${t('trackSplits.taxId')}: ${primaryPaymentDetail.taxId}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-primary">
                      {getRemainingPercentage()}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('trackSplits.ownerShare')}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t('trackSplits.splitInfo')}
            </AlertDescription>
          </Alert>

          {isLoadingExisting ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {splits.map((split, index) => (
                <Card key={split.id}>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {t('trackSplits.participant')} {index + 1}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveSplit(split.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="space-y-2">
                      <Label>
                        {t('trackSplits.name')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder={t('trackSplits.enterName')}
                        value={split.name}
                        onChange={(e) =>
                          handleUpdateSplit(split.id, "name", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>
                        IBAN <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder="UA00 0000 0000 0000 0000 0000 00000"
                        value={formatIBAN(split.iban)}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\s/g, "").toUpperCase();
                          handleUpdateSplit(split.id, "iban", cleaned);
                        }}
                      />
                      {ibanErrors[split.id] && (
                        <p className="text-sm text-destructive">
                          {ibanErrors[split.id]}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {t('trackSplits.ibanFormat')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        {t('trackSplits.taxId')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder="0000000000"
                        value={split.taxId}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/\D/g, "").slice(0, 10);
                          handleUpdateSplit(split.id, "taxId", cleaned);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('trackSplits.taxIdFormat')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        {t('trackSplits.bankName')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder={t('trackSplits.enterBankName')}
                        value={split.bankName}
                        onChange={(e) =>
                          handleUpdateSplit(split.id, "bankName", e.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t('trackSplits.percentage')}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={split.percentage || ""}
                          onChange={(e) =>
                            handleUpdateSplit(
                              split.id,
                              "percentage",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="flex-1"
                        />
                        <span className="text-sm text-muted-foreground w-8">%</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button
                variant="outline"
                className="w-full"
                onClick={handleAddSplit}
                disabled={splits.length >= 10 || !primaryPaymentDetail}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('trackSplits.addParticipant')}
              </Button>

              {splits.length > 0 && (
                <>
                  <Separator />
                  <Card>
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('trackSplits.totalSplitPercentage')}:</span>
                        <span
                          className={
                            getTotalSplitPercentage() > 100
                              ? "text-destructive font-medium"
                              : "font-medium"
                          }
                        >
                          {getTotalSplitPercentage().toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span>{t('trackSplits.remainingForMain')}:</span>
                        <span className="font-medium">
                          {getRemainingPercentage().toFixed(2)}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveSplitMutation.isPending || !primaryPaymentDetail}
          >
            {saveSplitMutation.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {t('trackSplits.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
