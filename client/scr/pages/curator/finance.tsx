import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProxiedImageUrl } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Wallet, TrendingUp, ArrowDownToLine, Clock, CheckCircle, AlertCircle, Info, DollarSign, Music, User, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { uk, enUS, pl } from "date-fns/locale";
import i18n from "@/i18n";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface CuratorBalance {
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalWithdrawn: number;
  currency: string;
}

interface CuratorTransaction {
  id: string;
  curatorOrgId: string;
  type: "INCOME" | "WITHDRAWAL";
  status: "PENDING" | "AVAILABLE" | "PROCESSING" | "COMPLETED" | "CANCELLED";
  amount: number;
  currency: string;
  applicationId: string | null;
  description: string | null;
  availableAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface FinanceAnalytics {
  totalWithdrawn: number;
  monthlyEarnings: { month: string; amount: number }[];
  earningsThisMonth: number;
  topPlaylists: { name: string; imageUrl: string | null; amount: number }[];
  topArtists: { name: string; amount: number }[];
  packageDistribution: { name: string; count: number; amount: number }[];
  stats: {
    totalApplications: number;
    averageCheck: number;
  };
}

interface MonthAnalytics {
  month: string;
  earnings: number;
  topPlaylists: { name: string; imageUrl: string | null; amount: number }[];
  topArtists: { name: string; amount: number }[];
  stats: {
    totalApplications: number;
    averageCheck: number;
  };
}

const formatCurrency = (kopecks: number): string => {
  return (kopecks / 100).toFixed(2);
};

const formatCurrencyShort = (kopecks: number): string => {
  const value = kopecks / 100;
  if (value >= 1000) {
    return (value / 1000).toFixed(1) + 'K';
  }
  return value.toFixed(0);
};

const getStatusBadge = (status: CuratorTransaction["status"], t: any) => {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary" className="bg-amber-500/20 text-amber-400"><Clock className="w-3 h-3 mr-1" />{t('curator.finance.statusPending')}</Badge>;
    case "AVAILABLE":
      return <Badge variant="secondary" className="bg-green-500/20 text-green-400"><CheckCircle className="w-3 h-3 mr-1" />{t('curator.finance.statusAvailable')}</Badge>;
    case "PROCESSING":
      return <Badge variant="secondary" className="bg-blue-500/20 text-blue-400"><Loader2 className="w-3 h-3 mr-1 animate-spin" />{t('curator.finance.statusProcessing')}</Badge>;
    case "COMPLETED":
      return <Badge variant="secondary" className="bg-green-500/20 text-green-400"><CheckCircle className="w-3 h-3 mr-1" />{t('curator.finance.statusCompleted')}</Badge>;
    case "CANCELLED":
      return <Badge variant="secondary" className="bg-red-500/20 text-red-400"><AlertCircle className="w-3 h-3 mr-1" />{t('curator.finance.statusCancelled')}</Badge>;
    default:
      return null;
  }
};


interface PaymentDetail {
  id: string;
  recipientName: string;
  iban: string;
  taxId?: string;
  bankName: string;
  isPrimary: boolean;
}

