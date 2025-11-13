import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MovieDetailsSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section Skeleton */}
      <div className="relative h-[70vh] overflow-hidden">
        <Skeleton className="absolute inset-0 w-full h-full" />
        
        {/* Overlay Content */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-8">
          <div className="max-w-7xl mx-auto">
            <div className="max-w-2xl space-y-4">
              {/* Title skeleton */}
              <Skeleton className="h-12 w-3/4" />
              
              {/* Meta info skeleton */}
              <div className="flex items-center space-x-4">
                <Skeleton className="h-6 w-16" />
                <span className="text-gray-300">•</span>
                <Skeleton className="h-6 w-20" />
                <span className="text-gray-300">•</span>
                <Skeleton className="h-6 w-24" />
              </div>
              
              {/* Overview skeleton */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-4/6" />
              </div>
              
              {/* Buttons skeleton */}
              <div className="flex space-x-4 pt-4">
                <Skeleton className="h-12 w-32" />
                <Skeleton className="h-12 w-40" />
                <Skeleton className="h-12 w-12 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Section Skeleton */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Cast Section */}
            <div>
              <Skeleton className="h-8 w-32 mb-6" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }, (_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 text-center">
                      <Skeleton className="w-16 h-16 rounded-full mx-auto mb-3" />
                      <Skeleton className="h-4 w-full mb-1" />
                      <Skeleton className="h-3 w-3/4 mx-auto" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Similar Movies */}
            <div>
              <Skeleton className="h-8 w-40 mb-6" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }, (_, i) => (
                  <div key={i}>
                    <Skeleton className="aspect-[2/3] w-full mb-2" />
                    <Skeleton className="h-4 w-full mb-1" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6 space-y-4">
                <Skeleton className="h-6 w-24" />
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-14" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}