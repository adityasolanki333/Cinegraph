import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import MovieCard from "@/components/movie-card";
import MovieCardSkeleton from "@/components/movie-card-skeleton";
import { tmdbService } from "@/lib/tmdb";
import { Play, Info, ChevronRight, ChevronLeft, Heart, Smile, Zap, Brain, Sparkles, RefreshCw, Film, Tv } from "lucide-react";
import { Link } from "wouter";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";
import type { Movie } from "@shared/schema";
import { TrailerDialog } from "@/components/trailer-dialog";
import { useToast } from "@/hooks/use-toast";
import { ContinueWatching } from "@/components/continue-watching";
import { useAuth } from "@/hooks/useAuth";

const moodOptions = [
  {
    id: "happy",
    label: "Happy",
    icon: Smile,
    color: "text-yellow-500",
    description: "Comedy, Feel-good, Uplifting",
  },
  {
    id: "romantic",
    label: "Romantic",
    icon: Heart,
    color: "text-pink-500",
    description: "Love stories, Romance, Date night",
  },
  {
    id: "energetic",
    label: "Energetic",
    icon: Zap,
    color: "text-red-500",
    description: "Action, Adventure, Thrillers",
  },
  {
    id: "thoughtful",
    label: "Thoughtful",
    icon: Brain,
    color: "text-blue-500",
    description: "Drama, Deep stories, Award-winning",
  },
  {
    id: "scary",
    label: "Scary",
    icon: Brain,
    color: "text-purple-500",
    description: "Horror, Suspense, Supernatural",
  },
  {
    id: "nostalgic",
    label: "Classic",
    icon: Sparkles,
    color: "text-amber-500",
    description: "Timeless, Vintage, Golden age",
  },
  {
    id: "animated",
    label: "Animated",
    icon: Heart,
    color: "text-green-500",
    description: "Family-friendly, Animation, Fun",
  },
  {
    id: "indie",
    label: "Indie",
    icon: Sparkles,
    color: "text-indigo-500",
    description: "Independent, Artistic, Unique",
  },
];

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const { isInWatchlist } = useWatchlist();
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Fetch data from TMDB API
  const { data: trendingData, isLoading: trendingLoading, error: trendingError } = useQuery({
    queryKey: ['/api/tmdb/trending'],
    select: (data: any) => {
      if (data.error || !data.results || data.results.length === 0) {
        return [];
      }
      return data.results.slice(0, 5).map((item: any) => tmdbService.convertToMovie(item, item.media_type || 'movie'));
    }
  });

  const { data: popularMoviesData, isLoading: popularLoading } = useQuery({
    queryKey: ['/api/tmdb/movies/popular'],
    select: (data: any) => {
      if (data.error || !data.results || data.results.length === 0) {
        return [];
      }
      return data.results.slice(0, 10).map((item: any) => tmdbService.convertToMovie(item, 'movie'));
    }
  });

  const { data: topRatedData, isLoading: topRatedLoading } = useQuery({
    queryKey: ['/api/tmdb/movies/top-rated'],
    select: (data: any) => {
      if (data.error || !data.results || data.results.length === 0) {
        return [];
      }
      return data.results.slice(0, 10).map((item: any) => tmdbService.convertToMovie(item, 'movie'));
    }
  });

  const { data: popularTVData, isLoading: tvLoading } = useQuery({
    queryKey: ['/api/tmdb/tv/popular'],
    select: (data: any) => {
      if (data.error || !data.results || data.results.length === 0) {
        return [];
      }
      return data.results.slice(0, 10).map((item: any) => tmdbService.convertToMovie(item, 'tv'));
    }
  });

  // TMDB-based mood recommendations
  const { data: moodRecommendations, isLoading: moodLoading } = useQuery({
    queryKey: ['/api/recommendations/mood', selectedMood, mediaType, refreshKey],
    enabled: !!selectedMood,
    queryFn: async () => {
      const response = await fetch(`/api/recommendations/mood/${selectedMood}?type=${mediaType}&seed=${refreshKey}`);
      if (!response.ok) throw new Error('Failed to fetch mood recommendations');
      return response.json();
    },
    select: (data: any) => {
      if (!data.recommendations) return [];
      return data.recommendations.slice(0, 8).map((item: any) => 
        tmdbService.convertToMovie(item, mediaType)
      );
    }
  });

  const featuredMovies = trendingData || [];
  const popularMovies = popularMoviesData || [];
  const topRatedContent = topRatedData || [];
  const trendingTVShows = popularTVData || [];

  const handleMoodSelect = (moodId: string) => {
    setSelectedMood(selectedMood === moodId ? null : moodId);
  };

  const getMoodBasedRecommendations = () => {
    if (!selectedMood) return [];
    
    const moodItems = moodRecommendations || [];
    
    if (moodItems.length >= 8) {
      return moodItems.slice(0, 8);
    }
    
    const fallbackItems = mediaType === 'tv' 
      ? (popularTVData || [])
      : (popularMoviesData || []);
    
    const combined = [...moodItems];
    const usedIds = new Set(moodItems.map((item: any) => item.id));
    
    for (const item of fallbackItems) {
      if (combined.length >= 8) break;
      if (!usedIds.has(item.id)) {
        combined.push(item);
        usedIds.add(item.id);
      }
    }
    
    return combined.slice(0, 8);
  };

  // Auto-advance slider removed - users navigate manually

  const nextSlide = () => {
    setCurrentSlide(prev => (prev + 1) % featuredMovies.length);
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev - 1 + featuredMovies.length) % featuredMovies.length);
  };

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null); // Reset touch end
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStart === null || touchEnd === null) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 30; // Swipe left to go to next
    const isRightSwipe = distance < -30; // Swipe right to go to previous
    
    if (isLeftSwipe && featuredMovies.length > 1) {
      nextSlide();
    }
    if (isRightSwipe && featuredMovies.length > 1) {
      prevSlide();
    }
    
    // Reset values
    setTouchStart(null);
    setTouchEnd(null);
  };

  const currentMovie = featuredMovies[currentSlide] || featuredMovies[0];
  const [trailerInfo, setTrailerInfo] = useState<{ id: string; type: 'movie' | 'tv'; title: string } | null>(null);
  const [shouldFetchTrailer, setShouldFetchTrailer] = useState(false);

  // Only fetch trailer when user clicks play button
  const { data: trailerData, isLoading: trailerLoading } = useQuery({
    queryKey: ['/api/tmdb', trailerInfo?.type || 'movie', trailerInfo?.id, 'videos'],
    queryFn: async () => {
      if (!trailerInfo?.id) return null;
      const endpoint = trailerInfo.type === 'tv' 
        ? `/api/tmdb/tv/${trailerInfo.id}/videos`
        : `/api/tmdb/movie/${trailerInfo.id}/videos`;
      const response = await fetch(endpoint);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!trailerInfo?.id && shouldFetchTrailer
  });

  const trailers = trailerData?.results?.filter((video: any) => 
    video.type === 'Trailer' && video.site === 'YouTube'
  ) || [];

  // Handle trailer data when it's loaded
  useEffect(() => {
    if (shouldFetchTrailer && !trailerLoading && trailerData) {
      if (trailers.length > 0) {
        setIsTrailerOpen(true);
      } else {
        toast({
          title: "No trailer available",
          description: `Sorry, no trailer is available for this ${trailerInfo?.type === 'tv' ? 'TV show' : 'movie'}.`,
          variant: "default",
        });
      }
      setShouldFetchTrailer(false);
    }
  }, [trailerData, trailerLoading, shouldFetchTrailer, trailers.length, trailerInfo?.type, toast]);

  const handlePlayTrailer = () => {
    if (!currentMovie?.id) return;
    setTrailerInfo({ 
      id: currentMovie.id, 
      type: currentMovie.type || 'movie',
      title: currentMovie.title || currentMovie.name || 'Unknown'
    });
    setShouldFetchTrailer(true);
  };

  // Get genres with counts and emojis
  const genreEmojis: Record<string, string> = {
    'Action': '🎬',
    'Romance': '💕',
    'Sci-Fi': '🚀',
    'Horror': '😱',
    'Drama': '🎭',
    'Adventure': '🗺️',
    'Comedy': '😄',
    'Fantasy': '🧙‍♂️',
    'Crime': '🕵️',
    'Medical': '🏥',
    'Documentary': '📹',
    'Thriller': '🔥',
    'Mystery': '🔍',
    'Animation': '🎨'
  };

  const genres = useMemo(() => {
    // Static genre list with counts and emojis for now
    return [
      { genre: "Action", count: 45, emoji: "🎬" },
      { genre: "Comedy", count: 38, emoji: "😄" },
      { genre: "Drama", count: 52, emoji: "🎭" },
      { genre: "Horror", count: 25, emoji: "😱" },
      { genre: "Romance", count: 31, emoji: "💕" },
      { genre: "Sci-Fi", count: 28, emoji: "🚀" },
      { genre: "Thriller", count: 33, emoji: "🔥" },
      { genre: "Adventure", count: 41, emoji: "🗺️" },
      { genre: "Animation", count: 22, emoji: "🎨" },
      { genre: "Fantasy", count: 19, emoji: "🧙‍♂️" },
      { genre: "Crime", count: 27, emoji: "🕵️" },
      { genre: "Mystery", count: 24, emoji: "🔍" },
    ];
  }, []);

  // Remove these functions as MovieCard will handle watchlist internally

  const MovieRow = ({ title, movies, showMore = false, showMoreLink = "/movies", isLoading = false }: { title: string; movies: Movie[]; showMore?: boolean; showMoreLink?: string; isLoading?: boolean }) => (
    <div className="mb-6 sm:mb-8" data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground" data-testid={`title-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</h2>
        {showMore && (
          <Link href={showMoreLink}>
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 text-sm" data-testid={`button-see-more-${title.toLowerCase().replace(/\s+/g, '-')}`}>
              <span className="hidden sm:inline">See More</span>
              <span className="sm:hidden">More</span>
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </Link>
        )}
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex space-x-3 sm:space-x-4 pb-4">
          {isLoading ? (
            Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex-none w-36 sm:w-40 md:w-48">
                <MovieCardSkeleton />
              </div>
            ))
          ) : (
            movies.map((movie) => (
              <div key={movie.id} className="flex-none w-36 sm:w-40 md:w-48" data-testid={`movie-card-${movie.id}`}>
                <MovieCard
                  movie={movie}
                />
              </div>
            ))
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );

  if (trendingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Loading CineGraph...</h2>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    );
  }

  // Show API key error if no data is available
  const hasNoData = !featuredMovies.length && !popularMovies.length && !topRatedContent.length && !trendingTVShows.length;
  if (hasNoData && !trendingLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <h2 className="text-2xl font-bold mb-4 text-red-500">TMDB API Key Required</h2>
          <p className="text-muted-foreground mb-4">
            To display real movie data, please provide a valid TMDB API key. You can get one for free at themoviedb.org.
          </p>
          <p className="text-sm text-muted-foreground">
            The API key appears to be invalid or missing. Please update your secrets with a valid TMDB_API_KEY.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Slider */}
      {currentMovie && (
        <div 
          className="relative h-[150vw] max-h-[100vh] sm:h-[70vh] lg:h-[80vh] overflow-hidden bg-black" 
          data-testid="hero-section"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="absolute inset-0">
            {/* Mobile: Blurred background + centered poster */}
            <div className="sm:hidden absolute inset-0">
              {/* Blurred background */}
              <img
                src={currentMovie.posterUrl || "https://images.unsplash.com/photo-1489599558473-7636b88d6e6a?ixlib=rb-4.0.3&w=1920&h=1080&fit=crop"}
                alt=""
                className="w-full h-full object-cover blur-2xl scale-110 opacity-50"
              />
              {/* Full poster on top */}
              <img
                src={currentMovie.posterUrl || "https://images.unsplash.com/photo-1489599558473-7636b88d6e6a?ixlib=rb-4.0.3&w=1920&h=1080&fit=crop"}
                alt={currentMovie.title || "Featured Movie"}
                className="absolute inset-0 w-full h-full object-contain transition-all duration-1000"
              />
            </div>
            {/* Desktop: Show backdrop/cover image */}
            <img
              src={currentMovie.backdropUrl || currentMovie.posterUrl || "https://images.unsplash.com/photo-1489599558473-7636b88d6e6a?ixlib=rb-4.0.3&w=1920&h=1080&fit=crop"}
              alt={currentMovie.title || "Featured Movie"}
              className="hidden sm:block w-full h-full object-cover transition-all duration-1000"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          </div>

          {/* Navigation - Clickable Areas */}
          {featuredMovies.length > 1 && (
            <>
              {/* Left clickable area for previous slide */}
              <button
                className="absolute left-0 top-0 bottom-0 w-[40%] z-[40] cursor-pointer group"
                onClick={prevSlide}
                data-testid="area-prev-slide"
                aria-label="Previous slide"
              >
                <div className="absolute inset-y-0 left-4 flex items-center opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <ChevronLeft className="h-10 w-10 sm:h-12 sm:w-12 text-white drop-shadow-2xl" />
                </div>
              </button>
              
              {/* Right clickable area for next slide */}
              <button
                className="absolute right-0 top-0 bottom-0 w-[40%] z-[40] cursor-pointer group"
                onClick={nextSlide}
                data-testid="area-next-slide"
                aria-label="Next slide"
              >
                <div className="absolute inset-y-0 right-4 flex items-center opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="h-10 w-10 sm:h-12 sm:w-12 text-white drop-shadow-2xl" />
                </div>
              </button>

              {/* Slide indicators */}
              <div className="absolute bottom-20 sm:bottom-8 left-1/2 -translate-x-1/2 z-[40] flex items-center gap-2">
                {featuredMovies.map((_movie, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentSlide(index)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      currentSlide === index 
                        ? "bg-white w-8" 
                        : "bg-white/50 hover:bg-white/75"
                    )}
                    data-testid={`indicator-slide-${index}`}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            </>
          )}
          
          <div className="relative z-[40] flex items-center h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pointer-events-none">
            <div className="max-w-2xl pointer-events-auto">
              <Badge variant="secondary" className="mb-2 sm:mb-4" data-testid="badge-featured-type">
                {currentMovie.type === "tv" ? (currentMovie.seasons ? `${currentMovie.seasons} Season${currentMovie.seasons !== 1 ? 's' : ''}` : "TV Series") : "Movie"}
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 sm:mb-4 line-clamp-2" data-testid="text-featured-title">
                {currentMovie.title}
              </h1>
              <p className="text-sm sm:text-base lg:text-lg text-gray-200 mb-4 sm:mb-6 max-w-xl line-clamp-3 sm:line-clamp-4" data-testid="text-featured-synopsis">
                {currentMovie.synopsis}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4 sm:mb-6 text-sm sm:text-base">
                <div className="flex items-center space-x-2 text-white">
                  <span className="text-yellow-400">★</span>
                  <span className="font-semibold" data-testid="text-featured-rating">{currentMovie.rating}</span>
                </div>
                <span className="text-gray-300 hidden sm:inline">•</span>
                <span className="text-gray-300" data-testid="text-featured-year">{currentMovie.year}</span>
                <span className="text-gray-300 hidden sm:inline">•</span>
                <span className="text-gray-300" data-testid="text-featured-genre">{currentMovie.genre}</span>
                {currentMovie.duration && (
                  <>
                    <span className="text-gray-300 hidden sm:inline">•</span>
                    <span className="text-gray-300" data-testid="text-featured-duration">{currentMovie.duration}min</span>
                  </>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <Button 
                  size="lg" 
                  className="bg-white text-black hover:bg-gray-200 w-full sm:w-auto" 
                  data-testid="button-play"
                  onClick={handlePlayTrailer}
                >
                  <Play className="h-4 w-4 sm:h-5 sm:w-5 mr-2 fill-current" />
                  Play Trailer
                </Button>
                <Link href={currentMovie.type === "tv" ? `/tv/${currentMovie.id}` : `/movie/${currentMovie.id}`}>
                  <Button size="lg" variant="secondary" className="bg-gray-500/50 text-white hover:bg-gray-500/70 w-full sm:w-auto" data-testid="button-more-info">
                    <Info className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                    More Info
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Content Sections */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Continue Watching Section */}
        {user && (
          <div className="mb-8" data-testid="section-continue-watching">
            <ContinueWatching />
          </div>
        )}

        {/* Mood-Based Suggestions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
              <div className="flex items-center space-x-2">
                <Heart className="h-5 w-5 text-accent" />
                <span className="text-lg sm:text-xl">What's Your Mood?</span>
              </div>
              <div className="flex items-center gap-2 bg-muted rounded-lg p-1 w-full sm:w-auto">
                <Button
                  variant={mediaType === 'movie' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMediaType('movie')}
                  className="h-8 flex-1 sm:flex-none"
                  data-testid="button-mood-movies"
                >
                  <Film className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Movies</span>
                </Button>
                <Button
                  variant={mediaType === 'tv' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setMediaType('tv')}
                  className="h-8 flex-1 sm:flex-none"
                  data-testid="button-mood-tv"
                >
                  <Tv className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">TV Shows</span>
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              {moodOptions.map((mood) => {
                const Icon = mood.icon;
                const isSelected = selectedMood === mood.id;
                
                return (
                  <Button
                    key={mood.id}
                    variant="outline"
                    className={cn(
                      "h-auto p-3 sm:p-4 flex flex-col items-center space-y-1 sm:space-y-2 transition-all duration-300",
                      isSelected && "border-primary bg-primary/10"
                    )}
                    onClick={() => handleMoodSelect(mood.id)}
                  >
                    <Icon className={cn("h-6 w-6 sm:h-8 sm:w-8", mood.color)} />
                    <div className="text-center">
                      <p className="font-medium text-sm sm:text-base">{mood.label}</p>
                      <p className="text-xs text-muted-foreground hidden sm:block">{mood.description}</p>
                    </div>
                  </Button>
                );
              })}
            </div>

            {selectedMood && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h3 className="text-base sm:text-lg font-semibold">
                    Perfect {mediaType === 'movie' ? 'movies' : 'TV shows'} for your {moodOptions.find(m => m.id === selectedMood)?.label.toLowerCase()} mood:
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRefreshKey(prev => prev + 1)}
                    disabled={moodLoading}
                    className="gap-2 w-full sm:w-auto"
                    data-testid="refresh-mood-recommendations"
                  >
                    <RefreshCw className={cn("h-4 w-4", moodLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
                {moodLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {Array.from({ length: 8 }, (_, i) => (
                      <MovieCardSkeleton key={i} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                    {getMoodBasedRecommendations().map((movie: any) => (
                      <MovieCard
                        key={movie.id}
                        movie={movie}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Popular Movies */}
        <MovieRow title="Popular Movies" movies={popularMovies} showMore={true} isLoading={popularLoading} />

        {/* Top Rated */}
        <MovieRow title="Top Rated" movies={topRatedContent} showMore={true} isLoading={topRatedLoading} />

        {/* Trending TV Shows */}
        <MovieRow title="Trending TV Shows" movies={trendingTVShows} showMore={true} showMoreLink="/tv-shows" isLoading={tvLoading} />

        {/* Browse by Genre */}
        <div className="mb-6 sm:mb-8" data-testid="section-genres">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground" data-testid="title-browse-genres">Browse by Genre</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {genres.map(({ genre, count, emoji }) => (
              <Link key={genre} href={`/movies?genre=${encodeURIComponent(genre)}`}>
                <Card className="genre-card cursor-pointer hover:bg-accent/50 transition-colors" data-testid={`card-genre-${genre.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardContent className="p-4 sm:p-6 text-center">
                    <div className="text-2xl sm:text-3xl mb-1 sm:mb-2" data-testid={`emoji-genre-${genre.toLowerCase().replace(/\s+/g, '-')}`}>{emoji}</div>
                    <h3 className="font-semibold text-sm sm:text-base text-foreground" data-testid={`text-genre-name-${genre.toLowerCase().replace(/\s+/g, '-')}`}>{genre}</h3>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Trailer Dialog */}
      {trailerInfo && (
        <TrailerDialog
          isOpen={isTrailerOpen}
          onClose={() => setIsTrailerOpen(false)}
          trailers={trailers}
          title={trailerInfo.title}
        />
      )}
    </div>
  );
}
