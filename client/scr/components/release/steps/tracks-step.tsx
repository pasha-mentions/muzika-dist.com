import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Music } from "lucide-react";
import type { ReleaseFormData, TrackFormData } from "@/lib/types";

interface TracksStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

export default function TracksStep({ formData, updateFormData }: TracksStepProps) {
  const [newTrackTitle, setNewTrackTitle] = useState("");

  const addTrack = () => {
    const newTrack: TrackFormData = {
      id: `track-${Date.now()}`,
      title: newTrackTitle || `Трек ${formData.tracks.length + 1}`,
      trackIndex: formData.tracks.length + 1,
      explicit: false,
    };

    updateFormData({
      tracks: [...formData.tracks, newTrack]
    });
    setNewTrackTitle("");
  };

  const updateTrack = (trackId: string, updates: Partial<TrackFormData>) => {
    const updatedTracks = formData.tracks.map(track => 
      track.id === trackId ? { ...track, ...updates } : track
    );
    updateFormData({ tracks: updatedTracks });
  };

  const removeTrack = (trackId: string) => {
    const updatedTracks = formData.tracks.filter(track => track.id !== trackId);
    // Reindex tracks
    const reindexedTracks = updatedTracks.map((track, index) => ({
      ...track,
      trackIndex: index + 1
    }));
    updateFormData({ tracks: reindexedTracks });
  };

  const handleAudioUpload = (trackId: string, audioUrl: string) => {
    updateTrack(trackId, { audioUrl });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Додайте аудіофайли</h3>
        <p className="text-sm text-muted-foreground">
          Завантажте пісні у форматі WAV
        </p>
      </div>

      {/* Add New Track */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Додати новий трек</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                value={newTrackTitle}
                onChange={(e) => setNewTrackTitle(e.target.value)}
                placeholder="Назва треку"
                data-testid="input-track-title"
              />
            </div>
            <Button onClick={addTrack} data-testid="button-add-track">
              Додати трек
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tracks List */}
      {formData.tracks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Додайте ваш перший трек</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {formData.tracks.map((track, index) => (
            <Card key={track.id}>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium">{track.trackIndex}</span>
                      </div>
                      <div className="flex-1">
                        <Input
                          value={track.title}
                          onChange={(e) => updateTrack(track.id, { title: e.target.value })}
                          placeholder="Назва треку"
                          className="font-medium"
                          data-testid={`input-track-title-${index}`}
                        />
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeTrack(track.id)}
                      data-testid={`button-remove-track-${index}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Audio Upload */}
                  <div className="space-y-2">
                    <Label>Аудіофайл</Label>
                    {track.audioUrl ? (
                      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                              <Music className="w-4 h-4 text-green-600 dark:text-green-400" />
                            </div>
                            <div>
                              <p className="font-medium text-green-800 dark:text-green-200">
                                Аудіофайл завантажено
                              </p>
                              <p className="text-sm text-green-600 dark:text-green-400">
                                Формат WAV
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <ObjectUploader
                        onUploadComplete={(url) => handleAudioUpload(track.id, url)}
                        accept="audio/wav"
                        maxSize={100 * 1024 * 1024} // 100MB
                        fileType="audio"
                        className="min-h-[120px]"
                      >
                        <div className="text-center">
                          <Music className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm font-medium">Завантажити аудіофайл</p>
                          <p className="text-xs text-muted-foreground">
                            Перетягніть WAV файл сюди або натисніть для вибору
                          </p>
                        </div>
                      </ObjectUploader>
                    )}
                  </div>

                  {/* Track Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`version-${track.id}`}>Версія</Label>
                      <Input
                        id={`version-${track.id}`}
                        value={track.version || ""}
                        onChange={(e) => updateTrack(track.id, { version: e.target.value })}
                        placeholder="Оригінал, Radio Edit, тощо"
                        data-testid={`input-track-version-${index}`}
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`explicit-${track.id}`}
                        checked={track.explicit}
                        onCheckedChange={(checked) => 
                          updateTrack(track.id, { explicit: !!checked })
                        }
                        data-testid={`checkbox-explicit-${index}`}
                      />
                      <Label htmlFor={`explicit-${track.id}`}>
                        Трек містить ненормативну лексику
                      </Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Track Summary */}
      {formData.tracks.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Підсумок треків</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Всього треків:</span>{' '}
                  <span className="font-medium">{formData.tracks.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">З аудіо:</span>{' '}
                  <span className="font-medium">
                    {formData.tracks.filter(track => track.audioUrl).length}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Explicit:</span>{' '}
                  <span className="font-medium">
                    {formData.tracks.filter(track => track.explicit).length}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Вимоги до аудіофайлів</h4>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Формат: WAV</li>
              <li>• Максимальний розмір: 100MB на файл</li>
              <li>• Рекомендована якість: 44.1kHz/16-bit або краще</li>
              <li>• Стерео або моно</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}