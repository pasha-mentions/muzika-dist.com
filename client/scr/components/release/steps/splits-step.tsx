import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ReleaseFormData, SplitFormData } from "@/lib/types";

interface SplitsStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

const SPLIT_ROLES = [
  "Artist",
  "Producer", 
  "Songwriter",
  "Composer",
  "Featured Artist",
  "Remixer",
  "Other"
];

export default function SplitsStep({ formData, updateFormData }: SplitsStepProps) {
  const [newSplit, setNewSplit] = useState<Partial<SplitFormData>>({
    email: "",
    percent: 0,
    role: ""
  });
  const { toast } = useToast();

  const totalPercentage = formData.splits.reduce((sum, split) => sum + split.percent, 0);
  const remainingPercentage = 100 - totalPercentage;
  const isValidSplits = totalPercentage === 100;

  const addSplit = () => {
    if (!newSplit.email || !newSplit.percent || newSplit.percent <= 0) {
      toast({
        title: "Invalid Split",
        description: "Please provide a valid email and percentage",
        variant: "destructive",
      });
      return;
    }

    if (newSplit.percent > remainingPercentage) {
      toast({
        title: "Invalid Percentage",
        description: `Cannot exceed ${remainingPercentage}% remaining`,
        variant: "destructive",
      });
      return;
    }

    const emailExists = formData.splits.some(split => split.email === newSplit.email);
    if (emailExists) {
      toast({
        title: "Duplicate Email",
        description: "This collaborator is already in the splits",
        variant: "destructive",
      });
      return;
    }

    const split: SplitFormData = {
      id: `split-${Date.now()}`,
      email: newSplit.email!,
      percent: newSplit.percent!,
      role: newSplit.role || "Artist"
    };

    updateFormData({
      splits: [...formData.splits, split]
    });

    setNewSplit({ email: "", percent: 0, role: "" });
    
    toast({
      title: "Split Added",
      description: `Added ${split.percent}% split for ${split.email}`,
    });
  };

  const removeSplit = (splitId: string) => {
    const updatedSplits = formData.splits.filter(split => split.id !== splitId);
    updateFormData({ splits: updatedSplits });
    
    toast({
      title: "Split Removed",
      description: "Collaborator removed from splits",
    });
  };

  const updateSplit = (splitId: string, updates: Partial<SplitFormData>) => {
    const updatedSplits = formData.splits.map(split =>
      split.id === splitId ? { ...split, ...updates } : split
    );
    updateFormData({ splits: updatedSplits });
  };

  const autoCalculateEqual = () => {
    const splitCount = formData.splits.length + 1; // +1 for new split being added
    const equalPercent = Math.floor(100 / splitCount);
    const remainder = 100 - (equalPercent * splitCount);
    
    const updatedSplits = formData.splits.map((split, index) => ({
      ...split,
      percent: equalPercent + (index === 0 ? remainder : 0)
    }));
    
    setNewSplit({ 
      ...newSplit, 
      percent: equalPercent 
    });
    
    updateFormData({ splits: updatedSplits });
  };

  return (
    <div className="space-y-6">
      {/* Split Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Revenue Split Allocation</h4>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-muted-foreground">Total:</span>
                <Badge variant={isValidSplits ? "default" : totalPercentage > 100 ? "destructive" : "secondary"}>
                  {totalPercentage}%
                </Badge>
              </div>
            </div>
            
            <Progress 
              value={Math.min(totalPercentage, 100)} 
              className="w-full"
              data-testid="splits-progress" 
            />
            
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Allocated: {totalPercentage}%</span>
              <span>Remaining: {Math.max(0, remainingPercentage)}%</span>
            </div>
            
            {totalPercentage > 100 && (
              <p className="text-xs text-destructive">
                Total percentage exceeds 100%. Please adjust the splits.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add New Split */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Add Collaborator</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="splitEmail">Email Address *</Label>
                <Input
                  id="splitEmail"
                  type="email"
                  value={newSplit.email || ""}
                  onChange={(e) => setNewSplit({ ...newSplit, email: e.target.value })}
                  placeholder="collaborator@example.com"
                  data-testid="input-split-email"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="splitPercent">Percentage *</Label>
                <Input
                  id="splitPercent"
                  type="number"
                  min="0"
                  max={remainingPercentage}
                  step="0.01"
                  value={newSplit.percent || ""}
                  onChange={(e) => setNewSplit({ ...newSplit, percent: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  data-testid="input-split-percent"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="splitRole">Role</Label>
                <Select
                  value={newSplit.role || ""}
                  onValueChange={(value) => setNewSplit({ ...newSplit, role: value })}
                >
                  <SelectTrigger data-testid="select-split-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPLIT_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={addSplit}
                disabled={!newSplit.email || !newSplit.percent || remainingPercentage <= 0}
                data-testid="button-add-split"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Split
              </Button>
              
              {formData.splits.length > 0 && (
                <Button 
                  variant="outline" 
                  onClick={autoCalculateEqual}
                  data-testid="button-auto-calculate"
                >
                  Auto Calculate Equal
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Splits */}
      {formData.splits.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Current Splits ({formData.splits.length})</h4>
              
              <div className="space-y-3">
                {formData.splits.map((split) => (
                  <div 
                    key={split.id} 
                    className="flex items-center justify-between p-3 border rounded-lg"
                    data-testid={`split-${split.id}`}
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{split.email}</span>
                      </div>
                      
                      {split.role && (
                        <Badge variant="outline" className="text-xs">
                          {split.role}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-2">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={split.percent}
                          onChange={(e) => updateSplit(split.id, { percent: parseFloat(e.target.value) || 0 })}
                          className="w-20 text-center"
                          data-testid={`split-percent-${split.id}`}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSplit(split.id)}
                        className="text-destructive hover:text-destructive"
                        data-testid={`remove-split-${split.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Messages */}
      {!isValidSplits && formData.splits.length > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">
              Revenue splits must total exactly 100%. 
              {totalPercentage < 100 
                ? ` Add ${(100 - totalPercentage).toFixed(2)}% more.`
                : ` Reduce by ${(totalPercentage - 100).toFixed(2)}%.`
              }
            </p>
          </CardContent>
        </Card>
      )}

      {/* Information */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Revenue Split Information</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• Collaborators will receive email invitations to claim their splits</p>
              <p>• All splits must total exactly 100% to proceed</p>
              <p>• Revenue will be distributed automatically based on these percentages</p>
              <p>• Splits can be modified after release with collaborator agreement</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
