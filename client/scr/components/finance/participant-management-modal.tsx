import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { validateIBAN, formatIBAN, maskIBAN } from "@/lib/validation";
import { Loader2, Edit2, User, Crown, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Participant {
  id: string;
  name: string;
  taxId: string | null;
  isOwner: boolean;
  currentPaymentDetails: {
    id: string;
    iban: string;
    bankName: string;
    version: number;
    isCurrent: boolean;
  } | null;
}

interface ParticipantManagementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const paymentDetailsSchema = z.object({
  iban: z.string().min(15, "IBAN must be at least 15 characters").max(34, "IBAN must be at most 34 characters"),
  bankName: z.string().min(2, "Bank name is required"),
});

type PaymentDetailsFormData = z.infer<typeof paymentDetailsSchema>;

export function ParticipantManagementModal({ open, onOpenChange }: ParticipantManagementModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);

  const { data: participants, isLoading } = useQuery<Participant[]>({
    queryKey: ["/api/royalty-participants"],
    enabled: open,
  });

  const form = useForm<PaymentDetailsFormData>({
    resolver: zodResolver(paymentDetailsSchema),
    defaultValues: {
      iban: "",
      bankName: "",
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ participantId, data }: { participantId: string; data: PaymentDetailsFormData }) => {
      const response = await fetch(`/api/royalty-participants/${participantId}/payment-details`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update payment details");
      }
      return response.json();
    },
    onSuccess: (result) => {
      toast({
        title: t("finance.participantUpdated", "Payment details updated"),
        description: t("finance.allocationsUpdated", `${result.allocationsUpdated} allocations updated with new payment details.`),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/royalty-participants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/allocation-summary"] });
      setEditingParticipantId(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startEditing = (participant: Participant) => {
    setEditingParticipantId(participant.id);
    form.reset({
      iban: participant.currentPaymentDetails?.iban || "",
      bankName: participant.currentPaymentDetails?.bankName || "",
    });
  };

  const cancelEditing = () => {
    setEditingParticipantId(null);
    form.reset();
  };

  const onSubmit = (data: PaymentDetailsFormData) => {
    if (!editingParticipantId) return;
    
    const validation = validateIBAN(data.iban);
    if (!validation.isValid) {
      form.setError("iban", { message: validation.message });
      return;
    }
    
    updatePaymentMutation.mutate({ participantId: editingParticipantId, data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("finance.manageParticipants", "Manage Participants")}
          </DialogTitle>
          <DialogDescription>
            {t("finance.participantManagementDescription", "View and update payment details for split participants. Changes to IBAN will automatically update all pending allocations.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !participants || participants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("finance.noParticipants", "No participants found. Participants are created automatically when you configure track splits.")}
          </div>
        ) : (
          <div className="space-y-4">
            {participants.map((participant) => (
              <Card key={participant.id} className={editingParticipantId === participant.id ? "ring-2 ring-primary" : ""}>
                <CardHeader className="py-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      {participant.isOwner && <Crown className="h-4 w-4 text-yellow-500" />}
                      <span>{participant.name}</span>
                      {participant.isOwner && (
                        <Badge variant="secondary" className="text-xs">
                          {t("finance.owner", "Owner")}
                        </Badge>
                      )}
                    </div>
                    {editingParticipantId !== participant.id && (
                      <Button variant="ghost" size="sm" onClick={() => startEditing(participant)}>
                        <Edit2 className="h-4 w-4 mr-1" />
                        {t("common.edit", "Edit")}
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2">
                  {editingParticipantId === participant.id ? (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                          control={form.control}
                          name="iban"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>IBAN</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="UA000000000000000000000000000" 
                                  onChange={(e) => field.onChange(formatIBAN(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="bankName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("finance.bankName", "Bank Name")}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder={t("finance.bankNamePlaceholder", "Enter bank name")} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex gap-2 justify-end">
                          <Button type="button" variant="outline" size="sm" onClick={cancelEditing}>
                            <X className="h-4 w-4 mr-1" />
                            {t("common.cancel", "Cancel")}
                          </Button>
                          <Button type="submit" size="sm" disabled={updatePaymentMutation.isPending}>
                            {updatePaymentMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-1" />
                            )}
                            {t("common.save", "Save")}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">IBAN:</span>
                        <p className="font-mono">
                          {participant.currentPaymentDetails?.iban 
                            ? maskIBAN(participant.currentPaymentDetails.iban) 
                            : t("finance.notSet", "Not set")}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("finance.bankName", "Bank")}:</span>
                        <p>{participant.currentPaymentDetails?.bankName || t("finance.notSet", "Not set")}</p>
                      </div>
                      {participant.taxId && (
                        <div>
                          <span className="text-muted-foreground">{t("finance.taxId", "Tax ID")}:</span>
                          <p>{participant.taxId}</p>
                        </div>
                      )}
                      {participant.currentPaymentDetails && (
                        <div>
                          <span className="text-muted-foreground">{t("finance.version", "Version")}:</span>
                          <p>v{participant.currentPaymentDetails.version}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Separator className="my-4" />
        
        <div className="text-sm text-muted-foreground">
          {t("finance.ibanUpdateNote", "Note: When you update IBAN, only AVAILABLE allocations are updated. Reserved or paid allocations keep their original payment details for audit purposes.")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
