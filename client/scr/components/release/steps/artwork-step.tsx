import { Card, CardContent } from "@/components/ui/card";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { ReleaseFormData } from "@/lib/types";
import { Image as ImageIcon } from "lucide-react";

interface ArtworkStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

export default function ArtworkStep({ formData, updateFormData }: ArtworkStepProps) {
  const handleArtworkUpload = (url: string, fileId?: string) => {
    updateFormData({ 
      artworkUrl: url,
      artworkFileId: fileId 
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Додайте обкладинку</h3>
        <p className="text-sm text-muted-foreground">
          Завантажте обкладинку розміром 3000x3000 пікселів
        </p>
      </div>

      {formData.artworkUrl ? (
        // Preview loaded artwork
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-4">
              <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                <img 
                  src={formData.artworkUrl} 
                  alt="Обкладинка релізу" 
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1">
                <p className="font-medium">Обкладинка завантажена</p>
                <p className="text-sm text-muted-foreground">3000x3000 пікселів</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Upload area
        <ObjectUploader
          onUploadComplete={handleArtworkUpload}
          accept="image/jpeg,image/png,image/jpg"
          maxSize={10 * 1024 * 1024} // 10MB
          fileType="image"
          className="min-h-[200px]"
        >
          <div className="text-center">
            <h4 className="font-medium mb-2">Додайте обкладинку</h4>
            <p className="text-sm text-muted-foreground">
              Перетягніть файл сюди або натисніть для вибору
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              JPG, PNG до 10MB
            </p>
          </div>
        </ObjectUploader>
      )}

      {/* Requirements */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Вимоги до обкладинки</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h5 className="font-medium mb-2">Технічні вимоги</h5>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Точно 3000×3000 пікселів</li>
                  <li>• Формат JPG або PNG</li>
                  <li>• Колірна модель RGB</li>
                  <li>• Максимум 10MB</li>
                </ul>
              </div>
              <div>
                <h5 className="font-medium mb-2">Рекомендації</h5>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Без логотипів стрімінгових сервісів</li>
                  <li>• Без URL або контактної інформації</li>
                  <li>• Без авторських матеріалів без дозволу</li>
                  <li>• Високий контраст і читабельність</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}