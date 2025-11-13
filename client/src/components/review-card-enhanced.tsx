import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RatingStars } from "./rating-stars";
import { formatDistanceToNow } from "date-fns";
import { 
  MessageSquare, Send, Trash2, ChevronDown, ChevronUp, Loader2, List, Users
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UserRating } from "@shared/schema";
import { AWARD_TYPES } from "@shared/helpers";

interface ReviewCardEnhancedProps {
  review: UserRating & {
    user?: {
      firstName: string;
      lastName: string;
      profileImageUrl?: string;
    };
  };
  currentUserId?: string;
  posterPath?: string;
  title?: string;
  mediaType?: string;
}

export function ReviewCardEnhanced({ 
  review, 
  currentUserId,
  posterPath,
  title,
  mediaType
}: ReviewCardEnhancedProps) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [animatingAward, setAnimatingAward] = useState<string | null>(null);
  const [mutatingAward, setMutatingAward] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Fetch awards on mount - always visible by default
  const { data: awards = [], isLoading: awardsLoading, error: awardsError } = useQuery({
    queryKey: ['/api/community/reviews', review.id, 'awards'],
  });

  // Fetch user's awards when authenticated
  const { data: userAwards = [], isLoading: userAwardsLoading } = useQuery({
    queryKey: ['/api/community/reviews', review.id, 'user-awards'],
    enabled: !!user?.id,
  });

  // Fetch comments only when toggled
  const { data: comments = [], isLoading: commentsLoading, error: commentsError } = useQuery({
    queryKey: ['/api/community/reviews', review.id, 'comments'],
    enabled: showComments,
  });

  // Fetch related lists containing this media item
  const { data: relatedLists = [], isLoading: relatedListsLoading } = useQuery({
    queryKey: ['/api/community/lists/containing', review.tmdbId, review.mediaType],
    enabled: !!(review.tmdbId && review.mediaType),
  });

  // Award mutations with loading states
  const addAwardMutation = useMutation({
    mutationFn: async (awardType: string) => {
      setMutatingAward(awardType);
      return apiRequest('POST', `/api/community/reviews/${review.id}/awards`, {
        awardType
      });
    },
    onSuccess: () => {
      setMutatingAward(null);
      queryClient.invalidateQueries({ queryKey: ['/api/community/reviews', review.id, 'awards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/reviews', review.id, 'user-awards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      toast({
        title: "Award given",
        description: "Your award has been added to this review."
      });
    },
    onError: () => {
      setMutatingAward(null);
      toast({
        title: "Error",
        description: "Failed to add award. Please try again.",
        variant: "destructive"
      });
    }
  });

  const removeAwardMutation = useMutation({
    mutationFn: async (data: { awardId: string; awardType: string }) => {
      setMutatingAward(data.awardType);
      return apiRequest('DELETE', `/api/community/reviews/${review.id}/awards/${data.awardId}`);
    },
    onSuccess: () => {
      setMutatingAward(null);
      queryClient.invalidateQueries({ queryKey: ['/api/community/reviews', review.id, 'awards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/reviews', review.id, 'user-awards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      toast({
        title: "Award removed",
        description: "Your award has been removed from this review."
      });
    },
    onError: () => {
      setMutatingAward(null);
      toast({
        title: "Error",
        description: "Failed to remove award. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Comment mutations
  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest('POST', `/api/community/reviews/${review.id}/comments`, {
        content
      });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ['/api/community/reviews', review.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      toast({
        title: "Comment added",
        description: "Your comment has been posted."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add comment. Please try again.",
        variant: "destructive"
      });
    }
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return apiRequest('DELETE', `/api/community/reviews/${review.id}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/reviews', review.id, 'comments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      toast({
        title: "Comment deleted",
        description: "Your comment has been removed."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete comment. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleAwardClick = (awardType: string) => {
    if (!isAuthenticated) {
      toast({
        title: "Login required",
        description: "Please log in to give awards.",
        variant: "destructive"
      });
      return;
    }

    // Trigger animation with haptic feedback
    setAnimatingAward(awardType);
    setTimeout(() => setAnimatingAward(null), 600);

    const userAward = Array.isArray(userAwards) ? userAwards.find((a: any) => a.awardType === awardType) : null;
    
    if (userAward) {
      removeAwardMutation.mutate({ awardId: userAward.id, awardType });
    } else {
      addAwardMutation.mutate(awardType);
    }
  };

  const handleCommentSubmit = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login required",
        description: "Please log in to comment.",
        variant: "destructive"
      });
      return;
    }

    if (!commentText.trim()) {
      toast({
        title: "Comment required",
        description: "Please enter a comment.",
        variant: "destructive"
      });
      return;
    }

    addCommentMutation.mutate(commentText.trim());
  };

  const getAwardCount = (type: string) => {
    return Array.isArray(awards) ? awards.filter((a: any) => a.awardType === type).length : 0;
  };

  const hasUserAward = (type: string) => {
    return Array.isArray(userAwards) ? userAwards.some((a: any) => a.awardType === type) : false;
  };

  const totalComments = Array.isArray(comments) ? comments.length : 0;

  // Use provided props as fallbacks for missing review data
  const displayPosterPath = review.posterPath || posterPath;
  const displayTitle = review.title || title;
  const displayMediaType = review.mediaType || mediaType;

  return (
    <Card data-testid={`review-${review.id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <Avatar data-testid={`avatar-user-${review.userId}`}>
            <AvatarImage src={review.user?.profileImageUrl} />
            <AvatarFallback>
              {review.user?.firstName?.[0] || review.userId === currentUserId ? "Me" : "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium" data-testid={`text-user-name-${review.id}`}>
                  {review.user?.firstName && review.user?.lastName 
                    ? `${review.user.firstName} ${review.user.lastName}` 
                    : review.userId === currentUserId ? "Your Review" : "Anonymous User"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {review.createdAt ? formatDistanceToNow(new Date(review.createdAt)) + " ago" : ""}
                </p>
              </div>
              <RatingStars 
                rating={review.rating} 
                readonly 
                size="sm"
                showValue={false}
              />
            </div>
            {review.review && (
              <p className="text-foreground dark:text-foreground mb-3" data-testid={`text-review-content-${review.id}`}>
                {review.review}
              </p>
            )}

            {/* Award Buttons */}
            <div className="flex flex-wrap gap-3 mb-3">
              {awardsLoading || userAwardsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading awards...</span>
                </div>
              ) : awardsError ? (
                <p className="text-sm text-destructive">Failed to load awards</p>
              ) : (
                AWARD_TYPES.map((award) => {
                  const Icon = award.icon;
                  const count = getAwardCount(award.type);
                  const hasAwarded = hasUserAward(award.type);
                  const isThisAwardMutating = mutatingAward === award.type;
                  const isAnimating = animatingAward === award.type;
                  
                  return (
                    <div key={award.type} className="flex flex-col items-center gap-1">
                      <Button
                        variant={hasAwarded ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => handleAwardClick(award.type)}
                        disabled={isThisAwardMutating}
                        className={`${hasAwarded ? 'bg-primary/10 hover:bg-primary/20 border-primary/30 text-primary dark:bg-primary/15 dark:hover:bg-primary/25' : award.color} transition-all duration-200 transform ${
                          isAnimating
                            ? 'scale-110 shadow-md' 
                            : 'hover:scale-105 hover:shadow-sm active:scale-95'
                        } ${hasAwarded ? 'ring-1 ring-primary/20' : ''} flex-col h-auto py-2 px-3`}
                        data-testid={`button-award-${award.type}-${review.id}`}
                      >
                        {isThisAwardMutating ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Icon className={`h-5 w-5 ${isAnimating ? 'animate-bounce' : ''}`} />
                        )}
                        <span className="text-xs mt-1 font-medium">{award.label}</span>
                      </Button>
                      {count > 0 && (
                        <Badge 
                          variant="secondary" 
                          className={`h-5 min-w-[20px] px-1.5 text-xs font-bold transition-all duration-200 ${
                            isAnimating ? 'scale-125 shadow-md' : ''
                          } ${hasAwarded ? 'bg-primary/30 text-primary dark:bg-primary/20 border-primary/50' : 'bg-muted'}`}
                          data-testid={`badge-award-count-${award.type}-${review.id}`}
                        >
                          {count}
                        </Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Comments Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowComments(!showComments)}
              className="text-muted-foreground hover:text-foreground"
              data-testid={`button-toggle-comments-${review.id}`}
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              <span className="text-sm">
                {totalComments} {totalComments === 1 ? 'comment' : 'comments'}
              </span>
              {showComments ? (
                <ChevronUp className="h-4 w-4 ml-1" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-1" />
              )}
            </Button>

            {/* Comments Section */}
            {showComments && (
              <div className="mt-4 space-y-4">
                <Separator />
                
                {/* Comment Input */}
                {isAuthenticated && (
                  <div className="flex gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.profileImageUrl} />
                      <AvatarFallback>{user?.firstName?.[0] || "U"}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 flex gap-2">
                      <Textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="Add a comment..."
                        className="resize-none min-h-[60px]"
                        disabled={addCommentMutation.isPending}
                        data-testid={`textarea-comment-${review.id}`}
                      />
                      <Button
                        size="sm"
                        onClick={handleCommentSubmit}
                        disabled={!commentText.trim() || addCommentMutation.isPending}
                        data-testid={`button-submit-comment-${review.id}`}
                      >
                        {addCommentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Comments List */}
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : commentsError ? (
                  <p className="text-sm text-destructive text-center py-4">Failed to load comments</p>
                ) : Array.isArray(comments) && comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map((comment: any) => (
                      <div key={comment.id} className="flex gap-2" data-testid={`comment-${comment.id}`}>
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={comment.user?.profileImageUrl} />
                          <AvatarFallback>{comment.user?.firstName?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="bg-muted dark:bg-muted rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium text-sm" data-testid={`text-comment-author-${comment.id}`}>
                                {comment.user?.firstName} {comment.user?.lastName}
                              </p>
                              {comment.userId === user?.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteCommentMutation.mutate(comment.id)}
                                  disabled={deleteCommentMutation.isPending}
                                  className="h-6 px-2"
                                  data-testid={`button-delete-comment-${comment.id}`}
                                >
                                  {deleteCommentMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                            </div>
                            <p className="text-sm text-foreground dark:text-foreground" data-testid={`text-comment-content-${comment.id}`}>
                              {comment.content}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 ml-3">
                            {formatDistanceToNow(new Date(comment.createdAt))} ago
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {isAuthenticated ? "No comments yet. Be the first to comment!" : "No comments yet. Log in to be the first to comment!"}
                  </p>
                )}
              </div>
            )}

            {/* Featured in Lists Section */}
            {relatedListsLoading ? (
              <div className="mt-4">
                <Separator className="mb-3" />
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading related lists...</span>
                </div>
              </div>
            ) : Array.isArray(relatedLists) && relatedLists.length > 0 ? (
              <div className="mt-4" data-testid={`featured-lists-${review.id}`}>
                <Separator className="mb-3" />
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <List className="h-4 w-4" />
                  Featured in Lists
                </h4>
                <div className="space-y-2">
                  {relatedLists.slice(0, 5).map((list: any) => (
                    <Link 
                      key={list.id} 
                      href={`/lists/${list.id}`}
                      data-testid={`link-list-${list.id}-${review.id}`}
                    >
                      <div className="group flex items-center gap-3 p-2 rounded-lg hover:bg-muted dark:hover:bg-muted transition-colors cursor-pointer">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors" data-testid={`text-list-title-${list.id}-${review.id}`}>
                            {list.title}
                          </p>
                          <div className="flex items-center gap-3 mt-1">
                            <div className="flex items-center gap-1">
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={list.user?.profileImageUrl} />
                                <AvatarFallback className="text-xs">
                                  {list.user?.firstName?.[0]}{list.user?.lastName?.[0]}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-muted-foreground" data-testid={`text-list-creator-${list.id}-${review.id}`}>
                                {list.user?.firstName} {list.user?.lastName}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1" data-testid={`text-list-item-count-${list.id}-${review.id}`}>
                                <List className="h-3 w-3" />
                                {list.itemCount}
                              </span>
                              <span className="flex items-center gap-1" data-testid={`text-list-follower-count-${list.id}-${review.id}`}>
                                <Users className="h-3 w-3" />
                                {list.followerCount}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
