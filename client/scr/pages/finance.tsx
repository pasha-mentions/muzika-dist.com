import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Wallet, DollarSign, TrendingUp, TrendingDown, Loader2, ArrowDownToLine, Info, Settings2, Clock, CheckCircle, ChevronDown, ChevronUp } from "lucide-react";
import { useLocation } from "wouter";
import { WithdrawalDialog } from "@/components/finance/withdrawal-dialog";
import { isUnauthorizedError } from "@/lib/authUtils";
import type { Withdrawal } from "@shared/schema";
import { GiftMarker } from "@/components/holiday/GiftMarker";
import useEmblaCarousel from "embla-carousel-react";

interface FinanceSummary {
  totalEarned: number; // in cents
  totalEarnedUah: number; // in kopiyky (UAH equivalent)
  totalWithdrawn: number; // in cents
  availableBalance: number; // in cents
  organizationName: string;
}

interface Allocation {
  id: string;
  orgId: string;
  trackId: string | null;
  participantName: string;
  participantIban: string | null;
  participantTaxId: string | null;
  participantBankName: string | null;
  percentage: string;
  amount: number;
  reportRowId: string;
  status: 'PENDING' | 'AVAILABLE' | 'RESERVED' | 'PAID';
  availableAt: string;
  createdAt: string;
}

interface AllocationsSummary {
  pending: Allocation[];
  available: Allocation[];
  summary: {
    pendingTotal: number;
    availableTotal: number;
  };
}

interface AllocationSummaryResponse {
  participants: Array<{
    iban: string;
    participantName: string;
    totalAmount: number;
    allocationCount: number;
    allocationIds: string[];
  }>;
  totalAvailable: number;
  legacyAvailable: number;
  ownerTotal: number;
  participantsTotal: number;
  combinedTotal: number;
  ownerTotalUah: number;
  participantsTotalUah: number;
  combinedTotalUah: number;
}

type Currency = 'EUR' | 'UAH';

