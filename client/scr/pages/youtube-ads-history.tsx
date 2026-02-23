import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Youtube, Globe, Clock, DollarSign, Users, MapPin, FileText, ExternalLink, Loader2, Eye, MousePointer, TrendingUp, Percent, BarChart3, CreditCard, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { countries as countryList } from "@shared/countries";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";

interface YouTubeAdCampaign {
  id: string;
  userId: string;
  orgId: string;
  videoUrl: string;
  videoId: string;
  budget: number;
  inStreamPercent: number;
  discoveryPercent: number;
  duration: number;
  countries: string[];
  cities?: Record<string, string[]> | null;
  audience?: string | null;
  status: string;
  adminNotes?: string | null;
  reportData?: Record<string, any> | null;
  reportUploadedAt?: string | null;
  inStreamReportData?: Record<string, any> | null;
  inStreamReportUploadedAt?: string | null;
  discoveryReportData?: Record<string, any> | null;
  discoveryReportUploadedAt?: string | null;
  paymentStatus: string;
  paymentReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
  launchFee?: number | null;
  adBudget?: number | null;
  wayforpayFee?: number | null;
  taxFee?: number | null;
  youtubeTax?: number | null;
}

interface WayforpayPaymentData {
  merchantAccount: string;
  merchantDomainName: string;
  merchantSignature: string;
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productName: string[];
  productCount: number[];
  productPrice: number[];
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  language: string;
  serviceUrl: string;
}

declare global {
  interface Window {
    Wayforpay: new () => {
      run: (
        data: Record<string, any>,
        onApproved?: (response: any) => void,
        onDeclined?: (response: any) => void,
        onPending?: (response: any) => void
      ) => void;
    };
  }
}

const BASE_LAUNCH_FEE = 50;
const COMBINED_AD_FEE = 15;
const TAX_RATE = 0.07;
const WAYFORPAY_RATE = 0.02;
const YOUTUBE_TAX_RATE = 0.20;

