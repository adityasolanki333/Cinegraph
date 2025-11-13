import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Clock, 
  TrendingUp, 
  Zap, 
  Eye,
  Sparkles 
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

interface ViewingHistoryItem {
  id: string;
  userId: string;
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath?: string;
  watchedAt: string;
  watchDuration?: number;
}

interface PatternAnalysis {
  bingeWatcher: boolean;
  preferredGenres: number[];
  avgRating: number;
  predictedNextGenre: number;
}

export function ContinueWatching() {
  const { user } = useAuth();

  // Fetch viewing history
  const { data: viewingHistory, isLoading: historyLoading } = useQuery<ViewingHistoryItem[]>({
    queryKey: ['/api/users', user?.id, 'watched'],
    enabled: !!user?.id,
  });

  // Fetch pattern analysis  
  const { data: patternData, isLoading: patternLoading } = useQuery<{
    userId: string;
    analysis: PatternAnalysis;
  }>({
    queryKey: ['/api/recommendations/pattern/analyze', user?.id],
    enabled: !!user?.id,
  });

  const recentItems = viewingHistory?.slice(0, 6) || [];
  const analysis = patternData?.analysis;
  
  // Determine session type and binge score
  const sessionType = analysis?.bingeWatcher ? 'binge' : 'casual';
  const bingeScore = analysis?.bingeWatcher ? 0.8 : 0.3;

  if (!user) {
    return null;
  }

  if (historyLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!recentItems.length) {
    return null;
  }

  const getSessionIcon = (sessionType: string) => {
    switch (sessionType) {
      case 'binge':
        return <Zap className="h-4 w-4" />;
      case 'explorer':
        return <Sparkles className="h-4 w-4" />;
      default:
        return <Eye className="h-4 w-4" />;
    }
  };

  const getSessionColor = (sessionType: string) => {
    switch (sessionType) {
      case 'binge':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'explorer':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default:
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getSessionLabel = (sessionType: string) => {
    switch (sessionType) {
      case 'binge':
        return 'Binge Watcher';
      case 'explorer':
        return 'Explorer';
      default:
        return 'Casual Viewer';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with Session Insights */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Play className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Continue Watching</h2>
        </div>

        {analysis && (
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={getSessionColor(sessionType)}
              data-testid="badge-session-type"
            >
              {getSessionIcon(sessionType)}
              <span className="ml-1">{getSessionLabel(sessionType)}</span>
            </Badge>
            
            {analysis.bingeWatcher && (
              <Badge variant="secondary" data-testid="badge-binge-score">
                <TrendingUp className="h-3 w-3 mr-1" />
                Binge Score: {Math.round(bingeScore * 100)}%
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Binge Detection Insight Card */}
      {analysis && analysis.bingeWatcher && bingeScore > 0.6 && (
        <Card className="bg-gradient-to-r from-red-500/10 to-orange-500/10 border-red-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-red-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-sm mb-1">🔥 You're on a binge-watching streak!</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Keep enjoying your favorite content!
                </p>
                {viewingHistory && analysis.avgRating > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Watched {viewingHistory.length} titles</span>
                    <span>•</span>
                    <span>Avg rating: {analysis.avgRating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recently Watched Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {recentItems.map((item) => (
          <Link 
            key={item.id} 
            href={`/${item.mediaType}/${item.tmdbId}`}
          >
            <Card 
              className="group overflow-hidden border-border bg-card cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              data-testid={`continue-watching-${item.tmdbId}`}
            >
              <div className="relative aspect-[2/3] overflow-hidden">
                {item.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w500${item.posterPath}`}
                    alt={item.title}
                    className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110 group-hover:brightness-75"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <span className="text-xs font-medium text-center p-4 text-muted-foreground">
                      {item.title}
                    </span>
                  </div>
                )}

                {/* Play overlay */}
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="bg-primary rounded-full p-3">
                    <Play className="h-6 w-6 text-primary-foreground fill-current" />
                  </div>
                </div>

                {/* Watch time badge */}
                {item.watchDuration && (
                  <Badge 
                    variant="secondary" 
                    className="absolute bottom-2 left-2 text-xs"
                    data-testid="badge-watch-duration"
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    {item.watchDuration}m
                  </Badge>
                )}

                {/* Recently watched badge */}
                <Badge 
                  variant="outline" 
                  className="absolute top-2 right-2 text-xs bg-black/50 border-white/20"
                >
                  {formatDistanceToNow(new Date(item.watchedAt), { addSuffix: true })}
                </Badge>
              </div>

              <CardContent className="p-2 md:p-3">
                <h3 className="font-semibold text-xs line-clamp-2 min-h-[2rem]">
                  {item.title}
                </h3>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* View All Button */}
      {viewingHistory && viewingHistory.length > 6 && (
        <div className="flex justify-center pt-2">
          <Link href="/my-list?tab=watched">
            <Button variant="outline" data-testid="button-view-all-watched">
              View All Watched ({viewingHistory.length})
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
