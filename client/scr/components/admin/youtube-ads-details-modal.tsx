import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Youtube, Globe, Clock, DollarSign, Users, Check, X, MessageSquare, ExternalLink, MapPin, Upload, FileSpreadsheet, CheckCircle, Copy } from "lucide-react";
import { countries as countryList } from "@shared/countries";
import { format } from "date-fns";

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
  // Calculated amounts in cents
  launchFee?: number | null;
  adBudget?: number | null;
  wayforpayFee?: number | null;
  taxFee?: number | null;
  youtubeTax?: number | null;
  inStreamBudget?: number | null;
  discoveryBudget?: number | null;
  status: string;
  adminNotes?: string | null;
  // Legacy report field (backwards compatibility)
  reportData?: Record<string, any> | null;
  reportUploadedAt?: string | null;
  // New separate report fields
  inStreamReportData?: Record<string, any> | null;
  inStreamReportUploadedAt?: string | null;
  discoveryReportData?: Record<string, any> | null;
  discoveryReportUploadedAt?: string | null;
  paymentStatus: string;
  paymentReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

type ReportType = 'inStream' | 'discovery';

interface ReportState {
  data: Record<string, any> | null;
  uploadedAt: string | null;
}

interface YouTubeAdsDetailsModalProps {
  campaign: YouTubeAdCampaign | null;
  isOpen: boolean;
  onClose: () => void;
}

// Fallback constants for old campaigns without stored calculations (matching user form)
const FALLBACK_BASE_LAUNCH_FEE = 50;
const FALLBACK_COMBINED_AD_FEE = 15;
const FALLBACK_WAYFORPAY_RATE = 0.02;
const FALLBACK_TAX_RATE = 0.07;
const FALLBACK_YOUTUBE_TAX_RATE = 0.20;

// Report data display component (view-only, no upload)
interface ReportDataDisplayProps {
  reportType: ReportType;
  reportState: ReportState;
  formatDate: (date: string) => string;
}

