import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MovieCardSkeleton() {
  return (
    <Card className="group cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-lg overflow-hidden">
      <CardContent className="p-0">
        {/* Poster skeleton */}
        <div className="relative aspect-[2/3] overflow-hidden">
          <Skeleton className="w-full h-full" />
          
          {/* Heart icon skeleton */}
          <div className="absolute top-2 right-2">
            <Skeleton className="w-8 h-8 rounded-full" />
          </div>
          
          {/* Rating badge skeleton */}
          <div className="absolute top-2 left-2">
            <Skeleton className="w-12 h-6 rounded-full" />
          </div>
        </div>
        
        {/* Content skeleton */}
        <div className="p-4 space-y-2">
          {/* Title skeleton */}
          <Skeleton className="h-5 w-full" />
          
          {/* Year and genre skeleton */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-12" />
            <span className="text-muted-foreground">•</span>
            <Skeleton className="h-4 w-16" />
          </div>
          
          {/* Rating stars skeleton */}
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="w-4 h-4 rounded-sm" />
            ))}
          </div>
          
          {/* Synopsis skeleton */}
          <div className="space-y-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}