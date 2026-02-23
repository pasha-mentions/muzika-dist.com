import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { FileText, PlayCircle, Clock, ArrowLeft, Lock, CheckCircle, GraduationCap } from "lucide-react";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  type: "ARTICLE" | "VIDEO";
  coverImageFileId: string | null;
  price: number | null;
  isFree: boolean;
  contentHtml: string | null;
  videoFileId: string | null;
  readingTime: number | null;
  videoDuration: number | null;
  purchased: boolean;
  hasAccess: boolean;
  createdAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  MARKETING: "Маркетинг",
  DISTRIBUTION: "Дистрибуція",
  FINANCE: "Фінанси",
  LEGAL: "Юридичне",
  PRODUCTION: "Продакшн",
  SOCIAL_MEDIA: "Соц. мережі",
};

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getContentPreview(html: string | null): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = html;
  const paragraphs = div.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote");
  const previewElements: string[] = [];
  let count = 0;
  paragraphs.forEach((el) => {
    if (count < 3) {
      previewElements.push(el.outerHTML);
      count++;
    }
  });
  return previewElements.join("");
}

export default function AcademyCoursePage() {
  const { t } = useTranslation();
  const [, params] = useRoute("/academy/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug;

  const { data: course, isLoading } = useQuery<Course>({
    queryKey: ["/api/academy/courses/by-slug", slug],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/academy/courses/by-slug/${slug}`);
      return res.json();
    },
    enabled: !!slug,
  });

  const { data: relatedCourses = [] } = useQuery<Course[]>({
    queryKey: ["/api/academy/courses", course?.category],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/academy/courses?category=${course!.category}`);
      return res.json();
    },
    enabled: !!course?.category,
    select: (data) => data.filter((c) => c.id !== course?.id).slice(0, 3),
  });

  const handlePurchase = async () => {
    if (!course) return;
    const res = await apiRequest("POST", `/api/academy/courses/${course.id}/purchase`);
    const data = await res.json();
    const wayforpay = new (window as any).Wayforpay();
    wayforpay.run(
      {
        merchantAccount: data.merchantAccount,
        merchantDomainName: data.merchantDomainName,
        merchantSignature: data.merchantSignature,
        orderReference: data.orderReference,
        orderDate: data.orderDate,
        amount: data.amount,
        currency: data.currency,
        productName: data.productName,
        productCount: data.productCount,
        productPrice: data.productPrice,
        serviceUrl: data.serviceUrl,
        returnUrl: data.returnUrl,
      },
      function (response: any) {
        window.location.reload();
      },
      function (response: any) {
        console.error("Payment declined:", response);
      },
      function (response: any) {
        console.log("Payment pending:", response);
      }
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="relative w-full h-[400px]">
          <Skeleton className="w-full h-full" />
        </div>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <GraduationCap className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("academy.courseNotFound", "Курс не знайдено")}
        </h2>
        <Button onClick={() => navigate("/academy")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("academy.backToAcademy", "Повернутися до Академії")}
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="relative w-full h-[400px] overflow-hidden">
        {course.coverImageFileId ? (
          <img
            src={`/api/files/${course.coverImageFileId}/proxy`}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400" />
        )}
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-8">
            <Button
              variant="ghost"
              className="text-white hover:bg-white/20 mb-4"
              onClick={() => navigate("/academy")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t("academy.backToAcademy", "Повернутися до Академії")}
            </Button>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-xs">
                {CATEGORY_LABELS[course.category] || course.category}
              </Badge>
              <Badge variant="outline" className="text-xs bg-white/10 text-white border-white/30 gap-1">
                {course.type === "VIDEO" ? (
                  <PlayCircle className="w-3 h-3" />
                ) : (
                  <FileText className="w-3 h-3" />
                )}
                {course.type === "VIDEO" ? "Відео" : "Стаття"}
              </Badge>
              {course.hasAccess && course.purchased && (
                <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Куплено
                </Badge>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              {course.title}
            </h1>
            {course.description && (
              <p className="text-white/80 text-lg mb-4 max-w-2xl">
                {course.description}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant={course.isFree ? "secondary" : "default"}
                className="text-sm px-3 py-1"
              >
                {course.isFree
                  ? "Безкоштовно"
                  : `₴${((course.price || 0) / 100).toFixed(0)}`}
              </Badge>
              {(course.type === "VIDEO" && course.videoDuration) && (
                <div className="flex items-center gap-1.5 text-white/70 text-sm">
                  <Clock className="w-4 h-4" />
                  {formatDuration(course.videoDuration)}
                </div>
              )}
              {(course.type === "ARTICLE" && course.readingTime) && (
                <div className="flex items-center gap-1.5 text-white/70 text-sm">
                  <Clock className="w-4 h-4" />
                  {course.readingTime} хв читання
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {course.hasAccess ? (
          <div>
            {course.type === "ARTICLE" && course.contentHtml && (
              <div
                className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-img:rounded-lg prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-li:text-foreground/90 prose-hr:border-border"
                dangerouslySetInnerHTML={{ __html: course.contentHtml }}
              />
            )}
            {course.type === "VIDEO" && course.contentHtml && (
              <div
                className="prose prose-lg dark:prose-invert max-w-none mb-8 prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-img:rounded-lg prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-li:text-foreground/90"
                dangerouslySetInnerHTML={{ __html: course.contentHtml }}
              />
            )}
            {course.type === "VIDEO" && (
              <div className="relative rounded-xl overflow-hidden bg-black">
                <video
                  controls
                  controlsList="nodownload"
                  disablePictureInPicture
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full aspect-video"
                  src={`/api/academy/courses/${course.id}/video`}
                >
                  Your browser does not support the video tag.
                </video>
                <div
                  className="absolute top-0 left-0 w-full h-full pointer-events-none"
                  style={{ zIndex: 1 }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            {course.contentHtml && (
              <div
                className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-strong:text-foreground prose-img:rounded-lg prose-blockquote:border-l-primary prose-blockquote:text-muted-foreground prose-li:text-foreground/90"
                dangerouslySetInnerHTML={{ __html: getContentPreview(course.contentHtml) }}
              />
            )}
            <div className="relative mt-0">
              <div className="absolute -top-32 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
              <Card className="border-2 border-dashed border-muted-foreground/30">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Lock className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Придбати цей курс
                  </h3>
                  <p className="text-2xl font-bold text-foreground mb-6">
                    ₴{((course.price || 0) / 100).toFixed(0)}
                  </p>
                  <Button size="lg" onClick={handlePurchase}>
                    Оплатити
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {relatedCourses.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold text-foreground mb-6">
              {t("academy.relatedCourses", "Схожі курси")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              {relatedCourses.map((rc) => (
                <Card
                  key={rc.id}
                  className="overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
                  onClick={() => navigate(`/academy/${rc.slug}`)}
                >
                  <div className="relative aspect-video">
                    {rc.coverImageFileId ? (
                      <img
                        src={`/api/files/${rc.coverImageFileId}/proxy`}
                        alt={rc.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-500/20 to-pink-600/20 flex items-center justify-center">
                        <GraduationCap className="w-10 h-10 text-muted-foreground/50" />
                      </div>
                    )}
                    <div className="absolute top-2 left-2">
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORY_LABELS[rc.category] || rc.category}
                      </Badge>
                    </div>
                    <div className="absolute top-2 right-2">
                      <Badge variant="outline" className="text-xs bg-background/80 backdrop-blur-sm gap-1">
                        {rc.type === "VIDEO" ? (
                          <PlayCircle className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        {rc.type === "VIDEO" ? "Відео" : "Стаття"}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground mb-1 line-clamp-1">
                      {rc.title}
                    </h3>
                    {rc.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {rc.description}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={rc.isFree ? "secondary" : "default"}
                        className="text-xs"
                      >
                        {rc.isFree ? "Безкоштовно" : `₴${((rc.price || 0) / 100).toFixed(0)}`}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        {rc.type === "VIDEO" && rc.videoDuration
                          ? formatDuration(rc.videoDuration)
                          : rc.readingTime
                            ? `${rc.readingTime} хв`
                            : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}