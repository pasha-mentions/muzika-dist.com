import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";

export default function PaymentFailure() {
  const [, setLocation] = useLocation();
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [trackCount, setTrackCount] = useState<number>(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const relId = params.get('releaseId');
    const tracks = params.get('trackCount');
    
    if (relId) setReleaseId(relId);
    if (tracks) setTrackCount(parseInt(tracks, 10));
  }, []);

  const handleRetryPayment = async () => {
    if (!releaseId) return;
    
    try {
      // Generate order reference and payment URL on server (secure)
      const paymentResponse = await fetch(`/api/releases/${releaseId}/payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!paymentResponse.ok) {
        throw new Error('Failed to generate payment order');
      }

      const { orderReference, paymentUrl } = await paymentResponse.json();
      
      const successUrl = `${window.location.origin}/payment/success?releaseId=${releaseId}&orderReference=${orderReference}&trackCount=${trackCount}`;
      const failureUrl = `${window.location.origin}/payment/failure?releaseId=${releaseId}&trackCount=${trackCount}`;
      
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
              disabled={!releaseId}
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
