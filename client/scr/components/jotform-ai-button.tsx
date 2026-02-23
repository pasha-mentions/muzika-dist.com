import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function JotformAIButton() {
  const handleClick = () => {
    const width = 700;
    const height = 500;
    const top = (window.outerHeight / 2) - (height / 2);
    const left = (window.outerWidth / 2) - (width / 2);
    
    window.open(
      `https://eu.jotform.com/agent/01998ae9a3507aa7bb142f25c8f95ad993b2?embedMode=popup&parentURL=${encodeURIComponent(window.location.href)}`,
      'blank',
      `scrollbars=yes,toolbar=no,width=${width},height=${height},top=${top},left=${left}`
    );
  };

  return (
    <Button
      onClick={handleClick}
      variant="default"
      size="sm"
      className="gap-2"
      data-testid="ai-assistant-button"
      data-tour="ai-assistant-button"
    >
      <Bot className="h-4 w-4" />
      <span className="hidden sm:inline">Ai chatbot</span>
    </Button>
  );
}
