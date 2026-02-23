import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReleaseDraft } from "@/hooks/useReleaseDraft";
import { format } from "date-fns";
import { uk, pl, enUS } from "date-fns/locale";

interface DraftListProps {
  drafts: ReleaseDraft[];
  onLoadDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  currentDraftId: string | null;
}

export function DraftList({ drafts, onLoadDraft, onDeleteDraft, currentDraftId }: DraftListProps) {
  const { t, i18n } = useTranslation();
  
  const getDateLocale = () => {
    switch (i18n.language) {
      case 'uk':
        return uk;
      case 'pl':
        return pl;
      default:
        return enUS;
    }
  };

  if (drafts.length === 0) {
    return null;
  }

  // Sort by timestamp descending (newest first)
  const sortedDrafts = [...drafts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return (
    <div className="mb-8">
      <h2 className="text-xl font-semibold mb-4">{t('newRelease.drafts.title', 'Розпочаті проекти')} ({drafts.length})</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedDrafts.map((draft) => {
          const isCurrentDraft = draft.id === currentDraftId;
          
          return (
            <Card 
              key={draft.id}
              className={`hover:shadow-md transition-shadow ${isCurrentDraft ? 'ring-2 ring-primary' : ''}`}
            >
              <CardContent className="p-4">
                <div className="flex gap-3">
                  {/* Cover Art */}
                  <div className="flex-shrink-0">
                    {draft.payload?.coverArt?.uploadedUrl ? (
                      <img
                        src={draft.payload.coverArt.uploadedUrl}
                        alt={draft.title || 'Draft'}
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">
                          {(draft.title || draft.payload?.releaseTitle)?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-medium text-sm truncate">
                        {draft.title || draft.payload?.releaseTitle || t('newRelease.drafts.untitled', 'Без назви')}
                      </h3>
                      <span className="text-xs font-semibold text-primary flex-shrink-0">
                        {draft.completionPercentage || 0}%
                      </span>
                    </div>
                    
                    {draft.payload?.artistName && (
                      <p className="text-xs text-muted-foreground truncate mb-2">
                        {draft.payload.artistName}
                      </p>
                    )}
                    
                    <p className="text-xs text-muted-foreground mb-3">
                      {format(new Date(draft.timestamp || draft.updatedAt), 'dd.MM.yyyy HH:mm', { locale: getDateLocale() })}
                    </p>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${draft.completionPercentage}%` }}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={isCurrentDraft ? "secondary" : "default"}
                        className="flex-1 h-8 text-xs"
                        onClick={() => onLoadDraft(draft.id)}
                      >
                        <Play className="w-3 h-3 mr-1" />
                        {isCurrentDraft ? t('newRelease.drafts.current', 'Поточний') : t('newRelease.drafts.continue', 'Продовжити')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t('newRelease.drafts.confirmDelete', 'Видалити цей чорновик?'))) {
                            onDeleteDraft(draft.id);
                          }
                        }}
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