function CostBreakdownBar({ campaign, t }: { campaign: YouTubeAdCampaign; t: any }) {
  if (!campaign) return null;
  
  const budget = campaign.budget || 0;
  
  if (budget <= 0) return null;
  
  const hasStoredValues = campaign.wayforpayFee != null && campaign.taxFee != null && campaign.launchFee != null && campaign.youtubeTax != null && campaign.adBudget != null;
  
  let wayforpayFee: number;
  let muzikaTax: number;
  let launchFee: number;
  let youtubeTax: number;
  let adSpend: number;
  
  if (hasStoredValues) {
    wayforpayFee = campaign.wayforpayFee! / 100;
    muzikaTax = campaign.taxFee! / 100;
    launchFee = campaign.launchFee! / 100;
    youtubeTax = campaign.youtubeTax! / 100;
    adSpend = campaign.adBudget! / 100;
  } else {
    const isCombinedCampaign = campaign.inStreamPercent > 0 && campaign.discoveryPercent > 0;
    wayforpayFee = budget * WAYFORPAY_RATE;
    const afterWayforpay = budget - wayforpayFee;
    muzikaTax = afterWayforpay * TAX_RATE;
    const afterMuzikaTax = afterWayforpay - muzikaTax;
    launchFee = isCombinedCampaign ? BASE_LAUNCH_FEE + COMBINED_AD_FEE : BASE_LAUNCH_FEE;
    const budgetBeforeYoutubeTax = Math.max(0, afterMuzikaTax - launchFee);
    youtubeTax = budgetBeforeYoutubeTax * YOUTUBE_TAX_RATE / (1 + YOUTUBE_TAX_RATE);
    adSpend = budgetBeforeYoutubeTax - youtubeTax;
  }
  
  adSpend = Math.max(0, adSpend);
  youtubeTax = Math.max(0, youtubeTax);
  muzikaTax = Math.max(0, muzikaTax);
  wayforpayFee = Math.max(0, wayforpayFee);
  
  const segments = [
    { key: 'adSpend', value: adSpend, color: '#22c55e', label: t('youtubeAds.history.costBreakdown.adSpend') },
    { key: 'youtubeTax', value: youtubeTax, color: '#ef4444', label: t('youtubeAds.history.costBreakdown.youtubeTax') },
    { key: 'launchFee', value: launchFee, color: '#6b7280', label: t('youtubeAds.history.costBreakdown.launchFee') },
    { key: 'muzikaTax', value: muzikaTax, color: '#f97316', label: t('youtubeAds.history.costBreakdown.muzikaTax') },
    { key: 'wayforpay', value: wayforpayFee, color: '#3b82f6', label: t('youtubeAds.history.costBreakdown.wayforpay') },
  ];
  
  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('youtubeAds.history.costBreakdown.title')}</span>
          <span className="text-xs text-muted-foreground ml-auto">${budget.toFixed(2)}</span>
        </div>
        
        <div className="h-6 flex rounded-lg overflow-hidden mb-3">
          {segments.map((segment) => {
            const percent = (segment.value / budget) * 100;
            if (percent < 0.5) return null;
            return (
              <div
                key={segment.key}
                className="h-full flex items-center justify-center text-[10px] font-medium text-white transition-all"
                style={{ 
                  width: `${percent}%`, 
                  backgroundColor: segment.color,
                  minWidth: percent > 3 ? '20px' : undefined
                }}
                title={`${segment.label}: $${segment.value.toFixed(2)} (${percent.toFixed(1)}%)`}
              >
                {percent > 8 && `${percent.toFixed(0)}%`}
              </div>
            );
          })}
        </div>
        
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {segments.map((segment) => (
            <div key={segment.key} className="flex items-center gap-1.5">
              <div 
                className="w-2.5 h-2.5 rounded-sm" 
                style={{ backgroundColor: segment.color }}
              />
              <span className="text-muted-foreground">{segment.label}:</span>
              <span className="font-medium">${segment.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReportMetricsGrid({ reportData, t }: { reportData: Record<string, any>; t: any }) {
  const hasCpv = reportData.cpv !== undefined;
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">{t('youtubeAds.history.report.impressions')}</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {(reportData.impressions || 0).toLocaleString()}
          </p>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <MousePointer className="w-4 h-4 text-green-500" />
            <span className="text-xs text-muted-foreground">{t('youtubeAds.history.report.views')}</span>
          </div>
          <p className="text-2xl font-bold text-green-600">
            {(reportData.views || 0).toLocaleString()}
          </p>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-muted-foreground">{t('youtubeAds.history.report.cost')}</span>
          </div>
          <p className="text-2xl font-bold text-purple-600">
            {reportData.cost || 0} <span className="text-sm font-normal">{reportData.currency || 'UAH'}</span>
          </p>
        </CardContent>
      </Card>
      
      <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">{hasCpv ? 'CPV' : t('youtubeAds.history.report.cpm')}</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {hasCpv ? reportData.cpv : (reportData.cpm || 0)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {reportData.currency || 'UAH'} / {hasCpv ? 'перегляд' : '1000 показів'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportCharts({ reportData, t }: { reportData: Record<string, any>; t: any }) {
  const viewRate = reportData.impressions ? ((reportData.views / reportData.impressions) * 100).toFixed(2) : 0;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('youtubeAds.history.report.performance')}</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={[
                  { name: t('youtubeAds.history.report.impressions'), value: reportData.impressions || 0, fill: '#3b82f6' },
                  { name: t('youtubeAds.history.report.views'), value: reportData.views || 0, fill: '#22c55e' },
                ]}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(value) => value.toLocaleString()} />
                <YAxis type="category" dataKey="name" width={80} />
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Percent className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{t('youtubeAds.history.report.viewRate')}</span>
          </div>
          <div className="h-48 flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: t('youtubeAds.history.report.viewed'), value: reportData.views || 0 },
                    { name: t('youtubeAds.history.report.notViewed'), value: Math.max(0, (reportData.impressions || 0) - (reportData.views || 0)) },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  <Cell fill="#22c55e" />
                  <Cell fill="#e5e7eb" />
                </Pie>
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-center text-sm text-muted-foreground mt-2">
              {t('youtubeAds.history.report.viewRateValue')}: {viewRate}%
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SingleReportView({ reportData, uploadedAt, campaign, showCostBreakdown = true, t }: { reportData: Record<string, any>; uploadedAt?: string | null; campaign: YouTubeAdCampaign; showCostBreakdown?: boolean; t: any }) {
  return (
    <div className="space-y-4">
      {showCostBreakdown && <CostBreakdownBar campaign={campaign} t={t} />}
      <ReportMetricsGrid reportData={reportData} t={t} />
      <ReportCharts reportData={reportData} t={t} />
      
      {reportData.conversions > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('youtubeAds.history.report.conversions')}</p>
                <p className="text-xl font-bold">{reportData.conversions}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('youtubeAds.history.report.conversionRate')}</p>
                <p className="text-xl font-bold">{reportData.conversionRate}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('youtubeAds.history.report.costPerConversion')}</p>
                <p className="text-xl font-bold">{reportData.costPerConversion} {reportData.currency || 'UAH'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {uploadedAt && (
        <p className="text-xs text-muted-foreground text-center">
          {t('youtubeAds.history.report.uploadedAt')}: {format(new Date(uploadedAt), "dd.MM.yyyy HH:mm")}
        </p>
      )}
    </div>
  );
}

function ReportDisplay({ campaign, t }: { campaign: YouTubeAdCampaign; t: any }) {
  const [activeTab, setActiveTab] = useState<'inStream' | 'discovery'>('inStream');
  
  const hasInStreamReport = campaign.inStreamReportData && Object.keys(campaign.inStreamReportData).length > 0;
  const hasDiscoveryReport = campaign.discoveryReportData && Object.keys(campaign.discoveryReportData).length > 0;
  const hasLegacyReport = campaign.reportData && Object.keys(campaign.reportData).length > 0;
  const hasAnyReport = hasInStreamReport || hasDiscoveryReport || hasLegacyReport;
  const hasBothReports = hasInStreamReport && hasDiscoveryReport;
  
  if (!hasAnyReport) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            {campaign.status === "COMPLETED"
              ? t('youtubeAds.history.reportsAvailable')
              : t('youtubeAds.history.reportsEmpty')}
          </p>
        </CardContent>
      </Card>
    );
  }
  
  // Legacy report support
  if (hasLegacyReport && !hasInStreamReport && !hasDiscoveryReport) {
    return (
      <SingleReportView 
        reportData={campaign.reportData!} 
        uploadedAt={campaign.reportUploadedAt} 
        campaign={campaign}
        t={t} 
      />
    );
  }
  
  // Both report types - show tabs
  if (hasBothReports) {
    return (
      <div className="space-y-4">
        <CostBreakdownBar campaign={campaign} t={t} />
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'inStream' | 'discovery')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="inStream" className="gap-2">
              In-Stream
              {hasInStreamReport && <Eye className="w-3 h-3 text-green-500" />}
            </TabsTrigger>
            <TabsTrigger value="discovery" className="gap-2">
              Discovery
              {hasDiscoveryReport && <Eye className="w-3 h-3 text-green-500" />}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="inStream" className="mt-4">
            <SingleReportView 
              reportData={campaign.inStreamReportData!} 
              uploadedAt={campaign.inStreamReportUploadedAt} 
              campaign={campaign}
              showCostBreakdown={false}
              t={t} 
            />
          </TabsContent>
          <TabsContent value="discovery" className="mt-4">
            <SingleReportView 
              reportData={campaign.discoveryReportData!} 
              uploadedAt={campaign.discoveryReportUploadedAt} 
              campaign={campaign}
              showCostBreakdown={false}
              t={t} 
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  }
  
  // Single report type
  if (hasInStreamReport) {
    return (
      <SingleReportView 
        reportData={campaign.inStreamReportData!} 
        uploadedAt={campaign.inStreamReportUploadedAt} 
        campaign={campaign}
        t={t} 
      />
    );
  }
  
  if (hasDiscoveryReport) {
    return (
      <SingleReportView 
        reportData={campaign.discoveryReportData!} 
        uploadedAt={campaign.discoveryReportUploadedAt} 
        campaign={campaign}
        t={t} 
      />
    );
  }
  
  return null;
}

