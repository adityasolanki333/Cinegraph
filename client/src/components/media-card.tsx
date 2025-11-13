import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Plus, Check, Heart, Play, LogIn } from "lucide-react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useToast } from "@/hooks/use-toast";

export interface MediaItem {
  id: number | string;
  title?: string;
  name?: string;
  rating?: number;
  vote_average?: number;
  year?: string;
  first_air_date?: string;
  last_air_date?: string;
  release_date?: string;
  genre?: string;
  genres?: Array<{ id: number; name: string }>;
  duration?: number;
  number_of_seasons?: number;
  synopsis?: string;
  overview?: string;
  poster_path?: string;
  posterUrl?: string;
  type?: 'movie' | 'tv';
  media_type?: 'movie' | 'tv';
}

interface MediaCardProps {
  item: MediaItem;
  mediaType?: 'movie' | 'tv';
  isInWatchlist?: boolean;
  onAddToWatchlist?: (itemId: string) => void;
  onRemoveFromWatchlist?: (itemId: string) => void;
  onRate?: (itemId: string, rating: number) => void;
  userRating?: number;
  showRemoveButton?: boolean;
}

export default function MediaCard({
  item,
  mediaType,
  isInWatchlist: propIsInWatchlist,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onRate,
  userRating,
  showRemoveButton = false,
}: MediaCardProps) {
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const { addToWatchlist, removeFromWatchlist, isInWatchlist: hookIsInWatchlist } = useWatchlist();
  const { toast } = useToast();

  // Determine media type
  const type = mediaType || item.type || item.media_type || (item.name ? 'tv' : 'movie');
  
  // Get display values
  const title = item.title || item.name || 'Untitled';
  const rating = item.rating || item.vote_average || 0;
  
  // For TV shows, prefer last air date, otherwise first air date
  let year = item.year || '';
  if (!year) {
    if (type === 'tv') {
      if (item.last_air_date) {
        year = new Date(item.last_air_date).getFullYear().toString();
      } else if (item.first_air_date) {
        year = new Date(item.first_air_date).getFullYear().toString();
      }
    } else if (item.release_date) {
      year = new Date(item.release_date).getFullYear().toString();
    }
  }
  
  const synopsis = item.synopsis || item.overview || '';
  const posterUrl = item.posterUrl || 
    (item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null);
  
  // Get genre display
  const genreDisplay = item.genre || 
    (item.genres && item.genres.length > 0 ? item.genres[0].name : '');

  // Use the hook's watchlist state if no prop is provided
  const currentlyInWatchlist = hookIsInWatchlist(item.id.toString());
  const isInWatchlist = propIsInWatchlist ?? currentlyInWatchlist;
  


  // Convert MediaItem to Movie format for watchlist
  const movieForWatchlist = {
    id: item.id.toString(),
    title: title,
    year: parseInt(year) || new Date().getFullYear(),
    genre: genreDisplay || 'Unknown',
    rating: rating,
    synopsis: synopsis,
    posterUrl: posterUrl,
    director: null,
    cast: null,
    duration: item.duration || null,
    type: type,
    seasons: item.number_of_seasons || null
  } as const;

  const handleWatchlistToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isAuthenticated) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to add items to your watchlist.",
        variant: "destructive",
      });
      setTimeout(() => setLocation('/login'), 500);
      return;
    }

    if (isInWatchlist) {
      // Remove from watchlist
      if (onRemoveFromWatchlist) {
        onRemoveFromWatchlist(item.id.toString());
      } else {
        removeFromWatchlist(item.id.toString());
        toast({
          title: "Removed from watchlist",
          description: `${title} has been removed from your watchlist.`,
        });
      }
    } else {
      // Add to watchlist
      if (onAddToWatchlist) {
        onAddToWatchlist(item.id.toString());
      } else {
        addToWatchlist(movieForWatchlist);
        toast({
          title: "Added to watchlist",
          description: `${title} has been added to your watchlist.`,
        });
      }
    }
  };

  const handleRating = (rating: number) => {
    if (onRate) {
      onRate(item.id.toString(), rating);
    }
  };

  const renderStars = (rating: number, interactive = false) => {
    return Array.from({ length: 5 }, (_, i) => {
      const starValue = i + 1;
      const isFilled = starValue <= rating;
      
      return (
        <Star
          key={i}
          className={cn(
            "h-3 w-3 sm:h-4 sm:w-4 transition-colors",
            isFilled ? "fill-rating text-rating" : "text-muted-foreground",
            interactive && "cursor-pointer hover:text-rating"
          )}
          onMouseEnter={() => interactive && setHoveredRating(starValue)}
          onMouseLeave={() => interactive && setHoveredRating(0)}
          onClick={() => interactive && handleRating(starValue)}
        />
      );
    });
  };

  const linkPath = type === 'tv' ? `/tv/${item.id}` : `/movie/${item.id}`;
  

  return (
    <Link href={linkPath}>
      <Card 
        className="media-card group overflow-hidden border-border bg-card cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative aspect-[2/3] overflow-hidden">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt={title}
              className="w-full h-full object-cover transition-all duration-500 ease-out group-hover:scale-110 group-hover:brightness-75"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-xs sm:text-sm font-medium text-center p-2 sm:p-4 text-muted-foreground">
                {title}
              </span>
            </div>
          )}
          
          {/* Overlay with actions */}
          {isHovered && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="flex space-x-1 sm:space-x-2">
                <Button size="sm" variant="secondary" className="bg-white/20 hover:bg-white/30 text-xs sm:text-sm px-2 sm:px-3 h-7 sm:h-9">
                  <Play className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                  <span className="hidden sm:inline">{type === 'tv' ? 'Watch' : 'Play'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleWatchlistToggle}
                  className="bg-white/20 hover:bg-white/30 px-2 sm:px-3 h-7 sm:h-9"
                >
                  {isInWatchlist ? (
                    <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                  ) : (
                    <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Type badge */}
          <Badge variant="secondary" className="absolute top-1 left-1 sm:top-2 sm:left-2 text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5">
            {type === 'tv' 
              ? (item.number_of_seasons 
                  ? `${item.number_of_seasons} Season${item.number_of_seasons !== 1 ? 's' : ''}` 
                  : 'TV Show')
              : 'Movie'
            }
          </Badge>

          {/* Remove button for watchlist */}
          {showRemoveButton && (
            <Button
              size="sm"
              variant="destructive"
              className="absolute top-2 right-2 h-8 w-8 p-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemoveFromWatchlist?.(item.id.toString());
              }}
            >
              ×
            </Button>
          )}
        </div>

        <CardContent className="p-2 sm:p-3 md:p-4">
          <h3 className="font-semibold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 min-h-[2.8rem] sm:min-h-[2.5rem]">
            {title}
          </h3>
          
          {/* Rating */}
          <div className="flex items-center justify-between mt-1 sm:mt-2">
            <div className="flex items-center space-x-0.5 sm:space-x-1">
              {renderStars(Math.round(rating / 2))}
              <span className="text-[10px] sm:text-sm text-muted-foreground ml-0.5 sm:ml-1">
                {rating.toFixed(1)}
              </span>
            </div>
          </div>

          {/* User rating */}
          {onRate && (
            <div className="flex items-center space-x-1 mt-1 sm:mt-2">
              <span className="text-[10px] sm:text-xs text-muted-foreground">Your rating:</span>
              <div className="flex items-center space-x-0.5 sm:space-x-1">
                {renderStars(hoveredRating || userRating || 0, true)}
              </div>
            </div>
          )}

          {/* Media info */}
          <div className="flex items-center gap-1 mt-1 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground">
            <span className="flex-1 min-w-0 truncate">
              {year}{genreDisplay ? ` • ${genreDisplay}` : ''}
            </span>
            {item.duration && (
              <span className="flex-shrink-0">{item.duration}min</span>
            )}
          </div>

          {/* Synopsis */}
          {synopsis && (
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 sm:mt-2 line-clamp-2">
              {synopsis}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}