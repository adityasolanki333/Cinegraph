import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Trash2, CheckCheck, User, MessageSquare, Award, Heart, List, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
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

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [filterType, setFilterType] = useState<string>('all');

  const { data: notifications = [], isLoading } = useQuery<NotificationWithActor[]>({
    queryKey: ['/api/community/notifications', { unreadOnly: filterType === 'unread' }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '50',
        ...(filterType === 'unread' && { unreadOnly: 'true' })
      });
      
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
      
      const response = await fetch(`/api/community/notifications?${params}`, {
        headers,
        credentials: "include",
      });
      if (!response.ok) throw new Error('Failed to fetch notifications');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest('PUT', `/api/community/notifications/${notificationId}/read`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications/unread/count'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PUT', '/api/community/notifications/read-all', {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications/unread/count'] });
      toast({
        title: "All notifications marked as read",
      });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest('DELETE', `/api/community/notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/notifications/unread/count'] });
      toast({
        title: "Notification deleted",
      });
    },
  });

  const handleNotificationClick = (notification: NotificationWithActor) => {
    if (!notification.isRead) {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.entityType === 'list' && notification.entityId) {
      setLocation(`/lists/${notification.entityId}`);
    } else if (notification.type === 'message') {
      setLocation('/messages');
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'follow':
        return <Users className="h-4 w-4" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4" />;
      case 'award':
        return <Award className="h-4 w-4" />;
      case 'list_follow':
        return <List className="h-4 w-4" />;
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const filteredNotifications = filterType === 'all' 
    ? notifications 
    : notifications.filter(n => n.type === filterType || (filterType === 'unread' && !n.isRead));

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background py-8">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-notifications-heading">Notifications</h1>
            <p className="text-muted-foreground mt-1">Stay updated with your activity</p>
          </div>
          {notifications.some(n => !n.isRead) && (
            <Button
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Mark All Read
            </Button>
          )}
        </div>

        <Tabs value={filterType} onValueChange={setFilterType} className="mb-6">
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="unread" data-testid="tab-unread">Unread</TabsTrigger>
            <TabsTrigger value="follow" data-testid="tab-follow">Follows</TabsTrigger>
            <TabsTrigger value="comment" data-testid="tab-comment">Comments</TabsTrigger>
            <TabsTrigger value="award" data-testid="tab-award">Awards</TabsTrigger>
            <TabsTrigger value="message" data-testid="tab-message">Messages</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start space-x-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <Card className="p-12">
            <div className="text-center" data-testid="text-no-notifications-found">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No notifications</h3>
              <p className="text-muted-foreground">
                {filterType === 'all' 
                  ? "You don't have any notifications yet"
                  : `No ${filterType} notifications`}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`p-4 cursor-pointer hover:bg-accent transition-colors ${
                  !notification.isRead ? 'border-primary/50 bg-accent/50' : ''
                }`}
                onClick={() => handleNotificationClick(notification)}
                data-testid={`notification-card-${notification.id}`}
              >
                <div className="flex items-start space-x-4">
                  {notification.actor ? (
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={notification.actor.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {notification.actor.firstName?.[0] || notification.actor.lastName?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                      {getNotificationIcon(notification.type)}
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed" data-testid={`text-notification-message-${notification.id}`}>
                      {notification.message}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-notification-time-${notification.id}`}>
                      {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    {!notification.isRead && (
                      <div className="h-2 w-2 rounded-full bg-primary" data-testid={`indicator-unread-${notification.id}`} />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotificationMutation.mutate(notification.id);
                      }}
                      data-testid={`button-delete-${notification.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
