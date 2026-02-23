import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CuratorMessage {
  id: string;
  applicationId: string;
  senderId: string;
  senderType: 'ARTIST' | 'CURATOR';
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface CuratorPresence {
  isOnline: boolean;
  curatorName: string | null;
}

interface CuratorChatProps {
  applicationId: string;
  applicationCode: string;
  playlistName?: string;
  artistName?: string;
  isCuratorView?: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export default function CuratorChat({ applicationId, applicationCode, playlistName, artistName, isCuratorView = false, isOpen, onClose }: CuratorChatProps) {
  const { t, i18n } = useTranslation();
  const [message, setMessage] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const getTimeLocale = () => {
    switch (i18n.language) {
      case 'uk': return 'uk-UA';
      case 'pl': return 'pl-PL';
      default: return 'en-US';
    }
  };

  const { data: messages = [], isLoading } = useQuery<CuratorMessage[]>({
    queryKey: ['/api/curator-messages', applicationId],
    queryFn: async () => {
      const res = await fetch(`/api/curator-messages/${applicationId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: isOpen ? 5000 : false,
  });

  const { data: presence } = useQuery<CuratorPresence>({
    queryKey: ['/api/curator-presence', applicationId],
    queryFn: async () => {
      const res = await fetch(`/api/curator-presence/${applicationId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch presence');
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: isOpen ? 30000 : false,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const res = await fetch(`/api/curator-messages/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: messageText }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/curator-messages', applicationId] });
      setMessage("");
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("curatorChat.error"),
        description: t("curatorChat.sendError"),
      });
    },
  });

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessageMutation.mutate(message.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString(getTimeLocale(), { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString(getTimeLocale(), { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-primary" />
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${
                  presence?.isOnline ? 'bg-emerald-500' : 'bg-gray-400'
                }`} />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  {isCuratorView 
                    ? (artistName || t("curatorChat.artist"))
                    : (presence?.curatorName || t("curatorChat.curator"))
                  }
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${presence?.isOnline ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    {presence?.isOnline ? t("curatorChat.online") : t("curatorChat.offline")}
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">{applicationCode}</span>
                </div>
              </div>
            </div>
          </div>
          {playlistName && (
            <p className="text-xs text-muted-foreground mt-2 truncate">
              {t("curatorChat.regarding")}: {playlistName}
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
          <div className="space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>{t("curatorChat.noMessages")}</p>
                <p className="text-xs mt-1">{t("curatorChat.startConversation")}</p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMyMessage = isCuratorView 
                  ? msg.senderType === 'CURATOR' 
                  : msg.senderType === 'ARTIST';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        isMyMessage
                          ? 'bg-primary text-primary-foreground rounded-tr-sm'
                          : 'bg-muted rounded-tl-sm'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                      <p className={`text-[10px] mt-1 ${
                        isMyMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'
                      }`}>
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <div className="p-4 pt-3 border-t shrink-0">
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("curatorChat.placeholder")}
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!message.trim() || sendMessageMutation.isPending}
              size="icon"
              className="shrink-0 h-[44px] w-[44px]"
            >
              {sendMessageMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
