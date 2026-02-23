import WayforpayWidget from "@/components/payment/WayforpayWidget";

interface VideoPaymentButtonProps {
  videoId: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "PROCESSING";
  paymentOrderReference?: string | null;
  priceUAH?: number;
}

export default function VideoPaymentButton({ 
  videoId,
  paymentStatus,
  priceUAH,
}: VideoPaymentButtonProps) {
  const defaultPrice = 1000;
  const amount = `${priceUAH ?? defaultPrice} грн`;

  return (
    <WayforpayWidget
      entityType="video"
      entityId={videoId}
      paymentStatus={paymentStatus}
      amount={amount}
      buttonText={`Оплатити (${amount})`}
    />
  );
}
