import { Gift } from "lucide-react";
import { useHolidayHunt } from "@/contexts/HolidayHuntContext";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface GiftMarkerProps {
  placementId: string;
  className?: string;
}

export function GiftMarker({ placementId, className }: GiftMarkerProps) {
  const { giftData, claimGift, isClaiming } = useHolidayHunt();

  if (!giftData?.enabled || !giftData?.hasGift || giftData?.claimed) {
    return null;
  }

  if (giftData.assignment?.placementId !== placementId) {
    return null;
  }

  return (
    <motion.button
      onClick={claimGift}
      disabled={isClaiming}
      className={cn(
        "relative p-3 rounded-full cursor-pointer transition-all",
        "bg-gradient-to-br from-red-500 via-red-600 to-purple-600",
        "hover:scale-110 hover:shadow-lg hover:shadow-purple-500/40",
        "focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      initial={{ scale: 0, rotate: -180 }}
      animate={{ 
        scale: 1, 
        rotate: 0,
      }}
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.95 }}
      transition={{ 
        type: "spring", 
        stiffness: 260, 
        damping: 20,
        delay: 0.5 
      }}
    >
      <motion.div
        animate={{ 
          y: [0, -4, 0],
        }}
        transition={{ 
          duration: 1.5, 
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <Gift className="h-8 w-8 text-white" />
      </motion.div>
      
      <motion.div
        className="absolute inset-0 rounded-full bg-white/20"
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ 
          duration: 1.5, 
          repeat: Infinity,
          ease: "easeOut"
        }}
      />
    </motion.button>
  );
}
