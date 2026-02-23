import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DollarSign, Music, Video, Disc, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Target, Save, Calendar as CalendarIcon, ArrowLeftRight, RefreshCw, ListMusic } from "lucide-react";
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PlatformRevenue {
  period: {
    startMonth: string;
    startYear: string;
    endMonth: string;
    endYear: string;
  };
  revenue: {
    total: number;
    singles: { count: number; amount: number };
    albums: { count: number; amount: number };
    videos: { count: number; amount: number };
    playlists: { count: number; amount: number };
  };
}

interface PlatformExpense {
  id: string;
  type: "EXPENSE" | "REVENUE";
  category: string;
  amount: number;
  comment: string | null;
  organizationId: string | null;
  organizationName: string | null;
  expenseDate: string;
  createdBy: string;
  creatorName: string;
  createdAt: string;
}

interface RevenueTransaction {
  id: string;
  type: 'single' | 'album' | 'video' | 'youtubeAds';
  title: string;
  paidAt: string;
  amount: number;
  organizationName: string;
}

interface CurrencyRates {
  rates: {
    usdBuy: number;
    usdSell: number;
    eurBuy: number;
    eurSell: number;
  };
  ratesDate: string;
  fetchedAt: string;
  source: string;
}

const EXPENSE_CATEGORIES = [
  { value: "TECHNICAL_MAINTENANCE", labelKey: "finance.categories.technicalMaintenance" },
  { value: "PAYROLL", labelKey: "finance.categories.payroll" },
  { value: "CONTRACTORS", labelKey: "finance.categories.contractors" },
  { value: "MARKETING", labelKey: "finance.categories.marketing" },
  { value: "OTHER", labelKey: "finance.categories.other" },
];

const REVENUE_CATEGORIES = [
  { value: "DISTRIBUTION", labelKey: "finance.categories.distribution" },
  { value: "YOUTUBE_ADS", labelKey: "finance.categories.youtubeAds" },
  { value: "META_ADS", labelKey: "finance.categories.metaAds" },
  { value: "PLAYLIST", labelKey: "finance.categories.playlist" },
  { value: "OTHER", labelKey: "finance.categories.other" },
];


function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₴';
}

