import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2, Newspaper, Loader2, Upload, X, FileText, Image as ImageIcon, Youtube } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import PromotionalBannersTab from "./promotional-banners-tab";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlatformNewsItem {
  id: string;
  titleEn: string;
  titleUk: string;
  titlePl: string;
  contentEn: string;
  contentUk: string;
  contentPl: string;
  images: string[];
  youtubeUrl: string | null;
  pdfFileId: string | null;
  targetAudience: "ALL" | "ARTIST" | "CURATOR";
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}

interface NewsFormData {
  titleEn: string;
  titleUk: string;
  titlePl: string;
  contentEn: string;
  contentUk: string;
  contentPl: string;
  images: string[];
  youtubeUrl: string;
  pdfFileId: string;
  targetAudience: "ALL" | "ARTIST" | "CURATOR";
  isPublished: boolean;
}

const emptyFormData: NewsFormData = {
  titleEn: "",
  titleUk: "",
  titlePl: "",
  contentEn: "",
  contentUk: "",
  contentPl: "",
  images: [],
  youtubeUrl: "",
  pdfFileId: "",
  targetAudience: "ALL",
  isPublished: true,
};

function RichTextEditor({ content, onChange, placeholder }: { content: string; onChange: (val: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
    ],
    content,
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-invert max-w-none focus:outline-none min-h-[120px] p-3 [&_strong]:text-inherit [&_em]:text-inherit [&_u]:text-inherit [&_s]:text-inherit',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) {
    return <div className="h-[150px] border rounded-md animate-pulse bg-muted" />;
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={cn("h-8 w-8 p-0", editor.isActive('bold') && "bg-accent text-accent-foreground")}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={cn("h-8 w-8 p-0", editor.isActive('italic') && "bg-accent text-accent-foreground")}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={cn("h-8 w-8 p-0", editor.isActive('underline') && "bg-accent text-accent-foreground")}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={cn("h-8 w-8 p-0", editor.isActive('strike') && "bg-accent text-accent-foreground")}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function FileDropZone({ 
  onFilesSelected, 
  accept, 
  maxFiles = 5,
  currentCount = 0,
  label,
  icon: Icon
}: { 
  onFilesSelected: (files: File[]) => void; 
  accept: string;
  maxFiles?: number;
  currentCount?: number;
  label: string;
  icon: React.ElementType;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const remaining = maxFiles - currentCount;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).slice(0, remaining);
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected, remaining]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, remaining);
    if (files.length > 0) {
      onFilesSelected(files);
    }
    e.target.value = '';
  };

  if (remaining <= 0 && maxFiles > 1) {
    return null;
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
      )}
      onClick={() => document.getElementById(`file-input-${label}`)?.click()}
    >
      <Icon className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">
        {maxFiles > 1 ? `Drag & drop or click (${remaining} remaining)` : 'Drag & drop or click'}
      </p>
      <input
        id={`file-input-${label}`}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}

