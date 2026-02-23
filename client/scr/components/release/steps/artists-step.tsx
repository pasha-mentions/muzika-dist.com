import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import type { ReleaseFormData, ArtistFormData } from "@/lib/types";

interface ArtistsStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

export default function ArtistsStep({ formData, updateFormData }: ArtistsStepProps) {
  const [mainArtist, setMainArtist] = useState(formData.artists.find(a => a.role === "MAIN")?.name || "");
  const [featuredArtists, setFeaturedArtists] = useState<ArtistFormData[]>(
    formData.artists.filter(a => a.role === "FEATURED")
  );

  const handleMainArtistChange = (name: string) => {
    setMainArtist(name);
    const allArtists = [
      { id: "main", name, role: "MAIN" as const },
      ...featuredArtists
    ];
    updateFormData({ artists: allArtists });
  };

  const addFeaturedArtist = () => {
    if (featuredArtists.length >= 5) return;
    
    const newArtist: ArtistFormData = {
      id: `featured-${Date.now()}`,
      name: "",
      role: "FEATURED"
    };
    
    const updated = [...featuredArtists, newArtist];
    setFeaturedArtists(updated);
    
    const allArtists = [
      { id: "main", name: mainArtist, role: "MAIN" as const },
      ...updated
    ];
    updateFormData({ artists: allArtists });
  };

  const updateFeaturedArtist = (index: number, name: string) => {
    const updated = featuredArtists.map((artist, i) => 
      i === index ? { ...artist, name } : artist
    );
    setFeaturedArtists(updated);
    
    const allArtists = [
      { id: "main", name: mainArtist, role: "MAIN" as const },
      ...updated
    ];
    updateFormData({ artists: allArtists });
  };

  const removeFeaturedArtist = (index: number) => {
    const updated = featuredArtists.filter((_, i) => i !== index);
    setFeaturedArtists(updated);
    
    const allArtists = [
      { id: "main", name: mainArtist, role: "MAIN" as const },
      ...updated
    ];
    updateFormData({ artists: allArtists });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Виконавці</h3>
        <p className="text-sm text-muted-foreground">
          Додайте основного виконавця та до п'яти додаткових виконавців
        </p>
      </div>

      {/* Основний виконавець */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Основний виконавець</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="main-artist">Ім'я виконавця</Label>
            <Input
              id="main-artist"
              value={mainArtist}
              onChange={(e) => handleMainArtistChange(e.target.value)}
              placeholder="Введіть ім'я основного виконавця"
              data-testid="input-main-artist"
            />
          </div>
        </CardContent>
      </Card>

      {/* Featured виконавці */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Додаткові виконавці
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addFeaturedArtist}
              disabled={featuredArtists.length >= 5}
              data-testid="button-add-featured-artist"
            >
              <Plus className="w-4 h-4 mr-2" />
              Додати виконавця
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {featuredArtists.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Немає додаткових виконавців
            </p>
          ) : (
            featuredArtists.map((artist, index) => (
              <div key={artist.id} className="flex items-center space-x-4">
                <div className="flex-1">
                  <Input
                    value={artist.name}
                    onChange={(e) => updateFeaturedArtist(index, e.target.value)}
                    placeholder={`Виконавець ${index + 1}`}
                    data-testid={`input-featured-artist-${index}`}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeFeaturedArtist(index)}
                  data-testid={`button-remove-featured-artist-${index}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))
          )}
          
          {featuredArtists.length < 5 && (
            <p className="text-xs text-muted-foreground">
              Ви можете додати ще {5 - featuredArtists.length} виконавець(ів)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}