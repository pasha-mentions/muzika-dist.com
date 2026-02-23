import { useHolidayHunt } from "@/contexts/HolidayHuntContext";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Gift, Share2, Download, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useRef, useState } from "react";
import * as htmlToImage from "html-to-image";

export function HolidayGiftModal() {
  const { showModal, setShowModal, claimedPrize } = useHolidayHunt();
  const { toast } = useToast();
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  if (!claimedPrize) return null;

  const generateImage = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    
    try {
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#1a1a2e',
      });
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      return blob;
    } catch (error) {
      console.error("Error generating image:", error);
      return null;
    }
  };

  const downloadImage = async (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "muzika-gift.png";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = async () => {
    setIsGenerating(true);
    
    try {
      const blob = await generateImage();
      
      if (!blob) {
        toast({
          title: "Помилка",
          description: "Не вдалося створити картинку",
          variant: "destructive",
        });
        return;
      }

      const file = new File([blob], "muzika-gift.png", { type: "image/png" });
      const shareData = {
        title: "Подарунок від Muzika",
        text: `Я знайшов подарунок від @muzika.ua.platform! 🎁 ${claimedPrize.name}`,
        files: [file],
      };
      
      if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData);
          return;
        } catch (error: any) {
          if (error.name === 'AbortError') {
            return;
          }
        }
      }
      
      await downloadImage(blob);
      toast({
        title: "Збережено",
        description: "Картинку збережено на ваш пристрій. Поділіться нею в соцмережах!",
      });
    } catch (error) {
      console.error("Share error:", error);
      toast({
        title: "Помилка",
        description: "Не вдалося поділитися. Спробуйте ще раз.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    
    try {
      const blob = await generateImage();
      
      if (blob) {
        await downloadImage(blob);
        toast({
          title: "Збережено",
          description: "Картинку збережено",
        });
      }
    } catch (error) {
      console.error("Download error:", error);
      toast({
        title: "Помилка",
        description: "Не вдалося зберегти картинку",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={showModal} onOpenChange={setShowModal}>
      <DialogContent className="sm:max-w-[360px] p-0 overflow-hidden border-0 bg-transparent [&>button]:hidden" aria-describedby={undefined}>
        <VisuallyHidden>
          <DialogTitle>Подарунок від Muzika</DialogTitle>
        </VisuallyHidden>
        
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 300 }}
          className="flex flex-col"
        >
          <div
            ref={cardRef}
            className="relative bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] rounded-t-2xl overflow-hidden"
            style={{ aspectRatio: "9/16" }}
          >
            <div className="absolute inset-0 opacity-10">
              <img 
                src="/assets/logo_icon_1765533994780.png" 
                alt="" 
                className="w-full h-full object-contain p-8"
                crossOrigin="anonymous"
              />
            </div>
            
            <div className="relative z-10 flex flex-col items-center justify-center h-full p-6 text-center text-white">
              <div className="flex-1 flex flex-col items-center justify-center space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full blur-xl opacity-50" />
                  <div className="relative bg-gradient-to-br from-red-500 via-red-600 to-purple-600 p-6 rounded-full shadow-2xl">
                    <Gift className="h-16 w-16 text-white" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">
                    Вітаємо! 🎁
                  </h2>
                  <p className="text-sm text-white/80">
                    Ви знайшли подарунок від muzika.ua
                  </p>
                </div>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 w-full">
                  <h3 className="text-lg font-semibold mb-2 text-yellow-300">
                    {claimedPrize.name}
                  </h3>
                  <p className="text-sm text-white/80 leading-relaxed">
                    {claimedPrize.description}
                  </p>
                </div>
                
                <div className="mt-4">
                  <p className="text-xs text-white/60">
                    Розкажіть про це друзям та відмічайте
                  </p>
                  <p className="text-sm font-semibold text-primary mt-1">
                    @muzika.ua.platform
                  </p>
                </div>
              </div>
            </div>
            
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-1 h-1 bg-yellow-400 rounded-full"
                  initial={{
                    x: Math.random() * 360,
                    y: -10,
                    opacity: 0,
                  }}
                  animate={{
                    y: 640,
                    opacity: [0, 1, 0],
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    repeat: Infinity,
                    delay: Math.random() * 3,
                    ease: "linear",
                  }}
                />
              ))}
            </div>
          </div>
          
          <div className="bg-[#0f3460] rounded-b-2xl p-4 space-y-3">
            <div className="flex gap-2">
              <Button
                onClick={handleShare}
                disabled={isGenerating}
                className="flex-1 bg-white/20 hover:bg-white/30 text-white border-0"
                variant="outline"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                Поділитися
              </Button>
              
              <Button
                onClick={handleDownload}
                disabled={isGenerating}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
                variant="outline"
                size="icon"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            <Button
              onClick={() => setShowModal(false)}
              variant="ghost"
              className="w-full text-white/60 hover:text-white hover:bg-white/10"
            >
              Закрити
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
