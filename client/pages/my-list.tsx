import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MovieCard from "@/components/movie-card";
import { Heart, Plus, Loader2, LogIn, CheckCircle, Eye } from "lucide-react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { tmdbService } from "@/lib/tmdb";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { apiRequest } from "@/lib/queryClient";
import type { Movie } from "@shared/schema";

// Component to fetch and display item with full TMDB metadata
function EnrichedMovieCard({ item, isOwnList, onRemove }: { item: any; isOwnList: boolean; onRemove: () => void }) {
  const mediaType = item.mediaType === 'tv' ? 'tv' : item.type === 'tv' ? 'tv' : 'movie';
  const tmdbId = item.tmdbId || item.id;
  
  const { data: tmdbData, isLoading } = useQuery({
    queryKey: [`/api/tmdb/${mediaType}/${tmdbId}`],
    enabled: !!tmdbId, // Always fetch TMDB data
  });

  if (isLoading) {
    return (
      <Card>
        <div className="aspect-[2/3] bg-muted animate-pulse" />
        <CardContent className="p-4">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!tmdbData) {
    // Fallback with minimal data if TMDB fetch fails
    const fallbackMovie: Movie = {
      id: tmdbId.toString(),
      title: item.title || 'Unknown',
      year: 0,
      genre: '',
      rating: 0,
      synopsis: '',
      posterUrl: item.posterUrl || (item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : null),
      director: '',
      cast: [],
      duration: 0,
      type: mediaType,
      seasons: null,
    };

    return (
      <MovieCard
        movie={fallbackMovie}
        isInWatchlist={true}
        showRemoveButton={true}
        onRemoveFromWatchlist={onRemove}
      />
    );
  }

  // Convert TMDB data to Movie format
  const movie = tmdbService.convertToMovie(tmdbData as any, mediaType);

  return (
    <MovieCard
      movie={movie}
      isInWatchlist={true}
      showRemoveButton={true}
      onRemoveFromWatchlist={onRemove}
    />
  );
}

export default function MyList() {
  const [listType, setListType] = useState<"watchlist" | "watched" | "favorite">("watchlist");
  const [filterType, setFilterType] = useState("all");
  const [sortBy, setSortBy] = useState("dateAdded");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { watchlist, removeFromWatchlist } = useWatchlist();

  // Fetch favorites (must be called before any returns)
  const { data: favoritesData = [], isLoading: favoritesLoading } = useQuery({
    queryKey: ['/api/users', user?.id, 'favorites'],
    enabled: !!user?.id && listType === "favorite",
  });

  // Fetch viewing history (watched items)
  const { data: watchedData = [], isLoading: watchedLoading } = useQuery({
    queryKey: ['/api/users', user?.id, 'watched'],
    enabled: !!user?.id && listType === "watched",
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Remove from watchlist mutation
  const removeFromWatchlistMutation = useMutation({
    mutationFn: async (movieId: string) => {
      return removeFromWatchlist(movieId);
    }
  });

  // Remove from favorites mutation
  const removeFromFavoritesMutation = useMutation({
    mutationFn: async (tmdbId: string) => {
      await apiRequest('DELETE', `/api/users/${user?.id}/favorites/${tmdbId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'favorites'] });
    }
  });

  // Remove from watched list mutation
  const removeFromWatchedMutation = useMutation({
    mutationFn: async (tmdbId: string) => {
      await apiRequest('DELETE', `/api/users/${user?.id}/watched/${tmdbId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'watched'] });
    }
  });

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Checking authentication...</span>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="text-center py-12 max-w-md">
          <CardContent className="pt-6">
            <LogIn className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Please Log In</h3>
            <p className="text-muted-foreground mb-6">
              You need to be logged in to view your watchlist.
            </p>
            <Button onClick={() => setLocation("/login")}>
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoading = favoritesLoading || watchedLoading;
  const error = null;
  
  // Get current list items based on selected type
  const getCurrentListItems = () => {
    if (listType === "favorite") {
      return (favoritesData as any[]).map((fav: any) => ({
        tmdbId: fav.tmdbId,
        id: fav.tmdbId.toString(),
        title: fav.title,
        mediaType: fav.mediaType,
        type: fav.mediaType,
        posterPath: fav.posterPath,
        posterUrl: fav.posterPath ? `https://image.tmdb.org/t/p/w500${fav.posterPath}` : '',
      }));
    } else if (listType === "watched") {
      return (watchedData as any[]).map((item: any) => ({
        tmdbId: item.tmdbId,
        id: item.tmdbId.toString(),
        title: item.title || 'Unknown',
        mediaType: item.mediaType || 'movie',
        type: item.mediaType || 'movie',
        posterPath: item.posterPath,
        posterUrl: item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : '',
      }));
    }
    return watchlist;
  };

  const allListItems = getCurrentListItems();

  const handleRemoveFromList = (movieId: string) => {
    if (listType === "favorite") {
      removeFromFavoritesMutation.mutate(movieId);
    } else if (listType === "watched") {
      removeFromWatchedMutation.mutate(movieId);
    } else {
      removeFromWatchlistMutation.mutate(movieId);
    }
  };

  const filteredList = allListItems.filter((item: Movie) => {
    if (filterType === "movies") return item.type === "movie";
    if (filterType === "tv") return item.type === "tv";
    return true;
  });

  const sortedList = [...filteredList].sort((a: Movie, b: Movie) => {
    switch (sortBy) {
      case "title":
        return a.title.localeCompare(b.title);
      case "rating":
        return b.rating - a.rating;
      case "year":
        return b.year - a.year;
      default:
        return 0;
    }
  });

  // Count items by type
  const movieCount = allListItems.filter((item: Movie) => item.type === "movie").length;
  const tvCount = allListItems.filter((item: Movie) => item.type === "tv").length;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="text-center py-12 max-w-md">
          <CardContent className="pt-6">
            <h3 className="text-xl font-semibold mb-2">Error Loading Watchlist</h3>
            <p className="text-muted-foreground mb-6">
              We couldn't load your watchlist. Please try again.
            </p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center space-x-3">
          <Heart className="h-8 w-8 text-accent" />
          <h1 className="text-3xl font-bold text-foreground">My List</h1>
        </div>
        
        {/* Filters */}
        <div className="flex space-x-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">📺 All Items</SelectItem>
              <SelectItem value="movies">🎬 Movies</SelectItem>
              <SelectItem value="tv">📺 TV Shows</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dateAdded">📅 Date Added</SelectItem>
              <SelectItem value="title">🔤 Title</SelectItem>
              <SelectItem value="rating">⭐ Rating</SelectItem>
              <SelectItem value="year">📆 Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="flex space-x-6 mb-8 text-sm text-muted-foreground">
        <span>📊 {allListItems.length} total items</span>
        <span>🎬 {movieCount} movies</span>
        <span>📺 {tvCount} TV shows</span>
      </div>

      {/* List Type Selector - Horizontal Scroll */}
      <div className="mb-6 overflow-x-auto scrollbar-hide">
        <div className="flex space-x-3 pb-2">
          <Button
            variant={listType === "watchlist" ? "default" : "outline"}
            onClick={() => setListType("watchlist")}
            className="flex items-center gap-2 whitespace-nowrap"
            data-testid="button-watchlist"
          >
            <Heart className="h-4 w-4" />
            Watchlist
          </Button>
          <Button
            variant={listType === "watched" ? "default" : "outline"}
            onClick={() => setListType("watched")}
            className="flex items-center gap-2 whitespace-nowrap"
            data-testid="button-watched"
          >
            <CheckCircle className="h-4 w-4" />
            Watched
          </Button>
          <Button
            variant={listType === "favorite" ? "default" : "outline"}
            onClick={() => setListType("favorite")}
            className="flex items-center gap-2 whitespace-nowrap"
            data-testid="button-favorite"
          >
            <Eye className="h-4 w-4" />
            Favorite
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading your watchlist...</span>
        </div>
      ) : 
      
      /* List Grid */
      sortedList.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6 mb-8">
          {sortedList.map((item: any) => (
            <EnrichedMovieCard
              key={item.id}
              item={item}
              isOwnList={true}
              onRemove={() => handleRemoveFromList(item.id)}
            />
          ))}
        </div>
      ) : (
        /* Empty Watchlist State */
        <Card className="text-center py-12">
          <CardContent className="pt-6">
            <Heart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Your watchlist is empty</h3>
            <p className="text-muted-foreground mb-6">
              {filterType === "movies" 
                ? "No movies in your watchlist yet. Start adding some movies to watch later!"
                : filterType === "tv"
                ? "No TV shows in your watchlist yet. Start adding some shows to binge later!"
                : "No items in your watchlist yet. Start building your perfect queue of movies and shows to watch!"
              }
            </p>
            <div className="space-x-4">
              <Button onClick={() => setLocation("/movies")}>
                <Plus className="h-4 w-4 mr-2" />
                Browse Movies
              </Button>
              <Button variant="outline" onClick={() => setLocation("/tv-shows")}>
                <Plus className="h-4 w-4 mr-2" />
                Browse TV Shows
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state for filtered results */}
      {allListItems.length > 0 && sortedList.length === 0 && (
        <Card className="text-center py-12">
          <CardContent className="pt-6">
            <h3 className="text-xl font-semibold mb-2">No items match your filter</h3>
            <p className="text-muted-foreground mb-6">
              Try changing your filter to see more items in your watchlist.
            </p>
            <Button onClick={() => setFilterType("all")}>
              Show All Items
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      {allListItems.length > 0 && (
        <Card className="p-6 mt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold mb-1">Ready to discover more?</h3>
              <p className="text-sm text-muted-foreground">
                Get personalized recommendations based on your watchlist preferences.
              </p>
            </div>
            <Button onClick={() => setLocation("/recommendations")} className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Get AI Recommendations</span>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}