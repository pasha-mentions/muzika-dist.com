import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Bot, X, Minimize2 } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function AIChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: window.innerWidth - 440, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const chatRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!document.querySelector('script[src*="jotfor.ms"]')) {
      const script = document.createElement("script");
      script.src = "https://cdn.jotfor.ms/agent/embedjs/01998ae9a3507aa7bb142f25c8f95ad993b2/embed.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.chat-header')) {
      setIsDragging(true);
      const rect = chatRef.current?.getBoundingClientRect();
      if (rect) {
        setDragOffset({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top
        });
      }
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging && chatRef.current) {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      const maxX = window.innerWidth - chatRef.current.offsetWidth;
      const maxY = window.innerHeight - chatRef.current.offsetHeight;
      
      setPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 px-6 shadow-lg z-50 gap-2 rounded-full"
          size="lg"
        >
          <Bot className="h-5 w-5" />
          <span className="font-medium">Ai чат-бот</span>
        </Button>
      )}

      {isOpen && (
        <Card
          ref={chatRef}
          className="fixed z-50 shadow-2xl overflow-hidden"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: '400px',
            height: '600px',
            maxWidth: '90vw',
            maxHeight: '90vh'
          }}
        >
          <div
            className="chat-header bg-primary text-primary-foreground p-4 flex items-center justify-between cursor-move select-none"
            onMouseDown={handleMouseDown}
          >
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-semibold">Ai чат-бот</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-primary-foreground/20 text-primary-foreground"
                onClick={() => setIsOpen(false)}
                title="Згорнути"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-primary-foreground/20 text-primary-foreground"
                onClick={() => setIsOpen(false)}
                title="Закрити"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="h-[calc(100%-64px)] w-full bg-background overflow-hidden">
            <iframe
              ref={iframeRef}
              src="https://form.jotform.com/01998ae9a3507aa7bb142f25c8f95ad993b2"
              className="w-full h-full border-0"
              title="AI Chatbot"
              allow="geolocation; microphone; camera"
            />
          </div>
        </Card>
      )}
    </>
  );
}
