import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProxiedImageUrl } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ListMusic, Plus, Pencil, Trash2, Users, ExternalLink, RefreshCw, X, Package, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FaSpotify, FaYoutube, FaApple } from "react-icons/fa";
import { apiRequest } from "@/lib/queryClient";
import { PLAYLIST_GENRES } from "@/lib/constants";

interface CuratorPlaylist {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  followerCount: number | null;
  tracksCount: number | null;
  genre: string | null;
  imageUrl: string | null;
  playlistUrl: string | null;
  spotifyId: string | null;
  isActive: boolean;
  createdAt: string;
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
  if (platformLower.includes('spotify')) return <FaSpotify className="w-5 h-5 text-[#1DB954]" />;
  if (platformLower.includes('youtube')) return <FaYoutube className="w-5 h-5 text-[#FF0000]" />;
  if (platformLower.includes('apple')) return <FaApple className="w-5 h-5 text-[#FC3C44]" />;
  return <ListMusic className="w-5 h-5 text-muted-foreground" />;
};

export default function CuratorPlaylists() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<CuratorPlaylist | null>(null);
  interface PackageFormData {
    name: string;
    description: string;
    price: number;
    currency: string;
    includesArtistPhoto: boolean;
    isFree: boolean;
  }

  const [formData, setFormData] = useState({
    description: '',
    platform: 'Spotify',
    genres: [] as string[],
    playlistUrl: '',
    packages: [] as PackageFormData[],
  });

  const [newPackage, setNewPackage] = useState<PackageFormData>({
    name: '',
    description: '',
    price: 0,
    currency: 'UAH',
    includesArtistPhoto: false,
    isFree: false,
  });

  const [editingPackageIndex, setEditingPackageIndex] = useState<number | null>(null);
  const [editingPackageData, setEditingPackageData] = useState<PackageFormData | null>(null);

  const TOTAL_COMMISSION_RATE = 0.19;

  const calculateCommission = (price: number) => {
    const totalCommission = Math.round(price * TOTAL_COMMISSION_RATE);
    const curatorReceives = price - totalCommission;
    const wayforpay = Math.round(price * 0.02);
    const fopTax = Math.round(price * 0.07);
    const platform = totalCommission - wayforpay - fopTax;
    return { wayforpay, fopTax, platform, totalCommission, curatorReceives };
  };

  const handleAddPackage = () => {
    const isValidPrice = newPackage.isFree || newPackage.price > 0;
    if (newPackage.name.trim() && isValidPrice && formData.packages.length < 10) {
      const packageToAdd = newPackage.isFree ? { ...newPackage, price: 0 } : newPackage;
      setFormData(prev => ({
        ...prev,
        packages: [...prev.packages, packageToAdd],
      }));
      setNewPackage({ name: '', description: '', price: 0, currency: 'UAH', includesArtistPhoto: false, isFree: false });
    }
  };

  const handleRemovePackage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      packages: prev.packages.filter((_, i) => i !== index),
    }));
  };

  const handleEditPackage = (index: number) => {
    setEditingPackageIndex(index);
    setEditingPackageData({ ...formData.packages[index] });
  };

  const handleSavePackage = () => {
    const isValidPrice = editingPackageData?.isFree || (editingPackageData?.price ?? 0) > 0;
    if (editingPackageIndex !== null && editingPackageData && editingPackageData.name.trim() && isValidPrice) {
      const packageToSave = editingPackageData.isFree ? { ...editingPackageData, price: 0 } : editingPackageData;
      setFormData(prev => ({
        ...prev,
        packages: prev.packages.map((pkg, i) => i === editingPackageIndex ? packageToSave : pkg),
      }));
      setEditingPackageIndex(null);
      setEditingPackageData(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingPackageIndex(null);
    setEditingPackageData(null);
  };

  const { data: playlists, isLoading } = useQuery<CuratorPlaylist[]>({
    queryKey: ["/api/curator/playlists"],
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      console.log('📦 FRONTEND - Sending create data:', JSON.stringify(data, null, 2));
      const res = await apiRequest('POST', '/api/curator/playlists', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists"] });
      setIsAddDialogOpen(false);
      resetForm();
      toast({ title: t('curator.playlists.created') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const res = await apiRequest('PUT', `/api/curator/playlists/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists"] });
      setEditingPlaylist(null);
      resetForm();
      toast({ title: t('curator.playlists.updated') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/curator/playlists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists"] });
      toast({ title: t('curator.playlists.deleted') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/curator/playlists/${id}/sync`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists"] });
      toast({ title: t('curator.playlists.synced') });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/curator/playlists/${id}/toggle-visibility`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/curator/playlists"] });
      toast({ 
        title: data.isActive ? t('curator.playlists.shown') : t('curator.playlists.hidden') 
      });
    },
    onError: (error: any) => {
      toast({ title: t('common.error'), description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setFormData({ description: '', platform: 'Spotify', genres: [], playlistUrl: '', packages: [] });
    setNewPackage({ name: '', description: '', price: 0, currency: 'UAH', includesArtistPhoto: false, isFree: false });
  };

  const handleEdit = async (playlist: CuratorPlaylist) => {
    setEditingPlaylist(playlist);
    const genreArray = playlist.genre ? playlist.genre.split(',').map(g => g.trim()).filter(Boolean) : [];
    
    // Fetch existing packages for this playlist
    let existingPackages: PackageFormData[] = [];
    try {
      const res = await fetch(`/api/curator/playlists/${playlist.id}/pricing`, { credentials: 'include' });
      if (res.ok) {
        const packages = await res.json();
        existingPackages = packages.map((pkg: any) => ({
          name: pkg.name,
          description: Array.isArray(pkg.benefits) && pkg.benefits.length > 0 ? pkg.benefits[0] : '',
          price: pkg.price,
          currency: pkg.currency,
          includesArtistPhoto: pkg.includesArtistPhoto || false,
          isFree: pkg.price === 0,
        }));
      }
    } catch (error) {
      console.error('Failed to fetch packages:', error);
    }
    
    setFormData({
      description: playlist.description || '',
      platform: playlist.platform,
      genres: genreArray,
      playlistUrl: playlist.playlistUrl || '',
      packages: existingPackages,
    });
  };

  const toggleGenre = (genre: string) => {
    setFormData(prev => ({
      ...prev,
      genres: prev.genres.includes(genre)
        ? prev.genres.filter(g => g !== genre)
        : [...prev.genres, genre]
    }));
  };

  const handleSubmit = () => {
    // Auto-add current package form if it has valid data
    let finalFormData = formData;
    const isValidPrice = newPackage.isFree || newPackage.price > 0;
    if (newPackage.name.trim() && isValidPrice && formData.packages.length < 10) {
      const packageToAdd = newPackage.isFree ? { ...newPackage, price: 0 } : newPackage;
      finalFormData = {
        ...formData,
        packages: [...formData.packages, packageToAdd],
      };
    }
    
    if (editingPlaylist) {
      updateMutation.mutate({ id: editingPlaylist.id, data: finalFormData });
    } else {
      createMutation.mutate(finalFormData);
    }
  };

  const formatFollowers = (count: number | null) => {
    if (!count) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('curator.playlists.title')}</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">{t('curator.playlists.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/playlists">
              <Button variant="outline" size="sm">
                <ExternalLink className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">{t('curator.playlists.viewMarketplace')}</span>
              </Button>
            </Link>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="text-xs sm:text-sm" onClick={() => { resetForm(); setEditingPlaylist(null); }}>
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                  {t('curator.playlists.add')}
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('curator.playlists.addNew')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>{t('curator.playlists.platform')}</Label>
                  <Select value={formData.platform} onValueChange={(v) => setFormData({ ...formData, platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Spotify">Spotify</SelectItem>
                      <SelectItem value="Apple Music">Apple Music</SelectItem>
                      <SelectItem value="YouTube Music">YouTube Music</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('curator.playlists.url')}</Label>
                  <Input 
                    value={formData.playlistUrl} 
                    onChange={(e) => setFormData({ ...formData, playlistUrl: e.target.value })} 
                    placeholder="https://open.spotify.com/playlist/..." 
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t('curator.playlists.urlHint')}</p>
                </div>
                <div>
                  <Label>{t('curator.playlists.genre')}</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                    {PLAYLIST_GENRES.map((genre) => (
                      <div key={genre} className="flex items-center space-x-2">
                        <Checkbox
                          id={`genre-add-${genre}`}
                          checked={formData.genres.includes(genre)}
                          onCheckedChange={() => toggleGenre(genre)}
                        />
                        <label
                          htmlFor={`genre-add-${genre}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {genre}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>{t('curator.playlists.description')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
                  <Textarea 
                    value={formData.description} 
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                    placeholder={t('curator.playlists.descriptionHint')}
                  />
                </div>

                {/* Pricing Packages Section */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-base font-semibold">{t('curator.pricing.packagesTitle')}</Label>
                    <span className="text-xs text-muted-foreground">{formData.packages.length}/10</span>
                  </div>
                  
                  {/* Pricing compliance warning */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                    <p className="text-sm text-amber-200 font-semibold mb-2">
                      {t('curator.pricing.attentionTitle')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('curator.pricing.pricingComplianceWarning')}{' '}
                      <a 
                        href="https://muzika-dist.com/curator-terms" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium"
                      >
                        {t('curator.pricing.viewTermsLink')}
                      </a>
                    </p>
                  </div>

                  {/* Existing packages */}
                  {formData.packages.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {formData.packages.map((pkg, index) => {
                        const commission = calculateCommission(pkg.price);
                        const isEditing = editingPackageIndex === index;
                        
                        if (isEditing && editingPackageData) {
                          const editCommission = calculateCommission(editingPackageData.price);
                          return (
                            <div key={index} className="border-2 border-primary rounded-lg p-3 bg-card">
                              <div className="space-y-3">
                                <div>
                                  <Label className="text-xs">{t('curator.pricing.packageName')} *</Label>
                                  <Input
                                    value={editingPackageData.name}
                                    onChange={(e) => setEditingPackageData(prev => prev ? { ...prev, name: e.target.value } : null)}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{t('curator.pricing.packageDescription')}</Label>
                                  <Textarea
                                    value={editingPackageData.description}
                                    onChange={(e) => setEditingPackageData(prev => prev ? { ...prev, description: e.target.value } : null)}
                                    className="mt-1"
                                    rows={2}
                                  />
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`edit-free-${index}`}
                                    checked={editingPackageData.isFree}
                                    onCheckedChange={(checked) => setEditingPackageData(prev => prev ? { ...prev, isFree: checked === true, price: checked === true ? 0 : prev.price } : null)}
                                  />
                                  <Label htmlFor={`edit-free-${index}`} className="text-sm font-medium cursor-pointer">
                                    {t('curator.pricing.freePackage')}
                                  </Label>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <Label className="text-xs">{t('curator.pricing.price')} *</Label>
                                    <Input
                                      type="number"
                                      min="1"
                                      value={editingPackageData.isFree ? 0 : (editingPackageData.price || '')}
                                      onChange={(e) => setEditingPackageData(prev => prev ? { ...prev, price: Number(e.target.value) } : null)}
                                      className="mt-1"
                                      disabled={editingPackageData.isFree}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">{t('curator.pricing.currency')}</Label>
                                    <Select 
                                      value={editingPackageData.currency} 
                                      onValueChange={(value) => setEditingPackageData(prev => prev ? { ...prev, currency: value } : null)}
                                      disabled={editingPackageData.isFree}
                                    >
                                      <SelectTrigger className="mt-1">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="UAH">UAH</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                        <SelectItem value="USD">USD</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id={`edit-artist-photo-${index}`}
                                    checked={editingPackageData.includesArtistPhoto}
                                    onCheckedChange={(checked) => setEditingPackageData(prev => prev ? { ...prev, includesArtistPhoto: checked === true } : null)}
                                  />
                                  <Label htmlFor={`edit-artist-photo-${index}`} className="text-sm cursor-pointer">
                                    {t('curator.pricing.includeArtistPhoto')}
                                  </Label>
                                </div>
                                {!editingPackageData.isFree && editingPackageData.price > 0 && (
                                  <div className="text-sm bg-muted p-2 rounded">
                                    <span className="font-bold">{editingPackageData.price.toLocaleString()} {editingPackageData.currency}</span>
                                    <span className="text-muted-foreground mx-2">→</span>
                                    <span className="text-green-500 font-medium">{t('curator.pricing.youReceive')}: {editCommission.curatorReceives.toLocaleString()} {editingPackageData.currency}</span>
                                  </div>
                                )}
                                <div className="flex gap-2 pt-2">
                                  <Button 
                                    type="button" 
                                    size="sm" 
                                    onClick={handleSavePackage}
                                    disabled={!editingPackageData.name.trim() || (!editingPackageData.isFree && editingPackageData.price <= 0)}
                                  >
                                    {t('common.save')}
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>
                                    {t('common.cancel')}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        
                        return (
                          <div key={index} className="bg-muted rounded-lg p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Package className="w-4 h-4 text-primary" />
                                  <span className="font-medium">{pkg.name}</span>
                                  {pkg.includesArtistPhoto && (
                                    <Badge variant="secondary" className="text-xs">
                                      {t('curator.pricing.artistPhotoIncluded')}
                                    </Badge>
                                  )}
                                </div>
                                {pkg.description && (
                                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{pkg.description}</p>
                                )}
                                <div className="mt-2 text-sm">
                                  <span className="font-bold">{pkg.price.toLocaleString()} {pkg.currency}</span>
                                  <span className="text-muted-foreground mx-2">→</span>
                                  <span className="text-green-500 font-medium">{t('curator.pricing.youReceive')}: {commission.curatorReceives.toLocaleString()} {pkg.currency}</span>
                                  <span className="text-muted-foreground text-xs ml-2">(-{commission.totalCommission.toLocaleString()} {pkg.currency})</span>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditPackage(index)}>
                                  <Pencil className="w-4 h-4 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemovePackage(index)}>
                                  <X className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add new package form */}
                  {formData.packages.length < 10 && (
                    <div className="space-y-3 border rounded-lg p-3 bg-card">
                      <div>
                        <Label className="text-xs">{t('curator.pricing.packageName')} *</Label>
                        <Input
                          value={newPackage.name}
                          onChange={(e) => setNewPackage(prev => ({ ...prev, name: e.target.value }))}
                          placeholder={t('curator.pricing.packageNamePlaceholder')}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('curator.pricing.packageDescription')} <span className="text-muted-foreground">({t('common.optional')})</span></Label>
                        <Textarea
                          value={newPackage.description}
                          onChange={(e) => setNewPackage(prev => ({ ...prev, description: e.target.value }))}
                          placeholder={t('curator.pricing.packageDescriptionPlaceholder')}
                          className="mt-1 min-h-[80px] resize-y"
                          rows={3}
                        />
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="newPackageFree"
                          checked={newPackage.isFree}
                          onCheckedChange={(checked) => setNewPackage(prev => ({ ...prev, isFree: checked === true, price: checked === true ? 0 : prev.price }))}
                        />
                        <Label htmlFor="newPackageFree" className="text-sm font-medium cursor-pointer">
                          {t('curator.pricing.freePackage')}
                        </Label>
                      </div>
                      <div>
                        <Label className="text-xs">{t('curator.pricing.price')} *</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            type="number"
                            value={newPackage.isFree ? 0 : (newPackage.price || '')}
                            onChange={(e) => setNewPackage(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))}
                            placeholder="0"
                            className="flex-1"
                            disabled={newPackage.isFree}
                          />
                          <Select value={newPackage.currency} onValueChange={(v) => setNewPackage(prev => ({ ...prev, currency: v }))} disabled={newPackage.isFree}>
                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="UAH">UAH</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Live commission calculator */}
                      {!newPackage.isFree && newPackage.price > 0 && (
                        <div className="bg-muted rounded p-2 text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Wayforpay (2%):</span>
                            <span className="text-red-400">-{calculateCommission(newPackage.price).wayforpay.toLocaleString()} {newPackage.currency}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('curator.pricing.fopTax')} (7%):</span>
                            <span className="text-red-400">-{calculateCommission(newPackage.price).fopTax.toLocaleString()} {newPackage.currency}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t('curator.pricing.platformCommission')} (10%):</span>
                            <span className="text-red-400">-{calculateCommission(newPackage.price).platform.toLocaleString()} {newPackage.currency}</span>
                          </div>
                          <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                            <span className="text-green-500">{t('curator.pricing.youReceive')}:</span>
                            <span className="text-green-500">{calculateCommission(newPackage.price).curatorReceives.toLocaleString()} {newPackage.currency}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center space-x-2 mt-2">
                        <Checkbox
                          id="includesArtistPhoto"
                          checked={newPackage.includesArtistPhoto}
                          onCheckedChange={(checked) => setNewPackage(prev => ({ ...prev, includesArtistPhoto: checked === true }))}
                        />
                        <Label htmlFor="includesArtistPhoto" className="text-sm cursor-pointer">
                          {t('curator.pricing.includesArtistPhoto')}
                        </Label>
                      </div>

                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleAddPackage}
                        disabled={!newPackage.name.trim() || (!newPackage.isFree && newPackage.price <= 0)}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('curator.pricing.addPackage')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('common.cancel')}</Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending || !formData.playlistUrl}>
                  {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t('common.save')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        <Dialog open={!!editingPlaylist} onOpenChange={(open) => !open && setEditingPlaylist(null)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('curator.playlists.edit')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>{t('curator.playlists.platform')}</Label>
                <Select value={formData.platform} onValueChange={(v) => setFormData({ ...formData, platform: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Spotify">Spotify</SelectItem>
                    <SelectItem value="Apple Music">Apple Music</SelectItem>
                    <SelectItem value="YouTube Music">YouTube Music</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('curator.playlists.url')}</Label>
                <Input 
                  value={formData.playlistUrl} 
                  onChange={(e) => setFormData({ ...formData, playlistUrl: e.target.value })} 
                  placeholder="https://open.spotify.com/playlist/..." 
                />
              </div>
              <div>
                <Label>{t('curator.playlists.genre')}</Label>
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-48 overflow-y-auto p-2 border rounded-md">
                  {PLAYLIST_GENRES.map((genre) => (
                    <div key={genre} className="flex items-center space-x-2">
                      <Checkbox
                        id={`genre-edit-${genre}`}
                        checked={formData.genres.includes(genre)}
                        onCheckedChange={() => toggleGenre(genre)}
                      />
                      <label
                        htmlFor={`genre-edit-${genre}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {genre}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>{t('curator.playlists.description')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span></Label>
                <Textarea 
                  value={formData.description} 
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })} 
                  placeholder={t('curator.playlists.descriptionHint')}
                />
              </div>

              {/* Pricing packages section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{t('curator.pricing.packagesTitle')}</Label>
                  <span className="text-xs text-muted-foreground">{formData.packages.length}/10</span>
                </div>

                {/* Warning about compliance */}
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-sm text-yellow-500 font-medium mb-1">{t('curator.pricing.attentionTitle')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('curator.pricing.pricingComplianceWarning')}{' '}
                    <a href="/curator-terms" target="_blank" className="text-primary hover:underline">
                      {t('curator.pricing.viewTermsLink')}
                    </a>
                  </p>
                </div>

                {/* Existing packages */}
                {formData.packages.length > 0 && (
                  <div className="space-y-2">
                    {formData.packages.map((pkg, index) => {
                      const commission = calculateCommission(pkg.price);
                      const isEditing = editingPackageIndex === index;
                      
                      if (isEditing && editingPackageData) {
                        const editCommission = calculateCommission(editingPackageData.price);
                        return (
                          <div key={index} className="border-2 border-primary rounded-lg p-3 bg-card">
                            <div className="space-y-3">
                              <div>
                                <Label className="text-xs">{t('curator.pricing.packageName')} *</Label>
                                <Input
                                  value={editingPackageData.name}
                                  onChange={(e) => setEditingPackageData(prev => prev ? { ...prev, name: e.target.value } : null)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">{t('curator.pricing.packageDescription')}</Label>
                                <Textarea
                                  value={editingPackageData.description}
                                  onChange={(e) => setEditingPackageData(prev => prev ? { ...prev, description: e.target.value } : null)}
                                  className="mt-1"
                                  rows={2}
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`edit-free-edit-${index}`}
                                  checked={editingPackageData.isFree}
                                  onCheckedChange={(checked) => setEditingPackageData(prev => prev ? { ...prev, isFree: checked === true, price: checked === true ? 0 : prev.price } : null)}
                                />
                                <Label htmlFor={`edit-free-edit-${index}`} className="text-sm font-medium cursor-pointer">
                                  {t('curator.pricing.freePackage')}
                                </Label>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs">{t('curator.pricing.price')} *</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    value={editingPackageData.isFree ? 0 : (editingPackageData.price || '')}
                                    onChange={(e) => setEditingPackageData(prev => prev ? { ...prev, price: Number(e.target.value) } : null)}
                                    className="mt-1"
                                    disabled={editingPackageData.isFree}
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">{t('curator.pricing.currency')}</Label>
                                  <Select 
                                    value={editingPackageData.currency} 
                                    onValueChange={(value) => setEditingPackageData(prev => prev ? { ...prev, currency: value } : null)}
                                    disabled={editingPackageData.isFree}
                                  >
                                    <SelectTrigger className="mt-1">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="UAH">UAH</SelectItem>
                                      <SelectItem value="EUR">EUR</SelectItem>
                                      <SelectItem value="USD">USD</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={`edit-artist-photo-edit-${index}`}
                                  checked={editingPackageData.includesArtistPhoto}
                                  onCheckedChange={(checked) => setEditingPackageData(prev => prev ? { ...prev, includesArtistPhoto: checked === true } : null)}
                                />
                                <Label htmlFor={`edit-artist-photo-edit-${index}`} className="text-sm cursor-pointer">
                                  {t('curator.pricing.includeArtistPhoto')}
                                </Label>
                              </div>
                              {!editingPackageData.isFree && editingPackageData.price > 0 && (
                                <div className="text-sm bg-muted p-2 rounded">
                                  <span className="font-bold">{editingPackageData.price.toLocaleString()} {editingPackageData.currency}</span>
                                  <span className="text-muted-foreground mx-2">→</span>
                                  <span className="text-green-500 font-medium">{t('curator.pricing.youReceive')}: {editCommission.curatorReceives.toLocaleString()} {editingPackageData.currency}</span>
                                </div>
                              )}
                              <div className="flex gap-2 pt-2">
                                <Button 
                                  type="button" 
                                  size="sm" 
                                  onClick={handleSavePackage}
                                  disabled={!editingPackageData.name.trim() || (!editingPackageData.isFree && editingPackageData.price <= 0)}
                                >
                                  {t('common.save')}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={handleCancelEdit}>
                                  {t('common.cancel')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      
                      return (
                        <div key={index} className="bg-muted rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{pkg.name}</span>
                                {pkg.includesArtistPhoto && (
                                  <Badge variant="secondary" className="text-xs">
                                    {t('curator.pricing.artistPhotoIncluded')}
                                  </Badge>
                                )}
                              </div>
                              {pkg.description && (
                                <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{pkg.description}</p>
                              )}
                              <div className="mt-2 text-sm">
                                <span className="font-bold">{pkg.price.toLocaleString()} {pkg.currency}</span>
                                <span className="text-muted-foreground mx-2">→</span>
                                <span className="text-green-500 font-medium">{t('curator.pricing.youReceive')}: {commission.curatorReceives.toLocaleString()} {pkg.currency}</span>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditPackage(index)}>
                                <Pencil className="w-4 h-4 text-primary" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemovePackage(index)}>
                                <X className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add new package form */}
                {formData.packages.length < 10 && (
                  <div className="space-y-3 border rounded-lg p-3 bg-card">
                    <div>
                      <Label className="text-xs">{t('curator.pricing.packageName')} *</Label>
                      <Input
                        value={newPackage.name}
                        onChange={(e) => setNewPackage(prev => ({ ...prev, name: e.target.value }))}
                        placeholder={t('curator.pricing.packageNamePlaceholder')}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">{t('curator.pricing.packageDescription')} <span className="text-muted-foreground">({t('common.optional')})</span></Label>
                      <Textarea
                        value={newPackage.description}
                        onChange={(e) => setNewPackage(prev => ({ ...prev, description: e.target.value }))}
                        placeholder={t('curator.pricing.packageDescriptionPlaceholder')}
                        className="mt-1 min-h-[60px] resize-y"
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="newPackageFreeEdit"
                        checked={newPackage.isFree}
                        onCheckedChange={(checked) => setNewPackage(prev => ({ ...prev, isFree: checked === true, price: checked === true ? 0 : prev.price }))}
                      />
                      <Label htmlFor="newPackageFreeEdit" className="text-sm font-medium cursor-pointer">
                        {t('curator.pricing.freePackage')}
                      </Label>
                    </div>
                    <div>
                      <Label className="text-xs">{t('curator.pricing.price')} *</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="number"
                          value={newPackage.isFree ? 0 : (newPackage.price || '')}
                          onChange={(e) => setNewPackage(prev => ({ ...prev, price: parseInt(e.target.value) || 0 }))}
                          placeholder="0"
                          className="flex-1"
                          disabled={newPackage.isFree}
                        />
                        <Select value={newPackage.currency} onValueChange={(v) => setNewPackage(prev => ({ ...prev, currency: v }))} disabled={newPackage.isFree}>
                          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="UAH">UAH</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {!newPackage.isFree && newPackage.price > 0 && (
                      <div className="bg-muted rounded p-2 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Wayforpay (2%):</span>
                          <span className="text-red-400">-{calculateCommission(newPackage.price).wayforpay.toLocaleString()} {newPackage.currency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('curator.pricing.fopTax')} (7%):</span>
                          <span className="text-red-400">-{calculateCommission(newPackage.price).fopTax.toLocaleString()} {newPackage.currency}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t('curator.pricing.platformCommission')} (10%):</span>
                          <span className="text-red-400">-{calculateCommission(newPackage.price).platform.toLocaleString()} {newPackage.currency}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1 mt-1 font-medium">
                          <span className="text-green-500">{t('curator.pricing.youReceive')}:</span>
                          <span className="text-green-500">{calculateCommission(newPackage.price).curatorReceives.toLocaleString()} {newPackage.currency}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="editIncludesArtistPhoto"
                        checked={newPackage.includesArtistPhoto}
                        onCheckedChange={(checked) => setNewPackage(prev => ({ ...prev, includesArtistPhoto: checked === true }))}
                      />
                      <Label htmlFor="editIncludesArtistPhoto" className="text-sm cursor-pointer">
                        {t('curator.pricing.includesArtistPhoto')}
                      </Label>
                    </div>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleAddPackage}
                      disabled={!newPackage.name.trim() || (!newPackage.isFree && newPackage.price <= 0)}
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t('curator.pricing.addPackage')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPlaylist(null)}>{t('common.cancel')}</Button>
              <Button onClick={handleSubmit} disabled={updateMutation.isPending || !formData.playlistUrl}>
                {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {playlists && playlists.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {playlists.map((playlist) => (
              <Card key={playlist.id} className="overflow-hidden group hover:shadow-lg hover:border-primary/30 transition-all duration-300">
                {/* Square cover image */}
                <div className="relative aspect-square overflow-hidden">
                  {playlist.imageUrl ? (
                    <img 
                      src={getProxiedImageUrl(playlist.imageUrl)} 
                      alt={playlist.name} 
                      className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-300 ${!playlist.isActive ? 'grayscale blur-[2px]' : ''}`}
                    />
                  ) : (
                    <div className={`w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center ${!playlist.isActive ? 'grayscale blur-[2px]' : ''}`}>
                      <ListMusic className="w-10 h-10 sm:w-12 sm:h-12 text-purple-400" />
                    </div>
                  )}
                  {/* Platform + ID badge */}
                  <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2">
                    <div className="flex items-center gap-1 bg-black/70 backdrop-blur-sm rounded-md px-1.5 py-0.5 sm:px-2 sm:py-1">
                      <PlatformIcon platform={playlist.platform} />
                      <span className="text-white text-[10px] sm:text-xs font-mono">#{playlist.id}</span>
                    </div>
                  </div>
                  {/* Status badge */}
                  <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2">
                    <Badge 
                      variant={playlist.isActive ? "default" : "secondary"} 
                      className="text-[10px] sm:text-xs px-1.5 py-0.5"
                    >
                      {playlist.isActive ? t('curator.playlists.active') : t('curator.playlists.hiddenStatus')}
                    </Badge>
                  </div>
                </div>
                
                {/* Card content */}
                <CardContent className="p-2.5 sm:p-3 space-y-1.5 sm:space-y-2">
                  {/* Playlist name */}
                  <h3 className="font-semibold text-xs sm:text-sm leading-tight line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem]">
                    {playlist.name}
                  </h3>
                  
                  {/* Genre badge */}
                  {playlist.genre && (
                    <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0.5 truncate max-w-full">
                      {playlist.genre}
                    </Badge>
                  )}

                  {/* Stats row */}
                  <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground pt-1 border-t border-border/50">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      {formatFollowers(playlist.followerCount)}
                    </span>
                    <span>{playlist.tracksCount || 0} {t('curator.playlists.tracks')}</span>
                  </div>

                  {/* Action buttons - smaller on mobile */}
                  <div className="flex items-center gap-1 pt-1">
                    {playlist.playlistUrl && (
                      <Button variant="outline" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0" asChild>
                        <a href={playlist.playlistUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </a>
                      </Button>
                    )}
                    {playlist.spotifyId && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 w-7 sm:h-8 sm:w-8 p-0 hidden sm:flex"
                        onClick={() => syncMutation.mutate(playlist.id)} 
                        disabled={syncMutation.isPending}
                      >
                        <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                      onClick={() => toggleVisibilityMutation.mutate(playlist.id)}
                      disabled={toggleVisibilityMutation.isPending}
                      title={playlist.isActive ? t('curator.playlists.hidePlaylist') : t('curator.playlists.showPlaylist')}
                    >
                      {playlist.isActive ? <EyeOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0" onClick={() => handleEdit(playlist)}>
                      <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7 w-7 sm:h-8 sm:w-8 p-0">
                          <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('curator.playlists.deleteConfirm')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('curator.playlists.deleteDescription')}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(playlist.id)} className="bg-destructive text-destructive-foreground">
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <ListMusic className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">{t('curator.playlists.noPlaylists')}</h3>
              <p className="text-muted-foreground mb-4">{t('curator.playlists.noPlaylistsDescription')}</p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('curator.playlists.addFirst')}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
