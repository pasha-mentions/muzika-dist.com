import WayforpayWidget from "@/components/payment/WayforpayWidget";

interface PaymentButtonProps {
  releaseType: "SINGLE" | "EP" | "ALBUM";
  trackCount: number;
  paymentStatus: "PENDING" | "PAID" | "FAILED";
  releaseId: string;
  paymentOrderReference?: string | null;
  priceUAH?: number;
}

export default function PaymentButton({ 
  trackCount, 
  paymentStatus,
  releaseId,
  priceUAH,
}: PaymentButtonProps) {
  const isSingle = trackCount === 1;
  const defaultPrice = isSingle ? 1000 : 2000;
  const amount = `${priceUAH ?? defaultPrice} грн`;

  return (
    <WayforpayWidget
      entityType="release"
      entityId={releaseId}
      paymentStatus={paymentStatus}
      amount={amount}
    />
  );
}