export default function Finance() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [allocationsOpen, setAllocationsOpen] = useState(false);
  const [emblaRef] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps' });
  
  const [currency, setCurrency] = useState<Currency>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('finance_currency') as Currency) || 'EUR';
    }
    return 'EUR';
  });
  
  useEffect(() => {
    localStorage.setItem('finance_currency', currency);
  }, [currency]);

  // Fetch finance summary
  const { data: summary, isLoading: isSummaryLoading, refetch } = useQuery<FinanceSummary>({
    queryKey: ['/api/finance/summary'],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) return false;
      return failureCount < 3;
    },
  });

  // Fetch withdrawals history
  const { data: withdrawals = [], isLoading: isWithdrawalsLoading } = useQuery<Withdrawal[]>({
    queryKey: ['/api/finance/withdrawals'],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) return false;
      return failureCount < 3;
    },
  });
  
  // Fetch allocations summary
  const { data: allocationsData } = useQuery<AllocationsSummary>({
    queryKey: ['/api/finance/allocations'],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) return false;
      return failureCount < 3;
    },
  });
  
  // Fetch allocation-summary for combined totals (legacy + allocations)
  const { data: allocationSummary } = useQuery<AllocationSummaryResponse>({
    queryKey: ['/api/finance/allocation-summary'],
    retry: (failureCount, error) => {
      if (isUnauthorizedError(error)) return false;
      return failureCount < 3;
    },
  });
  
  // Use combinedTotal from allocation-summary (legacy + allocations), fallback to old availableBalance
  const combinedAvailable = allocationSummary?.combinedTotal ?? summary?.availableBalance ?? 0;
  const combinedAvailableUah = allocationSummary?.combinedTotalUah ?? 0;
  
  const currencySymbol = currency === 'UAH' ? '₴' : '€';

  const formatCurrency = (cents: number, forceCurrency?: 'EUR' | 'UAH') => {
    const amount = cents / 100;
    const targetCurrency = forceCurrency || 'EUR';
    return new Intl.NumberFormat(i18n.language === 'uk' ? 'uk-UA' : i18n.language === 'pl' ? 'pl-PL' : 'en-US', {
      style: 'currency',
      currency: targetCurrency,
    }).format(amount);
  };
  
  const formatDisplayCurrency = (eurCents: number, uahCents: number) => {
    if (currency === 'UAH' && uahCents > 0) {
      return formatCurrency(uahCents, 'UAH');
    }
    return formatCurrency(eurCents, 'EUR');
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString(i18n.language === 'uk' ? 'uk-UA' : i18n.language === 'pl' ? 'pl-PL' : 'en-US', {
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

  if (isSummaryLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 relative">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Wallet className="h-8 w-8 text-primary" />
              {t('finance.title')}
            </h1>
            <div className="flex rounded-md border overflow-hidden">
              <button
                onClick={() => setCurrency('EUR')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${currency === 'EUR' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                € EUR
              </button>
              <button
                onClick={() => setCurrency('UAH')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${currency === 'UAH' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                ₴ UAH
              </button>
            </div>
          </div>
          <p className="text-muted-foreground mt-2">
            {t('finance.subtitle')}
          </p>
          <GiftMarker placementId="finance-header" className="absolute top-0 right-0" />
        </div>

        {/* Balance Summary Cards - Desktop Grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-6 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('finance.availableForWithdrawal')}
              </CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                {formatDisplayCurrency(combinedAvailable, combinedAvailableUah)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('finance.availableBalanceSubtitle')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('finance.totalEarned')}
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {currency === 'UAH' && (summary?.totalEarnedUah || 0) > 0
                  ? formatCurrency(summary?.totalEarnedUah || 0, 'UAH')
                  : formatCurrency(summary?.totalEarned || 0, 'EUR')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('finance.lifetimeEarnings')}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('finance.totalWithdrawn')}
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {formatCurrency(summary?.totalWithdrawn || 0, 'EUR')}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t('finance.allTimeWithdrawals')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Balance Summary Cards - Mobile Carousel */}
        <div className="md:hidden mb-6">
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-3">
              <div className="flex-[0_0_85%] min-w-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('finance.availableForWithdrawal')}
                    </CardTitle>
                    <DollarSign className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-primary">
                      {formatDisplayCurrency(combinedAvailable, combinedAvailableUah)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('finance.availableBalanceSubtitle')}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex-[0_0_85%] min-w-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('finance.totalEarned')}
                    </CardTitle>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">
                      {currency === 'UAH' && (summary?.totalEarnedUah || 0) > 0
                        ? formatCurrency(summary?.totalEarnedUah || 0, 'UAH')
                        : formatCurrency(summary?.totalEarned || 0, 'EUR')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('finance.lifetimeEarnings')}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="flex-[0_0_85%] min-w-0">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t('finance.totalWithdrawn')}
                    </CardTitle>
                    <TrendingDown className="h-4 w-4 text-orange-600" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-foreground">
                      {formatCurrency(summary?.totalWithdrawn || 0, 'EUR')}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('finance.allTimeWithdrawals')}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* Withdraw and Split Payments Buttons */}
        <div className="flex flex-col md:flex-row gap-3 mb-8">
          <Button
            onClick={() => setWithdrawalDialogOpen(true)}
            disabled={combinedAvailable <= 0}
            className="w-full md:flex-1"
            size="lg"
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            {t('finance.withdrawFunds')}
          </Button>
          <Button
            onClick={() => setLocation('/finance/splits')}
            variant="outline"
            className="w-full md:flex-1"
            size="lg"
          >
            <Settings2 className="h-4 w-4 mr-2" />
            {t('finance.configureSplits')}
          </Button>
        </div>

        {/* Information about 3-month holding period */}
        <Alert className="mb-8">
          <Info className="h-4 w-4" />
          <AlertTitle>{t('finance.holdingPeriodTitle')}</AlertTitle>
          <AlertDescription>
            {t('finance.holdingPeriodDescription')}
          </AlertDescription>
        </Alert>

        {/* Track Allocations Summary */}
        {allocationsData && (allocationsData.summary.pendingTotal > 0 || allocationsData.summary.availableTotal > 0) && (
          <Card className="mb-8">
            <Collapsible open={allocationsOpen} onOpenChange={setAllocationsOpen}>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {t('finance.allocations.title')}
                    </CardTitle>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">{formatCurrency(allocationsData.summary.pendingTotal)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">{formatCurrency(allocationsData.summary.availableTotal)}</span>
                      </div>
                      {allocationsOpen ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        <span>{t('finance.allocations.pending')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('finance.allocations.pendingDescription')}
                      </p>
                      <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                        {formatCurrency(allocationsData.summary.pendingTotal)}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>{t('finance.allocations.available')}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('finance.allocations.availableDescription')}
                      </p>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        {formatCurrency(allocationsData.summary.availableTotal)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <CardTitle>{t('finance.transactionHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {isWithdrawalsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : withdrawals.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">{t('finance.noTransactions')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('finance.date')}</TableHead>
                      <TableHead>{t('finance.amount')}</TableHead>
                      <TableHead>{t('finance.status')}</TableHead>
                      <TableHead>{t('finance.notes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map((withdrawal) => (
                      <TableRow key={withdrawal.id}>
                        <TableCell>{formatDate(withdrawal.requestedAt!)}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(withdrawal.amount)}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(withdrawal.status || 'PENDING')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {withdrawal.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Withdrawal Dialog */}
      <WithdrawalDialog
        open={withdrawalDialogOpen}
        onOpenChange={setWithdrawalDialogOpen}
        availableBalance={combinedAvailable}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ['/api/finance/withdrawals'] });
          queryClient.invalidateQueries({ queryKey: ['/api/finance/allocation-summary'] });
          setWithdrawalDialogOpen(false);
        }}
      />
    </div>
  );
}