export default function PlatformFinanceTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(1);
    return { start, end };
  };
  
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState<Date>(defaults.start);
  const [endDate, setEndDate] = useState<Date>(defaults.end);
  
  const startDateStr = format(startDate, 'yyyy-MM-dd');
  const endDateStr = format(endDate, 'yyyy-MM-dd');

  const [isExpenseDialogOpen, setIsExpenseDialogOpen] = useState(false);
  const [isTransactionsDialogOpen, setIsTransactionsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<PlatformExpense | null>(null);
  const [deleteConfirmExpense, setDeleteConfirmExpense] = useState<PlatformExpense | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    type: "EXPENSE" as "EXPENSE" | "REVENUE",
    category: "OTHER",
    amount: "",
    comment: "",
    organizationId: null as string | null,
    expenseDate: new Date().toISOString().split('T')[0],
  });
  const [targetRevenueInput, setTargetRevenueInput] = useState("");

  const { data: revenue, isLoading: isLoadingRevenue } = useQuery<PlatformRevenue>({
    queryKey: [`/api/admin/platform-revenue?startDate=${startDateStr}&endDate=${endDateStr}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: expenses, isLoading: isLoadingExpenses } = useQuery<PlatformExpense[]>({
    queryKey: [`/api/admin/platform-expenses?startDate=${startDateStr}&endDate=${endDateStr}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: targetRevenueSetting } = useQuery<{ key: string; value: number | null }>({
    queryKey: ['/api/admin/platform-settings/targetRevenue'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: transactionsData, isLoading: isLoadingTransactions } = useQuery<{ transactions: RevenueTransaction[] }>({
    queryKey: [`/api/admin/platform-revenue/transactions?startDate=${startDateStr}&endDate=${endDateStr}`],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: currencyRates } = useQuery<CurrencyRates>({
    queryKey: ['/api/admin/currency-rates'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60 * 60 * 1000,
  });

  const { data: organizations } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['/api/admin/organizations'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const saveTargetRevenueMutation = useMutation({
    mutationFn: async (value: number) => {
      const response = await apiRequest('PUT', '/api/admin/platform-settings/targetRevenue', { value });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-settings/targetRevenue'] });
      toast({ title: t('finance.targetSaved') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    },
  });

  const invalidateExpenses = () => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('/api/admin/platform-expenses');
      }
    });
  };

  const createExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/admin/platform-expenses', data);
      return response.json();
    },
    onSuccess: () => {
      invalidateExpenses();
      setIsExpenseDialogOpen(false);
      resetForm();
      toast({ title: t('finance.expenseCreated') });
    },
    onError: (error: any) => {
      toast({ title: t('finance.expenseError'), description: error.message, variant: 'destructive' });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest('PUT', `/api/admin/platform-expenses/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      invalidateExpenses();
      setIsExpenseDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      toast({ title: t('finance.expenseUpdated') });
    },
    onError: (error: any) => {
      toast({ title: t('finance.expenseError'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest('DELETE', `/api/admin/platform-expenses/${id}`);
      return response.json();
    },
    onSuccess: () => {
      invalidateExpenses();
      toast({ title: t('finance.expenseDeleted') });
    },
    onError: (error: any) => {
      toast({ title: t('finance.expenseError'), description: error.message, variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setExpenseForm({
      type: "EXPENSE",
      category: "OTHER",
      amount: "",
      comment: "",
      organizationId: null,
      expenseDate: new Date().toISOString().split('T')[0],
    });
  };

  const handleOpenExpenseDialog = (expense?: PlatformExpense) => {
    if (expense) {
      setEditingExpense(expense);
      setExpenseForm({
        type: expense.type || "EXPENSE",
        category: expense.category,
        amount: String(expense.amount / 100),
        comment: expense.comment || "",
        organizationId: expense.organizationId || null,
        expenseDate: new Date(expense.expenseDate).toISOString().split('T')[0],
      });
    } else {
      setEditingExpense(null);
      resetForm();
    }
    setIsExpenseDialogOpen(true);
  };

  const handleSubmitExpense = () => {
    const amount = Math.round(parseFloat(expenseForm.amount) * 100);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: t('finance.invalidAmount'), variant: 'destructive' });
      return;
    }

    const data = {
      type: expenseForm.type,
      category: expenseForm.category,
      amount,
      comment: expenseForm.comment || null,
      organizationId: expenseForm.type === 'REVENUE' ? expenseForm.organizationId : null,
      expenseDate: expenseForm.expenseDate,
    };

    if (editingExpense) {
      updateExpenseMutation.mutate({ id: editingExpense.id, data });
    } else {
      createExpenseMutation.mutate(data);
    }
  };

  const totalExpenses = expenses?.reduce((sum, exp) => 
    (exp as any).type !== 'REVENUE' ? sum + exp.amount : sum, 0) || 0;
  const totalManualRevenue = expenses?.reduce((sum, exp) => 
    (exp as any).type === 'REVENUE' ? sum + exp.amount : sum, 0) || 0;
  const platformRevenue = revenue?.revenue.total || 0;
  const totalRevenue = platformRevenue + totalManualRevenue;
  const netProfit = totalRevenue - totalExpenses;
  const targetRevenueValue = targetRevenueSetting?.value || 0;

  const progressBarData = useMemo(() => {
    const breakEvenPoint = totalExpenses;
    const targetPoint = targetRevenueValue;
    
    const maxValue = Math.max(totalRevenue, targetPoint, breakEvenPoint) || 100;
    const scale = maxValue > 0 ? 100 / maxValue : 0;
    
    const revenuePercent = Math.min((totalRevenue / maxValue) * 100, 100);
    const breakEvenPercent = maxValue > 0 ? (breakEvenPoint / maxValue) * 100 : 0;
    const targetPercent = maxValue > 0 ? (targetPoint / maxValue) * 100 : 0;
    
    let status: 'below-break-even' | 'above-break-even' | 'target-reached' = 'below-break-even';
    if (totalRevenue >= targetPoint && targetPoint > 0) {
      status = 'target-reached';
    } else if (totalRevenue >= breakEvenPoint && breakEvenPoint > 0) {
      status = 'above-break-even';
    }
    
    return {
      revenuePercent,
      breakEvenPercent,
      targetPercent,
      status,
      breakEvenPoint,
      targetPoint,
      totalRevenue,
    };
  }, [totalExpenses, targetRevenueValue, totalRevenue]);

  const handleSaveTargetRevenue = () => {
    const amount = Math.round(parseFloat(targetRevenueInput) * 100);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: t('finance.invalidAmount'), variant: 'destructive' });
      return;
    }
    saveTargetRevenueMutation.mutate(amount);
  };

  const getCategoryLabel = (category: string) => {
    const cat = EXPENSE_CATEGORIES.find(c => c.value === category) || REVENUE_CATEGORIES.find(c => c.value === category);
    return cat ? t(cat.labelKey) : category;
  };

  const getServiceTypeLabel = (type: string) => {
    switch (type) {
      case 'single': return t('finance.serviceTypes.single');
      case 'album': return t('finance.serviceTypes.album');
      case 'video': return t('finance.serviceTypes.video');
      case 'youtubeAds': return t('finance.serviceTypes.youtubeAds');
      default: return type;
    }
  };

  const combinedEntries = useMemo(() => {
    const entries: Array<{
      id: string;
      date: Date;
      type: 'expense' | 'revenue' | 'payment';
      category: string;
      amount: number;
      comment: string | null;
      organizationName: string | null;
      creatorName: string | null;
      isAutomatic: boolean;
      serviceType?: string;
      title?: string;
    }> = [];

    if (expenses) {
      for (const expense of expenses) {
        entries.push({
          id: expense.id,
          date: new Date(expense.expenseDate),
          type: expense.type === 'REVENUE' ? 'revenue' : 'expense',
          category: expense.category,
          amount: expense.amount,
          comment: expense.comment,
          organizationName: expense.organizationName,
          creatorName: expense.creatorName,
          isAutomatic: false,
        });
      }
    }

    if (transactionsData?.transactions) {
      for (const tx of transactionsData.transactions) {
        entries.push({
          id: tx.id,
          date: new Date(tx.paidAt),
          type: 'payment',
          category: 'DISTRIBUTION',
          amount: tx.amount,
          comment: tx.title,
          organizationName: tx.organizationName,
          creatorName: null,
          isAutomatic: true,
          serviceType: tx.type,
          title: tx.title,
        });
      }
    }

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return entries;
  }, [expenses, transactionsData]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('finance.periodSelector')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex gap-2 items-center">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[160px] justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "MMM d, yyyy") : t('finance.startDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">—</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[160px] justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "MMM d, yyyy") : t('finance.endDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Card className="border-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.totalRevenue')}</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatAmount(totalRevenue)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.singles')}</CardTitle>
            <Disc className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenue?.revenue.singles.count || 0}</div>
            <p className="text-xs text-muted-foreground">{formatAmount(revenue?.revenue.singles.amount || 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.albums')}</CardTitle>
            <Music className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenue?.revenue.albums.count || 0}</div>
            <p className="text-xs text-muted-foreground">{formatAmount(revenue?.revenue.albums.amount || 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.videos')}</CardTitle>
            <Video className="h-4 w-4 text-pink-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenue?.revenue.videos.count || 0}</div>
            <p className="text-xs text-muted-foreground">{formatAmount(revenue?.revenue.videos.amount || 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.playlists')}</CardTitle>
            <ListMusic className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{revenue?.revenue.playlists?.count || 0}</div>
            <p className="text-xs text-muted-foreground">{formatAmount(revenue?.revenue.playlists?.amount || 0)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.totalExpenses')}</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatAmount(totalExpenses)}</div>
          </CardContent>
        </Card>

        <Card className={netProfit >= 0 ? "border-green-500" : "border-red-500"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('finance.netProfit')}</CardTitle>
            {netProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatAmount(netProfit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {currencyRates && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowLeftRight className="h-5 w-5 text-blue-500" />
              {t('finance.currencyRates')}
              <Badge variant="outline" className="ml-auto text-xs font-normal">
                Wayforpay
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">USD</p>
                <p className="text-xl font-semibold">
                  {(currencyRates.rates.usdBuy ?? 0).toFixed(3)} / {(currencyRates.rates.usdSell ?? 0).toFixed(3)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">EUR</p>
                <p className="text-xl font-semibold">
                  {(currencyRates.rates.eurBuy ?? 0).toFixed(3)} / {(currencyRates.rates.eurSell ?? 0).toFixed(3)}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              {t('finance.ratesUpdatedAt')}: {new Date(currencyRates.fetchedAt).toLocaleString('uk-UA')}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {t('finance.revenueProgress')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 items-end mb-6">
            <div className="flex-1">
              <Label>{t('finance.setTargetRevenue')}</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  placeholder={t('finance.targetRevenuePlaceholder')}
                  value={targetRevenueInput}
                  onChange={(e) => setTargetRevenueInput(e.target.value)}
                  className="max-w-xs"
                />
                <Button 
                  onClick={handleSaveTargetRevenue}
                  disabled={saveTargetRevenueMutation.isPending}
                  size="icon"
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
              {targetRevenueValue > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t('finance.targetRevenue')}: {formatAmount(targetRevenueValue)}
                </p>
              )}
            </div>
          </div>

          <div className="relative h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
            <div
              className={`absolute h-full transition-all duration-500 ${
                progressBarData.status === 'target-reached' 
                  ? 'bg-gradient-to-r from-green-400 to-green-500'
                  : progressBarData.status === 'above-break-even'
                    ? 'bg-gradient-to-r from-yellow-400 to-yellow-500'
                    : 'bg-gradient-to-r from-red-400 to-red-500'
              }`}
              style={{ width: `${progressBarData.revenuePercent}%` }}
            />
            
            {progressBarData.breakEvenPoint > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-orange-600 dark:border-orange-400 z-10"
                style={{ left: `${progressBarData.breakEvenPercent}%` }}
              >
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs font-medium text-orange-600 dark:text-orange-400">
                  {t('finance.breakEvenPoint')}
                </div>
                <div className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground">
                  {formatAmount(progressBarData.breakEvenPoint)}
                </div>
              </div>
            )}
            
            {progressBarData.targetPoint > 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 border-l-2 border-dashed border-green-600 dark:border-green-400 z-10"
                style={{ left: `${progressBarData.targetPercent}%` }}
              >
                <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs font-medium text-green-600 dark:text-green-400">
                  {t('finance.targetRevenue')}
                </div>
                <div className="absolute -bottom-5 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground">
                  {formatAmount(progressBarData.targetPoint)}
                </div>
              </div>
            )}

            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold text-white drop-shadow-lg">
                {formatAmount(totalRevenue)}
              </span>
            </div>
          </div>

          <div className="flex justify-between mt-8 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-muted-foreground">{t('finance.belowBreakEven')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-muted-foreground">{t('finance.aboveBreakEven')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-muted-foreground">{t('finance.targetReached')}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('finance.expensesAndRevenues')}</CardTitle>
          <Button onClick={() => handleOpenExpenseDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            {t('finance.addEntry')}
          </Button>
        </CardHeader>
        <CardContent>
          {(isLoadingExpenses || isLoadingTransactions) ? (
            <div className="text-center text-muted-foreground py-8">{t('common.loading')}</div>
          ) : !combinedEntries.length ? (
            <div className="text-center text-muted-foreground py-8">{t('finance.noExpenses')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('finance.date')}</TableHead>
                  <TableHead>{t('finance.organization')}</TableHead>
                  <TableHead>{t('finance.category')}</TableHead>
                  <TableHead>{t('finance.amount')}</TableHead>
                  <TableHead>{t('finance.comment')}</TableHead>
                  <TableHead>{t('finance.source')}</TableHead>
                  <TableHead className="text-right">{t('finance.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {combinedEntries.map((entry) => {
                  const isExpense = entry.type === 'expense';
                  const isPayment = entry.type === 'payment';
                  const isRevenue = entry.type === 'revenue' || isPayment;
                  
                  return (
                    <TableRow key={`${entry.isAutomatic ? 'tx' : 'exp'}-${entry.id}`}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{entry.date.toLocaleDateString('uk-UA')}</span>
                          <span className="text-xs text-muted-foreground">
                            {entry.date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {entry.organizationName ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                            {entry.organizationName}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge 
                            variant="outline" 
                            className={isRevenue ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}
                          >
                            {isExpense ? t('finance.expense') : t('finance.revenue')}
                          </Badge>
                          {isPayment && entry.serviceType ? (
                            <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                              {getServiceTypeLabel(entry.serviceType)}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{getCategoryLabel(entry.category)}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`font-medium ${isRevenue ? 'text-green-600' : 'text-red-600'}`}>
                        {isRevenue ? '+' : '-'}{formatAmount(entry.amount)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {entry.title || entry.comment || '-'}
                      </TableCell>
                      <TableCell>
                        {entry.isAutomatic ? (
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
                            {t('finance.automatic')}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">{entry.creatorName || '-'}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!entry.isAutomatic && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => {
                                const originalExpense = expenses?.find(e => e.id === entry.id);
                                if (originalExpense) handleOpenExpenseDialog(originalExpense);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => {
                                const originalExpense = expenses?.find(e => e.id === entry.id);
                                if (originalExpense) setDeleteConfirmExpense(originalExpense);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isExpenseDialogOpen} onOpenChange={setIsExpenseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingExpense 
                ? (expenseForm.type === 'REVENUE' ? t('finance.editRevenue') : t('finance.editExpense'))
                : (expenseForm.type === 'REVENUE' ? t('finance.addRevenue') : t('finance.addExpense'))
              }
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={expenseForm.type === 'EXPENSE' ? 'default' : 'outline'}
                className={expenseForm.type === 'EXPENSE' ? 'flex-1 bg-red-600 hover:bg-red-700' : 'flex-1'}
                onClick={() => setExpenseForm(prev => ({ ...prev, type: 'EXPENSE', category: 'OTHER' }))}
              >
                {t('finance.expense')}
              </Button>
              <Button
                type="button"
                variant={expenseForm.type === 'REVENUE' ? 'default' : 'outline'}
                className={expenseForm.type === 'REVENUE' ? 'flex-1 bg-green-600 hover:bg-green-700' : 'flex-1'}
                onClick={() => setExpenseForm(prev => ({ ...prev, type: 'REVENUE', category: 'DISTRIBUTION' }))}
              >
                {t('finance.revenue')}
              </Button>
            </div>
            <div>
              <Label>{t('finance.category')}</Label>
              <Select value={expenseForm.category} onValueChange={(v) => setExpenseForm(prev => ({ ...prev, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(expenseForm.type === 'REVENUE' ? REVENUE_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{t(cat.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {expenseForm.type === 'REVENUE' && (
              <div>
                <Label>{t('finance.organization')} ({t('common.optional')})</Label>
                <Select 
                  value={expenseForm.organizationId || "none"} 
                  onValueChange={(v) => setExpenseForm(prev => ({ ...prev, organizationId: v === "none" ? null : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('finance.selectOrganization')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('finance.noOrganization')}</SelectItem>
                    {organizations?.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t('finance.amount')} (₴)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>{t('finance.date')}</Label>
              <Input
                type="date"
                value={expenseForm.expenseDate}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expenseDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('finance.comment')}</Label>
              <Textarea
                value={expenseForm.comment}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder={t('finance.commentPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExpenseDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={handleSubmitExpense}
              disabled={createExpenseMutation.isPending || updateExpenseMutation.isPending}
              className={expenseForm.type === 'REVENUE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
            >
              {editingExpense 
                ? t('common.save') 
                : (expenseForm.type === 'REVENUE' ? t('finance.addRevenue') : t('finance.addExpense'))
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmExpense} onOpenChange={(open) => !open && setDeleteConfirmExpense(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('finance.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('finance.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteConfirmExpense) {
                  deleteExpenseMutation.mutate(deleteConfirmExpense.id);
                  setDeleteConfirmExpense(null);
                }
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
