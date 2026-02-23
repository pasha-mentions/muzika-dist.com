import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CuratorSettingsLayout } from "@/components/curator/settings-layout";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Check } from "lucide-react";
import { validateUkrainianIBAN, validateTaxId, formatIBAN, maskIBAN } from "@/lib/validation";
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

interface PaymentDetail {
  id: string;
  recipientName: string;
  iban: string;
  taxId?: string;
  bankName: string;
  isPrimary: boolean;
}

export default function CuratorSettingsBilling() {
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
    mutationFn: async (id: string) => {
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
    mutationFn: async (id: string) => {
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

  const handleSetPrimary = (id: string) => {
    setPrimaryMutation.mutate(id);
  };

  return (
    <CuratorSettingsLayout>
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
                            {maskIBAN(detail.iban)}
                          </p>
                          {detail.taxId && (
                            <p className="text-sm text-muted-foreground font-mono">
                              {detail.taxId.slice(0, 3)}...{detail.taxId.slice(-2)}
                            </p>
                          )}
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
                {t("settings.billingDetails.taxId")} <span className="text-destructive">*</span>
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
              <p className="text-xs text-muted-foreground">{t("settings.billingDetails.taxIdPlaceholder")}</p>
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
              {deletePaymentDetailMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CuratorSettingsLayout>
  );
}
