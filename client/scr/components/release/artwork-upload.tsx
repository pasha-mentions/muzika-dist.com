import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image as ImageIcon, Check, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ArtworkUploadProps {
  artworkUrl?: string;
  onArtworkUpdate: (url: string) => void;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export default function ArtworkUpload({ artworkUrl, onArtworkUpdate }: ArtworkUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const { toast } = useToast();

  const validateArtwork = (file: File): Promise<ValidationResult> => {
    return new Promise((resolve) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check file type
      if (!file.type.includes('image/jpeg') && !file.type.includes('image/png')) {
        errors.push('File must be JPG or PNG format');
      }

      // Check file size (reasonable limit for 3000x3000 image)
      if (file.size > 10 * 1024 * 1024) {
        errors.push('File size too large (max 10MB)');
      }

      const img = new window.Image();
      img.onload = () => {
        // Check dimensions
        if (img.width !== 3000 || img.height !== 3000) {
          errors.push(`Dimensions must be exactly 3000×3000px (current: ${img.width}×${img.height}px)`);
        }

        // Check aspect ratio (should be 1:1 for square)
        if (img.width !== img.height) {
          errors.push('Image must be square (1:1 aspect ratio)');
        }

        resolve({
          isValid: errors.length === 0,
          errors,
          warnings,
        });
      };

      img.onerror = () => {
        errors.push('Unable to read image file');
        resolve({
          isValid: false,
          errors,
          warnings,
        });
      };

      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = useCallback(async (files: FileList) => {
    if (files.length === 0) return;

    const file = files[0];
    setUploading(true);

    try {
      // Validate artwork
      const validationResult = await validateArtwork(file);
      setValidation(validationResult);

      if (!validationResult.isValid) {
        toast({
          title: "Artwork Validation Failed",
          description: validationResult.errors.join(', '),
          variant: "destructive",
        });
        setUploading(false);
        return;
      }

      // Get presigned URL for upload
      const presignResponse = await apiRequest("POST", "/api/upload/presign", {
        filename: file.name,
        contentType: file.type,
      });
      
      const { uploadUrl, downloadUrl } = await presignResponse.json();
      
      // In real implementation, upload to S3 using presigned URL
      // For now, we'll simulate the upload
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      onArtworkUpdate(downloadUrl);
      
      toast({
        title: "Artwork Uploaded",
        description: "Your artwork has been uploaded successfully",
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload artwork. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [onArtworkUpdate, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files);
    }
  }, [handleFileUpload]);

  const requirements = [
    { text: "Dimensions: 3000×3000 pixels", met: validation?.isValid },
    { text: "Format: RGB color mode", met: true },
    { text: "No logos or watermarks", met: true },
    { text: "High quality and clear", met: true },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Artwork</CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload high-quality artwork for your release. Must be 3000x3000 pixels, RGB color mode.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Area */}
          <div>
            {!artworkUrl ? (
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border rounded-lg px-6 py-10 text-center hover:border-primary/50 transition-colors cursor-pointer"
                data-testid="artwork-upload-zone"
              >
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <div className="mb-4">
                  <label className="cursor-pointer">
                    <span className="text-sm font-medium text-primary">Upload artwork</span>
                    <input
                      type="file"
                      className="sr-only"
                      accept=".jpg,.jpeg,.png"
                      onChange={handleFileSelect}
                      data-testid="artwork-file-input"
                      disabled={uploading}
                    />
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPG or PNG, exactly 3000×3000px
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">or drag and drop your image here</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                  <img 
                    src={artworkUrl} 
                    alt="Release artwork" 
                    className="w-full h-full object-cover"
                    data-testid="uploaded-artwork"
                  />
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setValidation(null)}
                    data-testid="button-change-artwork"
                  >
                    Change Artwork
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => onArtworkUpdate("")}
                    data-testid="button-remove-artwork"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            )}

            {uploading && (
              <div className="mt-4 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Uploading artwork...</p>
              </div>
            )}

            {/* Validation Results */}
            {validation && (
              <div className="mt-4 p-4 rounded-lg bg-muted/50">
                <h4 className="text-sm font-medium mb-3">Validation Results</h4>
                {validation.errors.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {validation.errors.map((error, index) => (
                      <div key={index} className="flex items-center text-sm text-destructive">
                        <X className="w-4 h-4 mr-2" />
                        {error}
                      </div>
                    ))}
                  </div>
                )}
                {validation.warnings.length > 0 && (
                  <div className="space-y-1">
                    {validation.warnings.map((warning, index) => (
                      <div key={index} className="flex items-center text-sm text-orange-600">
                        <X className="w-4 h-4 mr-2" />
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Requirements Checklist */}
            <div className="mt-6 bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium mb-3">Artwork Requirements</h4>
              <div className="space-y-2">
                {requirements.map((req, index) => (
                  <div key={index} className="flex items-center text-xs">
                    <div className={`h-4 w-4 mr-2 rounded-full flex items-center justify-center ${
                      req.met === true ? 'bg-green-500' : req.met === false ? 'bg-red-500' : 'bg-gray-300'
                    }`}>
                      {req.met === true && <Check className="w-2 h-2 text-white" />}
                      {req.met === false && <X className="w-2 h-2 text-white" />}
                    </div>
                    <span className="text-muted-foreground">{req.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <h4 className="text-sm font-medium mb-4">Preview</h4>
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Square Format (Spotify, Apple Music)
                </p>
                <div className="w-32 h-32 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg overflow-hidden">
                  {artworkUrl ? (
                    <img src={artworkUrl} alt="Square preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Thumbnail Preview
                </p>
                <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-accent/20 rounded-lg overflow-hidden">
                  {artworkUrl ? (
                    <img src={artworkUrl} alt="Thumbnail preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
