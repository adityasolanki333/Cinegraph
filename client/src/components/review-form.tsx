import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { RatingStars } from "./rating-stars";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { InsertUserRating } from "@shared/schema";

interface ReviewFormProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath?: string | null;
  existingRating?: {
    id: string;
    rating: number;
    review: string | null;
  };
  onSuccess?: () => void;
}

export function ReviewForm({ 
  tmdbId, 
  mediaType, 
  title, 
  posterPath,
  existingRating,
  onSuccess 
}: ReviewFormProps) {
  const [rating, setRating] = useState(existingRating?.rating || 0);
  const [review, setReview] = useState(existingRating?.review || "");
  const [isDeleted, setIsDeleted] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Reset state when existingRating changes (e.g., after delete->create cycle)
  useEffect(() => {
    if (existingRating?.id) {
      setIsDeleted(false);
      setRating(existingRating.rating);
      setReview(existingRating.review || "");
    }
  }, [existingRating?.id, existingRating?.rating, existingRating?.review]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertUserRating) => {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to create rating" }));
        throw new Error(error.error || "Failed to create rating");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Review submitted!", 
        description: "Your rating and review have been saved."
      });
      // Reset isDeleted flag after successful create
      setIsDeleted(false);
      // Invalidate all rating-related queries
      queryClient.invalidateQueries({ queryKey: ['/api/ratings'] });
      // Invalidate profile queries to update stats in real-time
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/users', user.id, 'ratings'] });
        queryClient.invalidateQueries({ queryKey: ['/api/community', user.id, 'stats'] });
      }
      // Invalidate community queries to update feed, top reviews, and leaderboards
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/trending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/leaderboards'] });
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Create rating error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to submit your review. Please try again.",
        variant: "destructive"
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { rating: number; review: string }) => {
      const response = await fetch(`/api/ratings/${existingRating!.id}`, {
        method: "PUT",
        headers: { 
          "Content-Type": "application/json",
          "x-user-id": user?.id || ""
        },
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to update rating" }));
        throw new Error(error.error || "Failed to update rating");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Review updated!", 
        description: "Your rating and review have been updated."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ratings'] });
      // Invalidate profile queries to update stats
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/users', user.id, 'ratings'] });
        queryClient.invalidateQueries({ queryKey: ['/api/community', user.id, 'stats'] });
      }
      // Invalidate community queries to update feed, top reviews, and leaderboards
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/trending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/leaderboards'] });
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Update rating error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to update your review. Please try again.",
        variant: "destructive"
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/ratings/${existingRating!.id}`, {
        method: "DELETE",
        headers: {
          "x-user-id": user?.id || ""
        }
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to delete rating" }));
        throw new Error(error.error || "Failed to delete rating");
      }
      // 204 No Content responses don't have a body
      if (response.status === 204) {
        return { success: true };
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: "Review deleted", 
        description: "Your rating and review have been removed."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ratings'] });
      // Invalidate profile queries to update stats
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/users', user.id, 'ratings'] });
        queryClient.invalidateQueries({ queryKey: ['/api/community', user.id, 'stats'] });
      }
      // Invalidate community queries to update feed, top reviews, and leaderboards
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/top-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/trending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/leaderboards'] });
      setRating(0);
      setReview("");
      setIsDeleted(true);
      onSuccess?.();
    },
    onError: (error) => {
      console.error("Delete rating error:", error);
      toast({ 
        title: "Error", 
        description: "Failed to delete your review. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (rating === 0) {
      toast({ 
        title: "Rating required", 
        description: "Please select a rating before submitting.",
        variant: "destructive"
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: "Authentication required",
        description: "Please log in to submit a review.",
        variant: "destructive"
      });
      return;
    }

    if (existingRating && !isDeleted) {
      updateMutation.mutate({ rating, review });
    } else {
      createMutation.mutate({
        userId: user.id,
        tmdbId,
        mediaType,
        title,
        posterPath,
        rating,
        review: review.trim() || null
      });
    }
  };

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteDialog(false);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {existingRating && !isDeleted ? "Update Your Review" : "Rate & Review"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Your Rating
              </label>
              <RatingStars
                rating={rating}
                onRatingChange={setRating}
                size="lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Your Review (Optional)
              </label>
              <Textarea
                data-testid="review-textarea"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Share your thoughts about this movie/show..."
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="flex justify-between">
              <div className="flex gap-2">
                <Button 
                  type="submit" 
                  disabled={isLoading || rating === 0}
                  data-testid="submit-review-button"
                >
                  {isLoading ? "Saving..." : (existingRating && !isDeleted) ? "Update Review" : "Submit Review"}
                </Button>
                
                {existingRating && !isDeleted && (
                  <Button 
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isLoading}
                    data-testid="delete-review-button"
                  >
                    {deleteMutation.isPending ? "Deleting..." : "Delete Review"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="delete-confirmation-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete your review?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your rating and review will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="cancel-delete-button">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-button"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}