import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileText, Settings, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";

export default function AgreementRequired() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user?.agreementAccepted) {
      setLocation('/releases');
    }
  }, [user, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-orange-600" />
          </div>
          <CardTitle className="text-2xl">Потрібна згода з умовами</CardTitle>
          <CardDescription className="text-base">
            Для створення вашого першого релізу необхідно погодитися з Distribution Agreement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900">
                  Distribution Agreement
                </p>
                <p className="text-sm text-blue-700">
                  Ця угода визначає умови співпраці, права та обов'язки при розповсюдженні вашої музики через нашу платформу
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={() => setLocation('/settings')}
            >
              <Settings className="mr-2 h-5 w-5" />
              Перейти до налаштувань
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation('/releases')}
            >
              <Plus className="mr-2 h-5 w-5" />
              Повернутися до створення релізу
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setLocation('/dashboard')}
            >
              Повернутися на головну
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Ви зможете створювати релізи одразу після прийняття умов угоди в налаштуваннях
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