export default function CuratorFinance() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState({
    iban: "",
    recipientName: "",
    taxId: "",
    bankName: "",
  });

  const currentLocale = i18n.language === 'uk' ? uk : i18n.language === 'pl' ? pl : enUS;

  const { data: balance, isLoading: balanceLoading } = useQuery<CuratorBalance>({
    queryKey: ["/api/curator/balance"],
  });

  const { data: transactions, isLoading: transactionsLoading } = useQuery<CuratorTransaction[]>({
    queryKey: ["/api/curator/transactions"],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<FinanceAnalytics>({
    queryKey: ["/api/curator/finance-analytics"],
  });

  const { data: monthAnalytics, isLoading: monthAnalyticsLoading } = useQuery<MonthAnalytics>({
    queryKey: ["/api/curator/finance-analytics", selectedMonth],
    queryFn: async () => {
      if (!selectedMonth) return null;
      const res = await fetch(`/api/curator/finance-analytics/${selectedMonth}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch month analytics');
      return res.json();
    },
    enabled: !!selectedMonth,
  });

  const { data: paymentDetails = [] } = useQuery<PaymentDetail[]>({
    queryKey: ["/api/payment-details"],
  });

  const primaryPayment = paymentDetails.find(p => p.isPrimary) || paymentDetails[0];

  const handlePaymentSelect = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    const payment = paymentDetails.find(p => p.id === paymentId);
    if (payment) {
      setBankAccount({
        iban: payment.iban,
        recipientName: payment.recipientName,
        taxId: payment.taxId || "",
        bankName: payment.bankName,
      });
    }
  };

  const withdrawMutation = useMutation({
    mutationFn: async (data: { amount: number; bankAccount: typeof bankAccount }) => {
      const res = await apiRequest("POST", "/api/curator/withdraw", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curator/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/curator/finance-analytics"] });
      setIsWithdrawDialogOpen(false);
      setWithdrawAmount("");
      toast({ title: t('curator.finance.withdrawSuccess') });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('curator.finance.withdrawError'),
        variant: "destructive",
      });
    },
  });

  const handleWithdraw = () => {
    const amount = Math.round(parseFloat(withdrawAmount) * 100);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: t('curator.finance.invalidAmount'), variant: "destructive" });
      return;
    }
    if (!bankAccount.iban || !bankAccount.recipientName) {
      toast({ title: t('curator.finance.bankDetailsRequired'), variant: "destructive" });
      return;
    }
    withdrawMutation.mutate({ amount, bankAccount });
  };

  if (balanceLoading || transactionsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const chartData = analytics?.monthlyEarnings?.map(item => ({
    monthKey: item.month,
    month: format(new Date(item.month + '-01'), 'MMM', { locale: currentLocale }),
    amount: item.amount / 100,
  })) || [];

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload[0]) {
      const clickedMonth = data.activePayload[0].payload.monthKey;
      if (selectedMonth === clickedMonth) {
        setSelectedMonth(null);
      } else {
        setSelectedMonth(clickedMonth);
      }
    }
  };

  const getSelectedMonthLabel = () => {
    if (!selectedMonth) return '';
    return format(new Date(selectedMonth + '-01'), 'LLLL yyyy', { locale: currentLocale });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('curator.finance.title')}</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">{t('curator.finance.subtitle')}</p>
          </div>
        </div>

        {/* Balance Cards - 4 columns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Card className="bg-gradient-to-br from-green-500/10 to-emerald-600/10 border-green-500/30">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground">{t('curator.finance.availableBalance')}</span>
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-green-500">
                {formatCurrency(balance?.availableBalance || 0)} <span className="text-sm sm:text-lg">₴</span>
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{t('curator.finance.readyToWithdraw')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground">{t('curator.finance.pendingBalance')}</span>
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {formatCurrency(balance?.pendingBalance || 0)} <span className="text-sm sm:text-lg">₴</span>
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{t('curator.finance.pendingHint')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground">{t('curator.finance.totalEarned')}</span>
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {formatCurrency(balance?.totalEarned || 0)} <span className="text-sm sm:text-lg">₴</span>
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{t('curator.finance.allTimeEarnings')}</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-600/10 border-blue-500/30">
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-xs sm:text-sm text-muted-foreground">{t('curator.finance.totalWithdrawn')}</span>
                <ArrowDownToLine className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
              </div>
              <p className="text-xl sm:text-2xl font-bold text-blue-500">
                {formatCurrency(analytics?.totalWithdrawn || 0)} <span className="text-sm sm:text-lg">₴</span>
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{t('curator.finance.withdrawnFunds')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Withdraw Button */}
        <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              size="lg" 
              className="w-full mb-6 bg-primary hover:bg-primary/90"
              disabled={!balance || balance.availableBalance <= 0}
            >
              <ArrowDownToLine className="w-5 h-5 mr-2" />
              {t('curator.finance.withdrawFunds')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('curator.finance.withdrawTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('curator.finance.withdrawAmountLabel')}</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="pr-24"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-primary hover:text-primary/80"
                      onClick={() => setWithdrawAmount(((balance?.availableBalance || 0) / 100).toFixed(2))}
                    >
                      {t('common.max')}
                    </Button>
                    <span className="text-muted-foreground text-sm">UAH</span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('curator.finance.availableToWithdraw')}: {formatCurrency(balance?.availableBalance || 0)} ₴
                </p>
              </div>

              {paymentDetails.length > 0 ? (
                <div>
                  <Label>{t('curator.finance.selectPaymentMethod')}</Label>
                  <div className="space-y-2 mt-2">
                    {paymentDetails.map((payment) => (
                      <div
                        key={payment.id}
                        onClick={() => handlePaymentSelect(payment.id)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                          selectedPaymentId === payment.id 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{payment.recipientName}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {payment.iban.slice(0, 4)}...{payment.iban.slice(-4)}
                            </p>
                            {payment.taxId && (
                              <p className="text-xs text-muted-foreground">
                                {payment.taxId.slice(0, 3)}...{payment.taxId.slice(-2)}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">{payment.bankName}</p>
                          </div>
                          {payment.isPrimary && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              {t('settings.billingDetails.primary')}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('curator.finance.managePaymentMethods')} <a href="/curator/settings/billing" className="text-primary hover:underline">{t('curator.finance.inSettings')}</a>
                  </p>
                </div>
              ) : (
                <>
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">{t('curator.finance.noSavedPaymentMethods')}</p>
                    <a href="/curator/settings/billing" className="text-primary text-sm hover:underline">
                      {t('curator.finance.addPaymentMethod')}
                    </a>
                  </div>
                  <div>
                    <Label>{t('curator.finance.recipientName')}</Label>
                    <Input
                      value={bankAccount.recipientName}
                      onChange={(e) => setBankAccount({ ...bankAccount, recipientName: e.target.value })}
                      placeholder={t('curator.finance.recipientNamePlaceholder')}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>{t('curator.finance.iban')}</Label>
                    <Input
                      value={bankAccount.iban}
                      onChange={(e) => setBankAccount({ ...bankAccount, iban: e.target.value.toUpperCase() })}
                      placeholder="UA000000000000000000000000000"
                      className="mt-1 font-mono"
                    />
                  </div>
                  <div>
                    <Label>{t('curator.finance.bankName')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
                    <Input
                      value={bankAccount.bankName}
                      onChange={(e) => setBankAccount({ ...bankAccount, bankName: e.target.value })}
                      placeholder={t('curator.finance.bankNamePlaceholder')}
                      className="mt-1"
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsWithdrawDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleWithdraw} 
                disabled={withdrawMutation.isPending || (paymentDetails.length > 0 && !selectedPaymentId)}
              >
                {withdrawMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('curator.finance.confirmWithdraw')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Monthly Earnings Chart */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              {t('curator.finance.monthlyEarnings')}
              {selectedMonth && (
                <Badge variant="secondary" className="ml-2 cursor-pointer" onClick={() => setSelectedMonth(null)}>
                  {getSelectedMonthLabel()} ✕
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{t('curator.finance.clickMonthHint')}</p>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="h-48 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrencyShort(v * 100)} />
                  <Tooltip 
                    formatter={(value: number) => [`${value.toFixed(2)} ₴`, t('curator.finance.earnings')]}
                    labelFormatter={(label) => label}
                  />
                  <Bar 
                    dataKey="amount" 
                    radius={[4, 4, 0, 0]}
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.monthKey === selectedMonth ? '#22c55e' : '#8b5cf6'}
                        cursor="pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                {t('curator.finance.noDataYet')}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Month Details - shown when a month is selected */}
        {selectedMonth && (
          <div className="space-y-6 mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
            {monthAnalyticsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : monthAnalytics ? (
              <>
                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                  <Card className="border-primary/30">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">{getSelectedMonthLabel()}</p>
                      <p className="text-lg sm:text-xl font-bold text-primary">
                        {formatCurrency(monthAnalytics.earnings || 0)} ₴
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/30">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t('curator.finance.averageCheck')}</p>
                      <p className="text-lg sm:text-xl font-bold text-foreground">
                        {formatCurrency(monthAnalytics.stats?.averageCheck || 0)} ₴
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-primary/30">
                    <CardContent className="p-3 sm:p-4 text-center">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">{t('curator.finance.paidApplications')}</p>
                      <p className="text-lg sm:text-xl font-bold text-foreground">
                        {monthAnalytics.stats?.totalApplications || 0}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Rankings Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Top Playlists */}
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Music className="w-4 h-4 text-primary" />
                        {t('curator.finance.topPlaylists')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {monthAnalytics.topPlaylists && monthAnalytics.topPlaylists.length > 0 ? (
                        <div className="space-y-3">
                          {monthAnalytics.topPlaylists.map((playlist, index) => (
                            <div key={index} className="flex items-center gap-3">
                              <span className="text-lg font-bold text-muted-foreground w-6">{index + 1}</span>
                              <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                                {playlist.imageUrl ? (
                                  <img src={getProxiedImageUrl(playlist.imageUrl)} alt={playlist.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                                    <Music className="w-4 h-4 text-purple-400/60" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{playlist.name}</p>
                              </div>
                              <span className="font-bold text-green-500">{formatCurrency(playlist.amount)} ₴</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                          {t('curator.finance.noDataYet')}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Artists */}
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="w-4 h-4 text-primary" />
                        {t('curator.finance.topArtists')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {monthAnalytics.topArtists && monthAnalytics.topArtists.length > 0 ? (
                        <div className="space-y-3">
                          {monthAnalytics.topArtists.map((artist, index) => {
                            const medals = ['🥇', '🥈', '🥉'];
                            return (
                              <div key={index} className="flex items-center gap-3">
                                <span className="text-xl w-8">{medals[index] || (index + 1)}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{artist.name}</p>
                                </div>
                                <span className="font-bold text-green-500">{formatCurrency(artist.amount)} ₴</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                          {t('curator.finance.noDataYet')}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* Info Card */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t('curator.finance.howItWorksTitle')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('curator.finance.howItWorksDescription')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t('curator.finance.transactionHistory')}</CardTitle>
          </CardHeader>
          <CardContent>
            {transactions && transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        tx.type === 'INCOME' 
                          ? 'bg-green-500/20 text-green-500' 
                          : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {tx.type === 'INCOME' ? (
                          <TrendingUp className="w-5 h-5" />
                        ) : (
                          <ArrowDownToLine className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {tx.type === 'INCOME' ? t('curator.finance.typeIncome') : t('curator.finance.typeWithdrawal')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.description || format(new Date(tx.createdAt), "d MMMM yyyy, HH:mm", { locale: currentLocale })}
                        </p>
                        {tx.type === 'INCOME' && tx.status === 'PENDING' && tx.availableAt && (
                          <p className="text-xs text-amber-500">
                            {t('curator.finance.availableFrom')}: {format(new Date(tx.availableAt), "d MMM, HH:mm", { locale: currentLocale })}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${tx.type === 'INCOME' ? 'text-green-500' : 'text-foreground'}`}>
                        {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount)} ₴
                      </p>
                      <div className="mt-1">
                        {getStatusBadge(tx.status, t)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t('curator.finance.noTransactions')}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
