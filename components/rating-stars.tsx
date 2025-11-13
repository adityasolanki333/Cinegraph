import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
  showValue?: boolean;
}

export function RatingStars({ 
  rating, 
  onRatingChange, 
  readonly = false, 
  size = "md",
  showValue = true 
}: RatingStarsProps) {
  const [hoveredRating, setHoveredRating] = useState(0);
  
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-5 w-5", 
    lg: "h-6 w-6"
  };

  const handleStarClick = (starRating: number) => {
    if (!readonly && onRatingChange) {
      onRatingChange(starRating);
    }
  };

  const handleStarHover = (starRating: number) => {
    if (!readonly) {
      setHoveredRating(starRating);
    }
  };

  const handleStarLeave = () => {
    if (!readonly) {
      setHoveredRating(0);
    }
  };

  const displayRating = hoveredRating || rating;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => (
          <Star
            key={star}
            data-testid={`star-${star}`}
            className={cn(
              sizeClasses[size],
              "transition-colors duration-150",
              star <= displayRating 
                ? "fill-yellow-400 text-yellow-400" 
                : "fill-transparent text-gray-300 dark:text-gray-600",
              !readonly && "cursor-pointer hover:text-yellow-400"
            )}
            onClick={() => handleStarClick(star)}
            onMouseEnter={() => handleStarHover(star)}
            onMouseLeave={handleStarLeave}
          />
        ))}
      </div>
      {showValue && (
        <span className="text-sm text-gray-600 dark:text-gray-400 ml-1">
          {rating > 0 ? `${rating}/10` : "No rating"}
        </span>
      )}
    </div>
  );
}