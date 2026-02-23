import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, Clock } from "lucide-react";

export default function PaymentVideoSuccess() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'waiting' | 'checking' | 'success' | 'error'>('waiting');
  const [errorMessage, setErrorMessage] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [checkAttempts, setCheckAttempts] = useState(0);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      const params = new URLSearchParams(window.location.search);
      const vidId = params.get('videoId');

      if (!vidId) {
        setStatus('error');
        setErrorMessage('Відсутні необхідні параметри платежу');
        return;
      }

      setVideoId(vidId);
      setStatus('checking');

      try {
        const response = await fetch(`/api/music-videos/${vidId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error('Не вдалося перевірити статус відео');
        }

        if (data.paymentStatus === 'PAID') {
          setStatus('success');
          setTimeout(() => {
            setLocation(`/catalog`);
          }, 3000);
        } else if (checkAttempts < 10) {
          setTimeout(() => {
            setCheckAttempts(prev => prev + 1);
          }, 2000);
        } else {
          setStatus('error');
          setErrorMessage('Очікуємо підтвердження від платіжної системи. Це може зайняти кілька хвилин. Перевірте статус відео в каталозі.');
        }
      } catch (error) {
        console.error('Error checking payment status:', error);
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Не вдалося перевірити статус оплати');
      }
    };

    checkPaymentStatus();
  }, [setLocation, checkAttempts]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            {(status === 'waiting' || status === 'checking') && (
              <>
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                <CardTitle>Перевірка статусу оплати...</CardTitle>
              </>
            )}
            {status === 'success' && (
              <>
                <CheckCircle className="h-8 w-8 text-green-500" />
                <CardTitle>Оплата підтверджена!</CardTitle>
              </>
            )}
            {status === 'error' && (
              <>
                <Clock className="h-8 w-8 text-orange-500" />
                <CardTitle>Очікування підтвердження</CardTitle>
              </>
            )}
          </div>
          <CardDescription>
            {(status === 'waiting' || status === 'checking') && 'Зачекайте, будь ласка...'}
            {status === 'success' && 'Ваше музичне відео успішно оплачено'}
            {status === 'error' && 'Обробка може зайняти кілька хвилин'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(status === 'waiting' || status === 'checking') && (
            <p className="text-sm text-gray-600">
              Очікуємо підтвердження оплати від платіжної системи. 
              Це може зайняти до 30 секунд.
            </p>
          )}
          
          {status === 'success' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Дякуємо за оплату! Тепер ви можете відправити ваше музичне відео на перевірку.
              </p>
              <p className="text-sm text-gray-500">
                Перенаправлення на каталог через 3 секунди...
              </p>
              <Button 
                onClick={() => setLocation('/catalog')}
                className="w-full"
              >
                Перейти до каталогу
              </Button>
            </div>
          )}
          
          {status === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {errorMessage}
              </p>
              <p className="text-sm text-gray-500 text-xs">
                Ваша оплата обробляється платіжною системою. 
                Перевірте статус відео в каталозі через кілька хвилин.
              </p>
              <Button 
                onClick={() => setLocation('/catalog')}
                className="w-full"
              >
                Перейти до каталогу
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
