import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProxiedImageUrl } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Music, ExternalLink, Loader2, RefreshCw, Users, ListMusic, Eye, TrendingUp, Calendar } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PLAYLIST_GENRES } from "@/lib/constants";

interface LocalPlaylist {
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
  curatorOrgId: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

interface PlaylistCurator {
  id: string;
  name: string;
}

interface FollowerSnapshot {
  id: string;
  playlistId: number;
  followerCount: number;
  tracksCount: number;
  collectedAt: string;
}

const PLATFORMS = ["Spotify", "Youtube", "Apple Music"];

export function LocalPlaylistsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<LocalPlaylist | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    platform: "Spotify",
    genre: "",
    imageUrl: "",
    playlistUrl: "",
    curatorOrgId: "",
    isActive: true,
  });
  const [isFetchingSpotify, setIsFetchingSpotify] = useState(false);
  const [syncingPlaylistId, setSyncingPlaylistId] = useState<number | null>(null);
  const [viewingPlaylist, setViewingPlaylist] = useState<LocalPlaylist | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  const { data: followerHistory, isLoading: isLoadingHistory } = useQuery<FollowerSnapshot[]>({
    queryKey: ["/api/admin/local-playlists", viewingPlaylist?.id, "history"],
    queryFn: async () => {
      if (!viewingPlaylist) return [];
      const res = await fetch(`/api/admin/local-playlists/${viewingPlaylist.id}/history`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch history');
      return res.json();
    },
    enabled: !!viewingPlaylist && isViewDialogOpen,
  });

  const { data: playlists, isLoading } = useQuery<LocalPlaylist[]>({
    queryKey: ["/api/admin/local-playlists"],
  });

  const { data: curators } = useQuery<PlaylistCurator[]>({
    queryKey: ["/api/admin/playlist-curators"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/local-playlists", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-playlists"] });
      toast({ title: "Плейлист створено" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Помилка створення плейлиста", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PUT", `/api/admin/local-playlists/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-playlists"] });
      toast({ title: "Плейлист оновлено" });
      resetForm();
      setIsDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Помилка оновлення плейлиста", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/local-playlists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-playlists"] });
      toast({ title: "Плейлист видалено" });
    },
    onError: () => {
      toast({ title: "Помилка видалення плейлиста", variant: "destructive" });
    },
  });

  const fetchSpotifyData = async (url: string) => {
    if (!url || formData.platform !== 'Spotify') return;
    
    setIsFetchingSpotify(true);
    try {
      const res = await apiRequest("POST", "/api/admin/local-playlists/fetch-spotify", { url });
      const data = await res.json();
      
      setFormData(prev => ({
        ...prev,
        name: data.name || prev.name,
        description: data.description || prev.description,
      }));
      
      if (data.imageUrl) {
        setFormData(prev => ({ ...prev, imageUrl: data.imageUrl }));
      }
      
      toast({ title: "Дані з Spotify отримано" });
    } catch (error) {
      toast({ title: "Не вдалося отримати дані з Spotify", variant: "destructive" });
    }
    setIsFetchingSpotify(false);
  };

  const syncPlaylist = async (playlistId: number) => {
    setSyncingPlaylistId(playlistId);
    try {
      await apiRequest("POST", `/api/admin/local-playlists/${playlistId}/sync`);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/local-playlists"] });
      toast({ title: "Плейлист синхронізовано" });
    } catch (error) {
      toast({ title: "Помилка синхронізації", variant: "destructive" });
    }
    setSyncingPlaylistId(null);
  };

  const formatNumber = (num: number | null) => {
    if (num === null) return "-";
    return num.toLocaleString('uk-UA');
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      platform: "Spotify",
      genre: "",
      imageUrl: "",
      playlistUrl: "",
      curatorOrgId: "",
      isActive: true,
    });
    setEditingPlaylist(null);
  };

  const openEditDialog = (playlist: LocalPlaylist) => {
    setEditingPlaylist(playlist);
    setFormData({
      name: playlist.name,
      description: playlist.description || "",
      platform: playlist.platform,
      genre: playlist.genre || "",
      imageUrl: playlist.imageUrl || "",
      playlistUrl: playlist.playlistUrl || "",
      curatorOrgId: playlist.curatorOrgId || "",
      isActive: playlist.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      name: formData.name,
      description: formData.description || null,
      platform: formData.platform,
      genre: formData.genre || null,
      imageUrl: formData.imageUrl || null,
      playlistUrl: formData.playlistUrl || null,
      curatorOrgId: formData.curatorOrgId || null,
      isActive: formData.isActive,
    };

    if (editingPlaylist) {
      updateMutation.mutate({ id: editingPlaylist.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getCuratorName = (curatorOrgId: string | null) => {
    if (!curatorOrgId || !curators) return "-";
    const curator = curators.find(c => c.id === curatorOrgId);
    return curator?.name || "-";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Локальні плейлисти</h3>
          <p className="text-sm text-muted-foreground">
            Плейлисти для пітчингу від партнерів Muzika
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Додати плейлист
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPlaylist ? "Редагувати плейлист" : "Новий плейлист"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Назва *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Платформа *</Label>
                  <Select
                    value={formData.platform}
                    onValueChange={(value) => setFormData({ ...formData, platform: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Опис</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Жанр</Label>
                  <Select
                    value={formData.genre}
                    onValueChange={(value) => setFormData({ ...formData, genre: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть жанр" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAYLIST_GENRES.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Куратор</Label>
                  <Select
                    value={formData.curatorOrgId}
                    onValueChange={(value) => setFormData({ ...formData, curatorOrgId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Виберіть куратора" />
                    </SelectTrigger>
                    <SelectContent>
                      {curators && curators.length > 0 ? (
                        curators.map((curator) => (
                          <SelectItem key={curator.id} value={curator.id}>
                            {curator.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          Немає кураторів
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>URL плейлиста</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.playlistUrl}
                    onChange={(e) => setFormData({ ...formData, playlistUrl: e.target.value })}
                    placeholder="https://open.spotify.com/playlist/..."
                    className="flex-1"
                  />
                  {formData.platform === 'Spotify' && formData.playlistUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fetchSpotifyData(formData.playlistUrl)}
                      disabled={isFetchingSpotify}
                    >
                      {isFetchingSpotify ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      <span className="ml-2 hidden sm:inline">Завантажити з Spotify</span>
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label>Активний (видимий для користувачів)</Label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Скасувати
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editingPlaylist ? "Зберегти" : "Створити"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {playlists && playlists.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Плейлист</TableHead>
                <TableHead>Підписники</TableHead>
                <TableHead>Платформа</TableHead>
                <TableHead>Жанр</TableHead>
                <TableHead>Куратор</TableHead>
                <TableHead className="text-right">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {playlists.map((playlist) => (
                <TableRow key={playlist.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {playlist.imageUrl ? (
                        <img
                          src={getProxiedImageUrl(playlist.imageUrl)}
                          alt={playlist.name}
                          className="w-10 h-10 rounded object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <Music className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{playlist.name}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium">{formatNumber(playlist.followerCount)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{playlist.platform}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">{playlist.genre || "-"}</span>
                  </TableCell>
                  <TableCell>{getCuratorName(playlist.curatorOrgId)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Переглянути"
                        onClick={() => {
                          setViewingPlaylist(playlist);
                          setIsViewDialogOpen(true);
                        }}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {playlist.platform === 'Spotify' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => syncPlaylist(playlist.id)}
                          disabled={syncingPlaylistId === playlist.id}
                          title="Синхронізувати з Spotify"
                        >
                          {syncingPlaylistId === playlist.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(playlist)} title="Редагувати">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Видалити"
                        onClick={() => {
                          if (confirm("Видалити цей плейлист?")) {
                            deleteMutation.mutate(playlist.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Music className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Немає плейлистів</h3>
            <p className="text-muted-foreground mb-4">
              Додайте перший плейлист для пітчингу
            </p>
          </CardContent>
        </Card>
      )}

      {/* Playlist Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={(open) => {
        setIsViewDialogOpen(open);
        if (!open) setViewingPlaylist(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Деталі плейлиста</DialogTitle>
          </DialogHeader>
          
          {viewingPlaylist && (
            <div className="space-y-6">
              {/* Header with image and basic info */}
              <div className="flex gap-4">
                {viewingPlaylist.imageUrl ? (
                  <img
                    src={getProxiedImageUrl(viewingPlaylist.imageUrl)}
                    alt={viewingPlaylist.name}
                    className="w-32 h-32 rounded-lg object-cover shadow-md"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-lg bg-muted flex items-center justify-center">
                    <Music className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <h3 className="text-xl font-semibold">{viewingPlaylist.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{viewingPlaylist.platform}</Badge>
                    {viewingPlaylist.genre && (
                      <Badge variant="secondary">{viewingPlaylist.genre}</Badge>
                    )}
                    <Badge variant={viewingPlaylist.isActive ? "default" : "secondary"}>
                      {viewingPlaylist.isActive ? "Активний" : "Прихований"}
                    </Badge>
                  </div>
                  {viewingPlaylist.playlistUrl && (
                    <a
                      href={viewingPlaylist.playlistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Відкрити на {viewingPlaylist.platform}
                    </a>
                  )}
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Users className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{formatNumber(viewingPlaylist.followerCount)}</p>
                    <p className="text-xs text-muted-foreground">Підписників</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <ListMusic className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-2xl font-bold">{formatNumber(viewingPlaylist.tracksCount)}</p>
                    <p className="text-xs text-muted-foreground">Треків</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <Calendar className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">
                      {viewingPlaylist.lastSyncedAt 
                        ? format(new Date(viewingPlaylist.lastSyncedAt), "dd.MM.yyyy", { locale: uk })
                        : "-"
                      }
                    </p>
                    <p className="text-xs text-muted-foreground">Остання синхронізація</p>
                  </CardContent>
                </Card>
              </div>

              {/* Description */}
              {viewingPlaylist.description && (
                <div>
                  <h4 className="text-sm font-medium mb-2">Опис</h4>
                  <p className="text-sm text-muted-foreground">{viewingPlaylist.description}</p>
                </div>
              )}

              {/* Curator */}
              {viewingPlaylist.curatorOrgId && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Куратор</h4>
                  <p className="text-sm text-muted-foreground">{getCuratorName(viewingPlaylist.curatorOrgId)}</p>
                </div>
              )}

              {/* Follower Growth Chart */}
              <div>
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Динаміка підписників
                </h4>
                {isLoadingHistory ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : followerHistory && followerHistory.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={followerHistory.map(snapshot => ({
                          date: format(new Date(snapshot.collectedAt), "dd.MM", { locale: uk }),
                          followers: snapshot.followerCount,
                        }))}
                        margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                        />
                        <YAxis 
                          tick={{ fontSize: 12 }}
                          className="text-muted-foreground"
                          tickFormatter={(value) => formatNumber(value)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number) => [formatNumber(value), 'Підписників']}
                        />
                        <Line
                          type="monotone"
                          dataKey="followers"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                          activeDot={{ r: 6, stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-48 flex items-center justify-center border rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      Недостатньо даних для відображення графіка
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