export default function YouTubeAdsHistory() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [selectedCampaign, setSelectedCampaign] = useState<YouTubeAdCampaign | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [paymentLoadingMap, setPaymentLoadingMap] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery<YouTubeAdCampaign[]>({
    queryKey: ["/api/ads/youtube"],
  });

  const [isWayforpayReady, setIsWayforpayReady] = useState(false);

  useEffect(() => {
    const existingScript = document.getElementById("wayforpay-widget");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "wayforpay-widget";
      script.src = "https://secure.wayforpay.com/server/pay-widget.js";
      script.async = true;
      script.onload = () => setIsWayforpayReady(true);
      document.head.appendChild(script);
    } else {
      if (window.Wayforpay) {
        setIsWayforpayReady(true);
      }
    }
  }, []);

  const handlePayment = async (campaign: YouTubeAdCampaign, e: React.MouseEvent) => {
    e.stopPropagation();
    const campaignId = campaign.id;
    setPaymentLoadingMap(prev => ({ ...prev, [campaignId]: true }));

    try {
      const response = await fetch(`/api/ads/youtube/${campaignId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate payment");
      }

      const paymentData: WayforpayPaymentData = await response.json();

      if (!window.Wayforpay) {
        throw new Error("Payment widget not loaded");
      }

      const wayforpay = new window.Wayforpay();
      wayforpay.run(
        {
          merchantAccount: paymentData.merchantAccount,
          merchantDomainName: paymentData.merchantDomainName,
          authorizationType: "SimpleSignature",
          merchantSignature: paymentData.merchantSignature,
          orderReference: paymentData.orderReference,
          orderDate: paymentData.orderDate,
          amount: paymentData.amount,
          currency: paymentData.currency,
          productName: paymentData.productName,
          productPrice: paymentData.productPrice,
          productCount: paymentData.productCount,
          clientFirstName: paymentData.clientFirstName,
          clientLastName: paymentData.clientLastName,
          clientEmail: paymentData.clientEmail,
          clientPhone: paymentData.clientPhone,
          language: paymentData.language,
          serviceUrl: paymentData.serviceUrl,
        },
        (response: any) => {
          console.log("Payment approved:", response);
          toast({
            title: t('youtubeAds.history.paymentSuccess'),
            description: t('youtubeAds.history.paymentSuccessDesc'),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/ads/youtube"] });
          setPaymentLoadingMap(prev => ({ ...prev, [campaignId]: false }));
        },
        (response: any) => {
          console.log("Payment declined:", response);
          toast({
            title: t('youtubeAds.history.paymentFailed'),
            description: t('youtubeAds.history.paymentFailedDesc'),
            variant: "destructive",
          });
          setPaymentLoadingMap(prev => ({ ...prev, [campaignId]: false }));
        },
        (response: any) => {
          console.log("Payment pending:", response);
          toast({
            title: t('youtubeAds.history.paymentPending'),
            description: t('youtubeAds.history.paymentPendingDesc'),
          });
          setPaymentLoadingMap(prev => ({ ...prev, [campaignId]: false }));
        }
      );
      
      setTimeout(() => {
        setPaymentLoadingMap(prev => ({ ...prev, [campaignId]: false }));
      }, 3000);
    } catch (error: any) {
      console.error("Payment error:", error);
      toast({
        title: t('youtubeAds.history.paymentError'),
        description: error.message,
        variant: "destructive",
      });
      setPaymentLoadingMap(prev => ({ ...prev, [campaignId]: false }));
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: t('youtubeAds.history.paymentPending'),
      PAID: t('youtubeAds.history.paymentPaid'),
      FAILED: t('youtubeAds.history.paymentFailed'),
    };
    return labels[status] || status;
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "PAID":
        return "bg-green-500/20 text-green-500 border-green-500/30";
      case "FAILED":
        return "bg-red-500/20 text-red-500 border-red-500/30";
      default:
        return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    }
  };

  const getStatusLabel = (status: string) => {
    const statusLabels: Record<string, string> = {
      PENDING_PAYMENT: t('youtubeAds.history.statusPendingPayment'),
      PENDING: t('youtubeAds.history.statusPending'),
      ACTIVE: t('youtubeAds.history.statusActive'),
      COMPLETED: t('youtubeAds.history.statusCompleted'),
      REJECTED: t('youtubeAds.history.statusRejected'),
    };
    return statusLabels[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING_PAYMENT":
        return "bg-orange-500/20 text-orange-500 border-orange-500/30";
      case "PENDING":
        return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
      case "ACTIVE":
        return "bg-green-500/20 text-green-500 border-green-500/30";
      case "COMPLETED":
        return "bg-purple-500/20 text-purple-500 border-purple-500/30";
      case "REJECTED":
        return "bg-red-500/20 text-red-500 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-500 border-gray-500/30";
    }
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd.MM.yyyy");
  };

  const getCountryName = (code: string) => {
    const country = countryList.find(c => c.code === code);
    return country?.name || code;
  };

  const openDetail = (campaign: YouTubeAdCampaign) => {
    setSelectedCampaign(campaign);
    setIsDetailOpen(true);
  };

  const closeDetail = () => {
    setIsDetailOpen(false);
    setSelectedCampaign(null);
  };

  const getVideoThumbnail = (videoId: string) => {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  };

  return (
    <div className="py-6">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/ads")}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('youtubeAds.history.backToAds')}
          </Button>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {t('youtubeAds.history.title')}
              </h1>
              <p className="text-muted-foreground">
                {t('youtubeAds.history.description')}
              </p>
            </div>
            <Button onClick={() => navigate("/ads/youtube")} className="gap-2">
              <Plus className="w-4 h-4" />
              {t('youtubeAds.history.createCampaign')}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !campaigns || campaigns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Youtube className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">{t('youtubeAds.history.empty')}</h3>
              <p className="text-muted-foreground text-center mb-4">
                {t('youtubeAds.history.emptyDesc')}
              </p>
              <Button onClick={() => navigate("/ads/youtube")} className="gap-2">
                <Plus className="w-4 h-4" />
                {t('youtubeAds.history.createCampaign')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => (
              <Card
                key={campaign.id}
                className="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all duration-200"
                onClick={() => openDetail(campaign)}
              >
                <CardContent className="p-0">
                  <div className="relative">
                    <img
                      src={getVideoThumbnail(campaign.videoId)}
                      alt={t('youtubeAds.history.videoThumbnail')}
                      className="w-full h-32 object-cover rounded-t-lg"
                    />
                    <div className="absolute top-2 right-2 flex flex-col gap-1">
                      <Badge className={getStatusColor(campaign.status)}>
                        {getStatusLabel(campaign.status)}
                      </Badge>
                      {campaign.paymentStatus === "PAID" && (
                        <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          {t('youtubeAds.history.paid')}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{t('youtubeAds.history.submitted')}: {formatDate(campaign.createdAt)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>${campaign.budget}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{campaign.duration}d</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{campaign.countries.length}</span>
                      </div>
                    </div>
                    {campaign.status === "PENDING_PAYMENT" && (
                      <Button
                        onClick={(e) => handlePayment(campaign, e)}
                        disabled={paymentLoadingMap[campaign.id] || !isWayforpayReady}
                        className="w-full gap-2"
                        size="sm"
                      >
                        {paymentLoadingMap[campaign.id] ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4" />
                        )}
                        {t('youtubeAds.history.payNow')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={isDetailOpen} onOpenChange={(open) => !open && closeDetail()}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Youtube className="w-5 h-5 text-red-500" />
                {t('youtubeAds.history.details')}
              </DialogTitle>
            </DialogHeader>

            {selectedCampaign && (
              <Tabs defaultValue="video" className="mt-4">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="video">{t('youtubeAds.history.video')}</TabsTrigger>
                  <TabsTrigger value="budget">{t('youtubeAds.history.budgetBreakdown')}</TabsTrigger>
                  <TabsTrigger value="targeting">{t('youtubeAds.history.targeting')}</TabsTrigger>
                  <TabsTrigger value="reports">{t('youtubeAds.history.reports')}</TabsTrigger>
                </TabsList>

                <TabsContent value="video" className="space-y-4 mt-4">
                  <div className="relative rounded-lg overflow-hidden">
                    <img
                      src={getVideoThumbnail(selectedCampaign.videoId)}
                      alt={t('youtubeAds.history.videoThumbnail')}
                      className="w-full h-48 object-cover"
                    />
                    <Badge className={`absolute top-3 right-3 ${getStatusColor(selectedCampaign.status)}`}>
                      {getStatusLabel(selectedCampaign.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {t('youtubeAds.history.submitted')}: {formatDate(selectedCampaign.createdAt)}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(selectedCampaign.videoUrl, "_blank")}
                      className="gap-2"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t('youtubeAds.history.openVideo')}
                    </Button>
                  </div>
                  
                  {selectedCampaign.adminNotes && (
                    <Card className="bg-muted/50">
                      <CardContent className="p-4">
                        <div className="text-sm font-medium mb-2">{t('youtubeAds.history.adminNotes')}</div>
                        <p className="text-sm text-muted-foreground">{selectedCampaign.adminNotes}</p>
                      </CardContent>
                    </Card>
                  )}
                  
                  {selectedCampaign.status === "PENDING_PAYMENT" && (
                    <Button
                      onClick={(e) => handlePayment(selectedCampaign, e)}
                      disabled={paymentLoadingMap[selectedCampaign.id] || !isWayforpayReady}
                      className="w-full gap-2"
                    >
                      {paymentLoadingMap[selectedCampaign.id] ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      {t('youtubeAds.history.payNow')}
                    </Button>
                  )}
                </TabsContent>

                <TabsContent value="budget" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="p-4 space-y-4">
                      {(() => {
                        const isCombined = selectedCampaign.inStreamPercent > 0 && selectedCampaign.discoveryPercent > 0;
                        const launchFee = selectedCampaign.launchFee ? selectedCampaign.launchFee / 100 : (isCombined ? BASE_LAUNCH_FEE + COMBINED_AD_FEE : BASE_LAUNCH_FEE);
                        const adBudget = selectedCampaign.adBudget ? selectedCampaign.adBudget / 100 : Math.max(0, selectedCampaign.budget - launchFee);
                        return (
                          <>
                            <div className="flex justify-between items-center">
                              <span className="text-sm">{t('youtubeAds.history.totalBudget')}</span>
                              <span className="font-semibold">${selectedCampaign.budget}</span>
                            </div>
                            <div className="flex justify-between items-center text-muted-foreground">
                              <span className="text-sm">{t('youtubeAds.history.launchFee')}</span>
                              <span className="text-sm">${launchFee}</span>
                            </div>
                            <div className="flex justify-between items-center text-muted-foreground">
                              <span className="text-sm">{t('youtubeAds.history.adBudget')}</span>
                              <span className="text-sm">${adBudget.toFixed(2)}</span>
                            </div>
                            <hr className="border-border" />
                            <div className="space-y-3">
                              <div className="flex justify-between items-center">
                                <span className="text-sm">{t('youtubeAds.history.inStream')}</span>
                                <span className="text-sm">{selectedCampaign.inStreamPercent}% (${(adBudget * selectedCampaign.inStreamPercent / 100).toFixed(2)})</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full bg-blue-500"
                                  style={{ width: `${selectedCampaign.inStreamPercent}%` }}
                                />
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm">{t('youtubeAds.history.discovery')}</span>
                                <span className="text-sm">{selectedCampaign.discoveryPercent}% (${(adBudget * selectedCampaign.discoveryPercent / 100).toFixed(2)})</span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full bg-green-500"
                                  style={{ width: `${selectedCampaign.discoveryPercent}%` }}
                                />
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('youtubeAds.history.duration')}</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedCampaign.duration} {t('youtubeAds.summaryStep.days')}</p>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="targeting" className="space-y-4 mt-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Globe className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{t('youtubeAds.history.targetCountries')}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedCampaign.countries.map((code) => (
                          <Badge key={code} variant="secondary">
                            {getCountryName(code)}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {selectedCampaign.cities && Object.keys(selectedCampaign.cities).length > 0 && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <MapPin className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{t('youtubeAds.history.targetCities')}</span>
                        </div>
                        <div className="space-y-2">
                          {Object.entries(selectedCampaign.cities).map(([countryCode, cities]) => (
                            <div key={countryCode}>
                              <div className="text-xs text-muted-foreground mb-1">{getCountryName(countryCode)}</div>
                              <div className="flex flex-wrap gap-1">
                                {cities.map((city) => (
                                  <Badge key={city} variant="outline" className="text-xs">
                                    {city}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {selectedCampaign.audience && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{t('youtubeAds.history.targetAudience')}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedCampaign.audience}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="reports" className="mt-4">
                  <ReportDisplay campaign={selectedCampaign} t={t} />
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
