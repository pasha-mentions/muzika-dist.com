import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, Music, Edit, Trash2, Play, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface Track {
  id: string;
  title: string;
  isrc?: string;
  trackIndex: number;
  explicit: boolean;
  audioUrl?: string;
  version?: string;
  duration?: number;
}

interface TrackUploadProps {
  tracks: Track[];
  onTracksUpdate: (tracks: Track[]) => void;
}

export default function TrackUpload({ tracks, onTracksUpdate }: TrackUploadProps) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (files: FileList) => {
    setUploading(true);
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // Validate file type
        if (!file.type.includes('audio/wav') && !file.type.includes('audio/flac')) {
          toast({
            title: "Invalid File Type",
            description: `${file.name}: Only WAV and FLAC files are supported`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file size (200MB max)
        if (file.size > 200 * 1024 * 1024) {
          toast({
            title: "File Too Large", 
            description: `${file.name}: File size must be under 200MB`,
            variant: "destructive",
          });
          continue;
        }

        // Get presigned URL
        const presignResponse = await apiRequest("POST", "/api/upload/presign", {
          filename: file.name,
          contentType: file.type,
        });
        
        const { uploadUrl, downloadUrl } = await presignResponse.json();
        
        // Upload file (mock implementation)
        // In real implementation, upload to S3 using presigned URL
        
        // Create new track
        const newTrack: Track = {
          id: `track-${Date.now()}-${i}`,
          title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
          trackIndex: tracks.length + i + 1,
          explicit: false,
          audioUrl: downloadUrl,
          duration: 0, // Would be extracted from audio file
        };

        onTracksUpdate([...tracks, newTrack]);
      }
      
      toast({
        title: "Upload Complete",
        description: `${files.length} track(s) uploaded successfully`,
      });
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload audio files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [tracks, onTracksUpdate, toast]);

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

  const updateTrack = (trackId: string, updates: Partial<Track>) => {
    const updatedTracks = tracks.map(track => 
      track.id === trackId ? { ...track, ...updates } : track
    );
    onTracksUpdate(updatedTracks);
  };

  const removeTrack = (trackId: string) => {
    const updatedTracks = tracks.filter(track => track.id !== trackId);
    onTracksUpdate(updatedTracks);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Tracks</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-border rounded-lg px-6 py-10 text-center hover:border-primary/50 transition-colors cursor-pointer"
          data-testid="audio-upload-zone"
        >
          <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <div className="mb-4">
            <label className="cursor-pointer">
              <span className="text-sm font-medium text-primary">Upload audio files</span>
              <input
                type="file"
                className="sr-only"
                accept=".wav,.flac"
                multiple
                onChange={handleFileSelect}
                data-testid="audio-file-input"
                disabled={uploading}
              />
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              WAV or FLAC, 44.1kHz, 16/24-bit, max 200MB per file
            </p>
          </div>
          <p className="text-xs text-muted-foreground">or drag and drop files here</p>
        </div>

        {/* Track List */}
        {tracks.length > 0 && (
          <div className="mt-8 space-y-4">
            <h4 className="text-sm font-medium">Tracks ({tracks.length})</h4>
            {tracks.map((track, index) => (
              <Card key={track.id} className="p-4" data-testid={`track-${track.id}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-medium text-sm">
                        {track.trackIndex}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <Input
                        value={track.title}
                        onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                        className="text-sm font-medium"
                        placeholder="Track title"
                        data-testid={`track-title-${track.id}`}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        ISRC: {track.isrc || 'AUTO-GENERATED'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="sm" data-testid={`edit-track-${track.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeTrack(track.id)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`delete-track-${track.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground">Version</Label>
                    <Input
                      value={track.version || ""}
                      onChange={(e) => updateTrack(track.id, { version: e.target.value })}
                      className="mt-1 text-xs"
                      placeholder="Original/Radio Edit/Instrumental"
                      data-testid={`track-version-${track.id}`}
                    />
                  </div>
                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox
                      id={`explicit-${track.id}`}
                      checked={track.explicit}
                      onCheckedChange={(checked) => updateTrack(track.id, { explicit: !!checked })}
                      data-testid={`explicit-checkbox-${track.id}`}
                    />
                    <Label htmlFor={`explicit-${track.id}`} className="text-xs text-muted-foreground">
                      Explicit Content
                    </Label>
                  </div>
                </div>

                {/* Audio Info */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Music className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {track.audioUrl ? 'Audio uploaded' : 'No audio file'}
                    </span>
                  </div>
                  {track.audioUrl && (
                    <Button variant="ghost" size="sm" data-testid={`play-track-${track.id}`}>
                      <Play className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {uploading && (
          <div className="mt-4 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Uploading tracks...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
