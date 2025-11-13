import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import AIChat from "@/components/ai-chat";
import { AdvancedRecommendations } from "@/components/advanced-recommendations";
import { PatternInsights } from "@/components/pattern-insights";

import MovieCard from "@/components/movie-card";
import MovieCardSkeleton from "@/components/movie-card-skeleton";
import { tmdbService } from "@/lib/tmdb";
import { Sparkles, Heart, Brain, Zap, Smile, Loader2, Search, Settings, RefreshCw, Film, Tv, LogIn, Target } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useWatchlist } from "@/hooks/useWatchlist";
import { Link, useLocation } from "wouter";
import type { Movie } from "@shared/schema";
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

// Pipeline Recommendations Component with Pagination
function PipelineRecommendations({ loading, recommendations }: { loading: boolean; recommendations: any }) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" data-testid="loader-pipeline-recommendations" />
        <span className="ml-2 text-muted-foreground">Processing multi-stage pipeline...</span>
      </div>
    );
  }

  if (!recommendations?.recommendations?.length) {
    return (
      <div className="py-12 text-center">
        <Settings className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Pipeline Recommendations</h3>
        <p className="text-muted-foreground mb-6">
          Rate some movies or add titles to your watchlist to get advanced pipeline recommendations
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/movies">
            <Button data-testid="button-browse-movies-pipeline">
              <Film className="h-4 w-4 mr-2" />
              Browse Movies
            </Button>
          </Link>
          <Link href="/tv-shows">
            <Button variant="outline" data-testid="button-browse-tv-pipeline">
              <Tv className="h-4 w-4 mr-2" />
              Browse TV Shows
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Pagination logic
  const totalItems = recommendations.recommendations.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentItems = recommendations.recommendations.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Pipeline Stage Info */}
      {recommendations.pipeline && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <div className="text-2xl font-bold text-accent">Stage 1</div>
            <div className="text-sm text-muted-foreground mt-1">Candidate Generation</div>
            <div className="text-xs text-muted-foreground">{recommendations.pipeline.stage1}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent">Stage 2</div>
            <div className="text-sm text-muted-foreground mt-1">Precision Ranking</div>
            <div className="text-xs text-muted-foreground">{recommendations.pipeline.stage2}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-accent">Stage 3</div>
            <div className="text-sm text-muted-foreground mt-1">Re-ranking & Diversity</div>
            <div className="text-xs text-muted-foreground">{recommendations.pipeline.stage3}</div>
          </div>
        </div>
      )}

      {/* Recommendations Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {currentItems.map((rec: any) => {
          const movie = {
            id: rec.tmdbId.toString(),
            type: rec.mediaType || 'movie',
            mediaType: rec.mediaType || 'movie',
            title: rec.title,
            posterUrl: rec.posterPath ? tmdbService.getImageUrl(rec.posterPath, 'poster') : null,
            rating: rec.metadata?.vote_average || 0,
            year: rec.metadata?.release_date ? new Date(rec.metadata.release_date).getFullYear() : 0,
            genre: rec.metadata?.genres?.[0]?.name || '',
            synopsis: rec.metadata?.overview || null,
            director: null,
            cast: null,
            duration: rec.metadata?.runtime || null,
            seasons: null,
          } as Movie;
          
          return (
            <MovieCard 
              key={rec.tmdbId}
              movie={movie} 
              showFeedback={true}
              recommendationScore={rec.score}
              recommendationStrategy={rec.strategy}
              experimentId={rec.experimentId}
            />
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-4 mt-6">
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              data-testid="button-prev-page-pipeline"
            >
              Previous
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="min-w-[40px]"
                    data-testid={`button-page-${pageNum}-pipeline`}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              data-testid="button-next-page-pipeline"
            >
              Next
            </Button>
          </div>
          
          <div className="text-center text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, totalItems)} of {totalItems} recommendations
          </div>
        </div>
      )}
    </div>
  );
}

export default function Recommendations() {
  const [activeTab, setActiveTab] = useState<string>(() => {
    return sessionStorage.getItem('recommendations_activeTab') || 'chat';
  });
  
  const [selectedMood, setSelectedMood] = useState<string | null>(() => {
    return sessionStorage.getItem('recommendations_selectedMood') || null;
  });
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>(() => {
    const saved = sessionStorage.getItem('recommendations_mediaType');
    return (saved as 'movie' | 'tv') || 'movie';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const { isInWatchlist } = useWatchlist();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Persist state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('recommendations_activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedMood) {
      sessionStorage.setItem('recommendations_selectedMood', selectedMood);
    } else {
      sessionStorage.removeItem('recommendations_selectedMood');
    }
  }, [selectedMood]);

  useEffect(() => {
    sessionStorage.setItem('recommendations_mediaType', mediaType);
  }, [mediaType]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Get different categories of recommendations from TMDB
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['/api/tmdb/trending'],
    select: (data: any) => {
      if (!data.results) return [];
      return data.results.slice(0, 6).map((item: any) => 
        tmdbService.convertToMovie(item, item.media_type || 'movie')
      );
    }
  });

  const { data: topRatedMovies, isLoading: topRatedLoading } = useQuery({
    queryKey: ['/api/tmdb/movies/top-rated'],
    select: (data: any) => {
      if (!data.results) return [];
      return data.results.slice(0, 4).map((item: any) => 
        tmdbService.convertToMovie(item, 'movie')
      );
    }
  });

  const { data: popularMovies, isLoading: popularLoading } = useQuery({
    queryKey: ['/api/tmdb/movies/popular'],
    select: (data: any) => {
      if (!data.results) return [];
      return data.results.slice(0, 12).map((item: any) => 
        tmdbService.convertToMovie(item, 'movie')
      );
    }
  });

  const { data: popularTVShows, isLoading: tvLoading } = useQuery({
    queryKey: ['/api/tmdb/tv/popular'],
    select: (data: any) => {
      if (!data.results) return [];
      return data.results.slice(0, 12).map((item: any) => 
        tmdbService.convertToMovie(item, 'tv')
      );
    }
  });

  const handleMoodSelect = (moodId: string) => {
    setSelectedMood(selectedMood === moodId ? null : moodId);
  };

  // Remove local handlers - MovieCard will handle watchlist internally

  // TMDB-based mood recommendations for latest movies/TV shows
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

  // Unified pipeline recommendations with user-controlled diversity  
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);
  const [diversityLevel, setDiversityLevel] = useState(0.5); // 0 = focused, 0.5 = balanced, 1 = diverse
  const { data: pipelineRecommendations, isLoading: pipelineLoading } = useQuery({
    queryKey: ['/api/recommendations/unified', 'pipeline', user?.id, pipelineRefreshKey, Math.round(diversityLevel * 10) / 10],
    enabled: !!user?.id,
    queryFn: async () => {
      const response = await fetch('/api/recommendations/unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          context: {
            requestType: 'personalized',
            diversityLevel // Pass diversity level to backend
          },
          options: {
            limit: 18,
            useDiversity: diversityLevel > 0.2, // Only apply diversity if level is significant
            explainability: true
          }
        })
      });
      if (!response.ok) throw new Error('Failed to fetch unified recommendations');
      return response.json();
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const getMoodBasedRecommendations = () => {
    // If no mood selected, use trending as default
    if (!selectedMood) return trendingData?.slice(0, 8) || [];
    
    // Start with mood recommendations if available
    const moodItems = moodRecommendations || [];
    
    // If we have enough mood recommendations, return 8 of them
    if (moodItems.length >= 8) {
      return moodItems.slice(0, 8);
    }
    
    // Otherwise, fill in with popular content of the same media type
    const fallbackItems = mediaType === 'tv' 
      ? (popularTVShows || [])
      : (popularMovies || []);
    
    // Combine mood recommendations with fallback, ensuring no duplicates
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

  // Process pipeline recommendations into unified format
  const unifiedRecommendations = useMemo(() => {
    const combined: any[] = [];
    const seenIds = new Set<number>();

    // Helper to normalize score to 0-1 range
    const normalizeScore = (score: number | undefined): number => {
      if (score === undefined || score === null) return 0;
      // If score is already in 0-1 range, use it
      if (score >= 0 && score <= 1) return score;
      // If score is in 0-100 range, convert it
      if (score > 1 && score <= 100) return score / 100;
      // If score is out of bounds, cap it
      if (score > 100) return 1;
      if (score < 0) return 0;
      return 0;
    };

    // Add pipeline recommendations
    if (pipelineRecommendations?.recommendations) {
      for (const rec of pipelineRecommendations.recommendations) {
        if (!seenIds.has(rec.tmdbId)) {
          seenIds.add(rec.tmdbId);
          
          // Convert backend recommendation to TMDB format first
          const tmdbFormat = {
            id: rec.tmdbId,
            title: rec.title,
            name: rec.title,
            overview: rec.metadata?.overview || '',
            poster_path: rec.posterPath?.replace('https://image.tmdb.org/t/p/w500', '') || null,
            backdrop_path: rec.metadata?.backdrop_path || null,
            release_date: rec.metadata?.release_date || rec.metadata?.releaseDate || '',
            first_air_date: rec.metadata?.first_air_date || '',
            vote_average: rec.metadata?.vote_average || rec.metadata?.voteAverage || 0,
            genre_ids: [],
            genres: rec.metadata?.genres || [],
            runtime: rec.metadata?.runtime,
            number_of_seasons: rec.metadata?.number_of_seasons
          };
          
          // Now convert to Movie format using the service
          const movie = tmdbService.convertToMovie(tmdbFormat, rec.mediaType);
          
          combined.push({
            ...movie,
            score: normalizeScore(rec.score),
            diversityScore: normalizeScore(rec.diversityScore),
            strategy: rec.strategy,
            reasons: rec.reasons,
            source: 'pipeline',
            explanation: rec.explanation,
          });
        }
      }
    }

    return combined;
  }, [pipelineRecommendations]);

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
              You need to be logged in to access AI-powered recommendations.
            </p>
            <Button onClick={() => setLocation("/login")} data-testid="button-login">
              <LogIn className="h-4 w-4 mr-2" />
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="mx-auto max-w-7xl w-full px-3 sm:px-4 lg:px-8 py-2 sm:py-3">
        <div className="flex items-center space-x-2 md:space-x-3 mb-2 sm:mb-3">
          <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-accent flex-shrink-0" />
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground">AI-Powered Recommendations</h1>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1">
          <TabsList className="grid w-full grid-cols-3 mb-2 sm:mb-3 gap-0.5 sm:gap-1">
            <TabsTrigger value="chat" className="flex items-center gap-1 md:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-ai-chat">
              <Sparkles className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">AI Chat</span>
              <span className="sm:hidden">Chat</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center gap-1 md:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-advanced-finder">
              <Search className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Advanced Finder</span>
              <span className="sm:hidden">Finder</span>
            </TabsTrigger>
            <TabsTrigger value="why" className="flex items-center gap-1 md:gap-2 text-xs sm:text-sm px-2 sm:px-3" data-testid="tab-why-recommend">
              <Brain className="h-3 w-3 md:h-4 md:w-4" />
              <span className="hidden sm:inline">Why We Recommend</span>
              <span className="sm:hidden">Why</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="flex-1 mt-0">
            {/* AI Chat Interface - Full screen */}
            <AIChat className="w-full h-[calc(100vh-7rem)]" />
          </TabsContent>

        <TabsContent value="advanced">
          <AdvancedRecommendations />
        </TabsContent>


        <TabsContent value="why" className="space-y-8">
          {/* Pattern Recognition Insights */}
          <PatternInsights />

          {/* Diversity Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-5 w-5 text-primary" />
                Recommendation Style
              </CardTitle>
              <CardDescription>
                Control how adventurous your recommendations are
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <Slider
                  value={[diversityLevel]}
                  onValueChange={([value]) => setDiversityLevel(value)}
                  min={0}
                  max={1}
                  step={0.1}
                  className="w-full"
                  data-testid="slider-diversity"
                />
                <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                  <span className="text-left max-w-[30%]">More of what I love</span>
                  <span className="text-center">Balanced</span>
                  <span className="text-right max-w-[30%]">Surprise me!</span>
                </div>
              </div>

              {/* Current diversity level indicator */}
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Current Level:</span>
                  <Badge variant={
                    diversityLevel >= 0.7 ? "default" : 
                    diversityLevel >= 0.3 ? "secondary" : 
                    "outline"
                  } data-testid="badge-diversity-level">
                    {diversityLevel >= 0.7 ? "High Diversity" : 
                     diversityLevel >= 0.3 ? "Balanced" : 
                     "Focused"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {diversityLevel >= 0.7 ? 
                    "High variety across genres and themes. Great for discovering new content outside your usual preferences." : 
                   diversityLevel >= 0.3 ? 
                    "Mix of familiar favorites and new discoveries. Balanced approach to keep things interesting." : 
                    "Recommendations closely match your proven tastes. Deep dive into what you already love."}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Unified AI Recommendations */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                <div className="flex-1">
                  <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                    <Brain className="h-5 w-5 text-accent" />
                    <span>AI-Powered Recommendations</span>
                  </CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPipelineRefreshKey(prev => prev + 1);
                  }}
                  disabled={pipelineLoading}
                  className="w-full sm:w-auto"
                  data-testid="button-refresh-unified"
                >
                  <RefreshCw className={cn("h-4 w-4", pipelineLoading && "animate-spin")} />
                  <span className="sm:hidden ml-2">Refresh</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {pipelineLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-accent" data-testid="loader-unified-recommendations" />
                  <span className="ml-2 text-muted-foreground">Finding your perfect matches...</span>
                </div>
              ) : unifiedRecommendations.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {unifiedRecommendations.map((rec: any) => {
                    // Defensive guard: ensure we have a valid ID
                    const rawId = rec.tmdbId ?? rec.id ?? rec.movieId;
                    if (!rawId) {
                      console.warn('[Recommendations] Skipping item without valid ID:', rec);
                      return null;
                    }
                    
                    const movie = {
                      id: rawId.toString(),
                      type: rec.type || rec.mediaType || 'movie',
                      mediaType: rec.mediaType || 'movie',
                      title: rec.title,
                      posterUrl: rec.posterUrl || (rec.posterPath ? tmdbService.getImageUrl(rec.posterPath, 'poster') : null),
                      rating: rec.rating || rec.metadata?.vote_average || 0,
                      year: rec.year || (rec.metadata?.release_date ? new Date(rec.metadata.release_date).getFullYear() : 0) || (rec.metadata?.first_air_date ? new Date(rec.metadata.first_air_date).getFullYear() : 0),
                      genre: rec.genre || rec.metadata?.genres?.[0]?.name || '',
                      synopsis: rec.synopsis || rec.metadata?.overview || null,
                      director: null,
                      cast: null,
                      duration: rec.duration || rec.metadata?.runtime || null,
                      seasons: rec.seasons || rec.metadata?.number_of_seasons || null,
                    } as Movie;
                    
                    return (
                      <MovieCard 
                        key={rawId}
                        movie={movie} 
                        showFeedback={true}
                        recommendationScore={rec.score}
                        recommendationStrategy={rec.strategy}
                        experimentId={rec.experimentId}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <Brain className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Recommendations Yet</h3>
                  <p className="text-muted-foreground mb-6">
                    Rate some movies or add titles to your watchlist to get personalized AI-powered recommendations
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/movies">
                      <Button data-testid="button-browse-movies">
                        <Film className="h-4 w-4 mr-2" />
                        Browse Movies
                      </Button>
                    </Link>
                    <Link href="/tv-shows">
                      <Button variant="outline" data-testid="button-browse-tv">
                        <Tv className="h-4 w-4 mr-2" />
                        Browse TV Shows
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
