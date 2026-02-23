import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, Newspaper, MessageCircle, Search, Send, CheckCheck, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDistanceToNow, format } from "date-fns";
import { uk, enUS, pl } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  userId: string;
  releaseId: string | null;
  pitchingId: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  title: string;
  message: string;
  type: string;
  changedFields: string[] | null;
  isRead: boolean;
  createdAt: string;
  link: string | null;
}

interface PlatformNewsItem {
  id: string;
  titleEn: string;
  titleUk: string;
  titlePl: string;
  contentEn: string;
  contentUk: string;
  contentPl: string;
  images: string[];
  youtubeUrl: string | null;
  pdfFileId: string | null;
  publishedAt: string;
}

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

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
  return match ? match[1] : null;
}

export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const [, setLocation] = useLocation();
  const { user, isPlatformAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNews, setSelectedNews] = useState<PlatformNewsItem | null>(null);
  const [message, setMessage] = useState("");
  const [showSupportChat, setShowSupportChat] = useState(false);
  
  // Admin support state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  
  const getDateLocale = () => {
    switch (i18n.language) {
      case 'uk': return uk;
      case 'pl': return pl;
      default: return enUS;
    }
  };

  const getTimeLocale = () => {
    switch (i18n.language) {
      case 'uk': return 'uk-UA';
      case 'pl': return 'pl-PL';
      default: return 'en-US';
    }
  };

  // Notifications query
  const { data: notifications = [], isLoading: loadingNotifications } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const response = await fetch("/api/notifications", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch notifications");
      return response.json();
    },
  });

  const { data: unreadNotifCount = 0 } = useQuery<number>({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const response = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch unread count");
      const data = await response.json();
      return data.count;
    },
    refetchInterval: 30000,
  });

  // Platform news query
  const { data: news = [], isLoading: loadingNews } = useQuery<PlatformNewsItem[]>({
    queryKey: ["/api/platform-news"],
    retry: false,
    staleTime: 0,
  });

  // User support messages
  const { data: userMessages = [], isLoading: loadingUserMessages } = useQuery<SupportMessage[]>({
    queryKey: ['/api/support/messages'],
    enabled: !isPlatformAdmin,
    refetchInterval: showSupportChat ? 10000 : false,
  });

  const { data: userUnreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/support/unread-count'],
    enabled: !isPlatformAdmin,
    refetchInterval: 30000,
  });

  // Admin conversations query
  const { data: conversations = [], isLoading: loadingConversations } = useQuery<Conversation[]>({
    queryKey: ['/api/admin/support/conversations'],
    enabled: isPlatformAdmin,
    refetchInterval: showSupportChat ? 15000 : false,
  });

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
      const response = await fetch(`/api/admin/support/messages/${selectedUserId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch messages");
      return response.json();
    },
    enabled: isPlatformAdmin && !!selectedUserId,
    refetchInterval: selectedUserId ? 5000 : false,
  });

  const supportUnreadCount = isPlatformAdmin ? (adminUnreadData?.count || 0) : (userUnreadData?.count || 0);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [userMessages, adminMessages]);

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "PUT",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark notification as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    },
  });

  // Mark all as read
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "PUT",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to mark all as read");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
      toast({
        title: t('notificationsPage.markedAllRead'),
        description: t('notificationsPage.markedAllReadDesc'),
      });
    },
  });

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

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }
    
    // Handle direct link if present
    if (notification.link) {
      setLocation(notification.link);
      return;
    }
    
    if (notification.pitchingId && notification.type === "PITCHING_SUBMITTED") {
      if (isPlatformAdmin) {
        setLocation(`/admin?pitchingId=${notification.pitchingId}`);
      }
      return;
    }

    // Handle curator chat message notifications - navigate to chat
    if (notification.type === "CURATOR_MESSAGE" || notification.relatedEntityType === "curatorMessage") {
      const applicationId = notification.relatedEntityId;
      if (applicationId) {
        // Check if message is from curator (title contains "куратора") - user is artist
        if (notification.title?.includes("куратора")) {
          setLocation(`/my-applications?chatApplicationId=${applicationId}`);
        } else {
          // Message is from artist - user is curator
          setLocation(`/curator/applications?chatApplicationId=${applicationId}`);
        }
      }
      return;
    }

    // Handle curator payment received - navigate to curator applications
    if (notification.type === "CURATOR_PAYMENT_RECEIVED") {
      const applicationId = notification.relatedEntityId || notification.pitchingId;
      if (applicationId) {
        setLocation(`/curator/applications?id=${applicationId}`);
      } else {
        setLocation("/curator/applications");
      }
      return;
    }

    // Handle account frozen notification - no navigation needed, just show notification
    if (notification.type === "ACCOUNT_FROZEN") {
      return;
    }

    // Handle playlist application notifications - navigate to my applications page
    if (notification.type === "PITCHING_APPLICATION_APPROVED" || 
        notification.type === "PITCHING_APPLICATION_REJECTED" ||
        notification.relatedEntityType === "pitchingApplication" ||
        notification.relatedEntityType === "pitching_application") {
      setLocation("/my-applications");
      return;
    }

    if (notification.releaseId) {
      if (isPlatformAdmin) {
        setLocation(`/admin?releaseId=${notification.releaseId}`);
      } else {
        setLocation(`/release/${notification.releaseId}`);
      }
    }
  };

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
      return date.toLocaleTimeString(getTimeLocale(), { hour: '2-digit', minute: '2-digit' });
    }
    
    return date.toLocaleDateString(getTimeLocale(), {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getLocalizedTitle = (item: PlatformNewsItem) => {
    if (i18n.language === 'uk') return item.titleUk;
    if (i18n.language === 'pl') return item.titlePl;
    return item.titleEn;
  };

  const getLocalizedContent = (item: PlatformNewsItem) => {
    if (i18n.language === 'uk') return item.contentUk;
    if (i18n.language === 'pl') return item.contentPl;
    return item.contentEn;
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

  // Filter notifications based on search query
  const filteredNotifications = notifications.filter(n => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      n.title.toLowerCase().includes(query) ||
      n.message.toLowerCase().includes(query)
    );
  });

  // Filter news based on search query
  const filteredNews = news.filter(n => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      n.titleEn.toLowerCase().includes(query) ||
      n.titleUk.toLowerCase().includes(query) ||
      n.titlePl.toLowerCase().includes(query) ||
      n.contentEn.toLowerCase().includes(query) ||
      n.contentUk.toLowerCase().includes(query) ||
      n.contentPl.toLowerCase().includes(query)
    );
  });

  // Get all items for "All" tab
  const getAllItems = () => {
    const items: Array<{ type: 'notification' | 'news'; data: any; date: Date }> = [];
    
    filteredNotifications.forEach(n => items.push({ type: 'notification', data: n, date: new Date(n.createdAt) }));
    filteredNews.forEach(n => items.push({ type: 'news', data: n, date: new Date(n.publishedAt) }));
    
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const allItems = getAllItems();
  const unreadNotifications = filteredNotifications.filter(n => !n.isRead);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-3 py-2 md:px-4 md:py-3">
        <div className="flex items-center gap-2 md:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10" onClick={() => setLocation('/')}>
            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">{t('notificationsPage.title')}</h1>
          <div className="relative">
            <Search className="absolute left-2.5 md:left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
            <Input
              placeholder={t('notificationsPage.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 md:pl-9 w-[180px] md:w-[200px] h-8 md:h-10 text-sm"
            />
          </div>
        </div>
        
        {/* Quick Actions - Monobank style */}
        <div className="flex gap-3 md:gap-4 mt-3 md:mt-4 pb-1">
          <button
            onClick={() => setShowSupportChat(true)}
            className="flex flex-col items-center gap-1 group"
          >
            <div className="relative">
              <div className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center transition-transform group-hover:scale-105 shadow-lg">
                <MessageCircle className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              {supportUnreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 md:h-5 md:w-5 bg-red-500 text-white text-[10px] md:text-xs rounded-full flex items-center justify-center font-medium">
                  {supportUnreadCount > 9 ? '9+' : supportUnreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] md:text-xs text-center text-muted-foreground max-w-[60px] md:max-w-[70px] leading-tight">
              {t('notificationsPage.contactSupport')}
            </span>
          </button>
          
          <a
            href="https://t.me/muzika_info"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 group"
          >
            <div className="h-12 w-12 md:h-14 md:w-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center transition-transform group-hover:scale-105 shadow-lg">
              <svg className="h-5 w-5 md:h-6 md:w-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
            </div>
            <span className="text-[10px] md:text-xs text-center text-muted-foreground max-w-[60px] md:max-w-[70px] leading-tight">
              {t('notificationsPage.telegramSupport')}
            </span>
          </a>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-3 py-1.5 md:px-4 md:py-2 border-b overflow-x-auto scrollbar-hide">
          <TabsList className="w-max md:w-full justify-start gap-1.5 md:gap-2 bg-transparent p-0 flex-nowrap">
            <TabsTrigger 
              value="all" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-1 md:px-4 text-sm"
            >
              {t('notificationsPage.tabs.all')}
              {unreadNotifCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 md:ml-2 h-4 md:h-5 px-1 md:px-1.5 text-xs">
                  {unreadNotifCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="news" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-1 md:px-4 text-sm"
            >
              {t('notificationsPage.tabs.news')}
            </TabsTrigger>
            <TabsTrigger 
              value="notifications" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-1 md:px-4 text-sm"
            >
              {t('notificationsPage.tabs.notifications')}
              {unreadNotifCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 md:ml-2 h-4 md:h-5 px-1 md:px-1.5 text-xs">{unreadNotifCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger 
              value="unread" 
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full px-3 py-1 md:px-4 text-sm"
            >
              {t('notificationsPage.tabs.unread')}
              {unreadNotifCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 md:ml-2 h-4 md:h-5 px-1 md:px-1.5 text-xs">{unreadNotifCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Unread counter and mark all read */}
        {(activeTab === 'notifications' || activeTab === 'unread') && unreadNotifications.length > 0 && (
          <div className="px-3 py-1.5 md:px-4 md:py-2 flex items-center justify-between border-b bg-muted/30">
            <span className="text-xs md:text-sm text-muted-foreground">
              {unreadNotifications.length} {t('notificationsPage.unreadCount')}
            </span>
            <Button 
              variant="link" 
              size="sm" 
              className="text-primary h-7 md:h-8 text-xs md:text-sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1" />
              {t('notificationsPage.markAllRead')}
            </Button>
          </div>
        )}

        {/* All Tab */}
        <TabsContent value="all" className="mt-0">
          <ScrollArea className="h-[calc(100vh-160px)] md:h-[calc(100vh-180px)]">
            {loadingNotifications || loadingNews ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('common.loading')}...</div>
            ) : allItems.length === 0 ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('notificationsPage.empty')}</div>
            ) : (
              <div className="divide-y">
                {allItems.map((item, index) => (
                  item.type === 'notification' ? (
                    <div
                      key={`notif-${item.data.id}`}
                      className="flex items-start gap-2.5 md:gap-3 p-3 md:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => handleNotificationClick(item.data)}
                    >
                      <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <Bell className="h-4 w-4 md:h-5 md:w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-1.5 md:gap-2">
                          <h4 className={`text-[13px] md:text-sm ${!item.data.isRead ? 'font-semibold' : ''}`}>
                            {item.data.title}
                          </h4>
                          {!item.data.isRead && (
                            <span className="h-1.5 w-1.5 md:h-2 md:w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-[13px] md:text-sm text-muted-foreground line-clamp-2">{item.data.message}</p>
                        <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                          {formatDistanceToNow(item.date, { addSuffix: true, locale: getDateLocale() })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={`news-${item.data.id}`}
                      className="flex items-start gap-2.5 md:gap-3 p-3 md:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setSelectedNews(item.data)}
                    >
                      <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                        <Newspaper className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[13px] md:text-sm font-medium">{getLocalizedTitle(item.data)}</h4>
                        <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                          {format(item.date, 'dd.MM.yyyy')}
                        </p>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* News Tab */}
        <TabsContent value="news" className="mt-0">
          <ScrollArea className="h-[calc(100vh-160px)] md:h-[calc(100vh-180px)]">
            {loadingNews ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('common.loading')}...</div>
            ) : filteredNews.length === 0 ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('notificationsPage.noNews')}</div>
            ) : (
              <div className="divide-y">
                {filteredNews.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 md:gap-3 p-3 md:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedNews(item)}
                  >
                    <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                      <Newspaper className="h-4 w-4 md:h-5 md:w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[13px] md:text-sm font-medium">{getLocalizedTitle(item)}</h4>
                      <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                        {format(new Date(item.publishedAt), 'dd.MM.yyyy')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-0">
          <ScrollArea className="h-[calc(100vh-200px)] md:h-[calc(100vh-220px)]">
            {loadingNotifications ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('common.loading')}...</div>
            ) : filteredNotifications.length === 0 ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('notifications.empty')}</div>
            ) : (
              <div className="divide-y">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-start gap-2.5 md:gap-3 p-3 md:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Bell className="h-4 w-4 md:h-5 md:w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5 md:gap-2">
                        <h4 className={`text-[13px] md:text-sm ${!notification.isRead ? 'font-semibold' : ''}`}>
                          {notification.title}
                        </h4>
                        {!notification.isRead && (
                          <span className="h-1.5 w-1.5 md:h-2 md:w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-[13px] md:text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
                      <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: getDateLocale() })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Unread Tab */}
        <TabsContent value="unread" className="mt-0">
          <ScrollArea className="h-[calc(100vh-200px)] md:h-[calc(100vh-220px)]">
            {loadingNotifications ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('common.loading')}...</div>
            ) : unreadNotifications.length === 0 ? (
              <div className="text-center py-6 md:py-8 text-sm text-muted-foreground">{t('notificationsPage.noUnread')}</div>
            ) : (
              <div className="divide-y">
                {unreadNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-start gap-2.5 md:gap-3 p-3 md:p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="h-9 w-9 md:h-10 md:w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Bell className="h-4 w-4 md:h-5 md:w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5 md:gap-2">
                        <h4 className="text-[13px] md:text-sm font-semibold">
                          {notification.title}
                        </h4>
                        <span className="h-1.5 w-1.5 md:h-2 md:w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                      </div>
                      <p className="text-[13px] md:text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
                      <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: getDateLocale() })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

      </Tabs>

      {/* Support Chat Dialog */}
      <Dialog open={showSupportChat} onOpenChange={(open) => {
        setShowSupportChat(open);
        if (!open) setSelectedUserId(null);
      }}>
        <DialogContent className="max-w-2xl h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              {t('notificationsPage.contactSupport')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 flex flex-col overflow-hidden">
            {isPlatformAdmin ? (
              selectedUserId ? (
                // Admin chat view
                <div className="flex flex-col h-full">
                  <div className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
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
                        <div className="text-center text-muted-foreground py-8">{t('common.loading')}...</div>
                      ) : adminMessages.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">{t('admin.support.noMessages')}</div>
                      ) : (
                        adminMessages.map((msg) => (
                          <div key={msg.id} className={`flex ${msg.senderType === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[75%] p-3 rounded-lg text-sm ${
                              msg.senderType === 'ADMIN'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            }`}>
                              <p className="whitespace-pre-wrap">{msg.message}</p>
                              <p className="text-xs opacity-70 mt-1">{formatDate(msg.createdAt)}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                  
                  <div className="border-t p-4 shrink-0">
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
                          {sendReplyMutation.isPending ? t('support.sending') : (
                            <><Send className="h-4 w-4 mr-2" />{t('admin.support.sendReply')}</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Admin conversations list
                <ScrollArea className="flex-1">
                  {loadingConversations ? (
                    <div className="text-center text-muted-foreground py-8">{t('common.loading')}...</div>
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
                            <p className="text-xs text-muted-foreground truncate">{conv.user.email}</p>
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
              )
            ) : (
              // User chat view
              <div className="flex flex-col h-full">
                <ScrollArea className="flex-1 px-4" ref={scrollRef}>
                  <div className="space-y-3 py-4">
                    {loadingUserMessages ? (
                      <div className="text-center text-muted-foreground py-8">{t('common.loading')}...</div>
                    ) : userMessages.length === 0 ? (
                      <div className="flex justify-start">
                        <div className="max-w-[75%] p-3 rounded-lg text-sm bg-muted text-muted-foreground">
                          <p>{t('support.welcomeMessage')}</p>
                        </div>
                      </div>
                    ) : (
                      userMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.senderType === 'USER' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] p-3 rounded-lg text-sm ${
                            msg.senderType === 'USER'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                            <p className="text-xs opacity-70 mt-1">{formatDate(msg.createdAt)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                
                <div className="border-t p-4 shrink-0">
                  <div className="space-y-2">
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder={t('support.placeholder')}
                      className="resize-none min-h-[80px]"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        {t('support.subject', { organization: user?.organizations?.[0]?.name || t('support.organizationFallback') })}
                      </p>
                      <Button 
                        onClick={sendMessage} 
                        size="sm"
                        disabled={sendMessageMutation.isPending || !message.trim()}
                      >
                        {sendMessageMutation.isPending ? t('support.sending') : (
                          <><Send className="h-4 w-4 mr-2" />{t('support.send')}</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* News Detail Modal */}
      <Dialog open={!!selectedNews} onOpenChange={() => setSelectedNews(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedNews && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{getLocalizedTitle(selectedNews)}</DialogTitle>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedNews.publishedAt), 'dd.MM.yyyy')}
                </p>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div 
                  className="prose prose-sm prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: getLocalizedContent(selectedNews) }}
                />
                {selectedNews.images && selectedNews.images.length > 0 && (
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={`/api/files/download/${selectedNews.images[0]}`}
                      alt="News"
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                {selectedNews.youtubeUrl && extractYoutubeId(selectedNews.youtubeUrl) && (
                  <div className="aspect-video rounded-lg overflow-hidden">
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${extractYoutubeId(selectedNews.youtubeUrl)}`}
                      title="YouTube video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
