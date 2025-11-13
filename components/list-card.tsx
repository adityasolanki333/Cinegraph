import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { List, Users, Lock, Globe, Heart, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { userIdToUsername } from "@shared/helpers";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ListCardProps {
  list: {
    id: string;
    title: string;
    description?: string;
    isPublic: boolean;
    itemCount: number;
    followerCount: number;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      profileImageUrl?: string;
    };
    items?: Array<{
      id: string;
      posterPath?: string;
      title: string;
    }>;
  };
  showAuthor?: boolean;
}

export function ListCard({ list, showAuthor = true }: ListCardProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const { data: isFollowing, isLoading: isFollowingLoading } = useQuery({
    queryKey: ['/api/community/lists', list.id, 'is-following'],
    enabled: !!user?.id && list.user?.id !== user?.id,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/community/lists/${list.id}/follow`, {});
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/community/lists', list.id, 'is-following'] });
      
      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(['/api/community/lists', list.id, 'is-following']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['/api/community/lists', list.id, 'is-following'], true);
      
      // Return a context object with the snapshotted value
      return { previousValue };
    },
    onError: (err, variables, context) => {
      // Rollback to the previous value
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(['/api/community/lists', list.id, 'is-following'], context.previousValue);
      }
      toast({
        title: "Error",
        description: "Failed to follow list. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', list.id, 'followers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists'] });
      toast({
        title: "Following list",
        description: `You are now following "${list.title}".`,
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/community/lists/${list.id}/follow`);
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/community/lists', list.id, 'is-following'] });
      
      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(['/api/community/lists', list.id, 'is-following']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['/api/community/lists', list.id, 'is-following'], false);
      
      // Return a context object with the snapshotted value
      return { previousValue };
    },
    onError: (err, variables, context) => {
      // Rollback to the previous value
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(['/api/community/lists', list.id, 'is-following'], context.previousValue);
      }
      toast({
        title: "Error",
        description: "Failed to unfollow list. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', list.id, 'followers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists'] });
      toast({
        title: "Unfollowed list",
        description: `You have unfollowed "${list.title}".`,
      });
    },
  });

  const handleFollowToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast({
        title: "Login required",
        description: "Please log in to follow lists.",
        variant: "destructive",
      });
      return;
    }

    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const previewPosters = list.items?.slice(0, 4) || [];
  const isOwnList = user?.id === list.user?.id;

  return (
    <Link href={`/lists/${list.id}`}>
      <Card className="group hover:shadow-2xl hover:border-primary/50 transition-all duration-300 cursor-pointer overflow-hidden h-full hover:-translate-y-1" data-testid={`list-card-${list.id}`}>
        <CardContent className="p-0 relative">
          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none" />
          
          {previewPosters.length > 0 ? (
            <div className={cn(
              "grid gap-0.5 aspect-square",
              previewPosters.length === 1 && "grid-cols-1",
              previewPosters.length === 2 && "grid-cols-2",
              previewPosters.length >= 3 && "grid-cols-2"
            )}>
              {previewPosters.map((item, idx) => (
                <div key={item.id} className="relative overflow-hidden bg-muted">
                  {item.posterPath ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                      alt={item.title}
                      className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <List className="h-8 w-8 text-muted-foreground transition-transform group-hover:scale-110" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="aspect-square bg-muted flex items-center justify-center">
              <List className="h-12 w-12 text-muted-foreground transition-all duration-300 group-hover:scale-110 group-hover:text-primary" />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3 p-4 transition-all duration-300">
          <div className="w-full">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-lg line-clamp-1 flex-1 transition-colors group-hover:text-primary" data-testid={`text-list-title-${list.id}`}>
                {list.title}
              </h3>
              <Badge variant={list.isPublic ? "secondary" : "outline"} className="shrink-0 transition-all group-hover:scale-105">
                {list.isPublic ? (
                  <>
                    <Globe className="h-3 w-3 mr-1" />
                    Public
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3 mr-1" />
                    Private
                  </>
                )}
              </Badge>
            </div>
            {list.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3" data-testid={`text-list-description-${list.id}`}>
                {list.description}
              </p>
            )}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center" data-testid={`text-list-item-count-${list.id}`}>
                <List className="h-4 w-4 mr-1" />
                {list.itemCount || 0} items
              </span>
              <span className="flex items-center" data-testid={`text-list-follower-count-${list.id}`}>
                <Users className="h-4 w-4 mr-1" />
                {list.followerCount || 0} followers
              </span>
            </div>
          </div>
          {showAuthor && list.user && (
            <div className="flex items-center justify-between w-full pt-2 border-t">
              <Link href={`/profile/${userIdToUsername(list.user.id)}`} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={list.user.profileImageUrl} />
                    <AvatarFallback className="text-xs">
                      {list.user.firstName?.[0]}{list.user.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium" data-testid={`text-list-author-${list.id}`}>
                    {list.user.firstName} {list.user.lastName}
                  </span>
                </div>
              </Link>
              {!isOwnList && isAuthenticated && (
                <Button
                  variant={isFollowing ? "outline" : "default"}
                  size="sm"
                  onClick={handleFollowToggle}
                  disabled={isFollowingLoading || followMutation.isPending || unfollowMutation.isPending}
                  data-testid={`button-follow-list-${list.id}`}
                >
                  {followMutation.isPending || unfollowMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : isFollowing ? (
                    <Heart className="h-3 w-3 mr-1 fill-current" />
                  ) : (
                    <Heart className="h-3 w-3 mr-1" />
                  )}
                  {isFollowing ? "Following" : "Follow"}
                </Button>
              )}
            </div>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
