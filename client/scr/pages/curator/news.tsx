import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { uk, pl, enUS } from 'date-fns/locale';
import { Newspaper, ChevronRight, Download, ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';

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

export default function CuratorNewsPage() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedNews, setSelectedNews] = useState<PlatformNewsItem | null>(null);

  const getLocale = () => {
    switch (i18n.language) {
      case 'uk': return uk;
      case 'pl': return pl;
      default: return enUS;
    }
  };

  const { data: news = [], isLoading } = useQuery<PlatformNewsItem[]>({
    queryKey: ["/api/curator/platform-news"],
    enabled: isAuthenticated,
  });

  const getNewsTitle = (item: PlatformNewsItem) => {
    switch (i18n.language) {
      case 'uk': return item.titleUk;
      case 'pl': return item.titlePl;
      default: return item.titleEn;
    }
  };

  const getNewsContent = (item: PlatformNewsItem) => {
    switch (i18n.language) {
      case 'uk': return item.contentUk;
      case 'pl': return item.contentPl;
      default: return item.contentEn;
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/curator')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Newspaper className="h-6 w-6" />
            {t('dashboard.platformNews')}
          </h1>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-5 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : news.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Newspaper className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('curator.dashboard.noApplicationsYet')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <Card 
              key={item.id} 
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedNews(item)}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{getNewsTitle(item)}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {item.publishedAt && format(new Date(item.publishedAt), 'dd.MM.yyyy')}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedNews} onOpenChange={() => setSelectedNews(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{selectedNews && getNewsTitle(selectedNews)}</DialogTitle>
            {selectedNews?.publishedAt && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(selectedNews.publishedAt), 'dd MMMM yyyy', { locale: getLocale() })}
              </p>
            )}
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {selectedNews?.youtubeUrl && extractYoutubeId(selectedNews.youtubeUrl) && (
              <div className="aspect-video mb-4 rounded-lg overflow-hidden">
                <iframe
                  src={`https://www.youtube.com/embed/${extractYoutubeId(selectedNews.youtubeUrl)}`}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            {selectedNews?.images && selectedNews.images.length > 0 && (
              <div className="mb-4 rounded-lg overflow-hidden">
                <img
                  src={`/api/files/download/${selectedNews.images[0]}`}
                  alt=""
                  className="w-full h-auto object-contain max-h-64"
                />
              </div>
            )}
            <div 
              className="prose prose-invert prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedNews ? getNewsContent(selectedNews) : '' }}
            />
            {selectedNews?.pdfFileId && (
              <Button variant="outline" className="mt-4" asChild>
                <a href={`/api/files/download/${selectedNews.pdfFileId}`} download>
                  <Download className="h-4 w-4 mr-2" />
                  {t('common.downloadPdf')}
                </a>
              </Button>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
