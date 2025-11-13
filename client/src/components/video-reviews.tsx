import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Video, ExternalLink, Play } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface VideoReviewsProps {
  title: string;
  mediaType: "movie" | "tv";
}

interface YouTubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle?: string;
  publishedAt?: string;
}

export function VideoReviews({ title, mediaType }: VideoReviewsProps) {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const { data: videoData, isLoading, error } = useQuery({
    queryKey: ['/api/external/youtube/videos', title],
    queryFn: async () => {
      const searchQuery = `${title} ${mediaType} review`;
      const response = await fetch(`/api/external/youtube/videos?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Failed to fetch video reviews');
      return response.json();
    },
    enabled: !!title,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Video Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !videoData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Video Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Unable to load video reviews at this time.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Parse YouTube video data - adjust based on actual API response
  const videos: YouTubeVideo[] = [];
  
  // Handle different possible response formats
  if (videoData.contents) {
    // Parse contents array for video items
    videoData.contents.forEach((item: any) => {
      if (item.video) {
        videos.push({
          videoId: item.video.videoId,
          title: item.video.title,
          thumbnail: item.video.thumbnails?.[0]?.url || '',
          channelTitle: item.video.author?.title,
          publishedAt: item.video.publishedTimeText,
        });
      }
    });
  } else if (videoData.results) {
    // Alternative format
    videoData.results.forEach((item: any) => {
      if (item.type === 'video' && item.videoId) {
        videos.push({
          videoId: item.videoId,
          title: item.title,
          thumbnail: item.thumbnail?.url || '',
          channelTitle: item.channelName,
          publishedAt: item.publishedTime,
        });
      }
    });
  }

  // Limit to top 4 videos
  const displayVideos = videos.slice(0, 4);

  if (displayVideos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Video Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No video reviews available for this {mediaType}.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Video Reviews
          <Badge variant="secondary" className="ml-auto">
            {displayVideos.length} videos
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayVideos.map((video) => (
            <div
              key={video.videoId}
              className="group relative cursor-pointer rounded-lg overflow-hidden border border-border hover:border-primary transition-colors"
              data-testid={`video-review-${video.videoId}`}
            >
              {selectedVideo === video.videoId ? (
                <div className="aspect-video">
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1`}
                    title={video.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div
                  className="relative aspect-video bg-gray-100 dark:bg-gray-800"
                  onClick={() => setSelectedVideo(video.videoId)}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                    <div className="bg-red-600 rounded-full p-3 group-hover:scale-110 transition-transform">
                      <Play className="h-6 w-6 text-white fill-white" />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="p-3 bg-card">
                <h4 className="font-medium text-sm line-clamp-2 mb-1">
                  {video.title}
                </h4>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {video.channelTitle && (
                    <span className="truncate">{video.channelTitle}</span>
                  )}
                  <a
                    href={`https://www.youtube.com/watch?v=${video.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 hover:text-primary"
                    data-testid={`link-youtube-${video.videoId}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Watch
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