function ReportDataDisplay({ reportType, reportState, formatDate }: ReportDataDisplayProps) {
  const typeLabel = reportType === 'inStream' ? 'In-Stream' : 'Discovery';
  const isLegacyData = reportState.data?._isLegacy === true;
  
  if (!reportState.data) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p className="text-sm">Дані {typeLabel} ще не завантажено</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="w-4 h-4" />
        <span className="text-sm font-medium">
          Звіт {typeLabel} завантажено
          {isLegacyData && <span className="text-xs text-muted-foreground ml-2">(загальний звіт)</span>}
        </span>
      </div>
      {reportState.uploadedAt && (
        <p className="text-xs text-muted-foreground">
          Завантажено: {formatDate(reportState.uploadedAt)}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <div className="bg-muted p-3 rounded">
          <p className="text-xs text-muted-foreground">Покази</p>
          <p className="text-lg font-bold">{(reportState.data.impressions || 0).toLocaleString()}</p>
        </div>
        <div className="bg-muted p-3 rounded">
          <p className="text-xs text-muted-foreground">Перегляди</p>
          <p className="text-lg font-bold">{(reportState.data.views || 0).toLocaleString()}</p>
        </div>
        <div className="bg-muted p-3 rounded">
          <p className="text-xs text-muted-foreground">Витрати</p>
          <p className="text-lg font-bold">{reportState.data.cost || 0} {reportState.data.currency || 'UAH'}</p>
        </div>
        <div className="bg-muted p-3 rounded">
          <p className="text-xs text-muted-foreground">
            {reportState.data.cpv !== undefined ? 'CPV' : 'CPM'}
          </p>
          <p className="text-lg font-bold">{reportState.data.cpv || reportState.data.cpm || 0}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {reportState.data.currency || 'UAH'} / {reportState.data.cpv !== undefined ? 'перегляд' : '1000 показів'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function YouTubeAdsDetailsModal({ campaign, isOpen, onClose }: YouTubeAdsDetailsModalProps) {
  const { toast } = useToast();
  const [adminNotes, setAdminNotes] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<ReportType>('inStream');
  const [reportStates, setReportStates] = useState<Record<ReportType, ReportState>>({
    inStream: { data: null, uploadedAt: null },
    discovery: { data: null, uploadedAt: null },
  });
  const combinedFileInputRef = useRef<HTMLInputElement>(null);

  // Determine which campaign types are enabled
  const hasInStream = campaign ? campaign.inStreamPercent > 0 : false;
  const hasDiscovery = campaign ? campaign.discoveryPercent > 0 : false;
  const hasBothTypes = hasInStream && hasDiscovery;

  useEffect(() => {
    if (isOpen && campaign) {
      setAdminNotes(campaign.adminNotes || "");
      
      // Initialize report states from campaign data
      const inStreamData = campaign.inStreamReportData || null;
      const inStreamUploadedAt = campaign.inStreamReportUploadedAt || null;
      const discoveryData = campaign.discoveryReportData || null;
      const discoveryUploadedAt = campaign.discoveryReportUploadedAt || null;
      
      // Handle legacy reportData for backwards compatibility
      // If new fields are empty but legacy has data, migrate to appropriate type
      let finalInStreamData = inStreamData;
      let finalInStreamUploadedAt = inStreamUploadedAt;
      let finalDiscoveryData = discoveryData;
      let finalDiscoveryUploadedAt = discoveryUploadedAt;
      
      if (!inStreamData && !discoveryData && campaign.reportData) {
        // Legacy data exists, assign to enabled type(s)
        if (campaign.inStreamPercent > 0 && campaign.discoveryPercent === 0) {
          // Only In-Stream enabled - assign legacy to In-Stream
          finalInStreamData = campaign.reportData;
          finalInStreamUploadedAt = campaign.reportUploadedAt || null;
        } else if (campaign.discoveryPercent > 0 && campaign.inStreamPercent === 0) {
          // Only Discovery enabled - assign legacy to Discovery
          finalDiscoveryData = campaign.reportData;
          finalDiscoveryUploadedAt = campaign.reportUploadedAt || null;
        } else if (campaign.inStreamPercent > 0 && campaign.discoveryPercent > 0) {
          // Both types enabled with legacy data - clone legacy to both tabs
          // This ensures the legacy report is visible in both tabs until admin uploads separate reports
          finalInStreamData = { ...campaign.reportData, _isLegacy: true };
          finalInStreamUploadedAt = campaign.reportUploadedAt || null;
          finalDiscoveryData = { ...campaign.reportData, _isLegacy: true };
          finalDiscoveryUploadedAt = campaign.reportUploadedAt || null;
        }
      }
      
      setReportStates({
        inStream: { data: finalInStreamData, uploadedAt: finalInStreamUploadedAt },
        discovery: { data: finalDiscoveryData, uploadedAt: finalDiscoveryUploadedAt },
      });
      
      // Set initial active tab based on what's enabled
      if (campaign.inStreamPercent > 0) {
        setActiveReportTab('inStream');
      } else if (campaign.discoveryPercent > 0) {
        setActiveReportTab('discovery');
      }
    }
  }, [isOpen, campaign]);

  useEffect(() => {
    if (!isOpen) {
      setAdminNotes("");
      setReportStates({
        inStream: { data: null, uploadedAt: null },
        discovery: { data: null, uploadedAt: null },
      });
    }
  }, [isOpen]);

  const updateMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes?: string }) => {
      if (!campaign) throw new Error("No campaign");
      const payload: { status: string; adminNotes?: string | null } = { status };
      if (notes !== undefined) {
        payload.adminNotes = notes || null;
      }
      return await apiRequest("PATCH", `/api/admin/ads/youtube/${campaign.id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/youtube"] });
      toast({
        title: "Оновлено",
        description: "Статус кампанії успішно оновлено",
      });
      setAdminNotes("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Помилка",
        description: error.message || "Не вдалося оновити статус",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUpdating(false);
    },
  });

  if (!campaign) return null;

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "dd.MM.yyyy HH:mm");
  };

  const getStatusLabel = (status: string) => {
    const statusLabels: Record<string, string> = {
      PENDING_PAYMENT: "Очікує оплати",
      PENDING: "Оплачено, очікує активації",
      ACTIVE: "Активна",
      COMPLETED: "Завершена",
      REJECTED: "Відхилено",
    };
    return statusLabels[status] || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING_PAYMENT":
        return "bg-orange-500/10 text-orange-600 border-orange-500/20";
      case "PENDING":
        return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "ACTIVE":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "COMPLETED":
        return "bg-gray-500/10 text-gray-600 border-gray-500/20";
      case "REJECTED":
        return "bg-red-500/10 text-red-600 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-600";
    }
  };

  // Use stored values if available (in cents), otherwise calculate fallback matching user form
  const hasStoredAmounts = campaign.adBudget != null;
  
  // Calculate fallback values using EXACT same formula as user form (youtube-ads.tsx lines 83-89)
  const bothTypesEnabled = campaign.inStreamPercent > 0 && campaign.discoveryPercent > 0;
  const fallbackLaunchFee = bothTypesEnabled 
    ? FALLBACK_BASE_LAUNCH_FEE + FALLBACK_COMBINED_AD_FEE 
    : FALLBACK_BASE_LAUNCH_FEE;
  const fallbackWayforpayFee = campaign.budget * FALLBACK_WAYFORPAY_RATE;
  const fallbackAfterWayforpay = campaign.budget - fallbackWayforpayFee;
  const fallbackTaxAmount = fallbackAfterWayforpay * FALLBACK_TAX_RATE; // Tax from post-wayforpay, not budget!
  const fallbackAfterTax = fallbackAfterWayforpay - fallbackTaxAmount;
  const fallbackBudgetBeforeYoutubeTax = Math.max(0, fallbackAfterTax - fallbackLaunchFee);
  const fallbackYoutubeTax = fallbackBudgetBeforeYoutubeTax * FALLBACK_YOUTUBE_TAX_RATE / (1 + FALLBACK_YOUTUBE_TAX_RATE);
  const fallbackAdBudget = fallbackBudgetBeforeYoutubeTax - fallbackYoutubeTax;
  
  const launchFee = hasStoredAmounts 
    ? (campaign.launchFee || 0) / 100 
    : fallbackLaunchFee;
  const taxAmount = hasStoredAmounts 
    ? (campaign.taxFee || 0) / 100 
    : fallbackTaxAmount;
  const wayforpayFee = hasStoredAmounts 
    ? (campaign.wayforpayFee || 0) / 100 
    : fallbackWayforpayFee;
  const youtubeTax = hasStoredAmounts 
    ? (campaign.youtubeTax || 0) / 100 
    : fallbackYoutubeTax;
  const adBudget = hasStoredAmounts 
    ? (campaign.adBudget || 0) / 100 
    : fallbackAdBudget;
  const inStreamBudget = hasStoredAmounts 
    ? (campaign.inStreamBudget || 0) / 100 
    : adBudget * campaign.inStreamPercent / 100;
  const discoveryBudget = hasStoredAmounts 
    ? (campaign.discoveryBudget || 0) / 100 
    : adBudget * campaign.discoveryPercent / 100;

  const getCountryName = (code: string) => {
    const country = countryList.find(c => c.code === code);
    return country ? country.name : code;
  };

  const handleCopyInfo = async () => {
    const countryNames = campaign.countries.map(getCountryName).join(", ");
    
    let text = `1. Відео: ${campaign.videoUrl}\n`;
    text += `2. Рекламний бюджет: $${adBudget.toFixed(2)}\n`;
    text += `3. Тип реклами:\n`;
    text += `   - In-Stream: ${campaign.inStreamPercent}%\n`;
    text += `   - Discovery: ${campaign.discoveryPercent}%\n`;
    text += `4. Тривалість: ${campaign.duration} днів\n`;
    text += `5. ГЕО: ${countryNames}\n`;
    
    if (campaign.audience && campaign.audience.trim()) {
      text += `6. Аудиторія: ${campaign.audience}`;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Скопійовано",
        description: "Інформацію про кампанію скопійовано в буфер обміну",
      });
    } catch (err) {
      toast({
        title: "Помилка",
        description: "Не вдалося скопіювати текст",
        variant: "destructive",
      });
    }
  };


  const handleReject = () => {
    if (!adminNotes.trim()) {
      toast({
        title: "Потрібна причина",
        description: "Будь ласка, вкажіть причину відхилення",
        variant: "destructive",
      });
      return;
    }
    setIsUpdating(true);
    updateMutation.mutate({ status: "REJECTED", notes: adminNotes });
  };

  const handleActivate = () => {
    setIsUpdating(true);
    updateMutation.mutate({ status: "ACTIVE" });
  };

  const handleComplete = () => {
    setIsUpdating(true);
    updateMutation.mutate({ status: "COMPLETED" });
  };

  const handleCombinedFileUpload = async (file: File) => {
    if (!campaign) return;
    
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Невірний формат",
        description: "Будь ласка, завантажте CSV файл",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('report', file);

      const response = await fetch(`/api/admin/ads/youtube/${campaign.id}/report`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload report');
      }

      const result = await response.json();
      
      // The server returns the full updated campaign object
      // Update report states for both types from the combined response
      setReportStates({
        inStream: {
          data: result.inStreamReportData || null,
          uploadedAt: result.inStreamReportUploadedAt || null,
        },
        discovery: {
          data: result.discoveryReportData || null,
          uploadedAt: result.discoveryReportUploadedAt || null,
        }
      });

      queryClient.invalidateQueries({ queryKey: ["/api/ads/youtube"] });
      toast({
        title: "Успіх",
        description: "Звіт успішно завантажено",
      });
    } catch (error: any) {
      toast({
        title: "Помилка",
        description: error.message || "Не вдалося завантажити звіт",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleCombinedFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center">
              <Youtube className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <DialogTitle className="text-xl">YouTube Ads Campaign</DialogTitle>
              <p className="text-sm text-muted-foreground">ID: {campaign.id}</p>
            </div>
            <Badge className={getStatusColor(campaign.status)}>
              {getStatusLabel(campaign.status)}
            </Badge>
            {campaign.paymentStatus === "PAID" ? (
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                <CheckCircle className="w-3 h-3 mr-1" />
                Оплачено
              </Badge>
            ) : campaign.status === "PENDING_PAYMENT" ? (
              <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30">
                <DollarSign className="w-3 h-3 mr-1" />
                Очікує оплати
              </Badge>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyInfo}
              className="ml-auto"
            >
              <Copy className="w-4 h-4 mr-2" />
              Скопіювати
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Video Preview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Youtube className="w-4 h-4" />
                Відео
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <img 
                  src={`https://img.youtube.com/vi/${campaign.videoId}/mqdefault.jpg`}
                  alt="Video thumbnail"
                  className="w-40 h-24 object-cover rounded"
                />
                <div className="flex-1">
                  <a 
                    href={campaign.videoUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {campaign.videoUrl}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <p className="text-xs text-muted-foreground mt-2">
                    Video ID: {campaign.videoId}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Budget Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Бюджет
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Загальний бюджет</p>
                    <p className="text-lg font-bold">${campaign.budget}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Вартість запуску</p>
                    <p className="text-lg font-medium text-muted-foreground">${launchFee.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Бюджет на рекламу</p>
                    <p className="text-lg font-bold text-primary">${adBudget.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Тривалість</p>
                    <p className="text-lg font-medium">{campaign.duration} днів</p>
                  </div>
                </div>

                {/* Budget Split Bar */}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Розподіл бюджету</p>
                  <div className="h-4 rounded-full overflow-hidden flex bg-muted">
                    <div 
                      className="bg-gray-400 h-full"
                      style={{ width: `${(launchFee / campaign.budget) * 100}%` }}
                      title={`Launch Fee: $${launchFee.toFixed(2)}`}
                    />
                    <div 
                      className="bg-blue-500 h-full"
                      style={{ width: `${(inStreamBudget / campaign.budget) * 100}%` }}
                      title={`In-Stream: $${inStreamBudget.toFixed(2)}`}
                    />
                    <div 
                      className="bg-purple-500 h-full"
                      style={{ width: `${(discoveryBudget / campaign.budget) * 100}%` }}
                      title={`Discovery: $${discoveryBudget.toFixed(2)}`}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-gray-400" />
                      <span>Launch fee ${launchFee.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-blue-500" />
                      <span>In-Stream ${inStreamBudget.toFixed(2)} ({campaign.inStreamPercent}%)</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-purple-500" />
                      <span>Discovery ${discoveryBudget.toFixed(2)} ({campaign.discoveryPercent}%)</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Targeting */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="w-4 h-4" />
                Таргетинг
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Країни ({campaign.countries.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {campaign.countries.map((country: string) => (
                      <Badge key={country} variant="outline" className="text-xs">
                        {getCountryName(country)}
                      </Badge>
                    ))}
                  </div>
                </div>

                {campaign.cities && Object.keys(campaign.cities).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Міста
                    </p>
                    <div className="space-y-2">
                      {Object.entries(campaign.cities).map(([countryCode, cities]) => (
                        <div key={countryCode}>
                          <p className="text-xs font-medium">{countryCode}:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(cities as string[]).map((city: string) => (
                              <Badge key={city} variant="secondary" className="text-xs">
                                {city}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {campaign.audience && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Цільова аудиторія
                    </p>
                    <p className="text-sm bg-muted p-3 rounded">{campaign.audience}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Хронологія
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Створено</p>
                  <p>{formatDate(campaign.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Оновлено</p>
                  <p>{formatDate(campaign.updatedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Admin Notes */}
          {campaign.adminNotes && (
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2 text-yellow-600">
                  <MessageSquare className="w-4 h-4" />
                  Примітки адміна
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{campaign.adminNotes}</p>
              </CardContent>
            </Card>
          )}

          {/* Admin Actions - for PENDING campaigns (already paid) */}
          {campaign.status === "PENDING" && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Дії адміністратора</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="adminNotes" className="text-xs text-muted-foreground">
                    Примітки (обов'язково для відхилення)
                  </Label>
                  <Textarea
                    id="adminNotes"
                    placeholder="Причина відхилення або коментар..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="mt-1"
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleActivate}
                    disabled={isUpdating}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Активувати кампанію
                  </Button>
                  <Button
                    onClick={handleReject}
                    disabled={isUpdating}
                    variant="destructive"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Відхилити
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions for active campaigns */}
          {campaign.status === "ACTIVE" && (
            <Card className="border-gray-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Управління кампанією</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleComplete}
                  disabled={isUpdating}
                  variant="outline"
                >
                  Позначити як завершену
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Report Upload Section - show for ACTIVE or COMPLETED campaigns */}
          {(campaign.status === "ACTIVE" || campaign.status === "COMPLETED") && (
            <Card className="border-green-500/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Звіт кампанії
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Single file upload area for combined report */}
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                    isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">
                    {(reportStates.inStream.data || reportStates.discovery.data) 
                      ? 'Замінити звіт' 
                      : 'Завантажте звіт кампанії'}
                  </p>
                  <p className="text-xs text-muted-foreground mb-3">
                    Перетягніть CSV файл або натисніть для вибору
                    {hasBothTypes && (
                      <span className="block mt-1">Один файл з даними In-Stream та Discovery</span>
                    )}
                  </p>
                  <input
                    ref={combinedFileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCombinedFileUpload(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={() => combinedFileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? 'Завантаження...' : 'Обрати CSV файл'}
                  </Button>
                </div>

                {/* Display report data - tabs for both types, or single view */}
                {(reportStates.inStream.data || reportStates.discovery.data) && (
                  <>
                    {hasBothTypes ? (
                      <Tabs value={activeReportTab} onValueChange={(v) => setActiveReportTab(v as ReportType)} className="w-full">
                        <TabsList className="grid w-full grid-cols-2 mb-4">
                          <TabsTrigger value="inStream" className="flex items-center gap-2">
                            In-Stream
                            {reportStates.inStream.data && (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                          </TabsTrigger>
                          <TabsTrigger value="discovery" className="flex items-center gap-2">
                            Discovery
                            {reportStates.discovery.data && (
                              <CheckCircle className="w-3 h-3 text-green-500" />
                            )}
                          </TabsTrigger>
                        </TabsList>
                        <TabsContent value="inStream">
                          <ReportDataDisplay
                            reportType="inStream"
                            reportState={reportStates.inStream}
                            formatDate={formatDate}
                          />
                        </TabsContent>
                        <TabsContent value="discovery">
                          <ReportDataDisplay
                            reportType="discovery"
                            reportState={reportStates.discovery}
                            formatDate={formatDate}
                          />
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <ReportDataDisplay
                        reportType={hasInStream ? 'inStream' : 'discovery'}
                        reportState={hasInStream ? reportStates.inStream : reportStates.discovery}
                        formatDate={formatDate}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Закрити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
