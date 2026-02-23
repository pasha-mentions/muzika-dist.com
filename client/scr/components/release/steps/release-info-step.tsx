import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { uk } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ReleaseFormData } from "@/lib/types";

interface ReleaseInfoStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

export default function ReleaseInfoStep({ formData, updateFormData }: ReleaseInfoStepProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const currentOrgId = user?.organizations?.[0]?.id;

  const { data: artists, isLoading } = useQuery({
    queryKey: ["/api/organizations", currentOrgId, "artists"],
    enabled: !!currentOrgId,
    retry: false,
  });

  const generateUpcMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/generate-upc");
      return response.json();
    },
    onSuccess: (data) => {
      updateFormData({ upc: data.upc });
      toast({
        title: "UPC згенеровано",
        description: `Новий UPC код: ${data.upc}`,
      });
    },
    onError: (error) => {
      console.error("Error generating UPC:", error);
      toast({
        title: "Помилка",
        description: "Не вдалося згенерувати UPC код",
        variant: "destructive",
      });
    },
  });

  const handleInputChange = (field: keyof ReleaseFormData, value: any) => {
    updateFormData({ [field]: value });
  };

  const handleDateSelect = (date: Date | undefined) => {
    updateFormData({ releaseDate: date || null });
    setIsCalendarOpen(false);
  };

  const genres = [
    "Electronic", "Pop", "Rock", "Hip Hop", "R&B", "Country", 
    "Jazz", "Classical", "Folk", "Reggae", "Blues", "Alternative",
    "Indie", "Dance", "House", "Techno", "Ambient", "World",
    "Christian", "Christian & Gospel", "Christian Metal", "Christian Pop",
    "Christian Rap", "Christian Rap/Hip-Hop", "Christian Rock",
    "New Wave", "Shoegazing", "Synthwave",
    "Поп", "Рок", "Електронна", "Хіп-хоп", "R&B", "Джаз",
    "Класична", "Фолк", "Блюз", "Альтернативна", "Інді"
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Інформація про альбом</h3>
        <p className="text-sm text-muted-foreground">
          Заповніть основні дані про ваш реліз
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основна інформація</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Назва альбому *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Введіть назву альбому"
                className="w-full"
                data-testid="input-release-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Тип релізу *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => handleInputChange('type', value)}
              >
                <SelectTrigger data-testid="select-release-type">
                  <SelectValue placeholder="Оберіть тип" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SINGLE">Сингл</SelectItem>
                  <SelectItem value="EP">EP</SelectItem>
                  <SelectItem value="ALBUM">Альбом</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="genre">Основний жанр *</Label>
              <Select
                value={formData.primaryGenre}
                onValueChange={(value) => handleInputChange('primaryGenre', value)}
              >
                <SelectTrigger data-testid="select-genre">
                  <SelectValue placeholder="Оберіть жанр" />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre} value={genre}>
                      {genre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Дата релізу *</Label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !formData.releaseDate && "text-muted-foreground"
                    )}
                    data-testid="button-select-date"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.releaseDate ? (
                      format(formData.releaseDate, "d MMMM yyyy", { locale: uk })
                    ) : (
                      "Оберіть дату"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.releaseDate || undefined}
                    onSelect={handleDateSelect}
                    disabled={(date) =>
                      date < new Date() || date < new Date("1900-01-01")
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">UPC код</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="upc">UPC код *</Label>
              <Input
                id="upc"
                value={formData.upc}
                onChange={(e) => handleInputChange('upc', e.target.value)}
                placeholder="Введіть UPC код або згенеруйте новий"
                data-testid="input-upc"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => generateUpcMutation.mutate()}
                disabled={generateUpcMutation.isPending}
                data-testid="button-generate-upc"
              >
                {generateUpcMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Генерація...
                  </>
                ) : (
                  "Згенерувати UPC"
                )}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            UPC (Universal Product Code) - це унікальний код продукту, необхідний для дистрибуції
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Додаткова інформація</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="labelName">Назва лейблу</Label>
              <Input
                id="labelName"
                value={formData.labelName}
                onChange={(e) => handleInputChange('labelName', e.target.value)}
                placeholder="Введіть назву лейблу"
                data-testid="input-label-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pCopyright">Авторські права</Label>
              <Input
                id="pCopyright"
                value={formData.pCopyright}
                onChange={(e) => handleInputChange('pCopyright', e.target.value)}
                placeholder="© 2025 Your Label"
                data-testid="input-copyright"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}