export default function NewsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<PlatformNewsItem | null>(null);
  const [formData, setFormData] = useState<NewsFormData>(emptyFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const { data: news = [], isLoading } = useQuery<PlatformNewsItem[]>({
    queryKey: ["/api/admin/platform-news"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: NewsFormData) => {
      const response = await apiRequest("POST", "/api/admin/platform-news", {
        ...data,
        youtubeUrl: data.youtubeUrl || null,
        pdfFileId: data.pdfFileId || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-news"] });
      toast({ title: "Новину створено" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Не вдалося створити новину", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: NewsFormData }) => {
      const response = await apiRequest("PATCH", `/api/admin/platform-news/${id}`, {
        ...data,
        youtubeUrl: data.youtubeUrl || null,
        pdfFileId: data.pdfFileId || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-news"] });
      toast({ title: "Новину оновлено" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Не вдалося оновити новину", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/platform-news/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-news"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-news"] });
      toast({ title: "Новину видалено" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Не вдалося видалити новину", variant: "destructive" });
    },
  });

  const uploadFile = async (file: File): Promise<{ fileId: string; downloadUrl: string } | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/admin/platform-news/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Upload failed');
      return await response.json();
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Помилка завантаження файлу", variant: "destructive" });
      return null;
    }
  };

  const handleImagesUpload = async (files: File[]) => {
    setUploadingImages(true);
    const newImageIds: string[] = [];
    
    for (const file of files) {
      if (formData.images.length + newImageIds.length >= 5) break;
      const result = await uploadFile(file);
      if (result) {
        newImageIds.push(result.fileId);
      }
    }
    
    setFormData(prev => ({ ...prev, images: [...prev.images, ...newImageIds] }));
    setUploadingImages(false);
    
    if (newImageIds.length > 0) {
      toast({ title: `Завантажено ${newImageIds.length} фото` });
    }
  };

  const handlePdfUpload = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingPdf(true);
    
    const result = await uploadFile(files[0]);
    if (result) {
      setFormData(prev => ({ ...prev, pdfFileId: result.fileId }));
      toast({ title: "PDF документ завантажено" });
    }
    
    setUploadingPdf(false);
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const removePdf = () => {
    setFormData(prev => ({ ...prev, pdfFileId: "" }));
  };

  const handleOpenDialog = (newsItem?: PlatformNewsItem) => {
    if (newsItem) {
      setEditingNews(newsItem);
      setFormData({
        titleEn: newsItem.titleEn,
        titleUk: newsItem.titleUk,
        titlePl: newsItem.titlePl,
        contentEn: newsItem.contentEn,
        contentUk: newsItem.contentUk,
        contentPl: newsItem.contentPl,
        images: newsItem.images || [],
        youtubeUrl: newsItem.youtubeUrl || "",
        pdfFileId: newsItem.pdfFileId || "",
        targetAudience: newsItem.targetAudience || "ALL",
        isPublished: newsItem.isPublished,
      });
    } else {
      setEditingNews(null);
      setFormData(emptyFormData);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingNews(null);
    setFormData(emptyFormData);
  };

  const handleSubmit = () => {
    if (!formData.titleEn || !formData.titleUk || !formData.titlePl) {
      toast({ title: "Заповніть заголовки для всіх мов", variant: "destructive" });
      return;
    }
    if (!formData.contentEn || !formData.contentUk || !formData.contentPl) {
      toast({ title: "Заповніть контент для всіх мов", variant: "destructive" });
      return;
    }

    if (editingNews) {
      updateMutation.mutate({ id: editingNews.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PromotionalBannersTab />

      <div className="border-t pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Newspaper className="h-6 w-6" />
            <h2 className="text-xl font-semibold">Новини платформи</h2>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Додати новину
          </Button>
        </div>
      </div>

      {news.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Newspaper className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Новин поки немає</h3>
            <p className="text-muted-foreground mb-4">
              Створіть першу новину для відображення на дашборді користувачів
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Створити новину
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {news.map((item) => (
            <Card key={item.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <CardTitle className="text-base truncate">{item.titleUk}</CardTitle>
                      <Badge variant={item.isPublished ? "default" : "secondary"}>
                        {item.isPublished ? "Опубліковано" : "Чернетка"}
                      </Badge>
                      <Badge variant="outline" className={cn(
                        item.targetAudience === "CURATOR" && "border-purple-500 text-purple-500",
                        item.targetAudience === "ARTIST" && "border-blue-500 text-blue-500",
                        item.targetAudience === "ALL" && "border-green-500 text-green-500"
                      )}>
                        {item.targetAudience === "CURATOR" && "🎧 Куратори"}
                        {item.targetAudience === "ARTIST" && "🎤 Артисти"}
                        {item.targetAudience === "ALL" && "👥 Всі"}
                      </Badge>
                      {(item.images?.length > 0) && (
                        <Badge variant="outline" className="gap-1">
                          <ImageIcon className="h-3 w-3" /> {item.images.length}
                        </Badge>
                      )}
                      {item.youtubeUrl && (
                        <Badge variant="outline" className="gap-1">
                          <Youtube className="h-3 w-3" />
                        </Badge>
                      )}
                      {item.pdfFileId && (
                        <Badge variant="outline" className="gap-1">
                          <FileText className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.publishedAt 
                        ? `Опубліковано: ${format(new Date(item.publishedAt), 'dd.MM.yyyy HH:mm')}`
                        : `Створено: ${format(new Date(item.createdAt), 'dd.MM.yyyy HH:mm')}`
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div 
                  className="text-sm text-muted-foreground line-clamp-2"
                  dangerouslySetInnerHTML={{ __html: item.contentUk }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingNews ? "Редагувати новину" : "Створити новину"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="uk" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="uk">Українська</TabsTrigger>
              <TabsTrigger value="en">English</TabsTrigger>
              <TabsTrigger value="pl">Polski</TabsTrigger>
            </TabsList>

            <TabsContent value="uk" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Заголовок</Label>
                <Input
                  value={formData.titleUk}
                  onChange={(e) => setFormData({ ...formData, titleUk: e.target.value })}
                  placeholder="Заголовок новини"
                />
              </div>
              <div className="space-y-2">
                <Label>Контент</Label>
                <RichTextEditor
                  content={formData.contentUk}
                  onChange={(val) => setFormData({ ...formData, contentUk: val })}
                  placeholder="Текст новини..."
                />
              </div>
            </TabsContent>

            <TabsContent value="en" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={formData.titleEn}
                  onChange={(e) => setFormData({ ...formData, titleEn: e.target.value })}
                  placeholder="News title"
                />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <RichTextEditor
                  content={formData.contentEn}
                  onChange={(val) => setFormData({ ...formData, contentEn: val })}
                  placeholder="News content..."
                />
              </div>
            </TabsContent>

            <TabsContent value="pl" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Tytuł</Label>
                <Input
                  value={formData.titlePl}
                  onChange={(e) => setFormData({ ...formData, titlePl: e.target.value })}
                  placeholder="Tytuł wiadomości"
                />
              </div>
              <div className="space-y-2">
                <Label>Treść</Label>
                <RichTextEditor
                  content={formData.contentPl}
                  onChange={(val) => setFormData({ ...formData, contentPl: val })}
                  placeholder="Treść wiadomości..."
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="space-y-4 mt-4 pt-4 border-t">
            <Label className="text-base font-semibold">Медіа</Label>
            
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" /> Фото (до 5)
              </Label>
              {formData.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.images.map((imageId, index) => (
                    <div key={imageId} className="relative group">
                      <img
                        src={`/api/files/download/${imageId}`}
                        alt={`Image ${index + 1}`}
                        className="w-20 h-20 object-cover rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {uploadingImages ? (
                <div className="flex items-center gap-2 p-4 border rounded-lg">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Завантаження...</span>
                </div>
              ) : (
                <FileDropZone
                  onFilesSelected={handleImagesUpload}
                  accept="image/jpeg,image/png,image/webp"
                  maxFiles={5}
                  currentCount={formData.images.length}
                  label="Завантажити фото"
                  icon={ImageIcon}
                />
              )}
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Youtube className="h-4 w-4" /> YouTube відео
              </Label>
              <Input
                value={formData.youtubeUrl}
                onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4" /> PDF документ
              </Label>
              {formData.pdfFileId ? (
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
                  <FileText className="h-5 w-5 text-red-500" />
                  <span className="flex-1 text-sm">PDF документ завантажено</span>
                  <Button variant="ghost" size="sm" onClick={removePdf}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : uploadingPdf ? (
                <div className="flex items-center gap-2 p-4 border rounded-lg">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Завантаження...</span>
                </div>
              ) : (
                <FileDropZone
                  onFilesSelected={handlePdfUpload}
                  accept="application/pdf"
                  maxFiles={1}
                  label="Завантажити PDF"
                  icon={FileText}
                />
              )}
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Label>Цільова аудиторія</Label>
            <Select
              value={formData.targetAudience}
              onValueChange={(value: "ALL" | "ARTIST" | "CURATOR") => setFormData({ ...formData, targetAudience: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">👥 Всі користувачі</SelectItem>
                <SelectItem value="ARTIST">🎤 Артисти та лейбли</SelectItem>
                <SelectItem value="CURATOR">🎧 Куратори плейлистів</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 mt-4">
            <Switch
              checked={formData.isPublished}
              onCheckedChange={(checked) => setFormData({ ...formData, isPublished: checked })}
            />
            <Label>Опублікувати одразу</Label>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={handleCloseDialog}>
              Скасувати
            </Button>
            <Button onClick={handleSubmit} disabled={isPending || uploadingImages || uploadingPdf}>
              {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingNews ? "Зберегти" : "Створити"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Видалити новину</DialogTitle>
          </DialogHeader>
          <p className="py-4">Ви впевнені, що хочете видалити цю новину? Цю дію неможливо скасувати.</p>
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
