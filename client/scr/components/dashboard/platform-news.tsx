import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Newspaper, ChevronRight, Image as ImageIcon, FileText, Download, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";

interface PlatformNewsItem {
  id: string;
  titleEn: string;
  titleUk: string;
  titlePl: string;
  contentEn: string;
  contentUk: string;
  contentPl: string;
  images: string[];
  youtubeUrl: string | null;
  pdfFileId: string | null;
  publishedAt: string;
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
}

function ImageGallery({ images }: { images: string[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (images.length === 0) return null;

  const goToPrevious = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative">
      <div className="aspect-video bg-muted rounded-lg overflow-hidden">
        <img
          src={`/api/files/download/${images[currentIndex]}`}
          alt={`Image ${currentIndex + 1}`}
          className="w-full h-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <>
          <Button
            variant="outline"
            size="icon"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80"
            onClick={goToPrevious}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80"
            onClick={goToNext}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {images.map((_, index) => (
              <button
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? "bg-primary" : "bg-muted-foreground/50"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setCurrentIndex(index);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NewsDetailModal({ 
  news, 
  isOpen, 
  onClose,
  currentLang 
}: { 
  news: PlatformNewsItem | null; 
  isOpen: boolean; 
  onClose: () => void;
  currentLang: string;
}) {
  const { t } = useTranslation();
  
  if (!news) return null;

  const getLocalizedTitle = () => {
    if (currentLang === 'uk') return news.titleUk;
    if (currentLang === 'pl') return news.titlePl;
    return news.titleEn;
  };

  const getLocalizedContent = () => {
    if (currentLang === 'uk') return news.contentUk;
    if (currentLang === 'pl') return news.contentPl;
    return news.contentEn;
  };

  const youtubeId = news.youtubeUrl ? extractYoutubeId(news.youtubeUrl) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{getLocalizedTitle()}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {format(new Date(news.publishedAt), 'dd.MM.yyyy')}
          </p>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div 
            className="prose prose-sm prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: getLocalizedContent() }}
          />

          {news.images && news.images.length > 0 && (
            <ImageGallery images={news.images} />
          )}

          {youtubeId && (
            <div className="aspect-video rounded-lg overflow-hidden">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title="YouTube video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {news.pdfFileId && (
            <a
              href={`/api/files/download/${news.pdfFileId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted transition-colors"
            >
              <FileText className="h-5 w-5 text-red-500" />
              <span className="flex-1">{t('dashboard.news.downloadPdf', 'Завантажити PDF')}</span>
              <Download className="h-4 w-4" />
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PlatformNews() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;
  const [selectedNews, setSelectedNews] = useState<PlatformNewsItem | null>(null);

  const { data: news = [], isLoading } = useQuery<PlatformNewsItem[]>({
    queryKey: ["/api/platform-news"],
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const getLocalizedTitle = (item: PlatformNewsItem) => {
    if (currentLang === 'uk') return item.titleUk;
    if (currentLang === 'pl') return item.titlePl;
    return item.titleEn;
  };

  const getLocalizedContent = (item: PlatformNewsItem) => {
    if (currentLang === 'uk') return item.contentUk;
    if (currentLang === 'pl') return item.contentPl;
    return item.contentEn;
  };

  const stripHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  };

  const hasMedia = (item: PlatformNewsItem) => {
    return (item.images && item.images.length > 0) || item.youtubeUrl || item.pdfFileId;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            {t('dashboard.news.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-full"></div>
                <div className="h-3 bg-muted rounded w-1/4"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!news || news.length === 0) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            {t('dashboard.news.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[200px] px-6 pb-6">
            <div className="space-y-4">
              {news.map((item, index) => (
                <div 
                  key={item.id} 
                  className={`cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors ${
                    index !== news.length - 1 ? "border-b border-border pb-4" : ""
                  }`}
                  onClick={() => setSelectedNews(item)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-foreground text-sm">
                          {getLocalizedTitle(item)}
                        </h4>
                        {hasMedia(item) && (
                          <div className="flex items-center gap-1">
                            {item.images && item.images.length > 0 && (
                              <ImageIcon className="h-3 w-3 text-muted-foreground" />
                            )}
                            {item.pdfFileId && (
                              <FileText className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex-shrink-0">
                        {format(new Date(item.publishedAt), 'dd.MM.yyyy')}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <NewsDetailModal
        news={selectedNews}
        isOpen={!!selectedNews}
        onClose={() => setSelectedNews(null)}
        currentLang={currentLang}
      />
    </>
  );
}
