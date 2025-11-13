import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Star, Calendar, Clock, Users, ArrowLeft, 
  Play, Heart, Bookmark, Share, MessageSquare, TrendingUp, CheckCircle, Sparkles,
  ThumbsUp, ThumbsDown, Send, Layers
} from "lucide-react";
import { ReviewForm } from "@/components/review-form";
import { ReviewList } from "@/components/review-list";
import { VideoReviews } from "@/components/video-reviews";
import { WatchProviders } from "@/components/watch-providers";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useToast } from "@/hooks/use-toast";
import type { Movie } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import MediaCard from "@/components/media-card";
import MovieDetailsSkeleton from "@/components/movie-details-skeleton";
import { ExpandableText } from "@/components/expandable-text";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TrailerDialog } from "@/components/trailer-dialog";
import { AddToListButton } from "@/components/add-to-list-button";
import { ListCard } from "@/components/list-card";
import { Skeleton } from "@/components/ui/skeleton";

interface MovieDetails {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  runtime?: number;
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path?: string;
  backdrop_path?: string;
  original_language?: string;
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string }>;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages: Array<{ iso_639_1: string; name: string }>;
  status: string;
  tagline?: string;
  budget: number;
  revenue: number;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string;
    backdrop_path: string;
  } | null;
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path?: string;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      department: string;
    }>;
  };
  videos?: {
    results: Array<{
      id: string;
      key: string;
      name: string;
      site: string;
      type: string;
      iso_639_1?: string;
    }>;
  };
  similar?: {
    results: Array<{
      id: number;
      title: string;
      poster_path?: string;
      vote_average: number;
    }>;
  };
  external_ids?: {
    imdb_id?: string;
    facebook_id?: string;
    instagram_id?: string;
    twitter_id?: string;
  };
}

