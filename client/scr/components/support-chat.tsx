import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, ArrowLeft, Search, User, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface SupportMessage {
  id: string;
  userId: string;
  message: string;
  senderType: 'USER' | 'ADMIN';
  adminId?: string;
  isRead: boolean;
  createdAt: string;
}

interface Conversation {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organizationName: string;
  lastMessage: SupportMessage;
  unreadCount: number;
}

export default function SupportChat() {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const { user, isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Admin-specific state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  
  const getTimeLocale = () => {
    switch (i18n.language) {
      case 'uk': return 'uk-UA';
      case 'pl': return 'pl-PL';
      default: return 'en-US';
    }
  };

  // User messages query
  const { data: userMessages = [], isLoading: loadingUserMessages } = useQuery<SupportMessage[]>({
    queryKey: ['/api/support/messages'],
    enabled: isOpen && !isPlatformAdmin,
    refetchInterval: isOpen && !isPlatformAdmin ? 10000 : false,
  });

  // User unread count
  const { data: userUnreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/support/unread-count'],
    enabled: !isPlatformAdmin,
    refetchInterval: 30000,
  });

  // Admin conversations query
  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ['/api/admin/support/conversations'],
    enabled: isOpen && isPlatformAdmin,
    refetchInterval: isOpen && isPlatformAdmin ? 15000 : false,
  });

  // Admin unread count
  const { data: adminUnreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/admin/support/unread-count'],
    enabled: isPlatformAdmin,
    refetchInterval: 30000,
  });

  // Admin messages for selected user
  const { data: adminMessages = [], isLoading: loadingAdminMessages } = useQuery<SupportMessage[]>({
    queryKey: ['/api/admin/support/messages', selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const response = await fetch(`/api/admin/support/messages/${selectedUserId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: isOpen && isPlatformAdmin && !!selectedUserId,
    refetchInterval: selectedUserId ? 5000 : false,
  });

  const unreadCount = isPlatformAdmin ? (adminUnreadData?.count || 0) : (userUnreadData?.count || 0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [userMessages, adminMessages]);

  // Reset admin state when closing
  useEffect(() => {
    if (!isOpen && isPlatformAdmin) {
      setSelectedUserId(null);
      setReplyMessage("");
      setSearchQuery("");
    }
  }, [isOpen, isPlatformAdmin]);

  // Invalidate unread count when admin views messages
  useEffect(() => {
    if (selectedUserId && isPlatformAdmin) {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/support/unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/support/conversations'] });
    }
  }, [selectedUserId, isPlatformAdmin, queryClient]);

  // User send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const response = await fetch("/api/support/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('support.sendError'));
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/support/messages'] });
      toast({
        title: t('support.messageSent'),
        description: t('support.messageSentDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('toast.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Admin reply mutation
  const sendReplyMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const response = await fetch("/api/admin/support/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, message: messageText }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to send reply");
      }
      return response.json();
    },
    onSuccess: () => {
      setReplyMessage("");
      queryClient.invalidateQueries({ queryKey: ['/api/admin/support/messages', selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/support/conversations'] });
      toast({
        title: t('admin.support.replySent'),
        description: t('admin.support.replySentDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('toast.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sendMessage = () => {
    if (!message.trim()) return;
    const messageText = message;
    setMessage("");
    sendMessageMutation.mutate(messageText);
  };

  const sendReply = () => {
    if (!replyMessage.trim() || !selectedUserId) return;
    sendReplyMutation.mutate(replyMessage);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isPlatformAdmin && selectedUserId) {
        sendReply();
      } else if (!isPlatformAdmin) {
        sendMessage();
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString(getTimeLocale(), { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
    
    return date.toLocaleDateString(getTimeLocale(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredConversations = conversations.filter(conv => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      conv.organizationName.toLowerCase().includes(query) ||
      conv.user.email.toLowerCase().includes(query) ||
      conv.user.firstName?.toLowerCase().includes(query) ||
      conv.user.lastName?.toLowerCase().includes(query)
    );
  });

  const selectedConversation = conversations.find(c => c.userId === selectedUserId);

  // Render admin chat view (selected conversation)
  const renderAdminChatView = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(null)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{selectedConversation?.organizationName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {selectedConversation?.user.email}
          </p>
        </div>
      </div>
      
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="space-y-3 py-4">
          {loadingAdminMessages ? (
            <div className="text-center text-muted-foreground py-8">
              {t('common.loading')}...
            </div>
          ) : adminMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {t('admin.support.noMessages')}
            </div>
          ) : (
            adminMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.senderType === 'ADMIN' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] p-3 rounded-lg text-sm ${
                    msg.senderType === 'ADMIN'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {formatDate(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      <div className="border-t p-4">
        <div className="space-y-2">
          <Textarea
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t('admin.support.replyPlaceholder')}
            className="resize-none min-h-[80px]"
          />
          <div className="flex justify-end">
            <Button 
              onClick={sendReply} 
              size="sm"
              disabled={sendReplyMutation.isPending || !replyMessage.trim()}
            >
              {sendReplyMutation.isPending ? (
                t('support.sending')
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  {t('admin.support.sendReply')}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // Render admin conversations list
  const renderAdminConversationsList = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('admin.support.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        {loadingConversations ? (
          <div className="text-center text-muted-foreground py-8">
            {t('common.loading')}...
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            {searchQuery ? t('admin.support.noSearchResults') : t('admin.support.noConversations')}
          </div>
        ) : (
          <div className="divide-y">
            {filteredConversations.map((conv) => (
              <div
                key={conv.userId}
                onClick={() => setSelectedUserId(conv.userId)}
                className="flex items-center gap-3 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate text-sm">{conv.organizationName}</span>
                    {conv.unreadCount > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-xs shrink-0">
                        {conv.unreadCount}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {conv.user.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessage.senderType === 'ADMIN' ? `${t('admin.support.you')}: ` : ''}
                    {conv.lastMessage.message.substring(0, 40)}
                    {conv.lastMessage.message.length > 40 ? '...' : ''}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatDate(conv.lastMessage.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  // Render user chat view
  const renderUserChatView = () => (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="space-y-3 py-4">
          {loadingUserMessages ? (
            <div className="text-center text-muted-foreground py-8">
              {t('common.loading')}...
            </div>
          ) : userMessages.length === 0 ? (
            <div className="flex justify-start">
              <div className="max-w-[75%] p-3 rounded-lg text-sm bg-muted text-muted-foreground">
                <p>{t('support.welcomeMessage')}</p>
              </div>
            </div>
          ) : (
            userMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.senderType === 'USER' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] p-3 rounded-lg text-sm ${
                    msg.senderType === 'USER'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.message}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {formatDate(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      <div className="border-t p-4">
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={t('support.placeholder')}
            className="resize-none min-h-[80px]"
            data-testid="chat-input"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {t('support.subject', { organization: user?.organizations?.[0]?.name || t('support.organizationFallback') })}
            </p>
            <Button 
              onClick={sendMessage} 
              size="sm"
              disabled={sendMessageMutation.isPending || !message.trim()}
              data-testid="send-message-button"
            >
              {sendMessageMutation.isPending ? t('support.sending') : <><Send className="h-4 w-4 mr-2" />{t('support.send')}</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm"
          className="p-2 relative"
          data-testid="support-chat-button"
          data-tour="support-chat-button"
          title={t('support.title')}
        >
          <MessageCircle className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md h-[500px] flex flex-col p-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="text-base">
            {isPlatformAdmin ? t('admin.support.title') : t('support.title')}
          </DialogTitle>
        </DialogHeader>
        
        {isPlatformAdmin ? (
          selectedUserId ? renderAdminChatView() : renderAdminConversationsList()
        ) : (
          renderUserChatView()
        )}
      </DialogContent>
    </Dialog>
  );
}
