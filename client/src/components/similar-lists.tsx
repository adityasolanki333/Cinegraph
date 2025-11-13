import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListCard } from "@/components/list-card";
import { Layers, PercentIcon, AlertCircle } from "lucide-react";
import { Link } from "wouter";

interface SimilarListsProps {
  listId: string;
}

interface SharedItem {
  id: string;
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath?: string;
}

interface SimilarList {
  id: string;
  userId: string;
  title: string;
  description?: string;
  isPublic: boolean;
  followerCount: number;
  itemCount: number;
  createdAt: string;
  sharedItemCount: number;
  overlapPercentage: number;
  sharedItems: SharedItem[];
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
  };
  items?: Array<{
    id: string;
    posterPath?: string;
    title: string;
  }>;
}

export function SimilarLists({ listId }: SimilarListsProps) {
  const { data: similarLists, isLoading, isError, error } = useQuery<SimilarList[]>({
    queryKey: ['/api/community/lists', listId, 'similar'],
    enabled: !!listId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="similar-lists-loading">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" data-testid="similar-lists-error">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load similar lists. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  if (!similarLists || similarLists.length === 0) {
    return (
      <Card data-testid="similar-lists-empty">
        <CardContent className="py-12 text-center">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">No similar lists found</p>
          <p className="text-sm text-muted-foreground/70 mt-2">
            Lists with shared content will appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="similar-lists-grid">
      {similarLists.map((list) => (
        <div key={list.id} className="relative" data-testid={`similar-list-${list.id}`}>
          <ListCard list={list} showAuthor={true} />
          <div className="absolute top-2 left-2 flex gap-1.5 z-20 pointer-events-none">
            <Badge 
              variant="secondary" 
              className="shadow-lg bg-background/95 backdrop-blur-sm border border-border/50"
              data-testid={`badge-shared-items-${list.id}`}
            >
              <Layers className="h-3 w-3 mr-1" />
              {list.sharedItemCount} shared
            </Badge>
            <Badge 
              variant="secondary" 
              className="shadow-lg bg-background/95 backdrop-blur-sm border border-border/50"
              data-testid={`badge-overlap-percentage-${list.id}`}
            >
              <PercentIcon className="h-3 w-3 mr-1" />
              {list.overlapPercentage}%
            </Badge>
          </div>
          
          {/* Shared Items Preview */}
          {list.sharedItems && list.sharedItems.length > 0 && (
            <div className="absolute bottom-2 left-2 right-2 z-20">
              <Card className="bg-background/95 backdrop-blur-sm border border-border/50 shadow-lg">
                <CardContent className="p-2">
                  <p className="text-xs font-medium mb-1.5 text-muted-foreground">Shared Items:</p>
                  <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                    {list.sharedItems.map((item) => (
                      <Link 
                        key={item.id} 
                        href={`/${item.mediaType === 'movie' ? 'movies' : 'tv'}/${item.tmdbId}`}
                        className="pointer-events-auto"
                      >
                        <div className="relative flex-shrink-0 group" data-testid={`shared-item-${item.id}`}>
                          {item.posterPath ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${item.posterPath}`}
                              alt={item.title}
                              className="h-12 w-8 rounded object-cover transition-transform group-hover:scale-110"
                            />
                          ) : (
                            <div className="h-12 w-8 rounded bg-muted flex items-center justify-center">
                              <Layers className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                            <p className="text-[8px] text-white text-center px-0.5 line-clamp-2">{item.title}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                    {list.sharedItemCount > 5 && (
                      <div className="flex-shrink-0 h-12 w-8 rounded bg-muted/50 flex items-center justify-center">
                        <p className="text-[10px] text-muted-foreground font-medium">+{list.sharedItemCount - 5}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
