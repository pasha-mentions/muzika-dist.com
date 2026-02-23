import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  validateUkrainianIBAN,
  validateTaxId,
  formatIBAN,
  maskIBAN,
} from "@/lib/validation";
import {
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Info,
  Music,
  User,
  Users,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface WithdrawalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableBalance: number;
  onSuccess: () => void;
}

interface PaymentDetails {
  id: string;
  recipientName: string;
  iban: string;
  taxId?: string;
  bankName: string;
}

interface RoyaltySplit {
  id: string;
  name: string;
  iban: string;
  taxId: string;
  bankName: string;
  percentage: number;
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

interface AllocationParticipant {
  participantName: string;
  participantIban: string;
  participantTaxId: string | null;
  participantBankName: string | null;
  totalAmount: number;
  percentage: number;
  allocationIds: string[];
  isOwner?: boolean;
  tracks?: Array<{
    trackId: string;
    trackTitle: string;
    releaseTitle: string;
    amount: number;
    allocationId: string;
  }>;
}

interface AllocationSummary {
  participants: AllocationParticipant[];
  totalAvailable: number;
  allocationsCount: number;
  // New fields for dual-balance display
  ownerLegacyBalance: number; // Legacy balance (goes 100% to owner)
  ownerAllocationShare: number; // Owner's share from splits
  ownerTotal: number; // Total for owner (legacy + allocation share)
  participantsTotal: number; // Total for other split participants
  combinedTotal: number; // Grand total available
  ownerName: string;
  ownerIban: string | null;
}

const step1Schema = z.object({
  paymentMethod: z.enum(["existing", "new"]),
  existingPaymentId: z.string().optional(),
  recipientName: z.string().optional(),
  iban: z.string().optional(),
  taxId: z.string().optional(),
  bankName: z.string().optional(),
  saveForFuture: z.boolean().optional(),
}).refine((data) => {
  if (data.paymentMethod === "new") {
    return !!(data.recipientName && data.recipientName.trim().length > 0);
  }
  return true;
}, {
  message: "Recipient name is required",
  path: ["recipientName"],
}).refine((data) => {
  if (data.paymentMethod === "new") {
    if (!data.iban) return false;
    const validation = validateUkrainianIBAN(data.iban);
    return validation.valid;
  }
  return true;
}, {
  message: "Valid IBAN is required (country code + digits, 15-34 chars)",
  path: ["iban"],
}).refine((data) => {
  if (data.paymentMethod === "new") {
    if (!data.taxId) return false;
    const validation = validateTaxId(data.taxId);
    return validation.valid;
  }
  return true;
}, {
  message: "Valid Tax ID (РНОКПП) is required (10 digits)",
  path: ["taxId"],
}).refine((data) => {
  if (data.paymentMethod === "new") {
    return !!(data.bankName && data.bankName.trim().length > 0);
  }
  return true;
}, {
  message: "Bank name is required",
  path: ["bankName"],
});

type Step1FormData = z.infer<typeof step1Schema>;

export function WithdrawalDialog({
  open,
  onOpenChange,
  availableBalance,
  onSuccess,
}: WithdrawalDialogProps) {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [enableSplits, setEnableSplits] = useState(false);
  const [splits, setSplits] = useState<RoyaltySplit[]>([]);
  const [step1Data, setStep1Data] = useState<Step1FormData | null>(null);
  const [ibanErrors, setIbanErrors] = useState<Record<string, string>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState<string>("");

  const form = useForm<Step1FormData>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      paymentMethod: "existing",
      saveForFuture: false,
    },
  });

  const { data: savedPaymentDetails = [], isLoading: isLoadingPaymentDetails } =
    useQuery<PaymentDetails[]>({
      queryKey: ["/api/payment-details"],
      enabled: open,
    });

  const { data: savedTemplates = [], refetch: refetchTemplates } =
    useQuery<RoyaltySplitTemplate[]>({
      queryKey: ["/api/royalty-split-templates"],
      enabled: open,
    });

  const { data: allocationSummary, isLoading: isLoadingAllocations } =
    useQuery<AllocationSummary>({
      queryKey: ["/api/finance/allocation-summary"],
      enabled: open,
    });

  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { name: string; splits: any[] }) => {
      const response = await fetch("/api/royalty-split-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save template");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Template Saved",
        description: "Your royalty split template has been saved successfully.",
      });
      refetchTemplates();
      setShowSaveTemplateDialog(false);
      setTemplateName("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Save Template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/royalty-split-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete template");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Template Deleted",
        description: "Template has been removed.",
      });
      refetchTemplates();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete Template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (open && !isInitialized && !isLoadingPaymentDetails) {
      if (savedPaymentDetails.length > 0) {
        form.setValue("paymentMethod", "existing");
        form.setValue("existingPaymentId", savedPaymentDetails[0].id);
      } else {
        form.setValue("paymentMethod", "new");
        form.setValue("existingPaymentId", undefined);
      }
      setIsInitialized(true);
    }
  }, [open, isInitialized, savedPaymentDetails, isLoadingPaymentDetails, form]);

  const withdrawalMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/finance/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to process withdrawal");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Withdrawal Requested",
        description: "Your withdrawal request has been submitted successfully.",
      });
      onSuccess();
      handleClose();
    },
    onError: (error: Error) => {
      toast({
        title: "Withdrawal Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setCurrentStep(1);
      setEnableSplits(false);
      setSplits([]);
      setStep1Data(null);
      setIbanErrors({});
      setIsInitialized(false);
      setWithdrawalAmount("");
      form.reset();
    }, 300);
  };

  // Calculate proportional distribution for withdrawal amount
  // Handles both legacy balance (owner only) and allocation-based splits
  const calculateParticipantDistribution = (amount: number) => {
    if (!allocationSummary) return [];
    
    const combinedTotal = allocationSummary.combinedTotal || allocationSummary.totalAvailable || 0;
    if (combinedTotal === 0) return [];
    
    const combinedTotalEur = combinedTotal / 100;
    const proportionFactor = combinedTotalEur > 0 ? amount / combinedTotalEur : 0;
    
    const result: any[] = [];
    
    // Add owner with their legacy + allocation share
    const ownerTotal = allocationSummary.ownerTotal || 0;
    if (ownerTotal > 0) {
      const ownerTotalEur = ownerTotal / 100;
      const ownerCalculatedAmount = ownerTotalEur * proportionFactor;
      
      // Find owner in participants (if they have allocation share)
      const ownerParticipant = allocationSummary.participants.find((p: any) => p.isOwner);
      
      // Use step1Data as fallback for owner if no saved payment details
      // This handles the case where owner has no participant_payment_details record
      // Also supports "existing" payment method by resolving from savedPaymentDetails
      let step1Iban = '';
      let step1BankName = '';
      let step1TaxId = '';
      let step1RecipientName = '';
      
      if (step1Data?.paymentMethod === 'existing' && step1Data?.existingPaymentId) {
        const selectedPayment = savedPaymentDetails.find(pd => pd.id === step1Data.existingPaymentId);
        if (selectedPayment) {
          step1Iban = selectedPayment.iban || '';
          step1BankName = selectedPayment.bankName || '';
          step1TaxId = selectedPayment.taxId || '';
          step1RecipientName = selectedPayment.recipientName || '';
        }
      } else if (step1Data) {
        step1Iban = step1Data.iban || '';
        step1BankName = step1Data.bankName || '';
        step1TaxId = step1Data.taxId || '';
        step1RecipientName = step1Data.recipientName || '';
      }
      
      const ownerIbanFallback = allocationSummary.ownerIban || step1Iban || '';
      const ownerBankNameFallback = ownerParticipant?.participantBankName || step1BankName || null;
      const ownerTaxIdFallback = ownerParticipant?.participantTaxId || step1TaxId || null;
      const ownerNameFallback = allocationSummary.ownerName || step1RecipientName || 'Власник';
      
      result.push({
        participantName: ownerNameFallback,
        participantIban: ownerIbanFallback,
        participantTaxId: ownerTaxIdFallback,
        participantBankName: ownerBankNameFallback,
        totalAmount: ownerTotal,
        calculatedAmount: ownerCalculatedAmount,
        percentage: combinedTotal > 0 ? (ownerTotal / combinedTotal) * 100 : 0,
        isOwner: true,
        hasLegacy: (allocationSummary.ownerLegacyBalance || 0) > 0,
        legacyAmount: allocationSummary.ownerLegacyBalance || 0,
        allocationAmount: allocationSummary.ownerAllocationShare || 0,
        tracks: ownerParticipant?.tracks?.map((track: any) => ({
          ...track,
          calculatedAmount: Math.round(track.amount * proportionFactor),
        })) || [],
        allocationIds: ownerParticipant?.allocationIds || [],
      });
    }
    
    // Add other participants (non-owner) with their allocation shares
    const otherParticipants = allocationSummary.participants.filter((p: any) => !p.isOwner);
    for (const p of otherParticipants) {
      const pTotalEur = p.totalAmount / 100;
      result.push({
        ...p,
        calculatedAmount: pTotalEur * proportionFactor,
        percentage: combinedTotal > 0 ? (p.totalAmount / combinedTotal) * 100 : 0,
        tracks: p.tracks?.map((track: any) => ({
          ...track,
          calculatedAmount: Math.round(track.amount * proportionFactor),
        })) || [],
      });
    }
    
    return result;
  };

  const getWithdrawalAmountNum = () => {
    const num = parseFloat(withdrawalAmount);
    return isNaN(num) ? 0 : num;
  };

  // Check if there are any funds available (either from allocations or legacy balance)
  const hasAllocations = allocationSummary && (allocationSummary.combinedTotal > 0 || allocationSummary.totalAvailable > 0);

  const validateStep1 = (data: Step1FormData): boolean => {
    if (data.paymentMethod === "existing") {
      if (!data.existingPaymentId) {
        toast({
          title: "Validation Error",
          description: "Please select a payment method",
          variant: "destructive",
        });
        return false;
      }
    } else {
      if (!data.recipientName || !data.iban || !data.bankName) {
        toast({
          title: "Validation Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return false;
      }

      const ibanValidation = validateUkrainianIBAN(data.iban);
      if (!ibanValidation.valid) {
        setIbanErrors({ main: ibanValidation.error || "Invalid IBAN" });
        toast({
          title: "Validation Error",
          description: ibanValidation.error || "Invalid IBAN",
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    const withdrawalAmountNum = getWithdrawalAmountNum();
    // API returns combinedTotal in cents (legacy + allocations), convert to EUR for comparison
    const maxAvailableEur = (allocationSummary?.combinedTotal || allocationSummary?.totalAvailable || 0) / 100;

    if (!hasAllocations) {
      toast({
        title: "Немає доступних коштів",
        description: "Немає доступних коштів для виведення.",
        variant: "destructive",
      });
      return false;
    }

    if (withdrawalAmountNum <= 0) {
      toast({
        title: "Невірна сума",
        description: "Будь ласка, введіть коректну суму для виведення.",
        variant: "destructive",
      });
      return false;
    }

    if (withdrawalAmountNum > maxAvailableEur) {
      toast({
        title: "Сума занадто велика",
        description: `Максимальна сума для виведення: €${maxAvailableEur.toFixed(2)}`,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleStep1Next = form.handleSubmit((data) => {
    if (validateStep1(data)) {
      setStep1Data(data);
      setCurrentStep(2);
    }
  });

  const handleStep2Next = () => {
    if (validateStep2()) {
      setCurrentStep(3);
    }
  };

  const handleAddSplit = () => {
    if (splits.length >= 10) {
      toast({
        title: "Limit Reached",
        description: "Maximum 10 split participants allowed",
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

  const handleUpdateSplit = (id: string, field: keyof RoyaltySplit, value: any) => {
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
    const loadedSplits = template.splits.map((split) => ({
      ...split,
      id: Date.now().toString() + Math.random(),
    }));
    setSplits(loadedSplits);
    setEnableSplits(true);
    toast({
      title: "Template Loaded",
      description: `Loaded "${template.name}" template with ${template.splits.length} split(s).`,
    });
  };

  const handleSaveTemplate = () => {
    if (splits.length === 0) {
      toast({
        title: "No Splits to Save",
        description: "Add at least one split before saving as a template.",
        variant: "destructive",
      });
      return;
    }

    if (!templateName.trim()) {
      toast({
        title: "Template Name Required",
        description: "Please enter a name for your template.",
        variant: "destructive",
      });
      return;
    }

    const templateSplits = splits.map((split) => ({
      name: split.name,
      iban: split.iban,
      taxId: split.taxId,
      bankName: split.bankName,
      percentage: split.percentage,
    }));

    saveTemplateMutation.mutate({
      name: templateName,
      splits: templateSplits,
    });
  };

  const handleSubmit = () => {
    const withdrawalAmountNum = getWithdrawalAmountNum();
    const distribution = calculateParticipantDistribution(withdrawalAmountNum);

    // Validate that all participants have required banking details
    const missingIbanParticipants = distribution.filter(
      (p) => !p.participantIban || p.participantIban.trim() === ''
    );
    
    if (missingIbanParticipants.length > 0) {
      const names = missingIbanParticipants.map(p => p.participantName).join(', ');
      toast({
        title: t('finance.withdrawal.error', 'Помилка виведення'),
        description: t('finance.withdrawal.missingIban', 
          `Відсутні банківські реквізити для: ${names}. Будь ласка, поверніться на перший крок та введіть IBAN.`),
        variant: "destructive",
      });
      return;
    }

    // Build allocation-based splits data
    // calculatedAmount is in EUR from calculateParticipantDistribution, convert to cents for backend
    const splitsData = distribution.map((participant) => ({
      recipientName: participant.participantName,
      iban: participant.participantIban,
      taxId: participant.participantTaxId || "",
      bankName: participant.participantBankName || "",
      percentage: participant.percentage.toString(),
      calculatedAmount: Math.round(participant.calculatedAmount * 100), // Convert EUR to cents
      allocationIds: participant.allocationIds,
    }));

    withdrawalMutation.mutate({
      amount: Math.round(withdrawalAmountNum * 100), // Convert EUR to cents
      useAllocations: true,
      splits: splitsData,
    });
  };

  const getTotalSplitPercentage = () => {
    return splits.reduce((sum, split) => sum + (split.percentage || 0), 0);
  };

  const getRemainingPercentage = () => {
    return 100 - getTotalSplitPercentage();
  };

  const calculateSplitAmount = (percentage: number) => {
    return (availableBalance * percentage) / 100;
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(cents / 100);
  };

  const getMainRecipientInfo = () => {
    if (step1Data?.paymentMethod === "existing") {
      return savedPaymentDetails.find(
        (pd) => pd.id === step1Data.existingPaymentId
      );
    }
    return {
      recipientName: step1Data?.recipientName || "",
      iban: step1Data?.iban || "",
      bankName: step1Data?.bankName || "",
    };
  };

  const renderStep1 = () => (
    <Form {...form}>
      <form onSubmit={handleStep1Next} className="space-y-6">
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment Method</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="space-y-3"
                >
                  {isLoadingPaymentDetails ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : savedPaymentDetails.length > 0 ? (
                    savedPaymentDetails.map((detail) => (
                      <div key={detail.id} className="flex items-start space-x-3">
                        <RadioGroupItem
                          value="existing"
                          id={`payment-${detail.id}`}
                          onClick={() => {
                            form.setValue("paymentMethod", "existing");
                            form.setValue("existingPaymentId", detail.id);
                          }}
                        />
                        <Label
                          htmlFor={`payment-${detail.id}`}
                          className="flex-1 cursor-pointer"
                        >
                          <div className="space-y-1">
                            <div className="font-medium">{detail.recipientName}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatIBAN(detail.iban)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {detail.bankName}
                            </div>
                          </div>
                        </Label>
                      </div>
                    ))
                  ) : null}

                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="new" id="payment-new" />
                    <Label htmlFor="payment-new" className="cursor-pointer">
                      Add New Bank Details
                    </Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {form.watch("paymentMethod") === "new" && (
          <div className="space-y-4 pl-7">
            <FormField
              control={form.control}
              name="recipientName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Recipient Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter recipient name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="iban"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    IBAN <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="UA00 0000 0000 0000 0000 0000 00000"
                      onChange={(e) => {
                        field.onChange(e);
                        const newErrors = { ...ibanErrors };
                        delete newErrors.main;
                        setIbanErrors(newErrors);
                      }}
                    />
                  </FormControl>
                  {ibanErrors.main && (
                    <p className="text-sm text-destructive">{ibanErrors.main}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Format: Country code + digits (15-34 chars)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="taxId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    РНОКПП <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="0000000000"
                      maxLength={10}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        field.onChange(value);
                        const newErrors = { ...ibanErrors };
                        delete newErrors.taxId;
                        setIbanErrors(newErrors);
                      }}
                    />
                  </FormControl>
                  {ibanErrors.taxId && (
                    <p className="text-sm text-destructive">{ibanErrors.taxId}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    10 цифр (обов'язково)
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bankName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Bank Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter bank name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="saveForFuture"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal cursor-pointer">
                    Save for future use
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit">
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );

  const renderStep2 = () => {
    const withdrawalAmountNum = getWithdrawalAmountNum();
    // API returns totalAvailable in cents, convert to EUR for display and comparison
    const maxAvailableEur = (allocationSummary?.combinedTotal || allocationSummary?.totalAvailable || 0) / 100;
    const ownerTotalEur = (allocationSummary?.ownerTotal || 0) / 100;
    const participantsTotalEur = (allocationSummary?.participantsTotal || 0) / 100;
    const distribution = calculateParticipantDistribution(withdrawalAmountNum);
    const isValidAmount = withdrawalAmountNum > 0 && withdrawalAmountNum <= maxAvailableEur;
    
    // Check if there are any non-owner participants
    const hasOtherParticipants = participantsTotalEur > 0;

    return (
      <div className="space-y-6">
        {isLoadingAllocations ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : maxAvailableEur <= 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Немає доступних коштів</AlertTitle>
            <AlertDescription>
              Немає доступних коштів для виведення. Кошти стають доступними через 3 місяці після звітного періоду.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Dual balance display */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Власнику
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-xl font-bold text-primary">
                    {formatCurrency(ownerTotalEur * 100)}
                  </div>
                  {allocationSummary?.ownerLegacyBalance && allocationSummary.ownerLegacyBalance > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Застарілий баланс + частка зі сплітів
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card className={hasOtherParticipants ? "border-blue-500/30 bg-blue-500/5" : "opacity-50"}>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Учасникам сплітів
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(participantsTotalEur * 100)}
                  </div>
                  {hasOtherParticipants && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Розподіл за налаштуваннями
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Total available */}
            <Card>
              <CardContent className="py-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Всього доступно:</span>
                  <span className="text-lg font-bold text-primary">{formatCurrency(maxAvailableEur * 100)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="withdrawal-amount">Сума виведення (EUR)</Label>
              <div className="flex gap-2">
                <Input
                  id="withdrawal-amount"
                  type="number"
                  min="0.01"
                  max={maxAvailableEur}
                  step="0.01"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  placeholder={`Введіть суму (макс. ${maxAvailableEur.toFixed(2)})`}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  onClick={() => setWithdrawalAmount(maxAvailableEur.toFixed(2))}
                >
                  Макс
                </Button>
              </div>
              {withdrawalAmountNum > maxAvailableEur && (
                <p className="text-sm text-destructive">
                  Сума перевищує доступний баланс
                </p>
              )}
            </div>

            {withdrawalAmountNum > 0 && (
              <>
                <div>
                  <h3 className="text-lg font-medium mb-3">Автоматичний розподіл</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    На основі налаштованих сплітів для ваших релізів
                  </p>
                </div>

                <div className="space-y-3">
                  {distribution.map((participant, index) => (
                    <Card 
                      key={participant.participantIban || index} 
                      className={participant.isOwner ? "border-primary/30" : ""}
                    >
                      <CardContent className="pt-4 pb-4">
                        <Collapsible>
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium flex items-center gap-2">
                                {participant.participantName}
                                {participant.isOwner && (
                                  <Badge variant="secondary" className="text-xs">Власник</Badge>
                                )}
                              </div>
                              {participant.participantIban && (
                                <div className="text-sm text-muted-foreground">
                                  {maskIBAN(participant.participantIban)}
                                </div>
                              )}
                              {participant.participantBankName && (
                                <div className="text-xs text-muted-foreground">
                                  {participant.participantBankName}
                                </div>
                              )}
                              {/* Show legacy info for owner */}
                              {participant.isOwner && participant.hasLegacy && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Застарілий баланс: {formatCurrency(participant.legacyAmount)}
                                  {participant.allocationAmount > 0 && (
                                    <> + частка зі сплітів: {formatCurrency(participant.allocationAmount)}</>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <Badge variant="outline" className="mb-1">
                                {participant.percentage.toFixed(2)}%
                              </Badge>
                              <div className="font-semibold text-primary">
                                {formatCurrency(participant.calculatedAmount * 100)}
                              </div>
                            </div>
                          </div>
                          
                          {participant.tracks && participant.tracks.length > 0 && (
                            <>
                              <CollapsibleTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full mt-2 h-7 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  <Music className="h-3 w-3 mr-1" />
                                  {participant.tracks.length} {participant.tracks.length === 1 ? 'трек' : participant.tracks.length < 5 ? 'треки' : 'треків'}
                                  <ChevronDown className="h-3 w-3 ml-1 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-2 pt-2 border-t space-y-2">
                                  {participant.tracks.map((track: any) => (
                                    <div 
                                      key={track.isrc || track.allocationId} 
                                      className="flex justify-between items-center text-sm py-1"
                                    >
                                      <div className="flex-1 min-w-0 mr-2">
                                        <div className="font-medium truncate">{track.trackTitle}</div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {track.releaseTitle}
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <span className="font-medium">
                                          {formatCurrency(track.calculatedAmount)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </CollapsibleContent>
                            </>
                          )}
                        </Collapsible>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card>
                  <CardContent className="pt-6">
                    <div className="flex justify-between font-medium text-lg">
                      <span>Total Withdrawal:</span>
                      <span className="text-primary">
                        {formatCurrency(withdrawalAmountNum * 100)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep(1)}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button 
            type="button" 
            onClick={handleStep2Next}
            disabled={!isValidAmount}
          >
            Next
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </div>
    );
  };

  const renderStep3 = () => {
    const withdrawalAmountNum = getWithdrawalAmountNum();
    const distribution = calculateParticipantDistribution(withdrawalAmountNum);

    return (
      <div className="space-y-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Confirm Withdrawal</AlertTitle>
          <AlertDescription>
            Please review all details before submitting your withdrawal request.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium mb-3">Payment Recipients</h3>
            <div className="space-y-3">
              {distribution.map((participant, index) => (
                <Card key={participant.participantIban}>
                  <CardContent className="pt-6 space-y-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{participant.participantName}</span>
                      <Badge variant="outline">{participant.percentage.toFixed(2)}%</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">IBAN:</span>
                      <span className="font-mono text-xs">
                        {maskIBAN(participant.participantIban)}
                      </span>
                    </div>
                    {participant.participantBankName && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Bank:</span>
                        <span>{participant.participantBankName}</span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium text-lg">
                      <span>Amount:</span>
                      <span className="text-primary">
                        {formatCurrency(participant.calculatedAmount * 100)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card className="bg-muted/50">
            <CardContent className="pt-6">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Withdrawal Amount:</span>
                <span className="text-primary">{formatCurrency(withdrawalAmountNum * 100)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep(2)}
            disabled={withdrawalMutation.isPending}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={withdrawalMutation.isPending}
          >
            {withdrawalMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Confirm & Submit
          </Button>
        </DialogFooter>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Withdraw Funds - Step {currentStep} of 3
          </DialogTitle>
          <DialogDescription>
            {currentStep === 1 && "Select or add payment details for withdrawal"}
            {currentStep === 2 && "Choose withdrawal amount and see automatic distribution"}
            {currentStep === 3 && "Review and confirm your withdrawal"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((step) => (
                <div key={step} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step === currentStep
                        ? "bg-primary text-primary-foreground"
                        : step < currentStep
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step < currentStep ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      step
                    )}
                  </div>
                  {step < 3 && (
                    <div
                      className={`w-12 h-0.5 mx-1 ${
                        step < currentStep ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>
      </DialogContent>

      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Split Template</DialogTitle>
            <DialogDescription>
              Give your royalty split pattern a name for easy reuse
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                placeholder="e.g., Producer Split 50/50"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveTemplate();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saveTemplateMutation.isPending}>
              {saveTemplateMutation.isPending ? "Saving..." : "Save Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
