import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

interface NotificationWithActor extends Notification {
  actor?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  } | null;
}

export function NotificationBell() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, isAuthenticated } = useAuth();

  // Get unread count
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['/api/community/notifications/unread/count'],
    enabled: isAuthenticated,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Get recent notifications
  const { data: notifications = [] } = useQuery<NotificationWithActor[]>({
    queryKey: ['/api/community/notifications'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user?.id) {
            headers["x-user-id"] = user.id;
          }
        } catch (error) {
          console.error('Failed to parse user from localStorage', error);
        }
      }
      
      const response = await fetch('/api/community/notifications?limit=10', {
        headers,
        credentials: "include",
      });
      if (!response.ok) throw new Error('Failed to fetch notifications');
      return response.json();
    },
    enabled: isAuthenticated && isOpen,
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest('PUT', `/api/community/notifications/${notificationId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications/unread/count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications'] });
    },
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: NotificationWithActor) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    // Navigate based on notification type and entity
    if (notification.entityType === 'review' && notification.entityId) {
      // Navigate to the movie/show detail page - we'd need to fetch the tmdbId from the review
      // For now, just close the dropdown
      setIsOpen(false);
    } else if (notification.entityType === 'list' && notification.entityId) {
      setLocation(`/lists/${notification.entityId}`);
      setIsOpen(false);
    } else if (notification.entityType === 'user' && notification.actorId) {
      setLocation(`/profile`);
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    // Return appropriate icon based on notification type
    return null; // We'll use the actor avatar instead
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
        data-testid="button-notification-bell"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
            variant="destructive"
            data-testid="badge-notification-count"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-[100]">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold" data-testid="text-notifications-title">Notifications</h3>
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setLocation('/notifications');
                setIsOpen(false);
              }}
              data-testid="button-view-all-notifications"
            >
              View All
            </Button>
          </div>

          <ScrollArea className="h-96">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground" data-testid="text-no-notifications">
                No notifications yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    className={`w-full p-4 text-left hover:bg-accent transition-colors ${
                      !notification.isRead ? 'bg-accent/50' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start space-x-3">
                      {notification.actor && (
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={notification.actor.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {notification.actor.firstName?.[0] || notification.actor.lastName?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex-1 space-y-1">
                        <p className="text-sm leading-tight" data-testid={`text-notification-message-${notification.id}`}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid={`text-notification-time-${notification.id}`}>
                          {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      {!notification.isRead && (
                        <div className="h-2 w-2 rounded-full bg-primary" data-testid={`indicator-unread-${notification.id}`} />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
