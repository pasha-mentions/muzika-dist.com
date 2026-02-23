import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ReleaseInfoStep from "./steps/release-info-step";
import TracksStep from "./steps/tracks-step";
import ArtworkStep from "./steps/artwork-step";
import ReviewStep from "./steps/review-step";

// Temporary simple ArtistsStep component
const ArtistsStep = ({ formData, updateFormData }: any) => (
  <div className="space-y-6">
    <div>
      <h3 className="text-lg font-medium">Виконавці</h3>
      <p className="text-sm text-muted-foreground">
        Цей етап буде додано пізніше
      </p>
    </div>
  </div>
);
import type { ReleaseFormData } from "@/lib/types";

const STEPS = [
  { id: 1, name: "Обкладинка", component: ArtworkStep },
  { id: 2, name: "Аудіофайли", component: TracksStep },
  { id: 3, name: "Інформація про альбом", component: ReleaseInfoStep },
  { id: 4, name: "Виконавці", component: ArtistsStep },
  { id: 5, name: "Перегляд", component: ReviewStep },
];

export default function ReleaseWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<ReleaseFormData>({
    title: "",
    artistId: "",
    type: "SINGLE",
    primaryGenre: "",
    releaseDate: null,
    upc: "",
    labelName: "",
    pCopyright: "",
    territories: [],
    rightsOwner: "",
    tracks: [],
    artworkUrl: "",
    splits: [],
    artists: [],
  });
  const { toast } = useToast();

  const currentStepData = STEPS.find(step => step.id === currentStep);
  const StepComponent = currentStepData?.component;

  const progress = (currentStep / STEPS.length) * 100;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleStepClick = (stepId: number) => {
    if (stepId <= currentStep) {
      setCurrentStep(stepId);
    }
  };

  const updateFormData = (updates: Partial<ReleaseFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1: // Обкладинка
        return !!formData.artworkUrl;
      case 2: // Аудіофайли
        return formData.tracks.length > 0;
      case 3: // Інформація про альбом
        return !!(formData.title && formData.primaryGenre && formData.releaseDate && formData.upc);
      case 4: // Виконавці
        return formData.artists && formData.artists.length > 0;
      case 5: // Перегляд
        return true;
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    toast({
      title: "Release Submitted",
      description: "Your release has been submitted for review",
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Create New Release</CardTitle>
          <div className="text-sm text-muted-foreground">
            Step {currentStep} of {STEPS.length}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-4">
          <Progress value={progress} className="w-full" data-testid="wizard-progress" />
        </div>
        
        {/* Step Navigation */}
        <div className="mt-6">
          <nav aria-label="Progress">
            <ol role="list" className="flex items-center justify-between">
              {STEPS.map((step, stepIndex) => (
                <li key={step.name} className="relative flex-1">
                  {stepIndex !== STEPS.length - 1 && (
                    <div className="absolute top-4 left-1/2 w-full h-0.5 bg-border -translate-y-1/2"></div>
                  )}
                  <button
                    onClick={() => handleStepClick(step.id)}
                    disabled={step.id > currentStep}
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                      step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : step.id < currentStep
                        ? "bg-green-500 text-white"
                        : "bg-background border-2 border-border text-muted-foreground"
                    }`}
                    data-testid={`step-${step.id}`}
                  >
                    {step.id < currentStep ? "✓" : step.id}
                  </button>
                  <span className={`absolute top-10 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap ${
                    step.id === currentStep ? "text-primary" : "text-muted-foreground"
                  }`}>
                    {step.name}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </CardHeader>
      
      <CardContent className="pt-8">
        {StepComponent && (
          <StepComponent 
            formData={formData} 
            updateFormData={updateFormData}
          />
        )}
        
        {/* Navigation Buttons */}
        <div className="mt-8 flex justify-between">
          <Button 
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
            data-testid="button-previous"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          {currentStep === STEPS.length ? (
            <Button 
              onClick={handleSubmit}
              disabled={!validateCurrentStep()}
              data-testid="button-submit"
            >
              Submit Release
            </Button>
          ) : (
            <Button 
              onClick={handleNext}
              disabled={!validateCurrentStep()}
              data-testid="button-next"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

