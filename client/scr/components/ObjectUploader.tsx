import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, Music, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept: string;
  maxSize: number;
  children: ReactNode;
  className?: string;
  fileType: "image" | "audio";
}

export function FileUpload({
  onFileSelect,
  accept,
  maxSize,
  children,
  className = "",
  fileType
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  const validateFile = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      if (file.size > maxSize) {
        toast({
          title: "Файл занадто великий",
          description: `Максимальний розмір файлу: ${Math.round(maxSize / (1024 * 1024))}MB`,
          variant: "destructive",
        });
        resolve(false);
        return;
      }

      if (fileType === "image") {
        const img = new Image();
        img.onload = () => {
          if (img.width !== 3000 || img.height !== 3000) {
            toast({
              title: "Невірний розмір зображення",
              description: "Необхідний розмір обкладинки мін. 3000x3000 пікселів\nНеобхідне співвідношення сторін у зображення 1:1",
              variant: "destructive",
            });
            resolve(false);
          } else {
            resolve(true);
          }
        };
        img.onerror = () => {
          toast({
            title: "Помилка",
            description: "Не вдалося завантажити зображення",
            variant: "destructive",
          });
          resolve(false);
        };
        img.src = URL.createObjectURL(file);
      } else if (fileType === "audio") {
        const validFormats = [".wav"];
        const fileName = file.name.toLowerCase();
        const isValidFormat = validFormats.some(format => fileName.endsWith(format));
        
        if (!isValidFormat) {
          toast({
            title: "Невірний формат аудіо",
            description: "Підтримується тільки формат WAV",
            variant: "destructive",
          });
          resolve(false);
        } else {
          resolve(true);
        }
      } else {
        resolve(true);
      }
    });
  };

  const handleFileSelect = async (file: File) => {
    const isValid = await validateFile(file);
    if (isValid) {
      onFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <Card 
      className={`relative border-2 border-dashed transition-colors cursor-pointer ${
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      } ${className}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => document.getElementById(`file-input-${fileType}`)?.click()}
      data-testid={`upload-area-${fileType}`}
    >
      <CardContent className="flex flex-col items-center justify-center p-8 text-center">
        {fileType === "image" ? (
          <ImageIcon className="w-12 h-12 text-muted-foreground mb-4" />
        ) : (
          <Music className="w-12 h-12 text-muted-foreground mb-4" />
        )}
        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
        {children}
        <input
          id={`file-input-${fileType}`}
          type="file"
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
          data-testid={`file-input-${fileType}`}
        />
      </CardContent>
    </Card>
  );
}

interface ObjectUploaderProps {
  onUploadComplete: (url: string, fileId?: string) => void;
  accept: string;
  maxSize: number;
  fileType: "image" | "audio";
  children: ReactNode;
  className?: string;
}

export function ObjectUploader({
  onUploadComplete,
  accept,
  maxSize,
  fileType,
  children,
  className
}: ObjectUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      // Завантажуємо файл на Google Drive через наш сервер
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to upload file");
      }

      const data = await response.json();
      
      // Передаємо downloadUrl та fileId
      onUploadComplete(data.downloadUrl, data.fileId);
      setSelectedFile(null);

      toast({
        title: "Файл завантажено",
        description: "Файл успішно завантажено на Google Drive",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Помилка завантаження",
        description: "Не вдалося завантажити файл",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  if (selectedFile) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {fileType === "image" ? (
                <ImageIcon className="w-8 h-8 text-muted-foreground" />
              ) : (
                <Music className="w-8 h-8 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {Math.round(selectedFile.size / (1024 * 1024) * 100) / 100} MB
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                size="sm"
                data-testid="button-upload"
              >
                {isUploading ? "Завантаження..." : "Завантажити"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveFile}
                data-testid="button-remove-file"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <FileUpload
      onFileSelect={handleFileSelect}
      accept={accept}
      maxSize={maxSize}
      fileType={fileType}
      className={className}
    >
      {children}
    </FileUpload>
  );
}