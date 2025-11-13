import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RatingStars } from "./rating-stars";
import { ReviewCardEnhanced } from "./review-card-enhanced";
import { formatDistanceToNow } from "date-fns";
import { Clock, TrendingUp } from "lucide-react";
import type { UserRating } from "@shared/schema";

interface ReviewListProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
  currentUserId?: string;
}

export function ReviewList({ tmdbId, mediaType, currentUserId }: ReviewListProps) {
  const [tmdbSortBy, setTmdbSortBy] = useState<'latest' | 'popular'>('latest');
  const [tmdbPage, setTmdbPage] = useState(1);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['/api/ratings', tmdbId, mediaType],
    queryFn: async (): Promise<UserRating[]> => {
      const response = await fetch(`/api/ratings?tmdbId=${tmdbId}&mediaType=${mediaType}`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      return response.json();
    }
  });

  const { data: tmdbReviews, isLoading: tmdbLoading } = useQuery({
    queryKey: ['/api/tmdb', mediaType, tmdbId, 'reviews', tmdbPage],
    queryFn: async () => {
      const response = await fetch(`/api/tmdb/${mediaType}/${tmdbId}/reviews?page=${tmdbPage}`);
      if (!response.ok) throw new Error('Failed to fetch TMDB reviews');
      return response.json();
    }
  });

  if (isLoading || tmdbLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  const localReviews = reviews || [];
  const externalReviews = tmdbReviews?.results || [];
  
  // Apply sorting to TMDB reviews without breaking pagination
  // Note: We sort each page individually to maintain TMDB's pagination
  const sortedTmdbReviews = [...externalReviews].sort((a: any, b: any) => {
    if (tmdbSortBy === 'latest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // For popular, we'll sort by author rating if available, otherwise by created date
    const aRating = a.author_details?.rating || 0;
    const bRating = b.author_details?.rating || 0;
    if (aRating !== bRating) {
      return bRating - aRating;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-6">
      {/* Local Reviews */}
      {localReviews.length > 0 && (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Community Reviews</h3>
          </div>
          <div className="space-y-4">
            {localReviews.map((review) => (
              <ReviewCardEnhanced 
                key={review.id}
                review={review}
                currentUserId={currentUserId}
              />
            ))}
          </div>
        </div>
      )}

      {/* TMDB Reviews */}
      {sortedTmdbReviews.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">TMDB Reviews</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <div className="flex gap-1">
                <Button
                  variant={tmdbSortBy === 'latest' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setTmdbSortBy('latest');
                    setTmdbPage(1); // Reset to page 1 when sorting changes
                  }}
                  className="h-8 text-xs"
                  data-testid="button-sort-latest"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Latest
                </Button>
                <Button
                  variant={tmdbSortBy === 'popular' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setTmdbSortBy('popular');
                    setTmdbPage(1); // Reset to page 1 when sorting changes
                  }}
                  className="h-8 text-xs"
                  data-testid="button-sort-popular"
                >
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Popular
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            {sortedTmdbReviews.map((review: any) => (
              <Card key={review.id} data-testid={`tmdb-review-${review.id}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarImage 
                        src={review.author_details?.avatar_path ? 
                          `https://image.tmdb.org/t/p/w45${review.author_details.avatar_path}` : 
                          undefined} 
                      />
                      <AvatarFallback>
                        {review.author.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{review.author}</p>
                          <p className="text-sm text-gray-500">
                            {formatDistanceToNow(new Date(review.created_at))} ago
                          </p>
                        </div>
                        {review.author_details?.rating && (
                          <RatingStars 
                            rating={review.author_details.rating} 
                            readonly 
                            size="sm"
                            showValue={false}
                          />
                        )}
                      </div>
                      <p className="text-gray-700 dark:text-gray-300">
                        {review.content.length > 500 
                          ? `${review.content.substring(0, 500)}...` 
                          : review.content}
                      </p>
                      {review.url && (
                        <a 
                          href={review.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm mt-2 inline-block"
                        >
                          Read full review →
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Pagination Controls */}
          {tmdbReviews && tmdbReviews.total_results > 0 && (
            <div className="flex flex-col items-center gap-3 mt-6">
              <div className="text-sm text-muted-foreground text-center" data-testid="text-review-count">
                <div>{tmdbReviews.total_results} review{tmdbReviews.total_results !== 1 ? 's' : ''} total</div>
                <div className="text-xs opacity-75">Showing {externalReviews.length} review{externalReviews.length !== 1 ? 's' : ''} on this page</div>
              </div>
              {tmdbReviews.total_pages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTmdbPage(prev => Math.max(1, prev - 1))}
                    disabled={tmdbPage === 1}
                    data-testid="button-prev-page"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-3" data-testid="text-page-info">
                    Page {tmdbPage} of {tmdbReviews.total_pages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTmdbPage(prev => Math.min(tmdbReviews.total_pages, prev + 1))}
                    disabled={tmdbPage === tmdbReviews.total_pages}
                    data-testid="button-next-page"
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {localReviews.length === 0 && sortedTmdbReviews.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-gray-500">No reviews yet. Be the first to review!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}