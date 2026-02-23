import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Save, X, Plus, Globe, ChevronDown } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface EditVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  video: any;
  onSuccess: () => void;
}

const TERRITORIES_DATA = {
  "Europe": [
    "Åland Islands", "Albania", "Andorra", "Austria", "Belarus", "Belgium", 
    "Bosnia and Herzegovina", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", 
    "Denmark", "Estonia", "Faroe Islands", "Finland", "Macedonia", "France", 
    "Germany", "Gibraltar", "Greece", "Guernsey", "Vatican", "Hungary", 
    "Iceland", "Ireland", "Isle of Man", "Italy", "Jersey", "Latvia", 
    "Liechtenstein", "Lithuania", "Luxembourg", "Malta", "Moldova", "Monaco", 
    "Montenegro", "Netherlands", "Norway", "Poland", "Portugal", "Romania", 
    "Russian Federation", "San Marino", "Serbia", "Slovakia", "Slovenia", 
    "Spain", "Sweden", "Switzerland", "Ukraine", "United Kingdom"
  ],
  "Asia": [
    "Afghanistan", "Armenia", "Azerbaijan", "Bahrain", "Bangladesh", "Bhutan", 
    "British Indian Ocean Territory", "Brunei Darussalam", "Cambodia", "China", 
    "Christmas Island", "Cocos (Keeling) Islands", "Georgia", "Hong Kong", 
    "India", "Indonesia", "Iran", "Iraq", "Israel", "Japan", "Jordan", 
    "Kazakhstan", "Kuwait", "Kyrgyzstan", "Lao People's Democratic Republic", 
    "Lebanon", "Macao", "Malaysia", "Maldives", "Mongolia", "Myanmar", "Nepal", 
    "North Korea", "Oman", "Pakistan", "Philippines", "Qatar", "Russian Federation", 
    "Saudi Arabia", "Singapore", "South Korea", "Sri Lanka", "Palestine", 
    "Syria", "Taiwan", "Tajikistan", "Thailand", "Timor-Leste", "Turkey", 
    "Turkmenistan", "United Arab Emirates", "Uzbekistan", "Vietnam", "Yemen"
  ],
  "North America": [
    "Anguilla", "Antigua and Barbuda", "Bahamas", "Barbados", "Belize", "Bermuda", 
    "Canada", "Cayman Islands", "Costa Rica", "Cuba", "Dominica", "Dominican Republic", 
    "El Salvador", "Greenland", "Grenada", "Guatemala", "Haiti", "Honduras", 
    "Jamaica", "Martinique", "Mexico", "Montserrat", "Nicaragua", "Panama", 
    "Puerto Rico", "Saint Barthélemy", "Saint Kitts and Nevis", "Saint Lucia", 
    "Saint Pierre and Miquelon", "Saint Vincent and the Grenadines", "Sint Maarten", 
    "Turks and Caicos Islands", "United States", "Virgin Islands"
  ],
  "South America": [
    "Argentina", "Aruba", "Bolivia", "Bonaire", "Brazil", "Chile", "Colombia", 
    "Curaçao", "Ecuador", "Falkland Islands (Malvinas)", "Guyana", "French Guiana", 
    "Suriname", "Paraguay", "Peru", "Trinidad and Tobago", "Uruguay", "Venezuela"
  ],
  "Africa": [
    "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi", 
    "Cape Verde", "Cameroon", "Central African Republic", "Chad", "Comoros", 
    "Congo, the Democratic Republic", "Djibouti", "Egypt", "Equatorial Guinea", 
    "Eritrea", "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau", 
    "Ivory Coast", "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", 
    "Malawi", "Mali", "Mauritania", "Mauritius", "Morocco", "Mozambique", 
    "Namibia", "Niger", "Nigeria", "Congo", "Rwanda", "Sao Tome and Principe", 
    "Senegal", "Seychelles", "Sierra Leone", "Somalia", "South Africa", 
    "South Sudan", "Sudan", "Swaziland", "Tanzania", "Togo", "Tunisia", 
    "Uganda", "Western Sahara", "Zambia", "Zimbabwe"
  ],
  "Oceania": [
    "American Samoa", "Australia", "Cook Islands", "Micronesia", "Fiji", 
    "French Polynesia", "Guam", "Kiribati", "Marshall Islands", "Nauru", 
    "New Zealand", "Niue", "Norfolk Island", "Northern Mariana Islands", 
    "Palau", "Papua New Guinea", "Pitcairn", "Samoa", "Solomon Islands", 
    "Tokelau", "Tonga", "Tuvalu", "Vanuatu"
  ]
};

