import { useState } from "react";
import { Star, Calendar, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface MediaTooltipProps {
  item: {
    id: string;
    title?: string;
    name?: string;
    year: string;
    genre?: string;
    rating: number;
    synopsis?: string;
    director?: string;
    cast?: string[];
    duration?: number;
    seasons?: number;
    vote_count?: number;
    popularity?: number;
    genres?: Array<{ id: number; name: string }>;
    first_air_date?: string;
    release_date?: string;
  };
  mediaType: "movie" | "tv";
  children: React.ReactNode;
}

export function MediaTooltip({ item, mediaType, children }: MediaTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  const title = item.title || item.name || 'Unknown';
  const releaseDate = item.first_air_date || item.release_date || item.year;
  const genres = item.genres?.slice(0, 3) || (item.genre ? [{ name: item.genre }] : []);
  const truncatedSynopsis = item.synopsis && item.synopsis.length > 200 
    ? `${item.synopsis.substring(0, 200)}...` 
    : item.synopsis;

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      {isVisible && (
        <>
          {/* Portal-like positioning using fixed positioning */}
          <div 
            className="fixed z-50 pointer-events-none"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
          >
            <Card className="w-80 bg-background/95 backdrop-blur-sm border shadow-xl">
              <CardContent className="p-4 space-y-3">
                {/* Title and Year */}
                <div>
                  <h3 className="font-semibold text-lg leading-tight mb-1">{title}</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{releaseDate}</span>
                    {mediaType === "tv" && item.seasons && (
                      <>
                        <span>•</span>
                        <span>{item.seasons} season{item.seasons !== 1 ? 's' : ''}</span>
                      </>
                    )}
                    {mediaType === "movie" && item.duration && (
                      <>
                        <span>•</span>
                        <Clock className="h-4 w-4" />
                        <span>{item.duration}min</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Rating and Popularity */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{item.rating.toFixed(1)}</span>
                    {item.vote_count && (
                      <span className="text-xs text-muted-foreground">
                        ({item.vote_count.toLocaleString()} votes)
                      </span>
                    )}
                  </div>
                  {item.popularity && (
                    <div className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {Math.round(item.popularity)} popularity
                      </span>
                    </div>
                  )}
                </div>

                {/* Genres */}
                {genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {genres.map((genre, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {typeof genre === 'string' ? genre : genre.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Director/Creator */}
                {item.director && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">
                      {mediaType === "movie" ? "Director: " : "Creator: "}
                    </span>
                    <span className="font-medium">{item.director}</span>
                  </div>
                )}

                {/* Cast */}
                {item.cast && item.cast.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Cast: </span>
                    <span>{item.cast.slice(0, 3).join(", ")}</span>
                    {item.cast.length > 3 && (
                      <span className="text-muted-foreground"> and {item.cast.length - 3} more</span>
                    )}
                  </div>
                )}

                {/* Synopsis */}
                {truncatedSynopsis && (
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    {truncatedSynopsis}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}