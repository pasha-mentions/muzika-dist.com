import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Globe, Plus, X } from "lucide-react";
import type { ReleaseFormData } from "@/lib/types";
import { countries } from "@shared/countries";

interface RightsStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

export default function RightsStep({ formData, updateFormData }: RightsStepProps) {
  const [isWorldwide, setIsWorldwide] = useState(
    formData.territories.length === 0 || formData.territories.includes("WW")
  );
  const [selectedTerritory, setSelectedTerritory] = useState("");

  const handleInputChange = (field: keyof ReleaseFormData, value: any) => {
    updateFormData({ [field]: value });
  };

  const handleWorldwideToggle = (checked: boolean) => {
    setIsWorldwide(checked);
    if (checked) {
      updateFormData({ territories: ["WW"] });
    } else {
      updateFormData({ territories: [] });
    }
  };

  const addTerritory = () => {
    if (selectedTerritory && !formData.territories.includes(selectedTerritory)) {
      const newTerritories = formData.territories.filter(t => t !== "WW");
      newTerritories.push(selectedTerritory);
      updateFormData({ territories: newTerritories });
      setSelectedTerritory("");
    }
  };

  const removeTerritory = (territory: string) => {
    const newTerritories = formData.territories.filter(t => t !== territory);
    updateFormData({ territories: newTerritories });
  };

  const getTerritoryName = (code: string) => {
    if (code === "WW") return "Worldwide";
    const territory = countries.find(t => t.code === code);
    return territory ? territory.name : code;
  };

  const isValidTerritories = isWorldwide || formData.territories.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="worldwide"
                  checked={isWorldwide}
                  onCheckedChange={handleWorldwideToggle}
                  data-testid="checkbox-worldwide"
                />
                <Label htmlFor="worldwide" className="text-sm font-medium">
                  <Globe className="w-4 h-4 inline mr-2" />
                  Distribute worldwide
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                Your release will be available in all supported territories
              </p>
            </div>

            {!isWorldwide && (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Select Specific Territories</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Choose which countries/regions where your release will be available
                  </p>
                  
                  <div className="flex gap-2">
                    <Select value={selectedTerritory} onValueChange={setSelectedTerritory}>
                      <SelectTrigger className="flex-1" data-testid="select-territory">
                        <SelectValue placeholder="Select a territory" />
                      </SelectTrigger>
                      <SelectContent>
                        {countries
                          .filter(t => !formData.territories.includes(t.code))
                          .map((territory) => (
                            <SelectItem key={territory.code} value={territory.code}>
                              {territory.name}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addTerritory}
                      disabled={!selectedTerritory}
                      data-testid="button-add-territory"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {formData.territories.filter(t => t !== "WW").length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Selected Territories</Label>
                    <div className="flex flex-wrap gap-2">
                      {formData.territories.filter(t => t !== "WW").map((territory) => (
                        <Badge 
                          key={territory} 
                          variant="secondary" 
                          className="flex items-center gap-1"
                          data-testid={`territory-${territory}`}
                        >
                          {getTerritoryName(territory)}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => removeTerritory(territory)}
                            data-testid={`remove-territory-${territory}`}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {isWorldwide && (
              <div className="p-4 bg-accent/10 rounded-lg">
                <div className="flex items-center gap-2 text-sm font-medium text-accent-foreground">
                  <Globe className="w-4 h-4" />
                  Worldwide Distribution Selected
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Your release will be available in all supported territories including major markets
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rightsOwner">Rights Owner</Label>
              <Input
                id="rightsOwner"
                value={formData.rightsOwner}
                onChange={(e) => handleInputChange('rightsOwner', e.target.value)}
                placeholder="Who owns the master recording rights?"
                className="w-full"
                data-testid="input-rights-owner"
              />
              <p className="text-xs text-muted-foreground">
                Typically the artist, label, or production company that owns the recording
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Messages */}
      {!isValidTerritories && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Please select at least one territory or choose worldwide distribution
            </p>
          </CardContent>
        </Card>
      )}

      {/* Rights Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Important Rights Information</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                • You must own or have permission to distribute all content in your release
              </p>
              <p>
                • Ensure you have clearance for any samples, covers, or collaborations
              </p>
              <p>
                • Territory restrictions may apply based on your licensing agreements
              </p>
              <p>
                • You are responsible for any royalty splits with collaborators
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
