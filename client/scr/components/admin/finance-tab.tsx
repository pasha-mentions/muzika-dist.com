import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Wallet, TrendingUp, TrendingDown, DollarSign, CheckCircle, XCircle, Plus, Pencil, Trash2, Download, ChevronDown, ChevronUp, FileText, HandCoins, Copy, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { maskIBAN } from "@/lib/validation";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Organization {
  id: string;
  name: string;
  type: string;
  status?: string;
  balance?: number;
}

interface FinanceSummary {
  totalEarned: number;
  totalWithdrawn: number;
  availableBalance: number;
  totalEarnedUah: number;
}

interface WithdrawalSplit {
  id: string;
  recipientName: string;
  iban: string;
  taxId?: string;
  bankName: string;
  percentage: string;
  calculatedAmount: number;
}

interface Withdrawal {
  id: string;
  orgId: string;
  amount: number;
  recipientName?: string;
  iban?: string;
  taxId?: string;
  bankName?: string;
  status: string;
  requestedBy: string;
  processedBy?: string;
  notes?: string;
  requestedAt: Date;
  processedAt?: Date;
  organization?: { name: string };
  requester?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  processor?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
  splits?: WithdrawalSplit[];
  isCuratorWithdrawal?: boolean;
}

export default function FinanceTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [actionWithdrawalId, setActionWithdrawalId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [manualAmount, setManualAmount] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingWithdrawal, setEditingWithdrawal] = useState<Withdrawal | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [deleteWithdrawalId, setDeleteWithdrawalId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<"EUR" | "UAH">("EUR");

  // Fetch all organizations
  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ['/api/admin/organizations'],
  });

  // Fetch ALL withdrawals (for Withdrawal Requests tab)
  const { data: allWithdrawals = [], isLoading: isAllWithdrawalsLoading } = useQuery<Withdrawal[]>({
    queryKey: ['/api/admin/finance/all-withdrawals'],
  });

  // Fetch finance summary for selected organization (for Manual Payouts tab)
  const { data: financeSummary, isLoading: isSummaryLoading } = useQuery<FinanceSummary>({
    queryKey: ['/api/admin/finance/summary', selectedOrgId],
    enabled: !!selectedOrgId,
  });

  // Fetch withdrawals history for selected organization (for Manual Payouts tab)
  const { data: orgWithdrawals = [], isLoading: isOrgWithdrawalsLoading } = useQuery<Withdrawal[]>({
    queryKey: ['/api/admin/finance/withdrawals', selectedOrgId],
    enabled: !!selectedOrgId,
    queryFn: async () => {
      const response = await fetch(`/api/admin/finance/withdrawals/${selectedOrgId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch organization withdrawals');
      }
      return await response.json();
    },
  });

  // Force refetch when organization changes to avoid stale cache
  useEffect(() => {
    if (selectedOrgId) {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/summary', selectedOrgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/withdrawals', selectedOrgId] });
    }
  }, [selectedOrgId, queryClient]);

  // Copy to clipboard helper
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Скопійовано!",
        description: `${label} скопійовано в буфер обміну`,
      });
    } catch (error) {
      toast({
        title: "Помилка",
        description: "Не вдалося скопіювати текст",
        variant: "destructive",
      });
    }
  };

  // Update withdrawal status mutation
  const updateWithdrawalMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const response = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, notes }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update withdrawal');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/all-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/summary', selectedOrgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/withdrawals', selectedOrgId] });
      
      // Use the actual status from API response instead of local state
      const isApproved = data.status === 'APPROVED' || data.status === 'COMPLETED';
      
      toast({
        title: t('finance.withdrawalUpdated'),
        description: isApproved
          ? t('finance.withdrawalApproved') 
          : t('finance.withdrawalRejected'),
      });
      setActionWithdrawalId(null);
      setActionType(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('finance.updateFailed'),
        description: error.message,
        variant: "destructive",
      });
      setActionWithdrawalId(null);
      setActionType(null);
    },
  });

  const formatCurrency = (cents: number, currencyCode: "EUR" | "UAH" = "EUR") => {
    const amount = cents / 100;
    if (currencyCode === "UAH") {
      return new Intl.NumberFormat('uk-UA', {
        style: 'currency',
        currency: 'UAH',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { label: t('finance.statusPending'), color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
      APPROVED: { label: t('finance.statusApproved'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
      COMPLETED: { label: t('finance.statusCompleted'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
      REJECTED: { label: t('finance.statusRejected'), color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.PENDING;
    return <Badge className={config.color}>{config.label}</Badge>;
  };

  const handleAction = (withdrawalId: string, type: "approve" | "reject") => {
    setActionWithdrawalId(withdrawalId);
    setActionType(type);
  };

  const confirmAction = () => {
    if (!actionWithdrawalId || !actionType) return;

    const status = actionType === 'approve' ? 'APPROVED' : 'REJECTED';
    updateWithdrawalMutation.mutate({ 
      id: actionWithdrawalId, 
      status,
      notes: actionType === 'reject' ? 'Rejected by admin' : undefined 
    });
  };

  const cancelAction = () => {
    if (updateWithdrawalMutation.isPending) return;
    setActionWithdrawalId(null);
    setActionType(null);
  };

  // Create manual withdrawal mutation
  const createManualWithdrawalMutation = useMutation({
    mutationFn: async ({ orgId, amount, date, notes }: { orgId: string; amount: number; date: string; notes?: string }) => {
      const response = await fetch('/api/admin/withdrawals/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orgId, amount, date, notes }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to create withdrawal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/all-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/summary', selectedOrgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/withdrawals', selectedOrgId] });
      toast({
        title: t('finance.manualWithdrawalCreated'),
        description: t('finance.manualWithdrawalCreatedDescription'),
      });
      setManualAmount("");
      setManualDate("");
      setManualNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: t('finance.createFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateManualWithdrawal = () => {
    const amount = parseFloat(manualAmount);
    
    if (!amount || amount <= 0) {
      toast({
        title: t('finance.invalidAmount'),
        description: t('finance.pleaseEnterValidAmount'),
        variant: "destructive",
      });
      return;
    }

    if (!manualDate) {
      toast({
        title: t('finance.invalidDate'),
        description: t('finance.pleaseSelectDate'),
        variant: "destructive",
      });
      return;
    }

    // Convert EUR to cents
    const amountInCents = Math.round(amount * 100);

    createManualWithdrawalMutation.mutate({
      orgId: selectedOrgId,
      amount: amountInCents,
      date: manualDate,
      notes: manualNotes || undefined,
    });
  };

  // Edit withdrawal mutation
  const editWithdrawalMutation = useMutation({
    mutationFn: async ({ id, amount, date, notes }: { id: string; amount: number; date: string; notes?: string }) => {
      const response = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount, date, notes }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to edit withdrawal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/all-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/summary', selectedOrgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/withdrawals', selectedOrgId] });
      toast({
        title: t('finance.withdrawalUpdated'),
        description: t('finance.withdrawalEditedSuccess'),
      });
      setIsEditDialogOpen(false);
      setEditingWithdrawal(null);
      setEditAmount("");
      setEditDate("");
      setEditNotes("");
    },
    onError: (error: Error) => {
      toast({
        title: t('finance.updateFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete withdrawal mutation
  const deleteWithdrawalMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/withdrawals/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.message || 'Failed to delete withdrawal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/all-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/summary', selectedOrgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/finance/withdrawals', selectedOrgId] });
      toast({
        title: t('finance.withdrawalDeleted'),
        description: t('finance.withdrawalDeletedSuccess'),
      });
      setDeleteWithdrawalId(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('finance.deleteFailed'),
        description: error.message,
        variant: "destructive",
      });
      setDeleteWithdrawalId(null);
    },
  });

  const handleEditClick = (withdrawal: Withdrawal) => {
    setEditingWithdrawal(withdrawal);
    setEditAmount((withdrawal.amount / 100).toFixed(2));
    setEditDate(new Date(withdrawal.requestedAt).toISOString().split('T')[0]);
    setEditNotes(withdrawal.notes || "");
    setIsEditDialogOpen(true);
  };

  const handleEditSubmit = () => {
    if (!editingWithdrawal) return;

    const amount = parseFloat(editAmount);
    
    if (!amount || amount <= 0) {
      toast({
        title: t('finance.invalidAmount'),
        description: t('finance.pleaseEnterValidAmount'),
        variant: "destructive",
      });
      return;
    }

    if (!editDate) {
      toast({
        title: t('finance.invalidDate'),
        description: t('finance.pleaseSelectDate'),
        variant: "destructive",
      });
      return;
    }

    // Convert EUR to cents
    const amountInCents = Math.round(amount * 100);

    editWithdrawalMutation.mutate({
      id: editingWithdrawal.id,
      amount: amountInCents,
      date: editDate,
      notes: editNotes || undefined,
    });
  };

  const handleDeleteClick = (withdrawalId: string) => {
    setDeleteWithdrawalId(withdrawalId);
  };

  const confirmDelete = () => {
    if (!deleteWithdrawalId) return;
    deleteWithdrawalMutation.mutate(deleteWithdrawalId);
  };

  const cancelDelete = () => {
    if (deleteWithdrawalMutation.isPending) return;
    setDeleteWithdrawalId(null);
  };

  const toggleRowExpansion = (withdrawalId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(withdrawalId)) {
        newSet.delete(withdrawalId);
      } else {
        newSet.add(withdrawalId);
      }
      return newSet;
    });
  };

  const handleExportCSV = () => {
    const pendingWithdrawals = allWithdrawals.filter(w => w.status === 'PENDING');
    
    if (pendingWithdrawals.length === 0) {
      toast({
        title: t('finance.noDataToExport'),
        description: t('finance.noDataToExportDescription'),
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Organization Name",
      "Requested By",
      "Withdrawal ID",
      "Total Amount (EUR)",
      "Status",
      "Date Requested",
      "Date Processed",
      "Main Recipient Name",
      "Main Recipient IBAN",
      "Main Recipient Tax ID",
      "Main Recipient Bank",
      "Main Recipient Amount (EUR)",
    ];

    for (let i = 1; i <= 10; i++) {
      headers.push(
        `Split Recipient ${i} Name`,
        `Split Recipient ${i} IBAN`,
        `Split Recipient ${i} Tax ID`,
        `Split Recipient ${i} Bank`,
        `Split Recipient ${i} %`,
        `Split Recipient ${i} Amount (EUR)`
      );
    }
    headers.push("Notes");

    const rows = pendingWithdrawals.map((withdrawal) => {
      // Calculate main recipient amount (total - sum of splits)
      const splitsTotal = withdrawal.splits?.reduce((sum, split) => sum + split.calculatedAmount, 0) || 0;
      const mainRecipientAmount = withdrawal.amount - splitsTotal;
      
      const requesterName = withdrawal.requester 
        ? (withdrawal.requester.firstName && withdrawal.requester.lastName 
            ? `${withdrawal.requester.firstName} ${withdrawal.requester.lastName}` 
            : withdrawal.requester.email)
        : "";
      
      const row: string[] = [
        withdrawal.organization?.name || "",
        requesterName,
        withdrawal.id,
        (withdrawal.amount / 100).toFixed(2),
        withdrawal.status,
        formatDate(withdrawal.requestedAt),
        withdrawal.processedAt ? formatDate(withdrawal.processedAt) : "",
        withdrawal.recipientName || "",
        withdrawal.iban ? maskIBAN(withdrawal.iban) : "",
        withdrawal.taxId || "",
        withdrawal.bankName || "",
        (mainRecipientAmount / 100).toFixed(2),
      ];

      if (withdrawal.splits && withdrawal.splits.length > 0) {
        for (let i = 0; i < 10; i++) {
          if (i < withdrawal.splits.length) {
            const split = withdrawal.splits[i];
            row.push(
              split.recipientName,
              maskIBAN(split.iban),
              split.taxId || "",
              split.bankName,
              split.percentage,
              (split.calculatedAmount / 100).toFixed(2)
            );
          } else {
            row.push("", "", "", "", "", "");
          }
        }
      } else {
        for (let i = 0; i < 10; i++) {
          row.push("", "", "", "", "", "");
        }
      }

      row.push(withdrawal.notes || "");
      return row;
    });

    const csvContent = [headers, ...rows]
      .map((row) => 
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `withdrawals_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: t('finance.exportSuccessful'),
      description: t('finance.exportSuccessfulDescription'),
    });
  };

  return (
    <div className="space-y-6">
      {/* Tabs for Withdrawal Requests and Manual Payouts */}
      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Запити на виплати</span>
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <HandCoins className="h-4 w-4" />
            <span>Створення виплат</span>
          </TabsTrigger>
        </TabsList>

        {/* Withdrawal Requests Tab */}
        <TabsContent value="requests" className="space-y-6 mt-6">
          {/* All Withdrawal Requests */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <CardTitle>{t('finance.withdrawalRequests')}</CardTitle>
                <Button
                  onClick={handleExportCSV}
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={allWithdrawals.filter(w => w.status === 'PENDING').length === 0}
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('finance.exportCSV')}</span>
                  <span className="sm:hidden">CSV</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isAllWithdrawalsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : allWithdrawals.filter(w => w.status === 'PENDING').length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{t('finance.noWithdrawals')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allWithdrawals.filter(w => w.status === 'PENDING').map((withdrawal) => (
                    <Card key={withdrawal.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">
                                {formatCurrency(withdrawal.amount)}
                              </span>
                              {withdrawal.isCuratorWithdrawal && (
                                <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                                  🎧 Куратор
                                </Badge>
                              )}
                              {withdrawal.splits && withdrawal.splits.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {withdrawal.splits.length} {withdrawal.splits.length === 1 ? t('finance.split') : t('finance.splits')}
                                </Badge>
                              )}
                            </div>
                            {withdrawal.organization && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium">{withdrawal.organization.name}</span>
                                {withdrawal.requester && (
                                  <span>
                                    {' '} • {t('finance.requestedBy')}: {withdrawal.requester.firstName && withdrawal.requester.lastName 
                                      ? `${withdrawal.requester.firstName} ${withdrawal.requester.lastName}` 
                                      : withdrawal.requester.email}
                                  </span>
                                )}
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">
                                {formatDate(withdrawal.requestedAt)}
                              </span>
                              {getStatusBadge(withdrawal.status)}
                            </div>
                            {withdrawal.notes && (
                              <p className="text-sm text-muted-foreground italic">
                                {withdrawal.notes}
                              </p>
                            )}
                            {(withdrawal.recipientName || withdrawal.iban || withdrawal.bankName) && (
                              <div className="mt-2 p-2 bg-muted/50 rounded-md space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground">{t('finance.mainRecipientDetails')}:</p>
                                {withdrawal.recipientName && (
                                  <div className="flex items-center justify-between gap-2 group">
                                    <p className="text-sm">{withdrawal.recipientName}</p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => copyToClipboard(withdrawal.recipientName!, t('finance.recipientName'))}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {withdrawal.iban && (
                                  <div className="flex items-center justify-between gap-2 group">
                                    <p className="text-sm font-mono">{maskIBAN(withdrawal.iban)}</p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => copyToClipboard(withdrawal.iban!, 'IBAN')}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {withdrawal.taxId && (
                                  <div className="flex items-center justify-between gap-2 group">
                                    <p className="text-sm font-mono">{withdrawal.taxId.slice(0, 3)}...{withdrawal.taxId.slice(-2)}</p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => copyToClipboard(withdrawal.taxId!, t('finance.taxId'))}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {withdrawal.bankName && (
                                  <div className="flex items-center justify-between gap-2 group">
                                    <p className="text-sm">{withdrawal.bankName}</p>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => copyToClipboard(withdrawal.bankName!, t('finance.bankName'))}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap gap-2">
                            {withdrawal.status === 'PENDING' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="default"
                                  onClick={() => handleAction(withdrawal.id, 'approve')}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  {t('finance.approve')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleAction(withdrawal.id, 'reject')}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  {t('finance.reject')}
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditClick(withdrawal)}
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              {t('finance.edit')}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteClick(withdrawal.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              {t('finance.delete')}
                            </Button>
                          </div>
                        </div>

                        {withdrawal.splits && withdrawal.splits.length > 0 && (
                          <Collapsible
                            open={expandedRows.has(withdrawal.id)}
                            onOpenChange={() => toggleRowExpansion(withdrawal.id)}
                            className="mt-4"
                          >
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="w-full justify-between">
                                <span className="font-semibold">
                                  {t('finance.royaltySplits')}
                                </span>
                                {expandedRows.has(withdrawal.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-4">
                              <div className="space-y-4">
                                <div className="overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{t('finance.recipient')}</TableHead>
                                        <TableHead>{t('finance.iban')}</TableHead>
                                        <TableHead>{t('finance.taxId')}</TableHead>
                                        <TableHead>{t('finance.bank')}</TableHead>
                                        <TableHead className="text-right">{t('finance.percentage')}</TableHead>
                                        <TableHead className="text-right">{t('finance.amount')}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {withdrawal.splits.map((split) => (
                                        <TableRow key={split.id}>
                                          <TableCell className="font-medium">
                                            <div className="flex items-center justify-between gap-2 group">
                                              <span>{split.recipientName}</span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => copyToClipboard(split.recipientName, t('finance.recipientName'))}
                                              >
                                                <Copy className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                          <TableCell className="font-mono text-sm">
                                            <div className="flex items-center justify-between gap-2 group">
                                              <span>{maskIBAN(split.iban)}</span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => copyToClipboard(split.iban, 'IBAN')}
                                              >
                                                <Copy className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                          <TableCell className="font-mono text-sm">
                                            {split.taxId ? (
                                              <div className="flex items-center justify-between gap-2 group">
                                                <span>{split.taxId}</span>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                  onClick={() => copyToClipboard(split.taxId!, t('finance.taxId'))}
                                                >
                                                  <Copy className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            ) : '—'}
                                          </TableCell>
                                          <TableCell>
                                            <div className="flex items-center justify-between gap-2 group">
                                              <span>{split.bankName}</span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => copyToClipboard(split.bankName, t('finance.bankName'))}
                                              >
                                                <Copy className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right">{split.percentage}%</TableCell>
                                          <TableCell className="text-right font-semibold">
                                            {formatCurrency(split.calculatedAmount)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                                
                                <div className="flex justify-end items-center gap-2 pt-2 border-t">
                                  <span className="text-sm text-muted-foreground">
                                    {t('finance.totalVerification')}:
                                  </span>
                                  <span className="font-semibold">
                                    {formatCurrency(
                                      withdrawal.splits.reduce((sum, split) => sum + split.calculatedAmount, 0)
                                    )}
                                  </span>
                                  <span className="text-sm text-muted-foreground">
                                    / {formatCurrency(withdrawal.amount)}
                                  </span>
                                </div>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* History Section - Processed Withdrawals (Collapsible) */}
          <Collapsible>
            <Card>
              <CardHeader className="pb-3">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Історія оброблених запитів
                      {allWithdrawals.filter(w => w.status !== 'PENDING').length > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {allWithdrawals.filter(w => w.status !== 'PENDING').length}
                        </Badge>
                      )}
                    </CardTitle>
                    <ChevronDown className="h-5 w-5 transition-transform duration-200 [&[data-state=open]>svg]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {isAllWithdrawalsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : allWithdrawals.filter(w => w.status !== 'PENDING').length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">Немає оброблених запитів</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {allWithdrawals
                        .filter(w => w.status !== 'PENDING')
                        .sort((a, b) => {
                          const dateA = a.processedAt ? new Date(a.processedAt).getTime() : new Date(a.requestedAt).getTime();
                          const dateB = b.processedAt ? new Date(b.processedAt).getTime() : new Date(b.requestedAt).getTime();
                          return dateB - dateA;
                        })
                        .map((withdrawal) => (
                    <Card key={withdrawal.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">
                                {formatCurrency(withdrawal.amount)}
                              </span>
                              {getStatusBadge(withdrawal.status)}
                              {withdrawal.isCuratorWithdrawal && (
                                <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-400 border-purple-500/30">
                                  🎧 Куратор
                                </Badge>
                              )}
                              {withdrawal.splits && withdrawal.splits.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {withdrawal.splits.length} {withdrawal.splits.length === 1 ? t('finance.split') : t('finance.splits')}
                                </Badge>
                              )}
                            </div>
                            {withdrawal.organization && (
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium">{withdrawal.organization.name}</span>
                                {withdrawal.requester && (
                                  <span>
                                    {' '} • {t('finance.requestedBy')}: {withdrawal.requester.firstName && withdrawal.requester.lastName 
                                      ? `${withdrawal.requester.firstName} ${withdrawal.requester.lastName}` 
                                      : withdrawal.requester.email}
                                  </span>
                                )}
                              </p>
                            )}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted-foreground">
                              <span>
                                Запит: {formatDate(withdrawal.requestedAt)}
                              </span>
                              {withdrawal.processedAt && (
                                <>
                                  <span className="hidden sm:inline">•</span>
                                  <span>
                                    Оброблено: {formatDate(withdrawal.processedAt)}
                                  </span>
                                </>
                              )}
                              {withdrawal.processor && (
                                <>
                                  <span className="hidden sm:inline">•</span>
                                  <span>
                                    Адмін: {withdrawal.processor.firstName && withdrawal.processor.lastName 
                                      ? `${withdrawal.processor.firstName} ${withdrawal.processor.lastName}` 
                                      : withdrawal.processor.email}
                                  </span>
                                </>
                              )}
                            </div>
                            {withdrawal.notes && (
                              <p className="text-sm text-muted-foreground italic">
                                {withdrawal.notes}
                              </p>
                            )}
                            {(withdrawal.recipientName || withdrawal.iban || withdrawal.bankName) && (
                              <div className="mt-2 p-2 bg-muted/50 rounded-md space-y-1">
                                <p className="text-xs font-semibold text-muted-foreground">{t('finance.mainRecipientDetails')}:</p>
                                {withdrawal.recipientName && (
                                  <p className="text-sm">{withdrawal.recipientName}</p>
                                )}
                                {withdrawal.iban && (
                                  <p className="text-sm font-mono">{maskIBAN(withdrawal.iban)}</p>
                                )}
                                {withdrawal.taxId && (
                                  <p className="text-sm font-mono">{withdrawal.taxId.slice(0, 3)}...{withdrawal.taxId.slice(-2)}</p>
                                )}
                                {withdrawal.bankName && (
                                  <p className="text-sm">{withdrawal.bankName}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {withdrawal.splits && withdrawal.splits.length > 0 && (
                          <Collapsible
                            open={expandedRows.has(withdrawal.id)}
                            onOpenChange={() => toggleRowExpansion(withdrawal.id)}
                            className="mt-4"
                          >
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="w-full justify-between">
                                <span className="font-semibold">
                                  {t('finance.royaltySplits')}
                                </span>
                                {expandedRows.has(withdrawal.id) ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-4">
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>{t('finance.recipient')}</TableHead>
                                      <TableHead>{t('finance.iban')}</TableHead>
                                      <TableHead>{t('finance.taxId')}</TableHead>
                                      <TableHead>{t('finance.bank')}</TableHead>
                                      <TableHead className="text-right">{t('finance.percentage')}</TableHead>
                                      <TableHead className="text-right">{t('finance.amount')}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {withdrawal.splits.map((split) => (
                                      <TableRow key={split.id}>
                                        <TableCell className="font-medium">{split.recipientName}</TableCell>
                                        <TableCell className="font-mono text-sm">{maskIBAN(split.iban)}</TableCell>
                                        <TableCell className="font-mono text-sm">{split.taxId || '—'}</TableCell>
                                        <TableCell>{split.bankName}</TableCell>
                                        <TableCell className="text-right">{split.percentage}%</TableCell>
                                        <TableCell className="text-right font-semibold">
                                          {formatCurrency(split.calculatedAmount)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </TabsContent>

        {/* Manual Payouts Tab */}
        <TabsContent value="manual" className="space-y-6 mt-6">
          {/* Organization Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                {t('finance.selectOrganization')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                <SelectTrigger className="w-full md:w-96">
                  <SelectValue placeholder={t('finance.selectOrganizationPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name} ({org.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedOrgId && (
            <>
              {/* Currency Toggle */}
              <div className="flex justify-end">
                <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
                  <button
                    onClick={() => setCurrency("EUR")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      currency === "EUR"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    € EUR
                  </button>
                  <button
                    onClick={() => setCurrency("UAH")}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      currency === "UAH"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    ₴ UAH
                  </button>
                </div>
              </div>

              {/* Balance Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('finance.totalEarned')}</CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    {isSummaryLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="text-2xl font-bold">
                        {currency === "UAH" 
                          ? formatCurrency(financeSummary?.totalEarnedUah || 0, "UAH")
                          : formatCurrency(financeSummary?.totalEarned || 0, "EUR")
                        }
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('finance.totalWithdrawn')}</CardTitle>
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    {isSummaryLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="text-2xl font-bold">{formatCurrency(financeSummary?.totalWithdrawn || 0)}</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{t('finance.availableBalance')}</CardTitle>
                    <DollarSign className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    {isSummaryLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="text-2xl font-bold text-primary">{formatCurrency(financeSummary?.availableBalance || 0)}</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Manual Payout Creation Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    {t('finance.addManualWithdrawal')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">{t('finance.withdrawalAmount')}</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={manualAmount}
                      onChange={(e) => setManualAmount(e.target.value)}
                      disabled={createManualWithdrawalMutation.isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('finance.amountInEur')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date">{t('finance.withdrawalDate')}</Label>
                    <Input
                      id="date"
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      disabled={createManualWithdrawalMutation.isPending}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('finance.notes')} ({t('finance.optional')})</Label>
                    <Textarea
                      id="notes"
                      placeholder={t('finance.notesPlaceholder')}
                      value={manualNotes}
                      onChange={(e) => setManualNotes(e.target.value)}
                      disabled={createManualWithdrawalMutation.isPending}
                      rows={3}
                    />
                  </div>

                  <Button
                    onClick={handleCreateManualWithdrawal}
                    disabled={!selectedOrgId || !manualAmount || !manualDate || createManualWithdrawalMutation.isPending}
                    className="w-full"
                  >
                    {createManualWithdrawalMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('finance.createWithdrawal')}
                  </Button>
                </CardContent>
              </Card>

            </>
          )}

          {/* Withdrawal History - Always Visible */}
          <Card>
            <CardHeader>
              <CardTitle>{t('finance.transactionHistory')}</CardTitle>
            </CardHeader>
            <CardContent>
              {(selectedOrgId ? isOrgWithdrawalsLoading : isAllWithdrawalsLoading) ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (selectedOrgId ? orgWithdrawals : allWithdrawals).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">{t('finance.noTransactions')}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {!selectedOrgId && <TableHead>{t('finance.organization')}</TableHead>}
                        <TableHead>{t('finance.date')}</TableHead>
                        <TableHead>{t('finance.amount')}</TableHead>
                        <TableHead>{t('finance.status')}</TableHead>
                        <TableHead>{t('finance.notes')}</TableHead>
                        <TableHead className="text-right">{t('finance.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedOrgId ? orgWithdrawals : allWithdrawals).map((withdrawal) => (
                        <TableRow key={withdrawal.id}>
                          {!selectedOrgId && (
                            <TableCell className="font-medium">
                              {withdrawal.organization?.name || '—'}
                            </TableCell>
                          )}
                          <TableCell>{formatDate(withdrawal.requestedAt)}</TableCell>
                          <TableCell className="font-medium">
                            {formatCurrency(withdrawal.amount)}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(withdrawal.status)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {withdrawal.notes || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditClick(withdrawal)}
                                title={t('finance.edit')}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteClick(withdrawal.id)}
                                title={t('finance.delete')}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!actionWithdrawalId} onOpenChange={(open) => !open && cancelAction()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === 'approve' ? t('finance.confirmApprove') : t('finance.confirmReject')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve' 
                ? t('finance.approveDescription')
                : t('finance.rejectDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateWithdrawalMutation.isPending}>
              {t('finance.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmAction}
              disabled={updateWithdrawalMutation.isPending}
            >
              {updateWithdrawalMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('finance.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Withdrawal Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('finance.editWithdrawal')}</DialogTitle>
            <DialogDescription>
              {t('finance.editWithdrawalDescription')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">{t('finance.withdrawalAmount')}</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                disabled={editWithdrawalMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                {t('finance.amountInEur')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-date">{t('finance.withdrawalDate')}</Label>
              <Input
                id="edit-date"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                disabled={editWithdrawalMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">{t('finance.notes')} ({t('finance.optional')})</Label>
              <Textarea
                id="edit-notes"
                placeholder={t('finance.notesPlaceholder')}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                disabled={editWithdrawalMutation.isPending}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingWithdrawal(null);
                setEditAmount("");
                setEditDate("");
                setEditNotes("");
              }}
              disabled={editWithdrawalMutation.isPending}
            >
              {t('finance.cancel')}
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={editWithdrawalMutation.isPending}
            >
              {editWithdrawalMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('finance.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteWithdrawalId} onOpenChange={(open) => !open && cancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('finance.confirmDelete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('finance.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWithdrawalMutation.isPending}>
              {t('finance.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={deleteWithdrawalMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteWithdrawalMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('finance.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
