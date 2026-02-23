import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Lock, Music } from "lucide-react";

interface PaidReleaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaidReleaseModal({ open, onOpenChange }: PaidReleaseModalProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const handleCreateRelease = () => {
    onOpenChange(false);
    navigate("/releases");
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <AlertDialogTitle className="text-xl text-center">
            {t('paidReleaseGate.title', 'Доступ обмежено')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {t('paidReleaseGate.description', 'Інструменти просування будуть доступні після публікації вашого першого релізу.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogAction
            onClick={handleCreateRelease}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90"
          >
            <Music className="w-4 h-4 mr-2" />
            {t('paidReleaseGate.createRelease', 'Створити реліз')}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto bg-muted hover:bg-muted/80 text-foreground"
          >
            {t('paidReleaseGate.close', 'Закрити')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
