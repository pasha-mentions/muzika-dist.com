import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Megaphone, Loader2, ExternalLink, Link as LinkIcon, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface PromotionalBanner {
  id: string;
  textEn: string;
  textUk: string;
  textPl: string;
  linkUrl: string;
  linkTarget: string;
  targetCountry: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

interface BannerFormData {
  textEn: string;
  textUk: string;
  textPl: string;
  linkUrl: string;
  linkTarget: string;
  targetCountry: string;
  displayOrder: number;
  isActive: boolean;
}

const emptyFormData: BannerFormData = {
  textEn: "",
  textUk: "",
  textPl: "",
  linkUrl: "",
  linkTarget: "_self",
  targetCountry: "UA",
  displayOrder: 0,
  isActive: true,
};

const COUNTRY_OPTIONS = [
  { value: "UA", label: "Україна" },
  { value: "PL", label: "Польща" },
  { value: "ALL", label: "Всі країни" },
];

const MAX_BANNER_LENGTH = 60;

export default function PromotionalBannersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PromotionalBanner | null>(null);
  const [formData, setFormData] = useState<BannerFormData>(emptyFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { data: banners = [], isLoading } = useQuery<PromotionalBanner[]>({
    queryKey: ["/api/admin/promotional-banners"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: BannerFormData) => {
      const response = await apiRequest("POST", "/api/admin/promotional-banners", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotional-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/promotional-banners"] });
      toast({ title: "Банер створено" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Не вдалося створити банер", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: BannerFormData }) => {
      const response = await apiRequest("PATCH", `/api/admin/promotional-banners/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotional-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/promotional-banners"] });
      toast({ title: "Банер оновлено" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Не вдалося оновити банер", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/promotional-banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotional-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/promotional-banners"] });
      toast({ title: "Банер видалено" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Не вдалося видалити банер", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/promotional-banners/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotional-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/promotional-banners"] });
    },
    onError: () => {
      toast({ title: "Не вдалося змінити статус", variant: "destructive" });
    },
  });

  const handleOpenDialog = (banner?: PromotionalBanner) => {
    if (banner) {
      setEditingBanner(banner);
      setFormData({
        textEn: banner.textEn,
        textUk: banner.textUk,
        textPl: banner.textPl,
        linkUrl: banner.linkUrl,
        linkTarget: banner.linkTarget || "_self",
        targetCountry: banner.targetCountry || "UA",
        displayOrder: banner.displayOrder,
        isActive: banner.isActive,
      });
    } else {
      setEditingBanner(null);
      setFormData({
        ...emptyFormData,
        displayOrder: banners.length,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingBanner(null);
    setFormData(emptyFormData);
  };

  const handleSubmit = () => {
    if (!formData.textEn || !formData.textUk || !formData.textPl) {
      toast({ title: "Заповніть текст для всіх мов", variant: "destructive" });
      return;
    }
    if (!formData.linkUrl) {
      toast({ title: "Вкажіть посилання", variant: "destructive" });
      return;
    }

    if (editingBanner) {
      updateMutation.mutate({ id: editingBanner.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Промо-банери</h3>
        </div>
        <Button size="sm" onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Додати
        </Button>
      </div>

      {banners.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <h4 className="font-semibold mb-1">Банерів поки немає</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Створіть перший промо-банер для відображення користувачам
            </p>
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Створити банер
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {banners.map((banner, index) => (
            <Card key={banner.id} className={!banner.isActive ? "opacity-60" : ""}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-xs font-mono w-4">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm" title={banner.textUk}>
                      {banner.textUk}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <LinkIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={banner.linkUrl}>
                        {banner.linkUrl}
                      </span>
                      {banner.linkTarget === "_blank" && (
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {COUNTRY_OPTIONS.find(c => c.value === banner.targetCountry)?.label || banner.targetCountry}
                  </Badge>
                  <Badge variant={banner.isActive ? "default" : "secondary"} className="text-xs">
                    {banner.isActive ? "Активний" : "Неактивний"}
                  </Badge>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={banner.isActive}
                      onCheckedChange={(checked) => 
                        toggleActiveMutation.mutate({ id: banner.id, isActive: checked })
                      }
                      className="scale-75"
                    />
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleOpenDialog(banner)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      onClick={() => setDeleteConfirmId(banner.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingBanner ? "Редагувати банер" : "Створити банер"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="uk" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="uk">Українська</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="pl">Polski</TabsTrigger>
            </TabsList>

            <TabsContent value="uk" className="mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Текст банера</Label>
                  <span className={`text-xs ${formData.textUk.length > MAX_BANNER_LENGTH ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {formData.textUk.length}/{MAX_BANNER_LENGTH}
                  </span>
                </div>
                <Input
                  value={formData.textUk}
                  onChange={(e) => setFormData({ ...formData, textUk: e.target.value.slice(0, MAX_BANNER_LENGTH) })}
                  placeholder="Наприклад: Доєднуйся до нашого ком'юніті в Telegram"
                  maxLength={MAX_BANNER_LENGTH}
                />
              </div>
            </TabsContent>

            <TabsContent value="en" className="mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Banner text</Label>
                  <span className={`text-xs ${formData.textEn.length > MAX_BANNER_LENGTH ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {formData.textEn.length}/{MAX_BANNER_LENGTH}
                  </span>
                </div>
                <Input
                  value={formData.textEn}
                  onChange={(e) => setFormData({ ...formData, textEn: e.target.value.slice(0, MAX_BANNER_LENGTH) })}
                  placeholder="Example: Join our community on Telegram"
                  maxLength={MAX_BANNER_LENGTH}
                />
              </div>
            </TabsContent>

            <TabsContent value="pl" className="mt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Tekst baneru</Label>
                  <span className={`text-xs ${formData.textPl.length > MAX_BANNER_LENGTH ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {formData.textPl.length}/{MAX_BANNER_LENGTH}
                  </span>
                </div>
                <Input
                  value={formData.textPl}
                  onChange={(e) => setFormData({ ...formData, textPl: e.target.value.slice(0, MAX_BANNER_LENGTH) })}
                  placeholder="Przykład: Dołącz do naszej społeczności na Telegramie"
                  maxLength={MAX_BANNER_LENGTH}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-4 mt-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Посилання</Label>
              <Input
                value={formData.linkUrl}
                onChange={(e) => setFormData({ ...formData, linkUrl: e.target.value })}
                placeholder="https://t.me/muzika_community"
              />
            </div>

            <div className="space-y-2">
              <Label>Країна</Label>
              <Select
                value={formData.targetCountry}
                onValueChange={(value) => setFormData({ ...formData, targetCountry: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Відкривати посилання</Label>
                <Select
                  value={formData.linkTarget}
                  onValueChange={(value) => setFormData({ ...formData, linkTarget: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_self">У цій вкладці</SelectItem>
                    <SelectItem value="_blank">У новій вкладці</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Порядок відображення</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label>Активний</Label>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={handleCloseDialog}>
              Скасувати
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingBanner ? "Зберегти" : "Створити"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Видалити банер</DialogTitle>
          </DialogHeader>
          <p className="py-4">Ви впевнені, що хочете видалити цей банер? Цю дію неможливо скасувати.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Скасувати
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Видалити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
