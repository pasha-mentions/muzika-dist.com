import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

interface WayforpayPaymentData {
  merchantAccount: string;
  merchantDomainName: string;
  merchantSignature: string;
  orderReference: string;
  orderDate: number;
  amount: number;
  currency: string;
  productName: string[];
  productCount: number[];
  productPrice: number[];
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  clientPhone: string;
  language: string;
  serviceUrl: string;
}

declare global {
  interface Window {
    Wayforpay: new () => {
      run: (
        data: Record<string, any>,
        onApproved?: (response: any) => void,
        onDeclined?: (response: any) => void,
        onPending?: (response: any) => void
      ) => void;
      closeit: () => void;
    };
  }
}

interface WayforpayWidgetProps {
  entityType: "release" | "video" | "pitching";
  entityId: string;
  paymentStatus: "PENDING" | "PAID" | "FAILED" | "PROCESSING" | "UNPAID";
  amount: string;
  onPaymentSuccess?: () => void;
  onPaymentError?: (error: string) => void;
  onWidgetClose?: () => void;
  onWidgetOpen?: () => void;
  buttonText?: string;
  className?: string;
  autoStart?: boolean;
}

export default function WayforpayWidget({
  entityType,
  entityId,
  paymentStatus,
  amount,
  onPaymentSuccess,
  onPaymentError,
  onWidgetClose,
  onWidgetOpen,
  buttonText,
  className = "",
  autoStart = false,
}: WayforpayWidgetProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isWayforpayReady, setIsWayforpayReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoStartTriggered, setAutoStartTriggered] = useState(false);

  useEffect(() => {
    const existingScript = document.getElementById("wayforpay-widget");
    if (!existingScript) {
      const script = document.createElement("script");
      script.id = "wayforpay-widget";
      script.src = "https://secure.wayforpay.com/server/pay-widget.js";
      script.async = true;
      script.onload = () => setIsWayforpayReady(true);
      document.head.appendChild(script);
    } else {
      if (window.Wayforpay) {
        setIsWayforpayReady(true);
      } else {
        let attempts = 0;
        const maxAttempts = 50;
        const checkInterval = setInterval(() => {
          attempts++;
          if (window.Wayforpay) {
            setIsWayforpayReady(true);
            clearInterval(checkInterval);
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.warn("Wayforpay script failed to load after max attempts");
          }
        }, 100);
        return () => clearInterval(checkInterval);
      }
    }
  }, []);

  const handlePayment = useCallback(async () => {
    if (!isWayforpayReady) {
      toast({
        title: t("payment.errorTitle"),
        description: t("payment.widgetNotReady", "Платіжний віджет завантажується..."),
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const endpoint = entityType === "release" 
        ? `/api/releases/${entityId}/widget-payment`
        : entityType === "video"
        ? `/api/music-videos/${entityId}/widget-payment`
        : `/api/pitching-applications/${entityId}/widget-payment`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to initiate payment");
      }

      const paymentData: WayforpayPaymentData = await response.json();

      if (!window.Wayforpay) {
        throw new Error("Payment widget not loaded");
      }

      const wayforpay = new window.Wayforpay();
      
      const timeoutId = setTimeout(() => {
        console.warn("Wayforpay widget timeout - resetting processing state");
        setIsProcessing(false);
      }, 30000);

      // Notify parent that widget is about to open (allows closing dialogs/modals)
      onWidgetOpen?.();

      try {
        wayforpay.run(
          {
            merchantAccount: paymentData.merchantAccount,
            merchantDomainName: paymentData.merchantDomainName,
            authorizationType: "SimpleSignature",
            merchantSignature: paymentData.merchantSignature,
            orderReference: paymentData.orderReference,
            orderDate: paymentData.orderDate,
            amount: paymentData.amount,
            currency: paymentData.currency,
            productName: paymentData.productName,
            productPrice: paymentData.productPrice,
            productCount: paymentData.productCount,
            clientFirstName: paymentData.clientFirstName,
            clientLastName: paymentData.clientLastName,
            clientEmail: paymentData.clientEmail,
            clientPhone: paymentData.clientPhone,
            language: paymentData.language,
            serviceUrl: paymentData.serviceUrl,
          },
          (approvedResponse: any) => {
            clearTimeout(timeoutId);
            console.log("Payment approved:", approvedResponse);
            // Close the Wayforpay widget iframe
            wayforpay.closeit();
            toast({
              title: t("payment.successTitle", "Оплата успішна"),
              description: t("payment.successDescription", "Дякуємо за оплату!"),
            });
            queryClient.invalidateQueries({ queryKey: ["/api/releases"] });
            queryClient.invalidateQueries({ queryKey: ["/api/music-videos"] });
            queryClient.invalidateQueries({ queryKey: ["/api/pitching-applications"] });
            setIsProcessing(false);
            onPaymentSuccess?.();
          },
          (declinedResponse: any) => {
            clearTimeout(timeoutId);
            console.log("Payment declined:", declinedResponse);
            wayforpay.closeit();
            toast({
              title: t("payment.errorTitle", "Помилка оплати"),
              description: t("payment.declinedDescription", "Платіж було відхилено. Спробуйте ще раз."),
              variant: "destructive",
            });
            setIsProcessing(false);
            onPaymentError?.("Payment declined");
            onWidgetClose?.();
          },
          (pendingResponse: any) => {
            clearTimeout(timeoutId);
            console.log("Payment pending:", pendingResponse);
            wayforpay.closeit();
            toast({
              title: t("payment.pendingTitle", "Очікування"),
              description: t("payment.pendingDescription", "Платіж обробляється. Це може зайняти кілька хвилин."),
            });
            setIsProcessing(false);
            onWidgetClose?.();
          }
        );
      } catch (widgetError) {
        clearTimeout(timeoutId);
        console.error("Wayforpay widget error:", widgetError);
        setIsProcessing(false);
        throw widgetError;
      }
    } catch (error) {
      console.error("Error initiating payment:", error);
      toast({
        title: t("payment.errorTitle", "Помилка"),
        description: error instanceof Error ? error.message : t("payment.errorDescription", "Не вдалося ініціювати оплату"),
        variant: "destructive",
      });
      setIsProcessing(false);
      onPaymentError?.(error instanceof Error ? error.message : "Unknown error");
      onWidgetClose?.();
    }
  }, [entityType, entityId, isWayforpayReady, t, toast, queryClient, onPaymentSuccess, onPaymentError, onWidgetClose]);

  useEffect(() => {
    if (autoStart && isWayforpayReady && !autoStartTriggered && !isProcessing) {
      setAutoStartTriggered(true);
      handlePayment();
    }
  }, [autoStart, isWayforpayReady, autoStartTriggered, isProcessing, handlePayment]);

  if (paymentStatus === "PAID") {
    return (
      <Button disabled variant="outline" className={`w-full ${className}`}>
        <Check className="w-4 h-4 mr-2" />
        {t("payment.paid", "Оплачено")}
      </Button>
    );
  }

  const defaultButtonText = buttonText || t("payment.payRelease", { amount });

  return (
    <Button
      onClick={handlePayment}
      disabled={isProcessing || !isWayforpayReady}
      className={`w-full bg-[#0488cd] hover:bg-[#0488cd]/80 text-white ${className}`}
    >
      {isProcessing ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          {t("payment.processing", "Обробка...")}
        </>
      ) : (
        <>
          <CreditCard className="w-4 h-4 mr-2" />
          {defaultButtonText}
        </>
      )}
    </Button>
  );
}
