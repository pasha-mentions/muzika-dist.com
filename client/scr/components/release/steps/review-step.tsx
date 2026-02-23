import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, AlertCircle, Music, Calendar, Globe, Users, Image as ImageIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useState } from "react";
import type { ReleaseFormData } from "@/lib/types";
import type { User } from "@shared/schema";

interface ReviewStepProps {
  formData: ReleaseFormData;
  updateFormData: (updates: Partial<ReleaseFormData>) => void;
}

export default function ReviewStep({ formData, updateFormData }: ReviewStepProps) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const typedUser = user as User | undefined;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const currentOrgId = typedUser?.organizations?.[0]?.id;
      if (!currentOrgId) throw new Error("No organization found");

      // Create the release
      const releaseResponse = await apiRequest("POST", "/api/releases", {
        title: formData.title,
        artistId: formData.artistId,
        type: formData.type,
        primaryGenre: formData.primaryGenre,
        releaseDate: formData.releaseDate?.toISOString(),
        upc: formData.upc,
        labelName: formData.labelName,
        pCopyright: formData.pCopyright,
        territories: formData.territories,
        rightsOwner: formData.rightsOwner,
        artworkUrl: formData.artworkUrl,
        orgId: currentOrgId,
      });

      const release = await releaseResponse.json();

      // Create tracks
      for (const track of formData.tracks) {
        await apiRequest("POST", "/api/tracks", {
          releaseId: release.id,
          title: track.title,
          isrc: track.isrc,
          trackIndex: track.trackIndex,
          explicit: track.explicit,
          audioUrl: track.audioUrl,
          version: track.version,
          duration: track.duration,
          participants: track.participants,
        });
      }

      // Create splits
      for (const split of formData.splits) {
        await apiRequest("POST", "/api/splits", {
          releaseId: release.id,
          email: split.email,
          percent: split.percent,
          role: split.role,
        });
      }

      // Submit for review
      await apiRequest("POST", `/api/releases/${release.id}/submit`);

      return release;
    },
    onSuccess: (release) => {
      toast({
        title: "Release Submitted Successfully!",
        description: `"${release.title}" has been submitted for quality control review`,
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      
      // Reset form or redirect
      window.location.href = "/catalog";
    },
    onError: (error) => {
      if (isUnauthorizedError(error as Error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      
      toast({
        title: "Submission Failed",
        description: "Failed to submit release. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!agreedToTerms) {
      toast({
        title: "Terms Required",
        description: "Please agree to the terms of service to continue",
        variant: "destructive",
      });
      return;
    }
    
    submitMutation.mutate();
  };

  // Validation checks
  const validationChecks = [
    {
      id: "basic-info",
      label: "Basic release information completed",
      valid: !!(formData.title && formData.artistId && formData.type && formData.primaryGenre && formData.releaseDate),
      icon: Music
    },
    {
      id: "tracks",
      label: `${formData.tracks.length} track(s) added with audio files`,
      valid: formData.tracks.length > 0 && formData.tracks.every(track => track.audioUrl),
      icon: Music
    },
    {
      id: "artwork",
      label: "Release artwork uploaded",
      valid: !!formData.artworkUrl,
      icon: ImageIcon
    },
    {
      id: "territories",
      label: "Distribution territories selected",
      valid: formData.territories.length > 0,
      icon: Globe
    },
    {
      id: "splits",
      label: "Revenue splits total 100%",
      valid: formData.splits.reduce((sum, split) => sum + split.percent, 0) === 100,
      icon: Users
    },
    {
      id: "release-date",
      label: "Release date is at least 5 days in the future",
      valid: formData.releaseDate ? formData.releaseDate > new Date(Date.now() + 4 * 24 * 60 * 60 * 1000) : false,
      icon: Calendar
    }
  ];

  const allValid = validationChecks.every(check => check.valid);
  const canSubmit = allValid && agreedToTerms;

  return (
    <div className="space-y-6">
      {/* Validation Checklist */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">Pre-submission Checklist</h4>
            <div className="space-y-3">
              {validationChecks.map((check) => (
                <div key={check.id} className="flex items-center space-x-3" data-testid={`check-${check.id}`}>
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                    check.valid ? 'bg-green-500' : 'bg-red-500'
                  }`}>
                    {check.valid ? (
                      <CheckCircle className="w-3 h-3 text-white" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <check.icon className="w-4 h-4 text-muted-foreground" />
                  <span className={`text-sm ${check.valid ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Release Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold">Release Summary</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium text-muted-foreground">BASIC INFORMATION</h5>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Title:</span>{' '}
                    <span className="text-sm text-muted-foreground">{formData.title || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Type:</span>{' '}
                    <Badge variant="outline">{formData.type}</Badge>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Genre:</span>{' '}
                    <span className="text-sm text-muted-foreground">{formData.primaryGenre || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Release Date:</span>{' '}
                    <span className="text-sm text-muted-foreground">
                      {formData.releaseDate ? formData.releaseDate.toLocaleDateString() : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">UPC:</span>{' '}
                    <span className="text-sm text-muted-foreground font-mono">
                      {formData.upc || 'Will be auto-generated'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Rights & Distribution */}
              <div className="space-y-3">
                <h5 className="text-sm font-medium text-muted-foreground">RIGHTS & DISTRIBUTION</h5>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium">Territories:</span>{' '}
                    <span className="text-sm text-muted-foreground">
                      {formData.territories.includes("WW") 
                        ? "Worldwide" 
                        : `${formData.territories.length} selected`
                      }
                    </span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Rights Owner:</span>{' '}
                    <span className="text-sm text-muted-foreground">{formData.rightsOwner || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Label:</span>{' '}
                    <span className="text-sm text-muted-foreground">{formData.labelName || 'Independent'}</span>
                  </div>
                  <div>
                    <span className="text-sm font-medium">℗ Copyright:</span>{' '}
                    <span className="text-sm text-muted-foreground">{formData.pCopyright || 'Not specified'}</span>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Tracks */}
            <div className="space-y-3">
              <h5 className="text-sm font-medium text-muted-foreground">TRACKS ({formData.tracks.length})</h5>
              <div className="space-y-2">
                {formData.tracks.map((track, index) => (
                  <div key={track.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{index + 1}. {track.title}</span>
                      {track.explicit && <Badge variant="secondary" className="ml-2 text-xs">Explicit</Badge>}
                      {track.version && <span className="text-muted-foreground ml-2">({track.version})</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ISRC: {track.isrc || 'Auto-generated'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Splits */}
            {formData.splits.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h5 className="text-sm font-medium text-muted-foreground">REVENUE SPLITS</h5>
                  <div className="space-y-2">
                    {formData.splits.map((split) => (
                      <div key={split.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{split.email}</span>
                          {split.role && <span className="text-muted-foreground ml-2">({split.role})</span>}
                        </div>
                        <span className="text-sm font-medium">{split.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Terms Agreement */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Terms of Service Agreement</h4>
            <div className="flex items-start space-x-3">
              <Checkbox
                id="terms"
                checked={agreedToTerms}
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                className="mt-1"
                data-testid="checkbox-terms"
              />
              <Label htmlFor="terms" className="text-sm leading-relaxed">
                I confirm that I own or have the necessary rights to distribute all content in this release. 
                I agree to the platform's terms of service and understand that false claims may result in 
                account termination and legal action.
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submission Status */}
      {!allValid && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <p className="text-sm font-medium text-destructive">Cannot Submit Release</p>
                <p className="text-sm text-destructive/80">
                  Please complete all required fields and fix validation errors above.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit Button */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit || submitMutation.isPending}
          className="min-w-48"
          data-testid="button-submit-release"
        >
          {submitMutation.isPending ? (
            <>
              <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2"></div>
              Submitting...
            </>
          ) : (
            "Submit Release for Review"
          )}
        </Button>
      </div>

      {/* What happens next */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">What happens next?</h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Your release will be reviewed by our quality control team (1-2 business days)</p>
              <p>2. If approved, it will be delivered to streaming platforms (2-5 business days)</p>
              <p>3. You'll receive email notifications at each step</p>
              <p>4. Revenue reports will be available once your release starts generating streams</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
