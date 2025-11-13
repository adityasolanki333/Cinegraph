import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tv, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface WatchProvidersProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
}

interface Provider {
  logo_path: string;
  provider_id: number;
  provider_name: string;
  display_priority: number;
}

interface CountryProviders {
  link: string;
  flatrate?: Provider[];
  buy?: Provider[];
  rent?: Provider[];
}

export function WatchProviders({ tmdbId, mediaType }: WatchProvidersProps) {
  const { data: providersData, isLoading, error } = useQuery({
    queryKey: ['/api/tmdb', mediaType, tmdbId, 'watch/providers'],
    queryFn: async () => {
      const response = await fetch(`/api/tmdb/${mediaType}/${tmdbId}/watch/providers`);
      if (!response.ok) throw new Error('Failed to fetch watch providers');
      return response.json();
    },
    enabled: !!tmdbId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" />
            Where to Watch
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !providersData || !providersData.results) {
    return null;
  }

  const usProviders: CountryProviders | undefined = providersData.results.US;
  
  if (!usProviders || (!usProviders.flatrate && !usProviders.buy && !usProviders.rent)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tv className="h-5 w-5" />
          Where to Watch
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {usProviders.flatrate && usProviders.flatrate.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-sm">Streaming</h4>
            <div className="flex flex-wrap gap-3">
              {usProviders.flatrate.map((provider) => (
                <div 
                  key={provider.provider_id} 
                  className="flex flex-col items-center gap-1 group cursor-pointer"
                  title={provider.provider_name}
                  data-testid={`provider-stream-${provider.provider_id}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-colors">
                    <img
                      src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                      alt={provider.provider_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs text-center max-w-[60px] truncate">
                    {provider.provider_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {usProviders.buy && usProviders.buy.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-sm">Buy</h4>
            <div className="flex flex-wrap gap-3">
              {usProviders.buy.slice(0, 6).map((provider) => (
                <div 
                  key={provider.provider_id} 
                  className="flex flex-col items-center gap-1 group cursor-pointer"
                  title={provider.provider_name}
                  data-testid={`provider-buy-${provider.provider_id}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-colors">
                    <img
                      src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                      alt={provider.provider_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs text-center max-w-[60px] truncate">
                    {provider.provider_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {usProviders.rent && usProviders.rent.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-sm">Rent</h4>
            <div className="flex flex-wrap gap-3">
              {usProviders.rent.slice(0, 6).map((provider) => (
                <div 
                  key={provider.provider_id} 
                  className="flex flex-col items-center gap-1 group cursor-pointer"
                  title={provider.provider_name}
                  data-testid={`provider-rent-${provider.provider_id}`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-colors">
                    <img
                      src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                      alt={provider.provider_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className="text-xs text-center max-w-[60px] truncate">
                    {provider.provider_name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {usProviders.link && (
          <div className="pt-2 border-t">
            <a 
              href={usProviders.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
              data-testid="link-justwatch"
            >
              <ExternalLink className="h-3 w-3" />
              More options on JustWatch
            </a>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2">
          Availability data provided by JustWatch (US region)
        </p>
      </CardContent>
    </Card>
  );
}
