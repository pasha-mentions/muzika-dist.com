import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface HolidayGiftPrize {
  id: string;
  name: string;
  description: string;
}

interface HolidayGiftAssignment {
  id: string;
  placementId: string;
  claimedAt: string | null;
}

interface HolidayGiftData {
  enabled: boolean;
  hasGift: boolean;
  claimed: boolean;
  reason?: string;
  assignment?: HolidayGiftAssignment;
  prize?: HolidayGiftPrize;
}

interface HolidayHuntContextType {
  giftData: HolidayGiftData | null;
  isLoading: boolean;
  showModal: boolean;
  setShowModal: (show: boolean) => void;
  claimGift: () => void;
  isClaiming: boolean;
  claimedPrize: HolidayGiftPrize | null;
}

const HolidayHuntContext = createContext<HolidayHuntContextType | null>(null);

export function HolidayHuntProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [claimedPrize, setClaimedPrize] = useState<HolidayGiftPrize | null>(null);

  const { data: giftData, isLoading } = useQuery<HolidayGiftData>({
    queryKey: ["/api/holiday-gift"],
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/holiday-gift/claim");
      return response.json();
    },
    onSuccess: (data) => {
      setClaimedPrize(data.prize);
      setShowModal(true);
      queryClient.invalidateQueries({ queryKey: ["/api/holiday-gift"] });
    },
    onError: (error) => {
      console.error("Failed to claim gift:", error);
    },
  });

  const claimGift = () => {
    if (giftData?.hasGift && !giftData?.claimed) {
      claimMutation.mutate();
    }
  };

  return (
    <HolidayHuntContext.Provider
      value={{
        giftData: giftData || null,
        isLoading,
        showModal,
        setShowModal,
        claimGift,
        isClaiming: claimMutation.isPending,
        claimedPrize,
      }}
    >
      {children}
    </HolidayHuntContext.Provider>
  );
}

export function useHolidayHunt() {
  const context = useContext(HolidayHuntContext);
  // Return safe defaults when provider is not present (holiday hunt disabled)
  if (!context) {
    return {
      giftData: null,
      isLoading: false,
      showModal: false,
      setShowModal: () => {},
      claimGift: () => {},
      isClaiming: false,
      claimedPrize: null,
    };
  }
  return context;
}
