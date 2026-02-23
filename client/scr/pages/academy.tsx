import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, PlayCircle, Clock, Search, GraduationCap } from "lucide-react";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: "MARKETING" | "DISTRIBUTION" | "FINANCE" | "LEGAL" | "PRODUCTION" | "SOCIAL_MEDIA";
  type: "ARTICLE" | "VIDEO";
  coverImageFileId: string | null;
  price: number | null;
  isFree: boolean;
  readingTime: number | null;
  videoDuration: number | null;
  status: string;
  purchased: boolean;
  contentHtml: string | null;
  videoFileId: string | null;
  createdAt: string;
}

const CATEGORIES = ["ALL", "MARKETING", "DISTRIBUTION", "FINANCE", "LEGAL", "PRODUCTION", "SOCIAL_MEDIA"] as const;
const TYPES = ["ALL", "ARTICLE", "VIDEO"] as const;

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "Всі",
  MARKETING: "Маркетинг",
  DISTRIBUTION: "Дистрибуція",
  FINANCE: "Фінанси",
  LEGAL: "Юридичне",
  PRODUCTION: "Продакшн",
  SOCIAL_MEDIA: "Соц. мережі",
};

const TYPE_LABELS: Record<string, string> = {
  ALL: "Всі",
  ARTICLE: "Статті",
  VIDEO: "Відео",
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function AcademyPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [category, setCategory] = useState<string>("ALL");
  const [type, setType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (category !== "ALL") params.append("category", category);
    if (type !== "ALL") params.append("type", type);
    return params.toString();
  }, [category, type]);

  const { data: courses = [], isLoading } = useQuery<Course[]>({
    queryKey: ["/api/academy/courses", category, type],
    queryFn: async () => {
      const url = `/api/academy/courses${queryParams ? `?${queryParams}` : ""}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const filteredCourses = useMemo(() => {
    if (!searchQuery.trim()) return courses;
    const q = searchQuery.toLowerCase();
    return courses.filter((c) => c.title.toLowerCase().includes(q));
  }, [courses, searchQuery]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {t("academy.title", "Академія")}
              </h1>
              <p className="text-muted-foreground">
                {t("academy.description", "Навчальні матеріали для незалежних артистів та лейблів")}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="flex-wrap h-auto gap-1">
              {CATEGORIES.map((cat) => (
                <TabsTrigger key={cat} value={cat} className="text-xs sm:text-sm">
                  {CATEGORY_LABELS[cat] || cat}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("academy.searchPlaceholder", "Пошук курсів...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={type} onValueChange={setType}>
              <TabsList>
                {TYPES.map((tp) => (
                  <TabsTrigger key={tp} value={tp} className="text-xs sm:text-sm gap-1.5">
                    {tp === "ARTICLE" && <FileText className="w-3.5 h-3.5" />}
                    {tp === "VIDEO" && <PlayCircle className="w-3.5 h-3.5" />}
                    {TYPE_LABELS[tp] || tp}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {t("academy.noResults", "Курсів не знайдено")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("academy.noResultsDescription", "Спробуйте змінити фільтри або пошуковий запит")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredCourses.map((course) => (
              <Card
                key={course.id}
                className="overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
                onClick={() => navigate(`/academy/${course.slug}`)}
              >
                <div className="relative aspect-video">
                  {course.coverImageFileId ? (
                    <img
                      src={`/api/files/${course.coverImageFileId}/proxy`}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-600/20 flex items-center justify-center">
                      <GraduationCap className="w-10 h-10 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORY_LABELS[course.category] || course.category}
                    </Badge>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Badge variant="outline" className="text-xs bg-background/80 backdrop-blur-sm gap-1">
                      {course.type === "VIDEO" ? (
                        <PlayCircle className="w-3 h-3" />
                      ) : (
                        <FileText className="w-3 h-3" />
                      )}
                      {TYPE_LABELS[course.type] || course.type}
                    </Badge>
                  </div>
                  {course.purchased && (
                    <div className="absolute bottom-2 right-2">
                      <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">
                        Куплено ✓
                      </Badge>
                    </div>
                  )}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
                    {course.title}
                  </h3>
                  {course.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                      {course.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={course.isFree ? "secondary" : "default"}
                      className="text-xs"
                    >
                      {course.isFree ? "Безкоштовно" : `₴${((course.price || 0) / 100).toFixed(0)}`}
                    </Badge>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3.5 h-3.5" />
                      {course.type === "VIDEO" && course.videoDuration
                        ? formatDuration(course.videoDuration)
                        : course.readingTime
                          ? `${course.readingTime} хв`
                          : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
