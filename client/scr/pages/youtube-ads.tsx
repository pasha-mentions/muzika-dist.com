import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, ArrowRight, CheckCircle, Youtube, Monitor, Search, Globe, Users, Calendar, DollarSign, X, Loader2, Play, Eye, Check, ChevronDown, Calculator, Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { countries } from "@shared/countries";
import { majorCities, getCitiesForCountry } from "@shared/cities";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";


const STEPS = [
  { id: 1, nameKey: "youtubeAds.steps.video" },
  { id: 2, nameKey: "youtubeAds.steps.budget" },
  { id: 3, nameKey: "youtubeAds.steps.targeting" },
  { id: 4, nameKey: "youtubeAds.steps.summary" },
];

interface YouTubeVideoInfo {
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string;
}

export default function YouTubeAdsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user, isPlatformAdmin } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  
  const [videoUrl, setVideoUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<YouTubeVideoInfo | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState("");

  const [budget, setBudget] = useState<number>(100);
  const [inStreamEnabled, setInStreamEnabled] = useState(true);
  const [discoveryEnabled, setDiscoveryEnabled] = useState(false);
  const [inStreamPercent, setInStreamPercent] = useState(80);
  
  const [duration, setDuration] = useState(7);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<Record<string, string[]>>({});
  const [countrySearch, setCountrySearch] = useState("");
  const [countryPopoverOpen, setCountryPopoverOpen] = useState(false);
  const [cityPopoverOpen, setCityPopoverOpen] = useState<string | null>(null);
  const [citySearch, setCitySearch] = useState("");
  const [audience, setAudience] = useState("");
  const [budgetDetailsOpen, setBudgetDetailsOpen] = useState(false);

  const MAX_AD_TEXT_LENGTH = 90;
  const BASE_LAUNCH_FEE = 50;
  const COMBINED_AD_FEE = 15;
  const WAYFORPAY_RATE = 0.02;
  const TAX_RATE = 0.07;
  const YOUTUBE_TAX_RATE = 0.20;
  
  const bothTypesEnabled = inStreamEnabled && discoveryEnabled;
  const LAUNCH_FEE = bothTypesEnabled ? BASE_LAUNCH_FEE + COMBINED_AD_FEE : BASE_LAUNCH_FEE;
  
  const wayforpayAmount = budget * WAYFORPAY_RATE;
  const afterWayforpay = budget - wayforpayAmount;
  const taxAmount = afterWayforpay * TAX_RATE;
  const afterTax = afterWayforpay - taxAmount;
  const budgetBeforeYoutubeTax = Math.max(0, afterTax - LAUNCH_FEE);
  const youtubeTaxAmount = budgetBeforeYoutubeTax * YOUTUBE_TAX_RATE / (1 + YOUTUBE_TAX_RATE);
  const adBudget = budgetBeforeYoutubeTax - youtubeTaxAmount;
  
  const effectiveInStreamPercent = bothTypesEnabled ? inStreamPercent : (inStreamEnabled ? 100 : 0);
  const effectiveDiscoveryPercent = bothTypesEnabled ? (100 - inStreamPercent) : (discoveryEnabled ? 100 : 0);
  const discoveryPercent = effectiveDiscoveryPercent;
  const inStreamBudget = (adBudget * effectiveInStreamPercent / 100).toFixed(2);
  const discoveryBudget = (adBudget * effectiveDiscoveryPercent / 100).toFixed(2);
  
  const wayforpayPercent = budget > 0 ? (wayforpayAmount / budget) * 100 : 0;
  const taxPercent = budget > 0 ? (taxAmount / budget) * 100 : 0;
  const launchFeePercent = budget > 0 ? (LAUNCH_FEE / budget) * 100 : 0;
  const youtubeTaxPercent = budget > 0 ? (youtubeTaxAmount / budget) * 100 : 0;
  const adBudgetPercent = budget > 0 ? (adBudget / budget) * 100 : 0;

  const extractVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const fetchVideoInfo = async (url: string) => {
    const videoId = extractVideoId(url);
    if (!videoId) {
      setVideoError(t('youtubeAds.errors.invalidUrl'));
      setVideoInfo(null);
      return;
    }

    setIsLoadingVideo(true);
    setVideoError("");

    try {
      const response = await apiRequest('GET', `/api/youtube/video-info?videoId=${videoId}`);
      const data = await response.json();
      
      if (data.error) {
        setVideoError(data.error);
        setVideoInfo(null);
      } else {
        setVideoInfo(data);
      }
    } catch (error) {
      setVideoInfo({
        title: t('youtubeAds.videoPreview.title'),
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        channelTitle: "",
        duration: "",
      });
    } finally {
      setIsLoadingVideo(false);
    }
  };

  useEffect(() => {
    const videoId = extractVideoId(videoUrl);
    if (videoId) {
      const debounce = setTimeout(() => {
        fetchVideoInfo(videoUrl);
      }, 500);
      return () => clearTimeout(debounce);
    } else if (videoUrl) {
      setVideoError(t('youtubeAds.errors.invalidUrl'));
      setVideoInfo(null);
    } else {
      setVideoError("");
      setVideoInfo(null);
    }
  }, [videoUrl]);

  // Load organizations for Admin users
  useEffect(() => {
    const loadOrganizations = async () => {
      if (isPlatformAdmin) {
        setIsLoadingOrgs(true);
        try {
          const response = await apiRequest("GET", "/api/admin/organizations");
          const data = await response.json();
          setOrganizations(data);
        } catch (error) {
          console.error("Failed to load organizations:", error);
        } finally {
          setIsLoadingOrgs(false);
        }
      }
    };
    loadOrganizations();
  }, [isPlatformAdmin]);

  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
    country.code.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const toggleCountry = (code: string) => {
    setSelectedCountries(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const removeCountry = (code: string) => {
    setSelectedCountries(prev => prev.filter(c => c !== code));
  };

  const selectAllCountries = () => {
    setSelectedCountries(countries.map(c => c.code));
  };

  const clearAllCountries = () => {
    setSelectedCountries([]);
    setSelectedCities({});
  };

  const toggleCity = (countryCode: string, cityName: string) => {
    setSelectedCities(prev => {
      const countryCities = prev[countryCode] || [];
      if (countryCities.includes(cityName)) {
        const newCities = countryCities.filter(c => c !== cityName);
        if (newCities.length === 0) {
          const { [countryCode]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [countryCode]: newCities };
      } else {
        return { ...prev, [countryCode]: [...countryCities, cityName] };
      }
    });
  };

  const removeCity = (countryCode: string, cityName: string) => {
    setSelectedCities(prev => {
      const countryCities = prev[countryCode] || [];
      const newCities = countryCities.filter(c => c !== cityName);
      if (newCities.length === 0) {
        const { [countryCode]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [countryCode]: newCities };
    });
  };

  const selectAllCitiesForCountry = (countryCode: string) => {
    const cities = getCitiesForCountry(countryCode);
    setSelectedCities(prev => ({
      ...prev,
      [countryCode]: cities.map(c => c.name)
    }));
  };

  const clearCitiesForCountry = (countryCode: string) => {
    setSelectedCities(prev => {
      const { [countryCode]: _, ...rest } = prev;
      return rest;
    });
  };

  const getFilteredCities = (countryCode: string) => {
    const cities = getCitiesForCountry(countryCode);
    if (!citySearch) return cities;
    return cities.filter(city =>
      city.name.toLowerCase().includes(citySearch.toLowerCase())
    );
  };

  const countriesWithCities = selectedCountries.filter(code => getCitiesForCountry(code).length > 0);

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        const videoValid = videoUrl && extractVideoId(videoUrl) && !videoError;
        if (isPlatformAdmin) {
          return videoValid && !!selectedOrgId;
        }
        return videoValid;
      case 2:
        return budget >= 60 && (inStreamEnabled || discoveryEnabled);
      case 3:
        return selectedCountries.length > 0 && audience.trim().length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

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
      if ((window as any).Wayforpay) {
        setIsWayforpayReady(true);
      }
    }
  }, []);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        videoUrl,
        videoId: extractVideoId(videoUrl),
        budget,
        inStreamEnabled,
        discoveryEnabled,
        inStreamPercent: effectiveInStreamPercent,
        discoveryPercent: effectiveDiscoveryPercent,
        duration,
        countries: selectedCountries,
        cities: selectedCities,
        audience: audience.trim(),
        // Calculated amounts in cents for exact storage
        launchFee: Math.round(LAUNCH_FEE * 100),
        adBudget: Math.round(adBudget * 100),
        wayforpayFee: Math.round(wayforpayAmount * 100),
        taxFee: Math.round(taxAmount * 100),
        youtubeTax: Math.round(youtubeTaxAmount * 100),
        inStreamBudget: Math.round(parseFloat(inStreamBudget) * 100),
        discoveryBudget: Math.round(parseFloat(discoveryBudget) * 100),
      };
      if (isPlatformAdmin && selectedOrgId) {
        payload.orgId = selectedOrgId;
      }
      const response = await apiRequest('POST', '/api/ads/youtube', payload);
      return response.json();
    },
    onSuccess: (data: { campaign: any; paymentData: any }) => {
      const { paymentData } = data;
      
      if (!isWayforpayReady || !(window as any).Wayforpay) {
        toast({
          title: t('youtubeAds.errors.paymentNotReady'),
          description: t('youtubeAds.errors.tryAgain'),
          variant: "destructive",
        });
        return;
      }

      const wayforpay = new (window as any).Wayforpay();
      wayforpay.run({
        ...paymentData,
        straightWidget: true,
      }, 
      function onApproved() {
        toast({
          title: t('youtubeAds.success.title'),
          description: t('youtubeAds.success.paymentSuccess'),
        });
        navigate('/ads/youtube/history');
      },
      function onDeclined() {
        toast({
          title: t('youtubeAds.errors.paymentDeclined'),
          description: t('youtubeAds.errors.tryAgain'),
          variant: "destructive",
        });
        navigate('/ads/youtube/history');
      },
      function onPending() {
        toast({
          title: t('youtubeAds.success.paymentPending'),
          description: t('youtubeAds.success.paymentPendingDescription'),
        });
        navigate('/ads/youtube/history');
      });
    },
    onError: (error: any) => {
      toast({
        title: t('youtubeAds.errors.submitFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      submitMutation.mutate();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate('/ads');
    }
  };

  const getCountryName = (code: string) => {
    return countries.find(c => c.code === code)?.name || code;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/ads')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('common.back')}
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-red-500/10">
              <Youtube className="h-6 w-6 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold">{t('youtubeAds.title')}</h1>
          </div>
          <p className="text-muted-foreground">{t('youtubeAds.description')}</p>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                      currentStep > step.id
                        ? "bg-primary text-primary-foreground"
                        : currentStep === step.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {currentStep > step.id ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      step.id
                    )}
                  </div>
                  <span
                    className={cn(
                      "ml-2 text-sm hidden sm:inline",
                      currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {t(step.nameKey)}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-4",
                      currentStep > step.id ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {currentStep === 1 && (
              <div className="space-y-6">
                {isPlatformAdmin && (
                  <div className="space-y-2 p-4 border-2 border-purple-500/50 rounded-lg bg-purple-500/5">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-purple-500" />
                      * Оберіть організацію
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Рекламна кампанія буде створена для обраної організації
                    </p>
                    <Select 
                      value={selectedOrgId} 
                      onValueChange={setSelectedOrgId}
                      disabled={isLoadingOrgs}
                    >
                      <SelectTrigger className="h-12 border-purple-500/50">
                        <SelectValue placeholder={isLoadingOrgs ? "Завантаження..." : "Оберіть організацію"} />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name} ({org.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="videoUrl" className="text-base font-medium">
                    {t('youtubeAds.videoStep.urlLabel')}
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('youtubeAds.videoStep.urlHint')}
                  </p>
                  <div className="relative">
                    <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="videoUrl"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="pl-10"
                    />
                  </div>
                  {videoError && (
                    <p className="text-sm text-destructive mt-2">{videoError}</p>
                  )}
                </div>

                {isLoadingVideo && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}

                {videoInfo && !isLoadingVideo && (
                  <div className="rounded-lg border overflow-hidden max-w-sm mx-auto">
                    <div className="aspect-video relative bg-black">
                      <img
                        src={videoInfo.thumbnail}
                        alt={videoInfo.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const videoId = extractVideoId(videoUrl);
                          if (videoId && target.src.includes('maxresdefault')) {
                            target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                          }
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center">
                          <Play className="h-6 w-6 text-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="font-medium text-sm line-clamp-2">{videoInfo.title}</h3>
                      {videoInfo.channelTitle && (
                        <p className="text-xs text-muted-foreground mt-1">{videoInfo.channelTitle}</p>
                      )}
                    </div>
                  </div>
                )}

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="recommendations" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="text-base font-medium">{t('youtubeAds.videoStep.recommendations.title', 'Рекомендації до відео для успішної кампанії')}</span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.videoStep.recommendations.quality.title', 'Якість відео')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.videoStep.recommendations.quality.description', 'Використовуйте відео з роздільною здатністю не менше 1080p для найкращого враження')}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.videoStep.recommendations.hook.title', 'Захоплюючий початок')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.videoStep.recommendations.hook.description', 'Перші 5 секунд мають бути максимально цікавими, щоб утримати увагу глядача')}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.videoStep.recommendations.thumbnail.title', 'Ефективна обкладинка')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.videoStep.recommendations.thumbnail.description', 'Для Discovery кампаній обкладинка відео є ключовим — вона має бути яскравою та привертати увагу')}</p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-8">
                <div>
                  <Label htmlFor="budget" className="text-base font-medium">
                    {t('youtubeAds.budgetStep.budgetLabel')}
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('youtubeAds.budgetStep.budgetHint')}
                  </p>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="budget"
                      type="number"
                      min={1}
                      value={budget}
                      onChange={(e) => setBudget(parseInt(e.target.value) || 0)}
                      className={cn(
                        "pl-10 text-lg font-medium",
                        budget < 60 && "border-destructive focus-visible:ring-destructive"
                      )}
                    />
                  </div>
                  {budget < 60 ? (
                    <p className="text-xs text-destructive mt-1">
                      {t('youtubeAds.budgetStep.minBudget', { amount: '$60' })}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('youtubeAds.budgetStep.minBudget', { amount: '$60' })}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-base font-medium">
                    {t('youtubeAds.budgetStep.adTypesLabel')}
                  </Label>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t('youtubeAds.budgetStep.adTypesHint')}
                  </p>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Card 
                        className={cn(
                          "cursor-pointer transition-all",
                          inStreamEnabled ? "border-primary ring-1 ring-primary" : "opacity-60 hover:opacity-80"
                        )}
                        onClick={() => {
                          if (inStreamEnabled && !discoveryEnabled) return;
                          setInStreamEnabled(!inStreamEnabled);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-blue-500/10 flex-shrink-0">
                                <Monitor className="h-5 w-5 text-blue-500" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-medium">In-Stream</h4>
                                <p className="text-xs text-muted-foreground">
                                  {t('youtubeAds.budgetStep.inStreamDesc')}
                                </p>
                              </div>
                            </div>
                            <Checkbox 
                              checked={inStreamEnabled}
                              onCheckedChange={(checked) => {
                                if (!checked && !discoveryEnabled) return;
                                setInStreamEnabled(!!checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="flex-shrink-0"
                            />
                          </div>
                          {inStreamEnabled && (
                            <>
                              <div className="text-2xl font-bold text-primary">
                                ${inStreamBudget}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {effectiveInStreamPercent}%
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>

                      <Card 
                        className={cn(
                          "cursor-pointer transition-all",
                          discoveryEnabled ? "border-primary ring-1 ring-primary" : "opacity-60 hover:opacity-80"
                        )}
                        onClick={() => {
                          if (discoveryEnabled && !inStreamEnabled) return;
                          setDiscoveryEnabled(!discoveryEnabled);
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-start gap-3">
                              <div className="p-2 rounded-lg bg-purple-500/10 flex-shrink-0">
                                <Search className="h-5 w-5 text-purple-500" />
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-medium">Discovery</h4>
                                <p className="text-xs text-muted-foreground">
                                  {t('youtubeAds.budgetStep.discoveryDesc')}
                                </p>
                              </div>
                            </div>
                            <Checkbox 
                              checked={discoveryEnabled}
                              onCheckedChange={(checked) => {
                                if (!checked && !inStreamEnabled) return;
                                setDiscoveryEnabled(!!checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          {discoveryEnabled && (
                            <>
                              <div className="text-2xl font-bold text-primary">
                                ${discoveryBudget}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {effectiveDiscoveryPercent}%
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {bothTypesEnabled && (
                      <>
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            {t('youtubeAds.budgetStep.combinedFeeNote', '+$15 за комбіновану кампанію (In-Stream + Discovery)')}
                          </p>
                        </div>
                        <div className="px-2">
                          <div className="flex justify-between text-sm mb-2">
                            <span>In-Stream: {inStreamPercent}%</span>
                            <span>Discovery: {100 - inStreamPercent}%</span>
                          </div>
                          <Slider
                            value={[inStreamPercent]}
                            onValueChange={(value) => setInStreamPercent(value[0])}
                            max={100}
                            min={0}
                            step={5}
                            className="cursor-pointer"
                          />
                          {inStreamPercent < 80 && (
                            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                              <p className="text-sm text-amber-600 dark:text-amber-400">
                                {t('youtubeAds.budgetStep.lowInStreamWarning', 'Менша частка In-Stream може призвести до меншої глибини перегляду. Рекомендовані налаштування: 80% In-Stream / 20% Discovery.')}
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {budget >= 60 && (
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-muted-foreground">{t('youtubeAds.budgetStep.adBudget')}:</span>
                      <span className="font-bold text-primary text-lg">${adBudget.toFixed(2)}</span>
                    </div>
                    
                    <Collapsible open={budgetDetailsOpen} onOpenChange={setBudgetDetailsOpen}>
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2 rounded-md hover:bg-muted/50">
                          <Calculator className="h-4 w-4" />
                          <span>{t('youtubeAds.budgetStep.showCalculation', 'Детальний розрахунок')}</span>
                          <ChevronDown className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            budgetDetailsOpen && "rotate-180"
                          )} />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-3">
                        <div className="space-y-2 text-sm border-t pt-3">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('youtubeAds.budgetStep.totalBudget')}:</span>
                            <span className="font-medium">${budget}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-sm bg-orange-400 inline-block"></span>
                              {t('youtubeAds.budgetStep.wayforpay', 'Wayforpay')} (2%):
                            </span>
                            <span className="font-medium">-${wayforpayAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block"></span>
                              {t('youtubeAds.budgetStep.tax')} (7%):
                            </span>
                            <span className="font-medium">-${taxAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-sm bg-gray-400 inline-block"></span>
                              {t('youtubeAds.budgetStep.launchFee')}:
                            </span>
                            <span className="font-medium">-${LAUNCH_FEE}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-sm bg-red-500 inline-block"></span>
                              {t('youtubeAds.budgetStep.youtubeTax', 'Податок YouTube')} (20%):
                            </span>
                            <span className="font-medium">-${youtubeTaxAmount.toFixed(2)}</span>
                          </div>
                        </div>
                        
                        <div className="mt-3 h-3 rounded-full overflow-hidden flex bg-gray-200">
                          <div
                            className="bg-orange-400 transition-all"
                            style={{ width: `${wayforpayPercent}%` }}
                            title={`${t('youtubeAds.budgetStep.wayforpay', 'Wayforpay')}: $${wayforpayAmount.toFixed(2)}`}
                          />
                          <div
                            className="bg-amber-500 transition-all"
                            style={{ width: `${taxPercent}%` }}
                            title={`${t('youtubeAds.budgetStep.tax')}: $${taxAmount.toFixed(2)}`}
                          />
                          <div
                            className="bg-gray-400 transition-all flex items-center justify-center"
                            style={{ width: `${launchFeePercent}%` }}
                            title={`${t('youtubeAds.budgetStep.launchFee')}: $${LAUNCH_FEE}`}
                          />
                          <div
                            className="bg-red-500 transition-all"
                            style={{ width: `${youtubeTaxPercent}%` }}
                            title={`${t('youtubeAds.budgetStep.youtubeTax', 'Податок YouTube')}: $${youtubeTaxAmount.toFixed(2)}`}
                          />
                          {inStreamEnabled && (
                            <div
                              className="bg-blue-500 transition-all"
                              style={{ width: `${adBudgetPercent * effectiveInStreamPercent / 100}%` }}
                              title={`In-Stream: $${inStreamBudget}`}
                            />
                          )}
                          {discoveryEnabled && (
                            <div
                              className="bg-purple-500 transition-all"
                              style={{ width: `${adBudgetPercent * effectiveDiscoveryPercent / 100}%` }}
                              title={`Discovery: $${discoveryBudget}`}
                            />
                          )}
                        </div>
                        
                        <div className="mt-2 flex flex-wrap justify-between text-xs text-muted-foreground gap-y-1">
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-orange-400"></span>
                            <span>{t('youtubeAds.budgetStep.wayforpay', 'Wayforpay')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-amber-500"></span>
                            <span>{t('youtubeAds.budgetStep.tax')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-gray-400"></span>
                            <span>{t('youtubeAds.budgetStep.launchFee')}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-sm bg-red-500"></span>
                            <span>{t('youtubeAds.budgetStep.youtubeTax', 'YouTube')}</span>
                          </div>
                          {inStreamEnabled && (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-sm bg-blue-500"></span>
                              <span>In-Stream ${inStreamBudget}</span>
                            </div>
                          )}
                          {discoveryEnabled && (
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-sm bg-purple-500"></span>
                              <span>Discovery ${discoveryBudget}</span>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                )}

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="budget-recommendations" className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="text-base font-medium">{t('youtubeAds.budgetStep.recommendations.title', 'Рекомендації до бюджету')}</span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pb-4">
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.budgetStep.recommendations.minBudget.title', 'Мінімальний бюджет')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.budgetStep.recommendations.minBudget.description', 'Рекомендуємо починати з бюджету від $150 для отримання достатньої кількості показів та статистики. При бюджеті від 300$ можна отримати від 100 тисяч переглядів вашого відео.')}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.budgetStep.recommendations.adTypes.title', 'Типи реклами')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.budgetStep.recommendations.adTypes.description', 'Рекомендуємо використовувати або лише In-Stream рекламу — для максимального охоплення, або розподіляти 80% In-Stream та 20% Discovery. З досвіду для відеокліпів In-Stream дає кращі результати глибини перегляду.')}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.budgetStep.recommendations.combined.title', 'Комбінована стратегія')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.budgetStep.recommendations.combined.description', 'Для оптимізації маленького бюджету до 150$, обирайте лише In-Stream рекламу. Спрямуйте максимум бюджету на результат, оскільки вартість рекламної кампанії при комбінованій стратегії збільшується на 15$.')}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{t('youtubeAds.budgetStep.recommendations.taxes.title', 'Податки')}</p>
                            <p className="text-sm text-muted-foreground">{t('youtubeAds.budgetStep.recommendations.taxes.description', 'Враховуйте, що Youtube накладає 20% податку. А також для прозорості доходів та обігу коштів, ми приймаємо рекламний бюджет на рахунок ФОП через WayForPay. Детальна калькуляція витрат описана вище в "Детальний розрахунок"')}</p>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <div>
                  <Label className="text-base font-medium">
                    {t('youtubeAds.targetingStep.durationLabel')}
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('youtubeAds.targetingStep.durationHint')}
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-muted-foreground" />
                        <span className="text-2xl font-bold">{duration}</span>
                        <span className="text-muted-foreground">{t('youtubeAds.summaryStep.days')}</span>
                      </div>
                    </div>
                    <Slider
                      value={[duration]}
                      onValueChange={(value) => setDuration(value[0])}
                      min={3}
                      max={30}
                      step={1}
                      className="cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>3 {t('youtubeAds.summaryStep.days')}</span>
                      <span>30 {t('youtubeAds.summaryStep.days')}</span>
                    </div>
                    {budget < 150 && duration > 7 && (
                      <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          {t('youtubeAds.targetingStep.lowBudgetDurationWarning', 'При бюджеті менше $150 рекомендована тривалість до 7 днів для найкращих показників переглядів.')}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium">
                    {t('youtubeAds.targetingStep.geoLabel')}
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('youtubeAds.targetingStep.geoHint')}
                  </p>

                  <div className="flex gap-2 mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAllCountries}
                    >
                      <Globe className="mr-1 h-4 w-4" />
                      {t('youtubeAds.targetingStep.selectAll')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearAllCountries}
                    >
                      <X className="mr-1 h-4 w-4" />
                      {t('youtubeAds.targetingStep.clearAll')}
                    </Button>
                  </div>

                  <Popover open={countryPopoverOpen} onOpenChange={setCountryPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                      >
                        {selectedCountries.length > 0
                          ? t('youtubeAds.targetingStep.countriesSelected', { count: selectedCountries.length })
                          : t('youtubeAds.targetingStep.selectCountries')}
                        <Globe className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder={t('youtubeAds.targetingStep.searchCountries')}
                          value={countrySearch}
                          onValueChange={setCountrySearch}
                        />
                        <CommandList>
                          <CommandEmpty>{t('youtubeAds.targetingStep.noCountries')}</CommandEmpty>
                          <CommandGroup>
                            <ScrollArea className="h-60">
                              {filteredCountries.map((country) => (
                                <CommandItem
                                  key={country.code}
                                  value={country.name}
                                  onSelect={() => toggleCountry(country.code)}
                                >
                                  <div
                                    className={cn(
                                      "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                      selectedCountries.includes(country.code)
                                        ? "bg-primary text-primary-foreground"
                                        : "opacity-50"
                                    )}
                                  >
                                    {selectedCountries.includes(country.code) && (
                                      <CheckCircle className="h-3 w-3" />
                                    )}
                                  </div>
                                  <span>{country.name}</span>
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    {country.code}
                                  </span>
                                </CommandItem>
                              ))}
                            </ScrollArea>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  {selectedCountries.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {selectedCountries.slice(0, 10).map((code) => (
                        <Badge
                          key={code}
                          variant="secondary"
                          className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => removeCountry(code)}
                        >
                          {getCountryName(code)}
                          <X className="ml-1 h-3 w-3" />
                        </Badge>
                      ))}
                      {selectedCountries.length > 10 && (
                        <Badge variant="outline">
                          +{selectedCountries.length - 10} {t('youtubeAds.targetingStep.more')}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {countriesWithCities.length > 0 && (
                  <div>
                    <Label className="text-base font-medium">
                      {t('youtubeAds.targetingStep.citiesLabel')}
                      <span className="text-muted-foreground font-normal ml-2">
                        ({t('common.optional')})
                      </span>
                    </Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('youtubeAds.targetingStep.citiesHint')}
                    </p>

                    <div className="space-y-3">
                      {countriesWithCities.map((countryCode) => {
                        const countryName = getCountryName(countryCode);
                        const citiesForCountry = getCitiesForCountry(countryCode);
                        const selectedCountryCities = selectedCities[countryCode] || [];
                        
                        return (
                          <div key={countryCode} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">{countryName}</span>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => selectAllCitiesForCountry(countryCode)}
                                  className="h-7 text-xs"
                                >
                                  {t('youtubeAds.targetingStep.selectAll')}
                                </Button>
                                {selectedCountryCities.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => clearCitiesForCountry(countryCode)}
                                    className="h-7 text-xs"
                                  >
                                    {t('youtubeAds.targetingStep.clearAll')}
                                  </Button>
                                )}
                              </div>
                            </div>
                            
                            <Popover 
                              open={cityPopoverOpen === countryCode} 
                              onOpenChange={(open) => {
                                setCityPopoverOpen(open ? countryCode : null);
                                if (!open) setCitySearch("");
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  size="sm"
                                  className="w-full justify-between"
                                >
                                  {selectedCountryCities.length > 0
                                    ? t('youtubeAds.targetingStep.citiesSelected', { count: selectedCountryCities.length })
                                    : t('youtubeAds.targetingStep.selectCities')}
                                  <Globe className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-full p-0" align="start">
                                <Command>
                                  <CommandInput
                                    placeholder={t('youtubeAds.targetingStep.searchCities')}
                                    value={citySearch}
                                    onValueChange={setCitySearch}
                                  />
                                  <CommandList>
                                    <CommandEmpty>{t('youtubeAds.targetingStep.noCities')}</CommandEmpty>
                                    <CommandGroup>
                                      <ScrollArea className="h-48">
                                        {getFilteredCities(countryCode).map((city) => (
                                          <CommandItem
                                            key={city.name}
                                            value={city.name}
                                            onSelect={() => toggleCity(countryCode, city.name)}
                                          >
                                            <div
                                              className={cn(
                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                selectedCountryCities.includes(city.name)
                                                  ? "bg-primary text-primary-foreground"
                                                  : "opacity-50"
                                              )}
                                            >
                                              {selectedCountryCities.includes(city.name) && (
                                                <CheckCircle className="h-3 w-3" />
                                              )}
                                            </div>
                                            <span>{city.name}</span>
                                          </CommandItem>
                                        ))}
                                      </ScrollArea>
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>

                            {selectedCountryCities.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {selectedCountryCities.map((cityName) => (
                                  <Badge
                                    key={cityName}
                                    variant="outline"
                                    className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground text-xs"
                                    onClick={() => removeCity(countryCode, cityName)}
                                  >
                                    {cityName}
                                    <X className="ml-1 h-2 w-2" />
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="audience" className="text-base font-medium">
                    {t('youtubeAds.targetingStep.audienceLabel')}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    {t('youtubeAds.targetingStep.audienceHint')}
                  </p>
                  <Textarea
                    id="audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder={t('youtubeAds.targetingStep.audiencePlaceholder')}
                    rows={4}
                  />
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">{t('youtubeAds.summaryStep.title')}</h3>
                
                {videoInfo && (
                  <div className="flex gap-4 p-4 rounded-lg border">
                    <img
                      src={videoInfo.thumbnail}
                      alt={videoInfo.title}
                      className="w-32 h-20 object-cover rounded"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const videoId = extractVideoId(videoUrl);
                        if (videoId && target.src.includes('maxresdefault')) {
                          target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        }
                      }}
                    />
                    <div>
                      <h4 className="font-medium line-clamp-2">{videoInfo.title}</h4>
                      {videoInfo.channelTitle && (
                        <p className="text-sm text-muted-foreground">{videoInfo.channelTitle}</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{t('youtubeAds.summaryStep.totalBudget')}</span>
                      </div>
                      <div className="text-2xl font-bold">${budget}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">{t('youtubeAds.summaryStep.duration')}</span>
                      </div>
                      <div className="text-2xl font-bold">{duration} {t('youtubeAds.summaryStep.days')}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-3">{t('youtubeAds.summaryStep.budgetBreakdown')}</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-orange-400" />
                          <span>{t('youtubeAds.budgetStep.wayforpay', 'Wayforpay')} (2%)</span>
                        </div>
                        <span className="font-medium">${wayforpayAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-amber-500" />
                          <span>{t('youtubeAds.budgetStep.tax')} (7%)</span>
                        </div>
                        <span className="font-medium">${taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-gray-400" />
                          <span>{t('youtubeAds.budgetStep.launchFee')}</span>
                        </div>
                        <span className="font-medium">${LAUNCH_FEE}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-red-500" />
                          <span>{t('youtubeAds.budgetStep.youtubeTax', 'Податок YouTube')} (20%)</span>
                        </div>
                        <span className="font-medium">${youtubeTaxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between border-t pt-2">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-sm bg-primary" />
                          <span className="font-medium">{t('youtubeAds.budgetStep.adBudget')}</span>
                        </div>
                        <span className="font-bold text-primary">${adBudget.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-3">{t('youtubeAds.summaryStep.adTypes')}</h4>
                    <div className="space-y-3">
                      {inStreamEnabled && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                            <span>In-Stream</span>
                          </div>
                          <span className="font-medium">${inStreamBudget} ({effectiveInStreamPercent}%)</span>
                        </div>
                      )}
                      {discoveryEnabled && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-purple-500" />
                            <span>Discovery</span>
                          </div>
                          <span className="font-medium">${discoveryBudget} ({effectiveDiscoveryPercent}%)</span>
                        </div>
                      )}
                      {bothTypesEnabled && (
                        <>
                          <div className="h-2 rounded-full overflow-hidden flex">
                            <div className="bg-blue-500" style={{ width: `${inStreamPercent}%` }} />
                            <div className="bg-purple-500" style={{ width: `${100 - inStreamPercent}%` }} />
                          </div>
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            {t('youtubeAds.budgetStep.combinedFeeNote', '+$15 за комбіновану кампанію')}
                          </p>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{t('youtubeAds.summaryStep.targetCountries')}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedCountries.length === countries.length ? (
                        <Badge>{t('youtubeAds.summaryStep.worldwide')}</Badge>
                      ) : (
                        <>
                          {selectedCountries.slice(0, 5).map((code) => (
                            <Badge key={code} variant="secondary">{getCountryName(code)}</Badge>
                          ))}
                          {selectedCountries.length > 5 && (
                            <Badge variant="outline">+{selectedCountries.length - 5}</Badge>
                          )}
                        </>
                      )}
                    </div>

                    {Object.keys(selectedCities).length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <span className="text-sm font-medium text-muted-foreground">{t('youtubeAds.summaryStep.targetCities')}</span>
                        <div className="mt-2 space-y-2">
                          {Object.entries(selectedCities).map(([countryCode, cities]) => (
                            <div key={countryCode} className="flex flex-wrap gap-1 items-center">
                              <span className="text-xs font-medium mr-2">{getCountryName(countryCode)}:</span>
                              {cities.slice(0, 3).map((city) => (
                                <Badge key={city} variant="outline" className="text-xs">{city}</Badge>
                              ))}
                              {cities.length > 3 && (
                                <Badge variant="outline" className="text-xs">+{cities.length - 3}</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {audience && (
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{t('youtubeAds.summaryStep.targetAudience')}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{audience}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {currentStep === 1 ? t('common.cancel') : t('common.back')}
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || submitMutation.isPending}
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.submitting')}
              </>
            ) : currentStep === 4 ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                {t('youtubeAds.submit')}
              </>
            ) : (
              <>
                {t('common.next')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