// Validation schema for video editing
const editVideoSchema = z.object({
  title: z.string().min(1, "Назва відео обов'язкова"),
  primaryGenre: z.string().min(1, "Основний жанр обов'язковий"),
  secondaryGenre: z.string().optional(),
  language: z.string().min(1, "Мова обов'язкова"),
  metadataLanguage: z.string().optional(),
  firstReleaseDate: z.string().min(1, "Оригінальна дата релізу обов'язкова"),
  releaseDate: z.string().optional(),
  explicit: z.boolean().optional(),
  aiGenerated: z.boolean().optional(),
  upc: z.string().optional(),
  isrc: z.string().optional(),
});

type EditVideoFormData = z.infer<typeof editVideoSchema>;

export function EditVideoDialog({
  open,
  onOpenChange,
  video,
  onSuccess,
}: EditVideoDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [pendingData, setPendingData] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState("metadata");

  // Performers state
  const [performers, setPerformers] = useState<Array<{ name: string; role: string }>>(
    video?.performers || []
  );

  // Contributors/Credits state
  const [credits, setCredits] = useState<Array<{ name: string; role: string }>>(
    video?.credits || []
  );

  // Territories state
  const [territories, setTerritories] = useState<string[]>(video?.territories || []);
  const [territoriesOpen, setTerritoriesOpen] = useState(false);
  const [territorySearchQuery, setTerritorySearchQuery] = useState("");

  // Platforms state
  const [platforms, setPlatforms] = useState<string[]>(video?.platforms || []);

  const form = useForm<EditVideoFormData>({
    resolver: zodResolver(editVideoSchema),
    defaultValues: {
      title: video?.title || "",
      primaryGenre: video?.primaryGenre || "",
      secondaryGenre: video?.secondaryGenre || "",
      language: video?.language || "",
      metadataLanguage: video?.metadataLanguage || "",
      firstReleaseDate: video?.firstReleaseDate?.slice(0, 10) || "",
      releaseDate: video?.releaseDate?.slice(0, 10) || "",
      explicit: video?.explicit || false,
      aiGenerated: video?.aiGenerated || false,
      upc: video?.upc || "",
      isrc: video?.isrc || "",
    },
  });

  // Reset form when video changes
  useEffect(() => {
    if (video) {
      form.reset({
        title: video.title || "",
        primaryGenre: video.primaryGenre || "",
        secondaryGenre: video.secondaryGenre || "",
        language: video.language || "",
        metadataLanguage: video.metadataLanguage || "",
        firstReleaseDate: video.firstReleaseDate?.slice(0, 10) || "",
        releaseDate: video.releaseDate?.slice(0, 10) || "",
        explicit: video.explicit || false,
        aiGenerated: video.aiGenerated || false,
        upc: video.upc || "",
        isrc: video.isrc || "",
      });
      setPerformers(video.performers || []);
      setCredits(video.credits || []);
      setTerritories(video.territories || []);
      setPlatforms(video.platforms || []);
    }
  }, [video, form]);

  const updateVideoMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch(`/api/music-videos/${video.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update video');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/music-videos'] });
      toast({
        title: "Успішно оновлено",
        description: "Зміни до відео збережено",
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Помилка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddPerformer = () => {
    if (performers.length < 5) {
      setPerformers([...performers, { name: "", role: "" }]);
    }
  };

  const handleRemovePerformer = (index: number) => {
    setPerformers(performers.filter((_, i) => i !== index));
  };

  const handlePerformerChange = (index: number, field: "name" | "role", value: string) => {
    const updated = [...performers];
    updated[index][field] = value;
    setPerformers(updated);
  };

  const handleAddCredit = () => {
    setCredits([...credits, { name: "", role: "" }]);
  };

  const handleRemoveCredit = (index: number) => {
    setCredits(credits.filter((_, i) => i !== index));
  };

  const handleCreditChange = (index: number, field: "name" | "role", value: string) => {
    const updated = [...credits];
    updated[index][field] = value;
    setCredits(updated);
  };

  const toggleTerritory = (territory: string) => {
    setTerritories(prev => 
      prev.includes(territory)
        ? prev.filter(t => t !== territory)
        : [...prev, territory]
    );
  };

  const toggleContinentSelection = (continent: string) => {
    const continentCountries = TERRITORIES_DATA[continent as keyof typeof TERRITORIES_DATA];
    const allSelected = continentCountries.every(country => territories.includes(country));
    
    if (allSelected) {
      setTerritories(prev => prev.filter(t => !continentCountries.includes(t)));
    } else {
      setTerritories(prev => Array.from(new Set([...prev, ...continentCountries])));
    }
  };

  const getFilteredCountries = () => {
    if (!territorySearchQuery) return TERRITORIES_DATA;
    
    const filtered: Record<string, string[]> = {};
    Object.entries(TERRITORIES_DATA).forEach(([continent, countries]) => {
      const filteredCountries = countries.filter(country =>
        country.toLowerCase().includes(territorySearchQuery.toLowerCase())
      );
      if (filteredCountries.length > 0) {
        filtered[continent] = filteredCountries;
      }
    });
    return filtered;
  };

  const onSubmit = (data: EditVideoFormData) => {
    // Combine form data with performers, credits, territories, and platforms
    const fullData = {
      ...data,
      performers,
      credits,
      territories,
      platforms,
    };

    setPendingData(fullData);
    setShowWarning(true);
  };

  const handleConfirmEdit = async () => {
    if (!pendingData) return;

    setShowWarning(false);
    setIsSubmitting(true);

    try {
      await updateVideoMutation.mutateAsync(pendingData);
    } finally {
      setIsSubmitting(false);
      setPendingData(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Редагувати відео: {video?.title}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={selectedTab} onValueChange={setSelectedTab}>
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="metadata">Метадані</TabsTrigger>
                  <TabsTrigger value="performers">Виконавці</TabsTrigger>
                  <TabsTrigger value="contributors">Учасники</TabsTrigger>
                  <TabsTrigger value="distribution">Дистрибуція</TabsTrigger>
                </TabsList>

                {/* Metadata Tab */}
                <TabsContent value="metadata" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Назва відео *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Введіть назву відео" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="primaryGenre"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Основний жанр *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Оберіть жанр" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Pop">Pop</SelectItem>
                              <SelectItem value="Rock">Rock</SelectItem>
                              <SelectItem value="Hip-Hop">Hip-Hop</SelectItem>
                              <SelectItem value="Electronic">Electronic</SelectItem>
                              <SelectItem value="R&B">R&B</SelectItem>
                              <SelectItem value="Country">Country</SelectItem>
                              <SelectItem value="Jazz">Jazz</SelectItem>
                              <SelectItem value="Classical">Classical</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="secondaryGenre"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Другорядний жанр</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Оберіть жанр" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Pop">Pop</SelectItem>
                              <SelectItem value="Rock">Rock</SelectItem>
                              <SelectItem value="Hip-Hop">Hip-Hop</SelectItem>
                              <SelectItem value="Electronic">Electronic</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="language"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Мова контенту *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Оберіть мову" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="uk">Українська</SelectItem>
                              <SelectItem value="pl">Polski</SelectItem>
                              <SelectItem value="es">Español</SelectItem>
                              <SelectItem value="fr">Français</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="metadataLanguage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Мова метаданих</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Оберіть мову" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="en">English</SelectItem>
                              <SelectItem value="uk">Українська</SelectItem>
                              <SelectItem value="pl">Polski</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstReleaseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Оригінальна дата релізу *</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="releaseDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Дата публікації</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="explicit"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Explicit контент</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="aiGenerated"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Контент створений ШІ 🤖</FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="upc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>UPC</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="UPC код" disabled />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="isrc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>ISRC</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="ISRC код" disabled />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                {/* Performers Tab */}
                <TabsContent value="performers" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Виконавці (максимум 5)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {performers.map((performer, index) => (
                          <div key={index} className="space-y-2 p-4 border rounded-lg relative">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemovePerformer(index)}
                              className="absolute top-2 right-2 h-8 w-8 p-0 text-red-500 hover:text-red-700"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <div>
                              <Input
                                placeholder="Ім'я виконавця"
                                value={performer.name}
                                onChange={(e) => handlePerformerChange(index, "name", e.target.value)}
                                className="h-10"
                              />
                            </div>
                            <div>
                              <Input
                                placeholder="Роль"
                                value={performer.role}
                                onChange={(e) => handlePerformerChange(index, "role", e.target.value)}
                                className="h-10"
                              />
                            </div>
                          </div>
                        ))}
                        {performers.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Виконавці не додані
                          </p>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddPerformer}
                          disabled={performers.length >= 5}
                          className="w-full"
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Додати виконавця
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Contributors Tab */}
                <TabsContent value="contributors" className="space-y-4 mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Учасники</CardTitle>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddCredit}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Додати учасника
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {credits.map((credit, index) => (
                        <div key={index} className="flex gap-2 items-start">
                          <div className="flex-1">
                            <Input
                              placeholder="Ім'я"
                              value={credit.name}
                              onChange={(e) => handleCreditChange(index, "name", e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <div className="flex-1">
                            <Input
                              placeholder="Роль"
                              value={credit.role}
                              onChange={(e) => handleCreditChange(index, "role", e.target.value)}
                              className="h-10"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveCredit(index)}
                            className="h-10 w-10 p-0 text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {credits.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Немає доданих учасників
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Distribution Tab */}
                <TabsContent value="distribution" className="space-y-4 mt-4">
                  {/* Platforms */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        Платформи
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex flex-row items-center gap-2 p-3 border rounded-lg bg-muted/50">
                          <img 
                            src="https://storage.googleapis.com/pr-newsroom-wp/1/2023/05/Spotify_Primary_Logo_RGB_Green.png" 
                            alt="Spotify"
                            className="h-8 object-contain"
                          />
                          <span className="text-sm font-medium">Spotify</span>
                        </div>
                        <div className="flex flex-row items-center gap-2 p-3 border rounded-lg bg-muted/50">
                          <img 
                            src="https://upload.wikimedia.org/wikipedia/commons/3/3c/Apple_Music_logo.svg" 
                            alt="Apple Music"
                            className="h-8 object-contain"
                          />
                          <span className="text-sm font-medium">Apple Music</span>
                        </div>
                        <div className="flex flex-row items-center gap-2 p-3 border rounded-lg bg-muted/50">
                          <img 
                            src="https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png" 
                            alt="YouTube Music"
                            className="h-8 object-contain"
                          />
                          <span className="text-sm font-medium">YouTube Music</span>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        Платформи фіксовані і не можуть бути змінені після створення
                      </p>
                    </CardContent>
                  </Card>

                  {/* Territories */}
                  <Collapsible open={territoriesOpen} onOpenChange={setTerritoriesOpen}>
                    <Card>
                      <CardHeader>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between cursor-pointer">
                            <CardTitle className="flex items-center gap-2">
                              <Globe className="h-5 w-5" />
                              Країни ({territories.length} обрано)
                            </CardTitle>
                            <ChevronDown className={`h-5 w-5 transition-transform ${territoriesOpen ? 'rotate-180' : ''}`} />
                          </div>
                        </CollapsibleTrigger>
                      </CardHeader>
                      <CollapsibleContent>
                        <CardContent>
                          <div className="space-y-4">
                            <Input
                              placeholder="Шукати країну..."
                              value={territorySearchQuery}
                              onChange={(e) => setTerritorySearchQuery(e.target.value)}
                              className="mb-4"
                            />

                            {Object.entries(getFilteredCountries()).map(([continent, countries]) => {
                              const allSelected = countries.every(c => territories.includes(c));
                              const someSelected = countries.some(c => territories.includes(c));

                              return (
                                <div key={continent} className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      checked={allSelected}
                                      onCheckedChange={() => toggleContinentSelection(continent)}
                                      className={someSelected && !allSelected ? "data-[state=checked]:bg-primary/50" : ""}
                                    />
                                    <label className="text-sm font-semibold cursor-pointer" onClick={() => toggleContinentSelection(continent)}>
                                      {continent} ({countries.filter(c => territories.includes(c)).length}/{countries.length})
                                    </label>
                                  </div>
                                  <div className="ml-6 grid grid-cols-1 md:grid-cols-3 gap-2">
                                    {countries.map((country) => (
                                      <div key={country} className="flex items-center gap-2">
                                        <Checkbox
                                          checked={territories.includes(country)}
                                          onCheckedChange={() => toggleTerritory(country)}
                                        />
                                        <label className="text-sm cursor-pointer" onClick={() => toggleTerritory(country)}>
                                          {country}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Скасувати
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                      Збереження...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Зберегти зміни
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Warning Dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Увага!
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p className="font-medium">
                Ви збираєтесь редагувати контент, який уже було відправлено до сервісів дистрибуції. 
                Будь-які зміни призведуть до автоматичного замовлення на оновлення контенту в сервісах дистрибуції.
              </p>
              <p className="font-medium">Редагуючи контент, пам'ятайте:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>дотримуватись гайдів метаданих app.muzika.</li>
                <li>що зміни будуть передані всім сервісам, до яких було відправлено ваш контент.</li>
                <li>Внесення змін може зайняти до 10 робочих днів.</li>
                <li>що внесені зміни будуть верифіковані командою IDS і можуть бути відхилені, якщо не відповідатимуть стандартам коректності.</li>
                <li>що зміни мають бути прийняті сервісами дистрибуції. У деяких випадках сервіси можуть відмовитись від внесення змін або навіть відкликати публікацію.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmEdit}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
