import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotificationsDropdown() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const { data: unreadNotifCount = 0 } = useQuery<number>({
    queryKey: ["notifications", "unread-count"],
    queryFn: async () => {
      const response = await fetch("/api/notifications/unread-count", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch unread count");
      }
      const data = await response.json();
      return data.count;
    },
    refetchInterval: 30000,
  });

  const { data: supportUnreadData } = useQuery<{ count: number }>({
    queryKey: ['/api/support/unread-count'],
    refetchInterval: 30000,
  });

  const totalUnread = unreadNotifCount + (supportUnreadData?.count || 0);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="p-2 relative"
      data-testid="notifications-button"
      data-tour="notifications-button"
      onClick={() => setLocation('/notifications')}
      title={t('notifications.title')}
    >
      <MessageCircle className="h-5 w-5" />
      {totalUnread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {totalUnread > 9 ? '9+' : totalUnread}
        </span>
      )}
    </Button>
  );
}
