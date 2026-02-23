import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentVideoFailure() {
  const [, setLocation] = useLocation();
  const [videoId, setVideoId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vidId = params.get('videoId');
    
    if (vidId) setVideoId(vidId);
  }, []);

  const handleRetryPayment = async () => {
    if (!videoId) return;
    
    try {
      const response = await fetch(`/api/music-videos/${videoId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate payment order');
      }

      const paymentData = await response.json();
      const orderReference = paymentData.orderReference;
      const paymentUrl = paymentData.paymentUrl;
      
      const successUrl = `${window.location.origin}/payment/video-success?videoId=${videoId}&orderReference=${orderReference}`;
      const failureUrl = `${window.location.origin}/payment/video-failure?videoId=${videoId}`;
      
      const paymentParams = new URLSearchParams({
        orderReference,
        returnUrl: successUrl,
        cancelUrl: failureUrl
      });

      window.location.href = `${paymentUrl}?${paymentParams.toString()}`;
    } catch (error) {
      console.error('Error retrying payment:', error);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <XCircle className="h-8 w-8 text-red-500" />
            <CardTitle>Оплата не виконана</CardTitle>
          </div>
          <CardDescription>
            Платіж не було завершено успішно
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            На жаль, оплата не пройшла. Це могло статися через:
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-1 ml-2">
            <li>Недостатньо коштів на картці</li>
            <li>Відмова банку</li>
            <li>Скасування операції</li>
            <li>Технічна помилка</li>
          </ul>
          
          <div className="pt-4 space-y-2">
            <Button 
              onClick={handleRetryPayment}
              className="w-full"
              disabled={!videoId}
            >
              Спробувати оплатити знову
            </Button>
            <Button 
              onClick={() => setLocation('/catalog')}
              variant="outline"
              className="w-full"
            >
              Повернутися до каталогу
            </Button>
          </div>
          
          <p className="text-xs text-gray-500 text-center pt-2">
            Якщо у вас виникли питання, зверніться до служби підтримки
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
