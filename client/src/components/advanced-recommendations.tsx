import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Search, Star, TrendingUp, Brain, ExternalLink, Lightbulb, ChevronDown, ChevronUp, Tag, Film } from 'lucide-react';
import { PreferenceWizard } from './preference-wizard';
import { useQuery } from '@tanstack/react-query';
import MediaCard from '@/components/media-card';
import MediaCardSkeleton from '@/components/media-card-skeleton';

interface UserPreferences {
  mediaType: string[];
  releaseYearRange: [number, number];
  ratingRange: [number, number];
  genres: string[];
  moods: string[];
  languages: string[];
  runtime: string;
}

interface AdvancedRecommendation {
  movie: any;
  matchScore: number;
  reasons: string[];
  searchContext: string[];
  relatedMovies: string[];
}

export function AdvancedRecommendations() {
  const [showWizard, setShowWizard] = useState(false);
  
  // Load saved preferences and search query from sessionStorage
  const [preferences, setPreferences] = useState<UserPreferences | null>(() => {
    const saved = sessionStorage.getItem('advancedRecommendations_preferences');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [searchQuery, setSearchQuery] = useState(() => {
    return sessionStorage.getItem('advancedRecommendations_query') || '';
  });
  
  // Use a trigger to control when to search - only increments when user clicks button
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  
  // Track which recommendation details are expanded
  const [expandedRecommendations, setExpandedRecommendations] = useState<Set<number>>(new Set());
  
  // Persist state to sessionStorage whenever it changes
  React.useEffect(() => {
    if (preferences) {
      sessionStorage.setItem('advancedRecommendations_preferences', JSON.stringify(preferences));
    } else {
      sessionStorage.removeItem('advancedRecommendations_preferences');
    }
  }, [preferences]);

  React.useEffect(() => {
    sessionStorage.setItem('advancedRecommendations_query', searchQuery);
  }, [searchQuery]);

  // Semantic search query using Universal Sentence Encoder
  const { data: recommendations, isLoading, error, isFetching } = useQuery({
    queryKey: ['/api/recommendations/semantic-search', lastSearchedQuery, preferences, searchTrigger],
    enabled: searchTrigger > 0 && !!lastSearchedQuery,
    queryFn: async () => {
      // Build filters from preferences
      const filters: any = {};
      
      if (preferences) {
        if (preferences.genres && preferences.genres.length > 0) {
          filters.genres = preferences.genres;
        }
        if (preferences.releaseYearRange) {
          filters.yearRange = preferences.releaseYearRange;
        }
        if (preferences.ratingRange) {
          filters.minRating = preferences.ratingRange[0];
          filters.maxRating = preferences.ratingRange[1];
        }
        if (preferences.languages && preferences.languages.length > 0) {
          filters.languages = preferences.languages;
        }
        if (preferences.mediaType && preferences.mediaType.length > 0) {
          filters.mediaType = preferences.mediaType;
        }
        if (preferences.moods && preferences.moods.length > 0) {
          filters.moods = preferences.moods;
        }
        if (preferences.runtime) {
          filters.runtime = preferences.runtime;
        }
      }
      
      const response = await fetch('/api/recommendations/semantic-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: lastSearchedQuery,
          limit: 20,
          filters
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 429) {
          throw new Error(errorData.message || 'Too many requests. Please wait a moment before trying again.');
        }
        
        throw new Error(errorData.message || 'Failed to perform semantic search');
      }
      
      const data = await response.json();
      
      // Transform semantic search results to match expected format
      return {
        recommendations: data.results.map((result: any) => ({
          movie: {
            id: result.tmdbId,
            title: result.title,
            overview: result.overview,
            poster_path: result.posterPath,
            release_date: result.releaseDate,
            vote_average: result.voteAverage,
            popularity: result.popularity,
            genre_ids: result.genres,
            media_type: 'movie'
          },
          matchScore: Math.round(result.similarity * 100), // Convert 0-1 to 0-100
          reasons: [result.explanation],
          searchContext: [`Similarity: ${(result.similarity * 100).toFixed(1)}%`],
          relatedMovies: []
        })),
        totalMatches: data.totalMatches,
        searchTime: data.searchTime,
        queryAnalysis: data.queryAnalysis
      };
    },
  });

  const handlePreferencesComplete = (prefs: UserPreferences) => {
    setPreferences(prefs);
    setShowWizard(false);
  };

  const handleSearch = () => {
    if (searchQuery.trim() && !isLoading && !isFetching) {
      setLastSearchedQuery(searchQuery.trim());
      setSearchTrigger(prev => prev + 1);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getMatchScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100';
  };

  const getMatchScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent Match';
    if (score >= 60) return 'Good Match';
    return 'Partial Match';
  };

  const toggleRecommendationDetails = (movieId: number) => {
    setExpandedRecommendations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(movieId)) {
        newSet.delete(movieId);
      } else {
        newSet.add(movieId);
      }
      return newSet;
    });
  };

  if (showWizard) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <PreferenceWizard
          onComplete={handlePreferencesComplete}
          onSkip={() => {
            // Don't set preferences when skipping - just close the wizard
            // This way the preferences card won't show
            setShowWizard(false);
          }}
          onReset={() => {
            // Clear preferences and go back to advanced finder
            setPreferences(null);
            sessionStorage.removeItem('userPreferences');
            setShowWizard(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-8">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-foreground">Advanced Movie Finder</h1>
          </div>
        </div>
        <Button
          onClick={() => setShowWizard(true)}
          variant="outline"
          className="gap-2 w-full sm:w-auto"
        >
          <Sparkles className="h-4 w-4" />
          <span className="hidden sm:inline">{preferences ? 'Update Preferences' : 'Set Preferences'}</span>
          <span className="sm:hidden">Preferences</span>
        </Button>
      </div>

      {/* Search Interface */}
      <Card className="mb-4 sm:mb-8">
        <CardHeader className="p-4 sm:p-6 pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Brain className="h-4 w-4 sm:h-5 sm:w-5" />
            <span className="hidden sm:inline">Semantic Search - Describe the movie you're looking for in natural language</span>
            <span className="sm:hidden">Semantic Search</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="e.g., 'mind-bending thriller about dreams' or 'heartwarming family comedy'"
              className="flex-1 text-sm sm:text-base"
              data-testid="input-advanced-search"
            />
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isLoading || isFetching}
              className="gap-2 w-full sm:w-auto"
              data-testid="button-advanced-search"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Find Movies</span>
              <span className="sm:hidden">Search</span>
            </Button>
          </div>
          
          {!preferences && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 Optional: Set preferences to filter results by genre, year, rating, and language
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences Summary */}
      {preferences && (
        <Card className="mb-4 sm:mb-8">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base sm:text-lg">Your Preferences</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 text-sm">
              <div>
                <span className="font-medium">Media Type:</span> {preferences.mediaType.join(', ')}
              </div>
              <div>
                <span className="font-medium">Years:</span> {preferences.releaseYearRange[0]} - {preferences.releaseYearRange[1]}
              </div>
              <div>
                <span className="font-medium">Rating:</span> {preferences.ratingRange[0]} - {preferences.ratingRange[1]}
              </div>
              <div>
                <span className="font-medium">Runtime:</span> {preferences.runtime}
              </div>
              <div className="sm:col-span-2 md:col-span-2">
                <span className="font-medium">Languages:</span> {preferences.languages.join(', ')}
              </div>
              {preferences.genres.length > 0 && (
                <div className="sm:col-span-2 md:col-span-3">
                  <span className="font-medium">Genres:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {preferences.genres.map(genre => (
                      <Badge key={genre} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {preferences.moods.length > 0 && (
                <div className="sm:col-span-2 md:col-span-3">
                  <span className="font-medium">Moods:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {preferences.moods.map(mood => (
                      <Badge key={mood} variant="outline" className="text-xs">
                        {mood}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
          {Array.from({ length: 10 }, (_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="text-red-600 dark:text-red-400">
                <p className="font-semibold mb-2">
                  {error.message.includes('Too many requests') || error.message.includes('rate limit') 
                    ? '⏱️ Rate Limit Reached' 
                    : '❌ Error'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {error.message}
                </p>
              </div>
              {(error.message.includes('Too many requests') || error.message.includes('rate limit')) && (
                <p className="text-xs text-muted-foreground max-w-md">
                  You're making searches too quickly. Please wait about a minute and try again.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results - Advanced Search */}
      {recommendations && recommendations.recommendations && (
        <div className="space-y-6">
          {/* Movie Recommendations Grid */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg sm:text-xl lg:text-2xl font-bold">
                {preferences?.mediaType.includes('both') || (preferences?.mediaType.includes('movies') && preferences?.mediaType.includes('tv'))
                  ? 'Recommended Movies & TV Shows'
                  : preferences?.mediaType.includes('tv')
                  ? 'Recommended TV Shows'
                  : 'Recommended Movies'}
              </h2>
              <Badge variant="secondary" className="text-xs sm:text-sm">
                {recommendations.recommendations.length}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
              {recommendations.recommendations.map((rec: AdvancedRecommendation, index: number) => {
                const mediaType = rec.movie.media_type || (rec.movie.name ? 'tv' : 'movie');
                const title = rec.movie.title || rec.movie.name;
                const releaseDate = rec.movie.release_date || rec.movie.first_air_date;
                const year = releaseDate ? new Date(releaseDate).getFullYear().toString() : '2024';
                
                return (
                  <MediaCard
                    key={`${rec.movie.id}-${index}`}
                    item={{
                      id: rec.movie.id,
                      title: title,
                      name: rec.movie.name,
                      rating: rec.movie.vote_average || 7.0,
                      year: year,
                      synopsis: rec.movie.overview,
                      poster_path: rec.movie.poster_path,
                      type: mediaType,
                      media_type: mediaType,
                      first_air_date: rec.movie.first_air_date,
                      release_date: rec.movie.release_date,
                      number_of_seasons: rec.movie.number_of_seasons
                    }}
                    mediaType={mediaType}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {searchTrigger > 0 && !isLoading && !isFetching && !error && (!recommendations || !recommendations.recommendations?.length) && (
        <Card>
          <CardContent className="py-12 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No recommendations found</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your preferences or using different search terms
            </p>
            <Button onClick={() => setShowWizard(true)} variant="outline">
              Update Preferences
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}