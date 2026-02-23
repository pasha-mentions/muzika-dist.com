import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, ArrowUpRight, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

interface AllocationSummary {
  combinedTotal: number;
  combinedTotalUah: number;
  ownerTotal: number;
  ownerTotalUah: number;
  participantsTotal: number;
  participantsTotalUah: number;
  ownerLegacyBalance: number;
}

interface FinanceSummary {
  totalEarned: number;
  totalEarnedUah: number;
  totalWithdrawn: number;
  availableBalance: number;
  availableBalanceUah: number;
  organizationName: string;
}

type Currency = 'EUR' | 'UAH';

function formatCurrency(amount: number): string {
  return (amount / 100).toFixed(2);
}

export default function RoyaltiesCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentOrgId = user?.organizations?.[0]?.id;
  
  const [currency, setCurrency] = useState<Currency>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('finance_currency') as Currency) || 'EUR';
    }
    return 'EUR';
  });
  
  useEffect(() => {
    localStorage.setItem('finance_currency', currency);
  }, [currency]);

  const { data: allocationSummary, isLoading: isLoadingAllocation } = useQuery<AllocationSummary>({
    queryKey: ["/api/finance/allocation-summary"],
    enabled: !!currentOrgId,
    retry: false,
  });

  const { data: financeSummary, isLoading: isLoadingSummary } = useQuery<FinanceSummary>({
    queryKey: ["/api/finance/summary"],
    enabled: !!currentOrgId,
    retry: false,
  });

  const isLoading = isLoadingAllocation || isLoadingSummary;
  

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary" />
            {t('dashboard.royalties.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-muted rounded w-24"></div>
            <div className="h-4 bg-muted rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const availableBalance = allocationSummary?.combinedTotal ?? 0;
  const availableBalanceUah = allocationSummary?.combinedTotalUah ?? 0;
  const totalEarned = financeSummary?.totalEarned ?? 0;
  const totalEarnedUah = financeSummary?.totalEarnedUah ?? 0;
  
  const displayBalance = currency === 'UAH' ? availableBalanceUah : availableBalance;
  const displayTotalEarned = currency === 'UAH' && totalEarnedUah > 0 ? totalEarnedUah : totalEarned;
  const currencySymbol = currency === 'UAH' ? '₴' : '€';
  const earnedSymbol = currency === 'UAH' && totalEarnedUah > 0 ? '₴' : '€';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-5 w-5 text-primary" />
            {t('dashboard.royalties.title')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                onClick={() => setCurrency('EUR')}
                className={`px-2 py-1 transition-colors ${currency === 'EUR' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                €
              </button>
              <button
                onClick={() => setCurrency('UAH')}
                className={`px-2 py-1 transition-colors ${currency === 'UAH' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                ₴
              </button>
            </div>
            {availableBalance > 0 && (
              <Link href="/finance">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  {t('dashboard.royalties.withdraw')}
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">{t('dashboard.royalties.availableBalance')}</p>
          <p className="text-2xl font-bold text-primary">
            {currencySymbol}{formatCurrency(displayBalance)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          <span>{t('dashboard.royalties.totalEarned')}: {earnedSymbol}{formatCurrency(displayTotalEarned)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
