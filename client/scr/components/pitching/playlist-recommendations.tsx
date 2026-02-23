import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Music, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";

interface PlaylistRecommendation {
  name: string;
  description: string;
  matchScore: number;
  matchReasons: string[];
  genre?: string;
  targetAudience?: string;
}

interface PlaylistRecommendationsProps {
  releaseId: string;
}

export default function PlaylistRecommendations({ releaseId }: PlaylistRecommendationsProps) {
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery({
    queryKey: ['playlist-recommendations', releaseId],
    queryFn: async () => {
      const response = await fetch(`/api/pitching/playlist-recommendations/${releaseId}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch recommendations');
      }
      
      return response.json() as Promise<{
        track: { title: string; artist: string };
        recommendations: PlaylistRecommendation[];
      }>;
    },
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="mb-6 border-purple-200 dark:border-purple-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            Рекомендації плейлистів Spotify
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Аналізуємо ваш трек на Spotify...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mb-6 border-yellow-200 dark:border-yellow-900">
        <CardContent className="pt-6">
          <Alert variant="default" className="border-yellow-300 dark:border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              {(error as Error).message || 'Не вдалося отримати рекомендації плейлистів'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.recommendations.length === 0) {
    return (
      <Card className="mb-6 border-muted">
        <CardContent className="pt-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Не знайдено підходящих плейлистів для цього треку
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500 hover:bg-green-600";
    if (score >= 60) return "bg-blue-500 hover:bg-blue-600";
    if (score >= 40) return "bg-yellow-500 hover:bg-yellow-600";
    return "bg-gray-500 hover:bg-gray-600";
  };

  const getScoreTextColor = (score: number) => {
    if (score >= 80) return "text-green-700 dark:text-green-400";
    if (score >= 60) return "text-blue-700 dark:text-blue-400";
    if (score >= 40) return "text-yellow-700 dark:text-yellow-400";
    return "text-gray-700 dark:text-gray-400";
  };

  return (
    <Card className="mb-6 border-primary/30 bg-gradient-to-br from-purple-50/50 to-pink-50/50 dark:from-purple-950/20 dark:to-pink-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5 text-primary" />
          Рекомендовані плейлисти Spotify
        </CardTitle>
        <CardDescription>
          На основі аудіо-характеристик треку <strong>{data.track.title}</strong> - {data.track.artist}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-2 p-3 bg-primary/10 rounded-lg border border-primary/20">
          <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">
            Ці плейлисти найкраще підходять для вашого треку на основі аналізу енергії, танцювальності, настрою та інших музичних характеристик
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {data.recommendations.map((playlist, index) => (
            <Card 
              key={index} 
              className="border-primary/20 hover:border-primary/40 transition-all hover:shadow-md"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{playlist.name}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{playlist.description}</p>
                  </div>
                  <Badge className={getScoreColor(playlist.matchScore)}>
                    {playlist.matchScore}%
                  </Badge>
                </div>

                {playlist.matchReasons && playlist.matchReasons.length > 0 && (
                  <div className="space-y-1 mb-3">
                    {playlist.matchReasons.map((reason, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <div className="h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                        <span className={getScoreTextColor(playlist.matchScore)}>{reason}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  {playlist.genre && (
                    <Badge variant="outline" className="text-xs">
                      {playlist.genre}
                    </Badge>
                  )}
                  {playlist.targetAudience && (
                    <Badge variant="outline" className="text-xs">
                      {playlist.targetAudience}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          💡 Порада: Використовуйте ці дані при заповненні інформації про промо-план для пітчингу
        </div>
      </CardContent>
    </Card>
  );
}
