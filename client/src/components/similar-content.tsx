import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import MediaCard from "@/components/media-card";
import MovieCardSkeleton from "@/components/movie-card-skeleton";

interface SimilarContentProps {
  title: string;
  overview: string;
  mediaType: 'movie' | 'tv';
  currentTmdbId: number;
}

interface SemanticSearchResult {
  tmdbId: number;
  title?: string;
  name?: string;
  similarity: number;
  overview: string;
  posterPath?: string;
  mediaType: 'movie' | 'tv';
}

interface SemanticSearchResponse {
  query: string;
  results: SemanticSearchResult[];
  count: number;
  duration: string;
  method: string;
}

export function SimilarContent({ title, overview, mediaType, currentTmdbId }: SimilarContentProps) {
  const { data: semanticResults, isLoading: semanticLoading } = useQuery({
    queryKey: ['/api/recommendations/semantic-search', title, overview],
    queryFn: async () => {
      const query = `${title} ${overview}`;
      const response = await fetch(`/api/recommendations/semantic-search?query=${encodeURIComponent(query)}&limit=12`);
      if (!response.ok) throw new Error('Failed to fetch semantic similar content');
      return response.json() as Promise<SemanticSearchResponse>;
    },
    enabled: !!title,
  });

  // Filter out current item and map results
  const filteredResults = semanticResults?.results?.filter((r) => r.tmdbId !== currentTmdbId) || [];

  // Fetch TMDB details for all similar items
  const similarItemIds = filteredResults.map((r) => r.tmdbId);
  
  const { data: itemDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['/api/tmdb/details', mediaType, similarItemIds],
    queryFn: async () => {
      const promises = similarItemIds.map(async (id: number) => {
        try {
          const response = await fetch(`/api/tmdb/${mediaType}/${id}`);
          if (!response.ok) return null;
          return response.json();
        } catch {
          return null;
        }
      });
      const results = await Promise.all(promises);
      return results.filter(Boolean);
    },
    enabled: similarItemIds.length > 0,
  });

  if (semanticLoading || detailsLoading) {
    return (
      <div className="space-y-4" data-testid="similar-content-section">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              AI-Recommended Similar {mediaType === 'movie' ? 'Movies' : 'Shows'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Content with similar themes and storylines using TensorFlow.js
            </p>
          </div>
        </div>
        <ScrollArea className="w-full">
          <div className="flex gap-4 pb-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0">
                <MovieCardSkeleton />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    );
  }

  if (!itemDetails || itemDetails.length === 0) {
    return (
      <div className="space-y-4" data-testid="similar-content-section">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              AI-Recommended Similar {mediaType === 'movie' ? 'Movies' : 'Shows'}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Content with similar themes and storylines using TensorFlow.js
            </p>
          </div>
        </div>
        <div className="text-center py-12 bg-muted/30 rounded-lg" data-testid="empty-similar-content">
          <Sparkles className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold mb-2">No Semantic Matches Found</h3>
          <p className="text-muted-foreground">
            Try browsing other {mediaType === 'movie' ? 'movies' : 'shows'} or check back later
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="similar-content-section">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            AI-Recommended Similar {mediaType === 'movie' ? 'Movies' : 'Shows'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Content with similar themes and storylines using TensorFlow.js
          </p>
        </div>
        {semanticResults?.duration && (
          <Badge variant="secondary" className="text-xs">
            {semanticResults.duration}
          </Badge>
        )}
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-4 pb-4">
          {itemDetails.map((item: any) => {
            const semanticResult = filteredResults.find((r) => r.tmdbId === item.id);
            const similarityPercentage = semanticResult ? Math.round(semanticResult.similarity * 100) : 0;
            
            return (
              <div 
                key={item.id} 
                className="w-[150px] sm:w-[180px] md:w-[200px] flex-shrink-0 space-y-2"
                data-testid={`similar-content-item-${item.id}`}
              >
                <MediaCard
                  item={{
                    id: item.id,
                    title: item.title,
                    name: item.name,
                    vote_average: item.vote_average,
                    poster_path: item.poster_path,
                    type: mediaType
                  }}
                  mediaType={mediaType}
                />
                {semanticResult && (
                  <div className="px-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Similarity</span>
                      <Badge variant="outline" className="text-xs">
                        {similarityPercentage}%
                      </Badge>
                    </div>
                    <Progress value={similarityPercentage} className="h-1.5" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="text-center text-sm text-muted-foreground">
        Showing {itemDetails.length} AI-recommended similar {mediaType === 'movie' ? 'movies' : 'shows'}
      </div>
    </div>
  );
}
