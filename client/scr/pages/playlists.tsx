import { useState, useMemo, useEffect } from "react";
import { getProxiedImageUrl } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose, SheetFooter } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Music, ExternalLink, Search, ListMusic, ArrowLeft, Users, TrendingUp, TrendingDown, Minus, Camera, Check, Heart, ShoppingCart, SlidersHorizontal, X, RotateCcw } from "lucide-react";
import { FaSpotify, FaYoutube, FaApple } from "react-icons/fa";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { PLAYLIST_GENRES } from "@/lib/constants";

interface LocalPlaylist {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  followerCount: number | null;
  tracksCount: number | null;
  genre: string | null;
  country: string | null;
  imageUrl: string | null;
  playlistUrl: string | null;
  curatorName: string | null;
  curatorOrgId: string | null;
  isActive: boolean;
  createdAt: string;
}

interface FilterState {
  platforms: string[];
  genres: string[];
  priceMin: number;
  priceMax: number;
  country: string;
  freeOnly: boolean;
  sortBy: 'default' | 'price_asc' | 'price_desc' | 'audience_asc' | 'audience_desc';
}

const EUROPEAN_COUNTRIES = [
  { code: "PL", name: "Poland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PT", name: "Portugal" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
];

const DEFAULT_FILTERS: FilterState = {
  platforms: [],
  genres: [],
  priceMin: 0,
  priceMax: 50000,
  country: "",
  freeOnly: false,
  sortBy: 'default',
};

interface FollowerSnapshot {
  id: string;
  playlistId: number;
  followerCount: number;
  tracksCount: number;
  collectedAt: string;
}

interface PricingPackage {
  id: number;
  playlistId: number;
  name: string;
  price: number;
  currency: string;
  benefits: string[];
  includesArtistPhoto: boolean;
  sortOrder: number;
  isActive: boolean;
}

const PlatformIcon = ({ platform }: { platform: string }) => {
  const platformLower = platform.toLowerCase();
  
  if (platformLower.includes('spotify')) {
    return <FaSpotify className="w-5 h-5 text-[#1DB954]" />;
  }
  if (platformLower.includes('youtube')) {
    return <FaYoutube className="w-5 h-5 text-[#FF0000]" />;
  }
  if (platformLower.includes('apple')) {
    return <FaApple className="w-5 h-5 text-[#FC3C44]" />;
  }
  return <Music className="w-5 h-5 text-muted-foreground" />;
};

export default function Playlists() {
  const { t } = useTranslation();
  const { isAuthenticated, isCurator } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingPlaylist, setViewingPlaylist] = useState<LocalPlaylist | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PricingPackage | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const { data: playlists, isLoading } = useQuery<LocalPlaylist[]>({
    queryKey: ["/api/local-playlists"],
    enabled: isAuthenticated,
  });

  const { data: likedPlaylistIds = [] } = useQuery<number[]>({
    queryKey: ["/api/playlists/likes"],
    enabled: isAuthenticated,
  });

  const { data: cartItems = [] } = useQuery<any[]>({
    queryKey: ["/api/playlists/cart"],
    enabled: isAuthenticated,
  });

  const likeMutation = useMutation({
    mutationFn: async (playlistId: number) => {
      const res = await fetch(`/api/playlists/${playlistId}/like`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to like');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists/likes"] });
    },
  });

  const unlikeMutation = useMutation({
    mutationFn: async (playlistId: number) => {
      const res = await fetch(`/api/playlists/${playlistId}/like`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to unlike');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists/likes"] });
    },
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ playlistId, packageId }: { playlistId: number; packageId: number }) => {
      const res = await fetch('/api/playlists/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playlistId, packageId }),
      });
      if (!res.ok) throw new Error('Failed to add to cart');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playlists/cart"] });
      toast({
        title: t('playlists.addedToCart'),
        description: t('playlists.addedToCartDescription'),
      });
      setIsViewDialogOpen(false);
      setSelectedPackage(null);
    },
  });

  const toggleLike = (playlistId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (likedPlaylistIds.includes(playlistId)) {
      unlikeMutation.mutate(playlistId);
    } else {
      likeMutation.mutate(playlistId);
    }
  };

  const { data: followerHistory, isLoading: isLoadingHistory } = useQuery<FollowerSnapshot[]>({
    queryKey: ["/api/local-playlists", viewingPlaylist?.id, "history"],
    queryFn: async () => {
      if (!viewingPlaylist) return [];
      const res = await fetch(`/api/local-playlists/${viewingPlaylist.id}/history`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: !!viewingPlaylist && isViewDialogOpen,
  });

  const { data: pricingPackages, isLoading: isLoadingPackages } = useQuery<PricingPackage[]>({
    queryKey: ["/api/local-playlists", viewingPlaylist?.id, "pricing"],
    queryFn: async () => {
      if (!viewingPlaylist) return [];
      const res = await fetch(`/api/local-playlists/${viewingPlaylist.id}/pricing`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch pricing');
      return res.json();
    },
    enabled: !!viewingPlaylist && isViewDialogOpen,
  });

  const { data: bulkHistory } = useQuery<Record<number, FollowerSnapshot[]>>({
    queryKey: ["/api/local-playlists/history/bulk"],
    queryFn: async () => {
      const res = await fetch('/api/local-playlists/history/bulk?days=30', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch bulk history');
      return res.json();
    },
    enabled: isAuthenticated && !!playlists?.length,
  });

  const { data: bulkPricing } = useQuery<Record<number, PricingPackage[]>>({
    queryKey: ["/api/local-playlists/pricing/bulk"],
    queryFn: async () => {
      const res = await fetch('/api/local-playlists/pricing/bulk', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch bulk pricing');
      return res.json();
    },
    enabled: isAuthenticated && !!playlists?.length,
  });

  const availableGenres = useMemo(() => {
    if (!playlists) return [];
    const genres = new Set<string>();
    playlists.forEach(p => {
      if (p.genre) {
        p.genre.split(',').forEach(g => {
          const trimmed = g.trim();
          if (trimmed) genres.add(trimmed);
        });
      }
    });
    return Array.from(genres).sort();
  }, [playlists]);

  const priceRange = useMemo(() => {
    if (!bulkPricing) return { min: 0, max: 50000 };
    let min = Infinity;
    let max = 0;
    Object.values(bulkPricing).forEach(packages => {
      packages.forEach(pkg => {
        if (pkg.price < min) min = pkg.price;
        if (pkg.price > max) max = pkg.price;
      });
    });
    return { min: min === Infinity ? 0 : min, max: max === 0 ? 50000 : max };
  }, [bulkPricing]);

  const getPlaylistMinPrice = (playlistId: number): number | null => {
    const packages = bulkPricing?.[playlistId];
    if (!packages || packages.length === 0) return null;
    return Math.min(...packages.map(p => p.price));
  };

  const hasFreePricing = (playlistId: number): boolean => {
    const packages = bulkPricing?.[playlistId];
    if (!packages || packages.length === 0) return false;
    return packages.some(p => p.price === 0);
  };

  useEffect(() => {
    if (bulkPricing && priceRange.max > 0) {
      setFilters(prev => ({
        ...prev,
        priceMin: prev.priceMin === 0 ? priceRange.min : prev.priceMin,
        priceMax: prev.priceMax === DEFAULT_FILTERS.priceMax ? priceRange.max : prev.priceMax
      }));
    }
  }, [priceRange.min, priceRange.max, bulkPricing]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.platforms.length > 0) count++;
    if (filters.genres.length > 0) count++;
    if (filters.priceMin > priceRange.min || filters.priceMax < priceRange.max) count++;
    if (filters.country) count++;
    if (filters.freeOnly) count++;
    if (filters.sortBy !== 'default') count++;
    return count;
  }, [filters, priceRange.min, priceRange.max]);

  const resetFilters = () => {
    setFilters({ ...DEFAULT_FILTERS, priceMin: priceRange.min, priceMax: priceRange.max });
  };

  const getGrowthData = (playlistId: number) => {
    const history = bulkHistory?.[playlistId];
    if (!history || history.length < 2) return null;

    const first = history[0];
    const last = history[history.length - 1];
    const delta = last.followerCount - first.followerCount;
    const percentage = first.followerCount > 0 
      ? ((delta / first.followerCount) * 100).toFixed(1)
      : '0';

    return {
      delta,
      percentage: parseFloat(percentage),
      chartData: history.map(s => ({
        date: format(new Date(s.collectedAt), 'dd.MM', { locale: uk }),
        value: s.followerCount,
      })),
    };
  };

  const filteredPlaylists = useMemo(() => {
    const filtered = playlists?.filter(playlist => {
      const matchesSearch = 
        playlist.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        playlist.genre?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        playlist.platform.toLowerCase().includes(searchQuery.toLowerCase()) ||
        playlist.curatorName?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesFavorites = !showFavoritesOnly || likedPlaylistIds.includes(playlist.id);
      
      const matchesPlatform = filters.platforms.length === 0 || 
        filters.platforms.some(p => playlist.platform.toLowerCase().includes(p.toLowerCase()));
      
      const matchesGenre = filters.genres.length === 0 || 
        (playlist.genre && filters.genres.some(g => 
          playlist.genre!.split(',').map(s => s.trim()).includes(g)
        ));
      
      const minPrice = getPlaylistMinPrice(playlist.id);
      const matchesPrice = minPrice == null || (minPrice >= filters.priceMin && minPrice <= filters.priceMax);
      
      const matchesCountry = !filters.country || playlist.country === filters.country;
      
      const matchesFree = !filters.freeOnly || hasFreePricing(playlist.id);
      
      return matchesSearch && matchesFavorites && matchesPlatform && matchesGenre && matchesPrice && matchesCountry && matchesFree;
    }) || [];

    // Apply sorting
    if (filters.sortBy === 'default') {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      if (filters.sortBy === 'price_asc') {
        const priceA = getPlaylistMinPrice(a.id) ?? Infinity;
        const priceB = getPlaylistMinPrice(b.id) ?? Infinity;
        return priceA - priceB;
      }
      if (filters.sortBy === 'price_desc') {
        const priceA = getPlaylistMinPrice(a.id) ?? 0;
        const priceB = getPlaylistMinPrice(b.id) ?? 0;
        return priceB - priceA;
      }
      if (filters.sortBy === 'audience_asc') {
        return (a.followerCount ?? 0) - (b.followerCount ?? 0);
      }
      if (filters.sortBy === 'audience_desc') {
        return (b.followerCount ?? 0) - (a.followerCount ?? 0);
      }
      return 0;
    });
  }, [playlists, searchQuery, showFavoritesOnly, likedPlaylistIds, filters, bulkPricing]);

  const formatFollowers = (count: number | null) => {
    if (!count) return null;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const handleViewPlaylist = (playlist: LocalPlaylist) => {
    setViewingPlaylist(playlist);
    setSelectedPackage(null);
    setIsViewDialogOpen(true);
    
    // Track playlist view
    fetch(`/api/curator/playlists/${playlist.id}/view`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {
      // Silently fail - view tracking is not critical
    });
  };

  const chartData = followerHistory?.map(snapshot => ({
    date: format(new Date(snapshot.collectedAt), 'dd.MM', { locale: uk }),
    followers: snapshot.followerCount,
    tracks: snapshot.tracksCount,
  })) || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(isCurator ? '/curator/playlists' : '/promo')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('common.back')}
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <ListMusic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t('playlists.title')}</h1>
              <p className="text-muted-foreground">{t('playlists.subtitle')}</p>
            </div>
          </div>
        </div>

        <div className="mb-4 md:mb-6">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="relative flex-1 min-w-[120px] max-w-md order-1">
              <Search className="absolute left-2.5 md:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('playlists.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 md:pl-10 h-9 md:h-10 text-sm"
              />
            </div>
            {!isCurator && (
              <>
                <Button
                  variant={showFavoritesOnly ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className="gap-1.5 md:gap-2 h-9 md:h-10 px-2.5 md:px-3 text-xs md:text-sm order-2"
                >
                  <Heart className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`} />
                  <span className="hidden sm:inline">{t('playlists.favorites')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/playlists/cart')}
                  className="gap-1.5 md:gap-2 h-9 md:h-10 px-2.5 md:px-3 text-xs md:text-sm relative order-3"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('playlists.cart.button')}</span>
                  {cartItems.length > 0 && (
                    <Badge variant="destructive" className="absolute -top-1.5 -right-1.5 h-4 w-4 md:h-5 md:w-5 p-0 flex items-center justify-center text-[10px] md:text-xs">
                      {cartItems.length}
                    </Badge>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/my-applications')}
                  className="gap-1.5 md:gap-2 h-9 md:h-10 px-2.5 md:px-3 text-xs md:text-sm order-5 md:order-4"
                >
                  <ListMusic className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('myApplications.title')}</span>
                </Button>
              </>
            )}
            <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <SheetTrigger asChild>
                <Button
                  variant={activeFilterCount > 0 ? "default" : "outline"}
                  size="sm"
                  className="gap-1.5 md:gap-2 h-9 md:h-10 px-2.5 md:px-3 text-xs md:text-sm relative order-4 md:order-5"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('playlists.filters.button')}</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-0.5 md:ml-1 h-4 w-4 md:h-5 md:w-5 p-0 flex items-center justify-center text-[10px] md:text-xs bg-white/20">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[340px] sm:w-[400px] overflow-y-auto">
                <SheetHeader className="mb-6">
                  <div className="flex items-center justify-between">
                    <SheetTitle>{t('playlists.filters.title')}</SheetTitle>
                    {activeFilterCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetFilters}
                        className="gap-2 text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {t('playlists.filters.reset')}
                      </Button>
                    )}
                  </div>
                </SheetHeader>
                
                <div className="space-y-6">
                  <div>
                    <Label className="text-sm font-medium mb-3 block">{t('playlists.filters.platform')}</Label>
                    <div className="space-y-3">
                      {[
                        { id: 'spotify', icon: FaSpotify, color: 'text-[#1DB954]', label: 'Spotify' },
                        { id: 'apple', icon: FaApple, color: 'text-[#FC3C44]', label: 'Apple Music' },
                        { id: 'youtube', icon: FaYoutube, color: 'text-[#FF0000]', label: 'YouTube' },
                      ].map(platform => (
                        <div key={platform.id} className="flex items-center space-x-3">
                          <Checkbox
                            id={`platform-${platform.id}`}
                            checked={filters.platforms.includes(platform.id)}
                            onCheckedChange={(checked) => {
                              setFilters(prev => ({
                                ...prev,
                                platforms: checked
                                  ? [...prev.platforms, platform.id]
                                  : prev.platforms.filter(p => p !== platform.id)
                              }));
                            }}
                          />
                          <label
                            htmlFor={`platform-${platform.id}`}
                            className="flex items-center gap-2 text-sm cursor-pointer"
                          >
                            <platform.icon className={`w-5 h-5 ${platform.color}`} />
                            {platform.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-3 block">{t('playlists.filters.genre')}</Label>
                    <Select
                      value={filters.genres[0] || "all"}
                      onValueChange={(value) => {
                        setFilters(prev => ({
                          ...prev,
                          genres: value === "all" ? [] : [value]
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('playlists.filters.allGenres')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('playlists.filters.allGenres')}</SelectItem>
                        {PLAYLIST_GENRES.map(genre => (
                          <SelectItem key={genre} value={genre}>{genre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-3 block">{t('playlists.filters.price')}</Label>
                    <div className="space-y-4">
                      <Slider
                        value={[filters.priceMin, filters.priceMax]}
                        onValueChange={([min, max]) => {
                          setFilters(prev => ({ ...prev, priceMin: min, priceMax: max }));
                        }}
                        min={priceRange.min}
                        max={priceRange.max}
                        step={100}
                        className="w-full"
                      />
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">{t('playlists.filters.from')}</Label>
                          <Input
                            type="number"
                            value={filters.priceMin}
                            onChange={(e) => setFilters(prev => ({ ...prev, priceMin: Number(e.target.value) }))}
                            className="h-9"
                          />
                        </div>
                        <span className="text-muted-foreground mt-5">—</span>
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">{t('playlists.filters.to')}</Label>
                          <Input
                            type="number"
                            value={filters.priceMax}
                            onChange={(e) => setFilters(prev => ({ ...prev, priceMax: Number(e.target.value) }))}
                            className="h-9"
                          />
                        </div>
                        <span className="text-muted-foreground mt-5 text-sm font-medium">₴</span>
                      </div>
                      <div className="flex items-center space-x-2 pt-2">
                        <Checkbox
                          id="freeOnly"
                          checked={filters.freeOnly}
                          onCheckedChange={(checked) => setFilters(prev => ({ ...prev, freeOnly: checked === true }))}
                        />
                        <Label htmlFor="freeOnly" className="text-sm cursor-pointer">
                          {t('playlists.filters.freeOnly')}
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-3 block">{t('playlists.filters.sortBy')}</Label>
                    <Select
                      value={filters.sortBy}
                      onValueChange={(value: FilterState['sortBy']) => {
                        setFilters(prev => ({ ...prev, sortBy: value }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('playlists.filters.sortDefault')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">{t('playlists.filters.sortDefault')}</SelectItem>
                        <SelectItem value="price_asc">{t('playlists.filters.sortPriceAsc')}</SelectItem>
                        <SelectItem value="price_desc">{t('playlists.filters.sortPriceDesc')}</SelectItem>
                        <SelectItem value="audience_desc">{t('playlists.filters.sortAudienceDesc')}</SelectItem>
                        <SelectItem value="audience_asc">{t('playlists.filters.sortAudienceAsc')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-3 block">{t('playlists.filters.country')}</Label>
                    <Select
                      value={filters.country || "all"}
                      onValueChange={(value) => {
                        setFilters(prev => ({
                          ...prev,
                          country: value === "all" ? "" : value
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('playlists.filters.allCountries')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('playlists.filters.allCountries')}</SelectItem>
                        <SelectGroup>
                          <SelectItem value="UA">
                            <span className="flex items-center gap-2">🇺🇦 {t('playlists.filters.ukraine')}</span>
                          </SelectItem>
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>{t('playlists.filters.europe')}</SelectLabel>
                          {EUROPEAN_COUNTRIES.map(country => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectItem value="US">
                            <span className="flex items-center gap-2">🇺🇸 {t('playlists.filters.usa')}</span>
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <SheetFooter className="mt-8">
                  <SheetClose asChild>
                    <Button className="w-full">{t('playlists.filters.apply')}</Button>
                  </SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredPlaylists.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('playlists.noPlaylists')}</h3>
              <p className="text-muted-foreground">{t('playlists.noPlaylistsDescription')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4">
            {filteredPlaylists.map((playlist) => {
              const growthData = getGrowthData(playlist.id);
              
              return (
                <Card 
                  key={playlist.id} 
                  className="group hover:shadow-xl transition-all duration-200 overflow-hidden cursor-pointer border-border/50 hover:border-primary/40"
                  onClick={() => handleViewPlaylist(playlist)}
                >
                  {/* Image - 4:3 aspect ratio */}
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {playlist.imageUrl ? (
                      <img 
                        src={getProxiedImageUrl(playlist.imageUrl)} 
                        alt={playlist.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-600/30 to-pink-600/30 flex items-center justify-center">
                        <Music className="w-10 h-10 md:w-16 md:h-16 text-purple-400/60" />
                      </div>
                    )}
                    {/* Platform badge overlay */}
                    <div className="absolute top-2 left-2 md:top-3 md:left-3">
                      <div className="bg-black/60 backdrop-blur-sm rounded-full p-1.5 md:p-2">
                        <PlatformIcon platform={playlist.platform} />
                      </div>
                    </div>
                    {/* Free badge overlay */}
                    {hasFreePricing(playlist.id) && (
                      <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3">
                        <Badge className="bg-green-500 hover:bg-green-600 text-white font-semibold text-[10px] md:text-xs px-1.5 md:px-2">
                          {t('playlists.free')}
                        </Badge>
                      </div>
                    )}
                    {/* Like button overlay - hidden for curators */}
                    {!isCurator && (
                      <button
                        className="absolute bottom-2 right-2 md:bottom-3 md:right-3 p-1.5 md:p-2 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80 transition-colors"
                        onClick={(e) => toggleLike(playlist.id, e)}
                      >
                        <Heart 
                          className={`w-4 h-4 md:w-5 md:h-5 transition-all ${
                            likedPlaylistIds.includes(playlist.id) 
                              ? 'fill-red-500 text-red-500 scale-110' 
                              : 'text-white hover:text-red-400'
                          }`} 
                        />
                      </button>
                    )}
                    {/* Growth indicator overlay - hidden on mobile */}
                    {growthData && (
                      <div className="absolute top-2 right-2 md:top-3 md:right-3 hidden md:block">
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold shadow-lg ${
                          growthData.delta > 0 
                            ? 'bg-green-600 text-white' 
                            : growthData.delta < 0 
                              ? 'bg-red-600 text-white' 
                              : 'bg-black/70 text-white backdrop-blur-sm'
                        }`}>
                          {growthData.delta > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : growthData.delta < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : (
                            <Minus className="w-3 h-3" />
                          )}
                          <span>{growthData.delta > 0 ? '+' : ''}{growthData.percentage}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-2 md:p-4">
                    {/* Title */}
                    <h3 className="font-semibold text-xs md:text-sm line-clamp-2 mb-1 md:mb-2 min-h-[2rem] md:min-h-[2.5rem]">
                      {playlist.name}
                    </h3>
                    
                    {/* Curator */}
                    {playlist.curatorName && playlist.curatorOrgId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/c/${playlist.curatorOrgId}`);
                        }}
                        className="text-[10px] md:text-xs text-muted-foreground mb-2 md:mb-3 truncate block text-left hover:text-primary hover:underline transition-colors"
                      >
                        {playlist.curatorName}
                      </button>
                    )}
                    {playlist.curatorName && !playlist.curatorOrgId && (
                      <p className="text-[10px] md:text-xs text-muted-foreground mb-2 md:mb-3 truncate">
                        {playlist.curatorName}
                      </p>
                    )}
                    
                    {/* Stats row with icons */}
                    <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-xs text-muted-foreground mb-2 md:mb-3">
                      {playlist.followerCount && (
                        <div className="flex items-center gap-0.5 md:gap-1">
                          <Users className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{formatFollowers(playlist.followerCount)}</span>
                        </div>
                      )}
                      {playlist.tracksCount && (
                        <div className="flex items-center gap-0.5 md:gap-1">
                          <ListMusic className="w-3 h-3 md:w-3.5 md:h-3.5" />
                          <span>{playlist.tracksCount}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Genre tags - show only 1 on mobile */}
                    {playlist.genre && (
                      <div className="flex flex-wrap gap-1 mb-2 md:mb-3">
                        {playlist.genre.split(',').slice(0, 1).map((g, i) => (
                          <Badge key={i} variant="secondary" className="text-[9px] md:text-[10px] px-1.5 md:px-2 py-0 h-4 md:h-5">
                            {g.trim()}
                          </Badge>
                        ))}
                        <span className="hidden md:inline-flex">
                          {playlist.genre.split(',').slice(1, 2).map((g, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-2 py-0 h-5 ml-1">
                              {g.trim()}
                            </Badge>
                          ))}
                        </span>
                        {playlist.genre.split(',').length > 1 && (
                          <Badge variant="outline" className="text-[9px] md:text-[10px] px-1 md:px-2 py-0 h-4 md:h-5 md:hidden">
                            +{playlist.genre.split(',').length - 1}
                          </Badge>
                        )}
                        {playlist.genre.split(',').length > 2 && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 hidden md:inline-flex">
                            +{playlist.genre.split(',').length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                    
                    {/* Bottom action row */}
                    <div className="flex items-center justify-center pt-1.5 md:pt-2 border-t border-border/50">
                      <Button 
                        size="sm" 
                        className="h-7 md:h-8 px-3 md:px-6 text-[10px] md:text-xs w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewPlaylist(playlist);
                        }}
                      >
                        {t('playlists.pitch')}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewingPlaylist && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {viewingPlaylist.imageUrl ? (
                    <img 
                      src={getProxiedImageUrl(viewingPlaylist.imageUrl)} 
                      alt={viewingPlaylist.name}
                      className="w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Music className="w-6 h-6 text-purple-400" />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span>{viewingPlaylist.name}</span>
                    <PlatformIcon platform={viewingPlaylist.platform} />
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 mt-4">
                <div className="flex flex-wrap gap-2">
                  {viewingPlaylist.genre && (
                    <Badge variant="secondary">{viewingPlaylist.genre}</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {viewingPlaylist.followerCount && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Users className="w-4 h-4" />
                        {t('playlists.followers')}
                      </div>
                      <p className="text-xl font-semibold mt-1">
                        {formatFollowers(viewingPlaylist.followerCount)}
                      </p>
                    </div>
                  )}
                  {viewingPlaylist.tracksCount && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <ListMusic className="w-4 h-4" />
                        {t('playlists.tracks')}
                      </div>
                      <p className="text-xl font-semibold mt-1">
                        {viewingPlaylist.tracksCount}
                      </p>
                    </div>
                  )}
                </div>

                {viewingPlaylist.curatorName && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      {t('playlists.curator')}
                    </h4>
                    {viewingPlaylist.curatorOrgId ? (
                      <button
                        onClick={() => {
                          setIsViewDialogOpen(false);
                          navigate(`/c/${viewingPlaylist.curatorOrgId}`);
                        }}
                        className="text-sm hover:text-primary hover:underline transition-colors"
                      >
                        {viewingPlaylist.curatorName}
                      </button>
                    ) : (
                      <p className="text-sm">{viewingPlaylist.curatorName}</p>
                    )}
                  </div>
                )}

                {viewingPlaylist.description && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      {t('playlists.description')}
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">{viewingPlaylist.description}</p>
                  </div>
                )}

                {/* Pricing Packages Section - hidden for curators */}
                {!isCurator && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-3">
                      {t('playlists.packages')}
                    </h4>
                    {isLoadingPackages ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : pricingPackages && pricingPackages.length > 0 ? (
                      <div className="grid gap-3">
                        {pricingPackages.map((pkg) => (
                          <button
                            key={pkg.id}
                            onClick={() => setSelectedPackage(selectedPackage?.id === pkg.id ? null : pkg)}
                            className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                              selectedPackage?.id === pkg.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-primary/50 bg-muted/30'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-semibold">{pkg.name}</span>
                                  {pkg.includesArtistPhoto && (
                                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                      <Camera className="w-3 h-3" />
                                      {t('playlists.photoIncluded')}
                                    </Badge>
                                  )}
                                </div>
                                {pkg.benefits && pkg.benefits[0] && (
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {pkg.benefits[0]}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {pkg.price === 0 ? (
                                  <Badge className="bg-green-500 hover:bg-green-600 text-white font-semibold text-sm px-3">
                                    {t('playlists.free')}
                                  </Badge>
                                ) : (
                                  <span className="text-lg font-bold whitespace-nowrap">
                                    {pkg.price.toLocaleString()} {pkg.currency}
                                  </span>
                                )}
                                {selectedPackage?.id === pkg.id && (
                                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                    <Check className="w-3 h-3 text-primary-foreground" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('playlists.noPackages')}
                      </p>
                    )}
                  </div>
                )}

                {chartData.length > 1 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" />
                      {t('playlists.followerGrowth')}
                    </h4>
                    <div className="h-48 w-full">
                      {isLoadingHistory ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="date" 
                              className="text-xs fill-muted-foreground"
                              tick={{ fontSize: 11 }}
                            />
                            <YAxis 
                              className="text-xs fill-muted-foreground"
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => formatFollowers(value) || '0'}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'hsl(var(--popover))',
                                border: '1px solid hsl(var(--border))',
                                borderRadius: '8px',
                              }}
                              labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="followers" 
                              stroke="#14b8a6" 
                              strokeWidth={2}
                              dot={{ r: 4, fill: "#14b8a6" }}
                              name={t('playlists.followers')}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  {viewingPlaylist.playlistUrl && (
                    <Button variant="outline" asChild className={isCurator ? "flex-1" : ""}>
                      <a href={viewingPlaylist.playlistUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {t('playlists.openPlaylist')}
                      </a>
                    </Button>
                  )}
                  {!isCurator && (
                    <Button 
                      variant="default" 
                      className="flex-1 gap-2"
                      disabled={!selectedPackage || addToCartMutation.isPending}
                      onClick={() => {
                        if (selectedPackage && viewingPlaylist) {
                          addToCartMutation.mutate({
                            playlistId: viewingPlaylist.id,
                            packageId: selectedPackage.id,
                          });
                        }
                      }}
                    >
                      {addToCartMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="w-4 h-4" />
                      )}
                      {selectedPackage 
                        ? selectedPackage.price === 0
                          ? `${t('playlists.addToCart')} - ${t('playlists.free')}`
                          : `${t('playlists.addToCart')} - ${selectedPackage.price.toLocaleString()} ${selectedPackage.currency}`
                        : t('playlists.selectPackage')
                      }
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