export default function MovieDetailsPage() {
  const params = useParams();
  const movieId = params.id;
  const { isAuthenticated, user } = useAuth();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const { toast } = useToast();
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  const { data: movie, isLoading, error } = useQuery({
    queryKey: ['/api/tmdb/movie', movieId],
    enabled: !!movieId,
    select: (data: MovieDetails) => data
  });

  // Fetch user reviews for this movie
  const { data: userReviews, refetch: refetchReviews } = useQuery({
    queryKey: ['/api/ratings', movieId, 'movie'],
    queryFn: async () => {
      const response = await fetch(`/api/ratings?tmdbId=${movieId}&mediaType=movie`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      return response.json();
    },
    enabled: !!movieId
  });

  // Get current user's existing rating
  const userExistingRating = userReviews?.find((review: any) => review.userId === user?.id);

  // Fetch sentiment analysis for this movie
  const { data: sentimentData } = useQuery({
    queryKey: ['/api/sentiment', movieId, 'movie'],
    queryFn: async () => {
      const response = await fetch(`/api/sentiment/${movieId}/movie`);
      if (!response.ok) throw new Error('Failed to fetch sentiment');
      return response.json();
    },
    enabled: !!movieId
  });

  // Fetch user favorites
  const { data: userFavorites } = useQuery({
    queryKey: ['/api/users', user?.id, 'favorites'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user?.id}/favorites`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!user?.id
  });

  // Fetch user watched items
  const { data: userWatched } = useQuery({
    queryKey: ['/api/users', user?.id, 'watched'],
    queryFn: async () => {
      const response = await fetch(`/api/users/${user?.id}/watched`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!user?.id
  });

  // Fetch lists containing this movie
  const { data: containingLists, isLoading: isLoadingLists } = useQuery({
    queryKey: ['/api/community/lists/containing', movieId, 'movie'],
    queryFn: async () => {
      const response = await fetch(`/api/community/lists/containing/${movieId}/movie`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!movieId
  });

  // Check if current movie is in favorites
  const isInFavorites = userFavorites?.some((fav: any) => fav.tmdbId === parseInt(movieId || '0'));

  // Check if current movie is watched
  const isWatched = userWatched?.some((item: any) => item.tmdbId === parseInt(movieId || '0'));

  // Mutation for adding/removing favorites
  const favoritesMutation = useMutation({
    mutationFn: async ({ action }: { action: 'add' | 'remove' }) => {
      if (action === 'add') {
        return apiRequest('POST', `/api/users/${user?.id}/favorites`, {
          tmdbId: parseInt(movieId || '0'),
          mediaType: 'movie',
          title: movie?.title || '',
          posterPath: movie?.poster_path || null
        });
      } else {
        return apiRequest('DELETE', `/api/users/${user?.id}/favorites/${movieId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'favorites'] });
    }
  });

  // Mutation for adding/removing watched status
  const watchedMutation = useMutation({
    mutationFn: async ({ action }: { action: 'add' | 'remove' }) => {
      if (action === 'add') {
        return apiRequest('POST', `/api/users/${user?.id}/watched`, {
          tmdbId: parseInt(movieId || '0'),
          mediaType: 'movie',
          title: movie?.title || '',
          posterPath: movie?.poster_path || null
        });
      } else {
        return apiRequest('DELETE', `/api/users/${user?.id}/watched/${movieId}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'watched'] });
    }
  });

  if (isLoading) {
    return <MovieDetailsSkeleton />;
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Movie Not Found</h1>
          <p className="text-muted-foreground mb-4">
            The movie you're looking for doesn't exist or couldn't be loaded.
          </p>
          <Button onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const mainCast = movie.credits?.cast?.slice(0, 6) || [];
  const trailers = movie.videos?.results?.filter(video => 
    video.type === 'Trailer' && video.site === 'YouTube'
  ) || [];

  // Convert movie to Movie format for watchlist
  const convertMovieToMovie = (movie: MovieDetails): Movie => {
    return {
      id: movie.id.toString(),
      title: movie.title,
      year: new Date(movie.release_date).getFullYear(),
      genre: movie.genres[0]?.name || 'Drama',
      rating: movie.vote_average,
      synopsis: movie.overview,
      posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      director: movie.credits?.crew?.find(member => member.job === 'Director')?.name || 'Unknown',
      cast: movie.credits?.cast?.slice(0, 5).map(actor => actor.name) || [],
      duration: movie.runtime || null,
      type: 'movie',
      seasons: null,
    };
  };

  const movieData = movie ? convertMovieToMovie(movie) : null;
  const isInUserWatchlist = movieData ? isInWatchlist(movieData.id) : false;

  const handleWatchlistToggle = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to add items to your watchlist.",
        variant: "destructive",
      });
      return;
    }

    if (!movieData) return;

    if (isInUserWatchlist) {
      const success = await removeFromWatchlist(movieData.id);
      if (success) {
        toast({
          title: "Removed from watchlist",
          description: `${movie!.title} has been removed from your watchlist.`,
        });
      }
    } else {
      const success = await addToWatchlist(movieData);
      if (success) {
        toast({
          title: "Added to watchlist",
          description: `${movie!.title} has been added to your watchlist.`,
        });
      }
    }
  };

  const handleFavoritesToggle = () => {
    if (!movie) return;

    if (isInFavorites) {
      favoritesMutation.mutate({ action: 'remove' }, {
        onSuccess: () => {
          toast({
            title: "Removed from favorites",
            description: `${movie.title} has been removed from your favorites.`,
          });
        }
      });
    } else {
      favoritesMutation.mutate({ action: 'add' }, {
        onSuccess: () => {
          toast({
            title: "Added to favorites",
            description: `${movie.title} has been added to your favorites.`,
          });
        }
      });
    }
  };

  const handleWatchedToggle = () => {
    if (!movie) return;

    if (isWatched) {
      watchedMutation.mutate({ action: 'remove' }, {
        onSuccess: () => {
          toast({
            title: "Removed from watched",
            description: `${movie.title} has been removed from your watched list.`,
          });
        }
      });
    } else {
      watchedMutation.mutate({ action: 'add' }, {
        onSuccess: () => {
          toast({
            title: "Marked as watched",
            description: `${movie.title} has been marked as watched.`,
          });
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative min-h-[400px] sm:min-h-[500px] md:h-96 bg-gradient-to-r from-black/70 to-black/30">
        {movie.backdrop_path && (
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(https://image.tmdb.org/t/p/w1280${movie.backdrop_path})`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative z-10 container mx-auto px-3 sm:px-4 h-full flex items-center py-4 sm:py-6 md:py-0">
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start w-full">
            {/* Poster */}
            <div className="flex-shrink-0">
              <div className="w-24 h-36 sm:w-40 sm:h-60 md:w-48 md:h-72 bg-muted rounded-lg overflow-hidden">
                {movie.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback if image fails to load
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement!.innerHTML = `
                        <div class="w-full h-full flex items-center justify-center">
                          <span class="text-sm text-center p-4">${movie.title}</span>
                        </div>
                      `;
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-sm text-center p-4">{movie.title}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="flex-1 text-white w-full md:w-auto">
              <Button 
                variant="ghost" 
                size="sm" 
                className="mb-2 md:mb-4 text-white hover:text-white hover:bg-white/20"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">{movie.title}</h1>
              
              <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-3 md:mb-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 md:h-5 md:w-5 fill-yellow-400 text-yellow-400" />
                  <span className="text-base md:text-lg font-semibold">
                    {movie.vote_average.toFixed(1)}
                  </span>
                  <span className="text-xs md:text-sm opacity-80">
                    ({movie.vote_count.toLocaleString()} votes)
                  </span>
                </div>
                
                <Separator orientation="vertical" className="h-4 md:h-6 hidden sm:block" />
                
                <div className="flex items-center gap-2">
                  <Calendar className="h-3 w-3 md:h-4 md:w-4" />
                  <span className="text-sm md:text-base">{movie.release_date}</span>
                </div>

                {movie.runtime && (
                  <>
                    <Separator orientation="vertical" className="h-4 md:h-6 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 md:h-4 md:w-4" />
                      <span className="text-sm md:text-base">{movie.runtime} min</span>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mb-3 md:mb-4">
                {movie.genres.map((genre) => (
                  <Badge key={genre.id} variant="secondary" className="text-xs">
                    {genre.name}
                  </Badge>
                ))}
              </div>

              <div className="mb-3 md:mb-6 max-w-2xl">
                <ExpandableText 
                  text={movie.overview} 
                  className="text-sm md:text-lg opacity-90"
                  maxLines={2}
                />
              </div>

              <div className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-2 md:gap-3">
                <Button 
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                  onClick={() => {
                    if (trailers.length > 0) {
                      setIsTrailerOpen(true);
                    } else {
                      toast({
                        title: "No trailer available",
                        description: "Sorry, no trailer is available for this movie.",
                        variant: "default",
                      });
                    }
                  }}
                  data-testid="button-watch-trailer"
                >
                  <Play className="h-4 w-4 md:h-5 md:w-5 mr-2" />
                  <span className="hidden sm:inline">Watch Trailer</span>
                  <span className="sm:hidden">Trailer</span>
                </Button>
                
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleFavoritesToggle}
                    disabled={favoritesMutation.isPending}
                    data-testid="button-favorites"
                    className="w-full sm:w-auto"
                  >
                    <Heart className={`h-4 w-4 md:h-5 md:w-5 mr-2 ${isInFavorites ? 'fill-current' : ''}`} />
                    <span className="hidden md:inline">{isInFavorites ? 'Remove from Favorites' : 'Add to Favorites'}</span>
                    <span className="md:hidden">{isInFavorites ? 'Unfavorite' : 'Favorite'}</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleWatchlistToggle}
                    data-testid="button-watchlist"
                    className="w-full sm:w-auto"
                  >
                    <Bookmark className={`h-4 w-4 md:h-5 md:w-5 mr-2 ${isInUserWatchlist ? 'fill-current' : ''}`} />
                    <span className="hidden md:inline">{isInUserWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}</span>
                    <span className="md:hidden">{isInUserWatchlist ? 'Remove' : 'Watchlist'}</span>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleWatchedToggle}
                    disabled={watchedMutation.isPending}
                    data-testid="button-watched"
                    className="w-full sm:w-auto"
                  >
                    <CheckCircle className={`h-4 w-4 md:h-5 md:w-5 mr-2 ${isWatched ? 'fill-current' : ''}`} />
                    <span className="hidden md:inline">{isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}</span>
                    <span className="md:hidden">{isWatched ? 'Unwatched' : 'Watched'}</span>
                  </Button>
                  
                  <AddToListButton
                    tmdbId={movie.id}
                    mediaType="movie"
                    title={movie.title}
                    posterPath={movie.poster_path}
                    variant="outline"
                    size="sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Tabs */}
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid grid-cols-3 sm:grid-cols-5 w-full gap-1 sm:gap-1 mb-4 sm:mb-6 h-auto">
            <TabsTrigger value="details" className="text-xs sm:text-sm px-2 sm:px-3 py-2">Details</TabsTrigger>
            <TabsTrigger value="cast" className="text-xs sm:text-sm px-2 sm:px-3 py-2">Cast</TabsTrigger>
            <TabsTrigger value="reviews" className="text-xs sm:text-sm px-2 sm:px-3 py-2">Reviews</TabsTrigger>
            <TabsTrigger value="recommendations" className="text-xs sm:text-sm px-2 sm:px-3 py-2">
              <span className="hidden sm:inline">Recommendations</span>
              <span className="sm:hidden">Recommend</span>
            </TabsTrigger>
            <TabsTrigger value="similar" className="text-xs sm:text-sm px-2 sm:px-3 py-2">Similar</TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-4 sm:mt-6">
            <div className="space-y-4 sm:space-y-6 md:space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Movie Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-semibold">Status</h4>
                      <p className="text-muted-foreground">{movie.status}</p>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold">Release Date</h4>
                      <p className="text-muted-foreground">{movie.release_date}</p>
                    </div>
                    
                    {movie.runtime && (
                      <div>
                        <h4 className="font-semibold">Runtime</h4>
                        <p className="text-muted-foreground">{movie.runtime} minutes</p>
                      </div>
                    )}
                    
                    {movie.budget > 0 && (
                      <div>
                        <h4 className="font-semibold">Budget</h4>
                        <p className="text-muted-foreground">${movie.budget.toLocaleString()}</p>
                      </div>
                    )}
                    
                    {movie.revenue > 0 && (
                      <div>
                        <h4 className="font-semibold">Revenue</h4>
                        <p className="text-muted-foreground">${movie.revenue.toLocaleString()}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Production</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {movie.production_companies.length > 0 && (
                      <div>
                        <h4 className="font-semibold">Production Companies</h4>
                        <p className="text-muted-foreground">
                          {movie.production_companies.map(company => company.name).join(', ')}
                        </p>
                      </div>
                    )}
                    
                    {movie.production_countries.length > 0 && (
                      <div>
                        <h4 className="font-semibold">Countries</h4>
                        <p className="text-muted-foreground">
                          {movie.production_countries.map(country => country.name).join(', ')}
                        </p>
                      </div>
                    )}
                    
                    {movie.spoken_languages.length > 0 && (
                      <div>
                        <h4 className="font-semibold">Languages</h4>
                        <p className="text-muted-foreground">
                          {movie.spoken_languages.map(lang => lang.name).join(', ')}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Watch Providers */}
              <WatchProviders tmdbId={parseInt(movieId || '0')} mediaType="movie" />
            </div>
          </TabsContent>

          {/* Cast Tab */}
          <TabsContent value="cast" className="mt-4 sm:mt-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
              {mainCast.map((actor) => (
                <Card key={actor.id} className="text-center hover:shadow-lg transition-all duration-300">
                  <div className="aspect-[3/4] bg-muted m-4 rounded flex items-center justify-center">
                    {actor.profile_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w500${actor.profile_path}`}
                        alt={actor.name}
                        className="w-full h-full object-cover rounded"
                        loading="lazy"
                      />
                    ) : (
                      <Users className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-sm truncate">{actor.name}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {actor.character}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Reviews Tab */}
          <TabsContent value="reviews" className="mt-6">
            <Tabs defaultValue="user-reviews" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="user-reviews" data-testid="tab-user-reviews">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  User Reviews
                </TabsTrigger>
                <TabsTrigger value="video-reviews" data-testid="tab-video-reviews">
                  <Play className="h-4 w-4 mr-2" />
                  Video Reviews
                </TabsTrigger>
              </TabsList>

              {/* User Reviews Tab */}
              <TabsContent value="user-reviews" className="mt-6">
                <div className="space-y-8">
                  {/* AI-Generated Review Summary */}
                  {(sentimentData as any)?.aiSummary && (
                    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="h-5 w-5 text-primary" />
                          AI Review Summary
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm leading-relaxed">{(sentimentData as any).aiSummary}</p>
                      </CardContent>
                    </Card>
                  )}

                  {/* Sentiment Analysis */}
                  {sentimentData?.summary && (sentimentData.summary.totalReviews > 0 || (sentimentData as any).sources?.tmdb > 0) && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5" />
                          Audience Sentiment
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Overall Sentiment</span>
                            <span className="text-sm">{sentimentData.summary.avgScore.toFixed(2)}</span>
                          </div>
                          <Progress 
                            value={(sentimentData.summary.avgScore + 1) * 50} 
                            className="w-full"
                          />
                          
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div className="space-y-1">
                              <div className="text-green-600 font-medium text-2xl">
                                😊 {sentimentData.summary.distribution.positive}
                              </div>
                              <div className="text-xs text-muted-foreground">Positive</div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-gray-600 font-medium text-2xl">
                                😐 {sentimentData.summary.distribution.neutral}
                              </div>
                              <div className="text-xs text-muted-foreground">Neutral</div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-red-600 font-medium text-2xl">
                                😞 {sentimentData.summary.distribution.negative}
                              </div>
                              <div className="text-xs text-muted-foreground">Negative</div>
                            </div>
                          </div>
                          
                          {sentimentData.insights && Array.isArray(sentimentData.insights) && sentimentData.insights.length > 0 && (
                            <div className="mt-4 p-4 bg-muted rounded-lg">
                              <div className="space-y-2">
                                {sentimentData.insights.map((insight: string, index: number) => (
                                  <p key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                                    <span className="text-accent mt-0.5">•</span>
                                    <span>{insight}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Review Form */}
                  {isAuthenticated && movie && (
                    <ReviewForm 
                      tmdbId={parseInt(movieId || '0')}
                      mediaType="movie"
                      title={movie.title}
                      posterPath={movie.poster_path}
                      existingRating={userExistingRating ? {
                        id: userExistingRating.id,
                        rating: userExistingRating.rating,
                        review: userExistingRating.review
                      } : undefined}
                      onSuccess={() => {
                        refetchReviews();
                        toast({ title: "Review submitted!", description: "Thank you for your feedback." });
                      }}
                    />
                  )}
                  
                  {!isAuthenticated && (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">Share Your Thoughts</h3>
                        <p className="text-muted-foreground mb-4">Sign in to rate and review this movie</p>
                        <Link href="/login">
                          <Button>Sign In</Button>
                        </Link>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Review List */}
                  <ReviewList 
                    tmdbId={parseInt(movieId || '0')}
                    mediaType="movie"
                    currentUserId={user?.id}
                  />
                </div>
              </TabsContent>

              {/* Video Reviews Tab */}
              <TabsContent value="video-reviews" className="mt-6">
                <div className="space-y-6">
                  {movie && (
                    <VideoReviews 
                      title={movie.title}
                      mediaType="movie"
                    />
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* User Recommendations Tab */}
          <TabsContent value="recommendations" className="mt-6">
            <UserRecommendationsSection 
              forTmdbId={parseInt(movieId || '0')}
              forMediaType="movie"
              currentUserId={user?.id}
              isAuthenticated={isAuthenticated}
            />
          </TabsContent>

          {/* Similar Movies Tab */}
          <TabsContent value="similar" className="mt-6">
            <Tabs defaultValue="tmdb" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="tmdb" data-testid="tab-tmdb-similar">Similar Movies</TabsTrigger>
                <TabsTrigger value="lists" data-testid="tab-similar-lists">Lists</TabsTrigger>
                <TabsTrigger value="ai-similar" data-testid="tab-ai-similar"><Sparkles className="h-4 w-4 mr-1 inline" />AI Similar</TabsTrigger>
              </TabsList>
              
              {/* TMDB Similar Movies */}
              <TabsContent value="tmdb" className="mt-6">
                {movie.similar?.results && movie.similar.results.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" data-testid="grid-tmdb-similar">
                    {movie.similar.results.slice(0, 8).map((similarMovie) => (
                      <MediaCard
                        key={similarMovie.id}
                        item={{
                          id: similarMovie.id,
                          title: similarMovie.title,
                          vote_average: similarMovie.vote_average,
                          poster_path: similarMovie.poster_path,
                          type: 'movie'
                        }}
                        mediaType="movie"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="empty-tmdb-similar">
                    <div className="text-muted-foreground mb-4">No similar movies found.</div>
                  </div>
                )}
              </TabsContent>
              
              {/* Lists Tab */}
              <TabsContent value="lists" className="mt-6">
                <div className="flex items-center gap-2 mb-6">
                  <Layers className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl font-bold" data-testid="heading-similar-lists">Lists Featuring This Movie</h2>
                </div>
                {isLoadingLists ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="loading-similar-lists">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-80" data-testid={`skeleton-list-${i}`} />
                    ))}
                  </div>
                ) : containingLists && containingLists.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-similar-lists">
                    {containingLists.map((list: any) => (
                      <ListCard key={list.id} list={list} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12" data-testid="empty-similar-lists">
                    <div className="text-muted-foreground mb-4">
                      This movie hasn't been added to any public lists yet.
                    </div>
                  </div>
                )}
              </TabsContent>
              
              {/* AI Similar */}
              <TabsContent value="ai-similar" className="mt-6">
                <SemanticSimilarMovies 
                  movieTitle={movie.title}
                  movieOverview={movie.overview}
                  currentMovieId={movie.id}
                  genres={movie.genres}
                  cast={movie.credits?.cast}
                  tagline={movie.tagline}
                  collection={movie.belongs_to_collection}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>

      {/* Trailer Dialog */}
      <TrailerDialog
        isOpen={isTrailerOpen}
        onClose={() => setIsTrailerOpen(false)}
        trailers={trailers}
        title={movie.title}
        originalLanguage={movie.original_language}
      />
    </div>
  );
}

// Semantic Similar Movies Component
function SemanticSimilarMovies({ 
  movieTitle, 
  movieOverview, 
  currentMovieId,
  genres,
  cast,
  tagline,
  collection
}: { 
  movieTitle: string; 
  movieOverview: string;
  currentMovieId: number;
  genres?: Array<{ id: number; name: string }>;
  cast?: Array<{ id: number; name: string; character: string }>;
  tagline?: string;
  collection?: { id: number; name: string; poster_path: string; backdrop_path: string } | null;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const moviesPerPage = 12;

  const { data: semanticResults, isLoading: semanticLoading } = useQuery({
    queryKey: ['/api/recommendations/semantic-search', movieTitle, genres, cast, collection],
    queryFn: async () => {
      // PRIORITY ORDER: Franchise > Cast > Genres > Title > Other factors
      const queryParts: string[] = [];
      
      // 1. FRANCHISE - Highest priority for series/sequels
      if (collection?.name) {
        // Use collection name for franchise-based similarity
        queryParts.push(`${collection.name} franchise`);
        queryParts.push(`movies like ${movieTitle} from ${collection.name}`);
      } else {
        // Detect franchise patterns in title (e.g., "Title 2", "Title: Part 1")
        const franchisePattern = /(\d+|Part|Chapter|Vol\.?|Episode|II|III|IV|V|VI|VII|VIII|IX|X)/i;
        if (franchisePattern.test(movieTitle)) {
          // Extract base title without numbers/parts
          const baseTitle = movieTitle.replace(/[:\-–—]\s*(Part|Chapter|Vol\.?|Episode)?\s*\d+/gi, '')
                                      .replace(/\s+\d+$/g, '')
                                      .replace(/\s+(II|III|IV|V|VI|VII|VIII|IX|X)$/i, '')
                                      .trim();
          queryParts.push(`${baseTitle} series`);
          queryParts.push(`movies like ${movieTitle}`);
        } else {
          queryParts.push(`movies like ${movieTitle}`);
        }
      }
      
      // 2. CAST - High priority for actor-based similarity
      if (cast && cast.length > 0) {
        // Top 5 cast members for better actor matching
        const topCast = cast.slice(0, 5).map(c => c.name).join(', ');
        queryParts.push(`starring ${topCast}`);
        
        // Lead actor emphasis
        if (cast[0]) {
          queryParts.push(`${cast[0].name} movies`);
        }
      }
      
      // 3. GENRES - Already in filters, but add to query for emphasis
      const genreNames = genres?.map(g => g.name) || [];
      if (genreNames.length > 0) {
        queryParts.push(`${genreNames.join(' ')} film`);
      }
      
      // 4. TITLE - Explicit title matching
      queryParts.push(`similar to ${movieTitle}`);
      
      // 5. OTHER FACTORS - Lower priority
      // Tagline for tone/mood
      if (tagline && tagline.length < 100) {
        queryParts.push(tagline);
      }
      
      // Plot summary - brief version for themes
      if (movieOverview) {
        // Take first 150 characters for key themes
        const plotSummary = movieOverview.substring(0, 150).trim();
        queryParts.push(plotSummary);
      }
      
      // Build semantic query with priority order
      const query = queryParts.join(' ');
      
      // Use POST endpoint with filters for better results
      const response = await fetch('/api/recommendations/semantic-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          limit: 48,
          filters: {
            // Strong genre filtering for genre-based similarity
            genres: genreNames.length > 0 ? genreNames : undefined,
            mediaType: ['movies']
          }
        })
      });
      
      if (!response.ok) throw new Error('Failed to fetch semantic similar movies');
      return response.json();
    },
    enabled: !!movieTitle,
  });

  // Fetch TMDB details for all similar movies
  const similarMovieIds = semanticResults?.results?.filter((r: any) => r.tmdbId !== currentMovieId).map((r: any) => r.tmdbId) || [];
  
  const { data: movieDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['/api/tmdb/movies/details', similarMovieIds],
    queryFn: async () => {
      const promises = similarMovieIds.map(async (id: number) => {
        try {
          const response = await fetch(`/api/tmdb/movie/${id}`);
          if (!response.ok) return null;
          return response.json();
        } catch {
          return null;
        }
      });
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    },
    enabled: similarMovieIds.length > 0,
  });

  if (semanticLoading || detailsLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" data-testid="loading-semantic-similar">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-80" />
        ))}
      </div>
    );
  }

  // Pagination logic
  const totalMovies = movieDetails?.length || 0;
  const totalPages = Math.ceil(totalMovies / moviesPerPage);
  const startIndex = (currentPage - 1) * moviesPerPage;
  const endIndex = startIndex + moviesPerPage;
  const currentMovies = movieDetails?.slice(startIndex, endIndex) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            AI-Powered Semantic Similarity
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Movies with similar themes and storylines using TensorFlow.js
          </p>
        </div>
        {semanticResults?.duration && (
          <Badge variant="secondary" className="text-xs">
            {semanticResults.duration}
          </Badge>
        )}
      </div>

      {currentMovies.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6" data-testid="grid-semantic-similar">
            {currentMovies.map((movie: any) => {
              const semanticResult = semanticResults?.results?.find((r: any) => r.tmdbId === movie.id);
              return (
                <div key={movie.id} className="space-y-2" data-testid={`semantic-result-${movie.id}`}>
                  <MediaCard
                    item={{
                      id: movie.id,
                      title: movie.title,
                      vote_average: movie.vote_average,
                      poster_path: movie.poster_path,
                      type: 'movie'
                    }}
                    mediaType="movie"
                  />
                  {semanticResult && (
                    <div className="px-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-muted-foreground">Similarity</span>
                        <Badge variant="outline" className="text-xs">
                          {(semanticResult.similarity * 100).toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                Previous
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="min-w-[40px]"
                    data-testid={`button-page-${page}`}
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Next
              </Button>
            </div>
          )}

          <div className="text-center text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, totalMovies)} of {totalMovies} similar movies
          </div>
        </>
      ) : (
        <div className="text-center py-12" data-testid="empty-semantic-similar">
          <Sparkles className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Semantic Matches Found</h3>
          <p className="text-muted-foreground">
            Try browsing other movies or check back later
          </p>
        </div>
      )}
    </div>
  );
}

// Comments Component for a recommendation
function RecommendationComments({ recommendationId, currentUserId, reason }: { recommendationId: string; currentUserId?: string; reason?: string }) {
  const [commentText, setCommentText] = useState("");
  const { toast } = useToast();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['/api/users/recommendations/comments', recommendationId],
    queryFn: async () => {
      const response = await fetch(`/api/users/recommendations/${recommendationId}/comments`);
      if (!response.ok) return [];
      return response.json();
    }
  });

  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      if (!currentUserId) throw new Error("User not authenticated");
      return apiRequest('POST', `/api/users/${currentUserId}/recommendations/${recommendationId}/comments`, { comment });
    },
    onSuccess: () => {
      toast({ title: "Comment added! 💬" });
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ['/api/users/recommendations/comments', recommendationId] });
    }
  });

  return (
    <div className="mt-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
      {reason && (
        <div className="bg-primary/5 border border-primary/20 rounded-md p-3 flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary mb-1">Why this recommendation?</p>
            <p className="text-sm">{reason}</p>
          </div>
        </div>
      )}
      {currentUserId && (
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment... 💭"
            className="flex-1 px-3 py-2 text-sm border rounded-md bg-background text-foreground"
            data-testid={`input-comment-${recommendationId}`}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && commentText.trim()) {
                addCommentMutation.mutate(commentText.trim());
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => commentText.trim() && addCommentMutation.mutate(commentText.trim())}
            disabled={!commentText.trim() || addCommentMutation.isPending}
            data-testid={`button-add-comment-${recommendationId}`}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading comments...</p>
      ) : comments.length > 0 ? (
        <div className="space-y-2">
          {comments.map((comment: any) => (
            <div key={comment.id} className="bg-muted/50 rounded-md p-2 animate-in slide-in-from-left-1 duration-150" data-testid={`comment-${comment.id}`}>
              <p className="text-xs font-medium flex items-center gap-1">
                <span>👤</span>
                {comment.userFirstName && comment.userLastName 
                  ? `${comment.userFirstName} ${comment.userLastName}` 
                  : comment.userEmail || 'Anonymous'}
              </p>
              <p className="text-sm mt-1">{comment.comment}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// User Recommendations Component
function UserRecommendationsSection({ forTmdbId, forMediaType, currentUserId, isAuthenticated }: {
  forTmdbId: number;
  forMediaType: string;
  currentUserId?: string;
  isAuthenticated: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  // Fetch user recommendations for this movie
  const { data: recommendations, isLoading: recommendationsLoading } = useQuery({
    queryKey: ['/api/users/recommendations/for', forTmdbId, forMediaType],
    queryFn: async () => {
      const url = currentUserId 
        ? `/api/users/recommendations/for/${forTmdbId}/${forMediaType}?userId=${currentUserId}`
        : `/api/users/recommendations/for/${forTmdbId}/${forMediaType}`;
      const response = await fetch(url);
      if (!response.ok) return [];
      return response.json();
    }
  });

  // Search for shows/movies to recommend
  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ['/api/tmdb/search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return { results: [] };
      const response = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) return { results: [] };
      return response.json();
    },
    enabled: searchQuery.length >= 2
  });

  // Submit recommendation mutation
  const submitRecommendationMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!currentUserId) throw new Error("User not authenticated");
      
      return apiRequest('POST', `/api/users/${currentUserId}/recommendations`, {
        forTmdbId,
        forMediaType,
        recommendedTmdbId: data.recommendedTmdbId,
        recommendedMediaType: data.recommendedMediaType,
        recommendedTitle: data.recommendedTitle,
        recommendedPosterPath: data.recommendedPosterPath,
        reason: data.reason
      });
    },
    onSuccess: () => {
      toast({ title: "Recommendation submitted!", description: "Thanks for sharing your suggestion." });
      setShowForm(false);
      setSelectedMedia(null);
      setSearchQuery("");
      setReason("");
      queryClient.invalidateQueries({ queryKey: ['/api/users/recommendations/for', forTmdbId, forMediaType] });
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Failed to submit recommendation";
      const isAlreadyRecommended = errorMessage.includes("already recommended");
      
      toast({ 
        title: isAlreadyRecommended ? "Already Recommended" : "Error", 
        description: isAlreadyRecommended 
          ? "You've already recommended this movie/show here" 
          : errorMessage,
        variant: isAlreadyRecommended ? undefined : "destructive"
      });
    }
  });

  // Delete recommendation mutation
  const deleteRecommendationMutation = useMutation({
    mutationFn: async (recommendationId: string) => {
      if (!currentUserId) throw new Error("User not authenticated");
      return apiRequest('DELETE', `/api/users/${currentUserId}/recommendations/${recommendationId}`);
    },
    onSuccess: () => {
      toast({ title: "Recommendation deleted" });
      queryClient.invalidateQueries({ queryKey: ['/api/users/recommendations/for', forTmdbId, forMediaType] });
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Failed to delete recommendation";
      const cannotDelete = errorMessage.includes("Cannot delete") || errorMessage.includes("likes");
      
      toast({ 
        title: cannotDelete ? "Cannot Delete" : "Error", 
        description: cannotDelete 
          ? "This recommendation has likes from others and cannot be deleted" 
          : errorMessage,
        variant: "destructive"
      });
    }
  });

  // Vote on recommendation mutation
  const voteMutation = useMutation({
    mutationFn: async ({ recommendationId, voteType }: { recommendationId: string; voteType: 'like' | 'dislike' }) => {
      if (!currentUserId) throw new Error("User not authenticated");
      return apiRequest('POST', `/api/users/${currentUserId}/recommendations/${recommendationId}/vote`, { voteType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users/recommendations/for', forTmdbId, forMediaType] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to vote",
        variant: "destructive"
      });
    }
  });

  // Comment visibility state
  const [showComments, setShowComments] = useState<Record<string, boolean>>({});

  const handleSubmitRecommendation = () => {
    if (!selectedMedia || !currentUserId) return;

    submitRecommendationMutation.mutate({
      recommendedTmdbId: selectedMedia.id,
      recommendedMediaType: selectedMedia.media_type || 'movie',
      recommendedTitle: selectedMedia.title || selectedMedia.name,
      recommendedPosterPath: selectedMedia.poster_path,
      reason: reason.trim() || undefined
    });
  };

  return (
    <div className="space-y-6">
      {/* Recommendation Form */}
      {isAuthenticated ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share className="h-5 w-5" />
              Recommend a Movie or Show
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showForm ? (
              <Button onClick={() => setShowForm(true)} data-testid="button-add-recommendation">
                <Share className="h-4 w-4 mr-2" />
                Add Recommendation
              </Button>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Search for a show or movie to recommend:</label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for a show or movie..."
                    className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
                    data-testid="input-search-recommendation"
                  />
                  
                  {searchLoading && <p className="text-sm text-muted-foreground mt-2">Searching...</p>}
                  
                  {searchResults?.results && searchResults.results.length > 0 && (
                    <div className="mt-2 max-h-48 overflow-y-auto border rounded-md">
                      {searchResults.results.slice(0, 5).map((item: any) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedMedia(item);
                            setSearchQuery(item.title || item.name);
                          }}
                          className="p-2 hover:bg-accent cursor-pointer flex items-center gap-3 select-none"
                          data-testid={`search-result-${item.id}`}
                        >
                          {item.poster_path && (
                            <img 
                              src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                              alt={item.title || item.name}
                              className="w-12 h-18 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="font-medium text-sm">{item.title || item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.media_type === 'movie' ? 'Movie' : 'TV Show'} • {item.release_date || item.first_air_date}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedMedia && (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Why do you recommend this? (optional)</label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Share why fans of this movie would enjoy your recommendation..."
                        className="w-full px-3 py-2 border rounded-md min-h-[80px] bg-background text-foreground"
                        data-testid="input-recommendation-reason"
                        maxLength={500}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Help others discover great content by sharing what makes this recommendation special. {reason.length}/500 characters
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSubmitRecommendation}
                        disabled={submitRecommendationMutation.isPending}
                        data-testid="button-submit-recommendation"
                      >
                        {submitRecommendationMutation.isPending ? "Submitting..." : "Submit Recommendation"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowForm(false);
                          setSelectedMedia(null);
                          setSearchQuery("");
                          setReason("");
                        }}
                        data-testid="button-cancel-recommendation"
                      >
                        Cancel
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center">
            <Share className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Share Your Recommendations</h3>
            <p className="text-muted-foreground mb-4">Sign in to recommend movies to other fans</p>
            <Link href="/login">
              <Button>Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Recommendations List */}
      <Card>
        <CardHeader>
          <CardTitle>User Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          {recommendationsLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading recommendations...</p>
          ) : recommendations && recommendations.length > 0 ? (
            <div className="space-y-4">
              {recommendations.map((rec: any) => (
                <Card key={rec.id} className="hover:shadow-lg hover:scale-[1.01] transition-all duration-200 animate-in fade-in slide-in-from-bottom-2" data-testid={`recommendation-${rec.id}`}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      {rec.recommendedPosterPath && (
                        <Link href={`/${rec.recommendedMediaType}/${rec.recommendedTmdbId}`}>
                          <img 
                            src={`https://image.tmdb.org/t/p/w185${rec.recommendedPosterPath}`}
                            alt={rec.recommendedTitle}
                            className="w-24 h-36 object-cover rounded cursor-pointer hover:opacity-80 hover:scale-105 transition-transform duration-200"
                          />
                        </Link>
                      )}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <Link href={`/${rec.recommendedMediaType}/${rec.recommendedTmdbId}`}>
                              <h4 className="font-semibold hover:underline cursor-pointer flex items-center gap-2" data-testid={`recommendation-title-${rec.id}`}>
                                <span>✨</span>
                                {rec.recommendedTitle}
                              </h4>
                            </Link>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <span>👤</span>
                              Recommended by {rec.userFirstName && rec.userLastName 
                                ? `${rec.userFirstName} ${rec.userLastName}` 
                                : rec.userEmail || 'Anonymous'}
                            </p>
                          </div>
                          {currentUserId === rec.userId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteRecommendationMutation.mutate(rec.id)}
                              disabled={deleteRecommendationMutation.isPending || (rec.likeCount && rec.likeCount > 0)}
                              data-testid={`button-delete-recommendation-${rec.id}`}
                              title={rec.likeCount > 0 ? `Cannot delete - ${rec.likeCount} ${rec.likeCount === 1 ? 'person has' : 'people have'} liked this` : 'Delete recommendation'}
                            >
                              Delete
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-3">
                          <Badge variant="outline" className="flex items-center gap-1">
                            <span>{rec.recommendedMediaType === 'movie' ? '🎬' : '📺'}</span>
                            {rec.recommendedMediaType === 'movie' ? 'Movie' : 'TV Show'}
                          </Badge>
                          {rec.score !== undefined && (
                            <span className="text-sm font-medium flex items-center gap-1" data-testid={`recommendation-score-${rec.id}`}>
                              {rec.score > 0 ? '🔥' : rec.score < 0 ? '❄️' : '➖'}
                              Score: {rec.score > 0 ? '+' : ''}{rec.score}
                            </span>
                          )}
                        </div>
                        
                        {/* Voting and Comments Section */}
                        <div className="mt-3 pt-3 border-t">
                          <div className="flex items-center gap-4">
                            {isAuthenticated ? (
                              <>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant={rec.userVote === 'like' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => voteMutation.mutate({ recommendationId: rec.id, voteType: 'like' })}
                                    disabled={voteMutation.isPending}
                                    data-testid={`button-like-${rec.id}`}
                                    className="hover:scale-110 transition-transform duration-200 active:scale-95"
                                  >
                                    <span className={`text-base mr-1 ${rec.userVote === 'like' ? 'animate-bounce' : ''}`}>👍</span>
                                    {rec.likeCount || 0}
                                  </Button>
                                  <Button
                                    variant={rec.userVote === 'dislike' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => voteMutation.mutate({ recommendationId: rec.id, voteType: 'dislike' })}
                                    disabled={voteMutation.isPending}
                                    data-testid={`button-dislike-${rec.id}`}
                                    className="hover:scale-110 transition-transform duration-200 active:scale-95"
                                  >
                                    <span className={`text-base mr-1 ${rec.userVote === 'dislike' ? 'animate-bounce' : ''}`}>👎</span>
                                    {rec.dislikeCount || 0}
                                  </Button>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowComments(prev => ({ ...prev, [rec.id]: !prev[rec.id] }))}
                                  data-testid={`button-comments-${rec.id}`}
                                  className="hover:scale-110 transition-transform duration-200 active:scale-95"
                                >
                                  <span className={`text-base mr-1 ${showComments[rec.id] ? 'animate-pulse' : ''}`}>💬</span>
                                  {rec.commentCount || 0} {rec.commentCount === 1 ? 'comment' : 'comments'}
                                </Button>
                              </>
                            ) : (
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="text-base">👍</span> {rec.likeCount || 0}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-base">👎</span> {rec.dislikeCount || 0}
                                </span>
                                <span className="flex items-center gap-1">
                                  <span className="text-base">💬</span> {rec.commentCount || 0}
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* Comments Display */}
                          {showComments[rec.id] && (
                            <RecommendationComments 
                              recommendationId={rec.id} 
                              currentUserId={currentUserId}
                              reason={rec.reason}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 animate-in fade-in duration-500">
              <div className="text-6xl mb-4">💡</div>
              <p className="text-muted-foreground text-lg font-medium mb-2">No recommendations yet</p>
              <p className="text-muted-foreground text-sm">Be the first to suggest a movie or show!</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}