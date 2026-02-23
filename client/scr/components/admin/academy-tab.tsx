import { useState, useRef, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Upload, FileText, PlayCircle, Image } from "lucide-react";

const RichTextEditor = lazy(() => import("./rich-text-editor"));

interface AcademyCourse {
  id: string;
  title: string;
  description: string | null;
  category: string;
  type: string;
  status: "DRAFT" | "PUBLISHED";
  price: number;
  isFree: boolean;
  contentHtml: string | null;
  readingTime: number | null;
  videoDuration: number | null;
  coverImageFileId: string | null;
  videoFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CourseFormData {
  title: string;
  description: string;
  category: string;
  type: string;
  isFree: boolean;
  price: number;
  readingTime: number;
  videoDuration: number;
  contentHtml: string;
  status: "DRAFT" | "PUBLISHED";
}

const CATEGORIES = ["MARKETING", "DISTRIBUTION", "FINANCE", "LEGAL", "PRODUCTION", "SOCIAL_MEDIA"];
const TYPES = ["ARTICLE", "VIDEO"];

const emptyFormData: CourseFormData = {
  title: "",
  description: "",
  category: "MARKETING",
  type: "ARTICLE",
  isFree: true,
  price: 0,
  readingTime: 0,
  videoDuration: 0,
  contentHtml: "",
  status: "DRAFT",
};

export default function AcademyTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<AcademyCourse | null>(null);
  const [formData, setFormData] = useState<CourseFormData>(emptyFormData);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const { data: courses = [], isLoading } = useQuery<AcademyCourse[]>({
    queryKey: ["/api/admin/academy/courses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/academy/courses");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CourseFormData) => {
      const body: any = {
        title: data.title,
        description: data.description || null,
        category: data.category,
        type: data.type,
        isFree: data.isFree,
        price: data.isFree ? 0 : Math.round(data.price * 100),
        contentHtml: data.contentHtml || null,
        readingTime: data.type === "ARTICLE" ? (data.readingTime || null) : null,
        videoDuration: data.type === "VIDEO" ? (data.videoDuration || null) : null,
      };
      const response = await apiRequest("POST", "/api/admin/academy/courses", body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      toast({ title: "Курс створено" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Не вдалося створити курс", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CourseFormData }) => {
      const body: any = {
        title: data.title,
        description: data.description || null,
        category: data.category,
        type: data.type,
        isFree: data.isFree,
        price: data.isFree ? 0 : Math.round(data.price * 100),
        contentHtml: data.contentHtml || null,
        readingTime: data.type === "ARTICLE" ? (data.readingTime || null) : null,
        videoDuration: data.type === "VIDEO" ? (data.videoDuration || null) : null,
        status: data.status,
      };
      const response = await apiRequest("PUT", `/api/admin/academy/courses/${id}`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      toast({ title: "Курс оновлено" });
      handleCloseDialog();
    },
    onError: () => {
      toast({ title: "Не вдалося оновити курс", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/academy/courses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      toast({ title: "Курс видалено" });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ title: "Не вдалося видалити курс", variant: "destructive" });
    },
  });

  const handleCoverUpload = async (file: File) => {
    if (!editingCourse) return;
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch(`/api/admin/academy/courses/${editingCourse.id}/cover`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      toast({ title: "Обкладинку завантажено" });
    } catch {
      toast({ title: "Не вдалося завантажити обкладинку", variant: "destructive" });
    } finally {
      setUploadingCover(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!editingCourse) return;
    setUploadingVideo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const response = await fetch(`/api/admin/academy/courses/${editingCourse.id}/video`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/academy/courses"] });
      toast({ title: "Відео завантажено" });
    } catch {
      toast({ title: "Не вдалося завантажити відео", variant: "destructive" });
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleOpenDialog = (course?: AcademyCourse) => {
    if (course) {
      setEditingCourse(course);
      setFormData({
        title: course.title,
        description: course.description || "",
        category: course.category,
        type: course.type,
        isFree: course.isFree,
        price: course.price / 100,
        readingTime: course.readingTime || 0,
        videoDuration: course.videoDuration || 0,
        contentHtml: course.contentHtml || "",
        status: course.status,
      });
    } else {
      setEditingCourse(null);
      setFormData(emptyFormData);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCourse(null);
    setFormData(emptyFormData);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast({ title: "Введіть назву курсу", variant: "destructive" });
      return;
    }
    if (editingCourse) {
      updateMutation.mutate({ id: editingCourse.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const formatPrice = (priceInKopecks: number, isFree: boolean) => {
    if (isFree) return "Безкоштовно";
    return `${(priceInKopecks / 100).toFixed(2)} ₴`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h2 className="text-xl font-semibold">Академія</h2>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Додати курс
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Курсів поки немає</h3>
          <p className="text-muted-foreground mb-4">Створіть перший курс для академії</p>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Створити курс
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Назва</TableHead>
                <TableHead>Категорія</TableHead>
                <TableHead>Тип</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Ціна</TableHead>
                <TableHead className="text-right">Дії</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell className="font-medium">{course.title}</TableCell>
                  <TableCell>{course.category}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {course.type === "VIDEO" ? (
                        <PlayCircle className="h-4 w-4" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      {course.type}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        course.status === "PUBLISHED"
                          ? "border-green-500 text-green-500"
                          : "border-yellow-500 text-yellow-500"
                      }
                    >
                      {course.status === "PUBLISHED" ? "Опубліковано" : "Чернетка"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPrice(course.price, course.isFree)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(course)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(course.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCourse ? "Редагувати курс" : "Створити курс"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Назва *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Назва курсу"
              />
            </div>

            <div className="space-y-2">
              <Label>Опис</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Опис курсу"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Категорія</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Тип</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={formData.isFree}
                onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked })}
              />
              <Label>Безкоштовний</Label>
            </div>

            {!formData.isFree && (
              <div className="space-y-2">
                <Label>Ціна (₴)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            )}

            {formData.type === "ARTICLE" && (
              <div className="space-y-2">
                <Label>Час читання (хвилини)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.readingTime}
                  onChange={(e) => setFormData({ ...formData, readingTime: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            {formData.type === "VIDEO" && (
              <div className="space-y-2">
                <Label>Тривалість відео (секунди)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.videoDuration}
                  onChange={(e) => setFormData({ ...formData, videoDuration: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Контент</Label>
              <Suspense fallback={<div className="h-[300px] border rounded-lg animate-pulse bg-muted/30" />}>
                <RichTextEditor
                  content={formData.contentHtml}
                  onChange={(html) => setFormData({ ...formData, contentHtml: html })}
                  courseId={editingCourse?.id}
                  placeholder="Почніть писати контент курсу..."
                />
              </Suspense>
              {!editingCourse && (
                <p className="text-xs text-muted-foreground">
                  Збережіть курс, щоб мати змогу завантажувати зображення в текст
                </p>
              )}
            </div>

            {editingCourse && (
              <div className="space-y-4 border-t pt-4">
                <div className="space-y-2">
                  <Label>Обкладинка</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploadingCover}
                      onClick={() => coverInputRef.current?.click()}
                    >
                      <Image className="h-4 w-4 mr-2" />
                      {uploadingCover ? "Завантаження..." : "Завантажити обкладинку"}
                    </Button>
                    {editingCourse.coverImageFileId && (
                      <Badge variant="outline" className="gap-1">
                        <Image className="h-3 w-3" />
                        Завантажено
                      </Badge>
                    )}
                  </div>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleCoverUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>

                {formData.type === "VIDEO" && (
                  <div className="space-y-2">
                    <Label>Відео файл</Label>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadingVideo}
                        onClick={() => videoInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {uploadingVideo ? "Завантаження..." : "Завантажити відео"}
                      </Button>
                      {editingCourse.videoFileId && (
                        <Badge variant="outline" className="gap-1">
                          <PlayCircle className="h-3 w-3" />
                          Завантажено
                        </Badge>
                      )}
                    </div>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleVideoUpload(file);
                        e.target.value = "";
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {editingCourse && (
              <div className="flex items-center gap-3 border-t pt-4">
                <Switch
                  checked={formData.status === "PUBLISHED"}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, status: checked ? "PUBLISHED" : "DRAFT" })
                  }
                />
                <Label>
                  {formData.status === "PUBLISHED" ? "Опубліковано" : "Чернетка"}
                </Label>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={handleCloseDialog}>
              Скасувати
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Видалити курс?</AlertDialogTitle>
            <AlertDialogDescription>
              Цю дію неможливо скасувати. Курс буде видалено назавжди.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Видалення..." : "Видалити"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}