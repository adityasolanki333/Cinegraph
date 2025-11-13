import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { tmdbService } from "@/lib/tmdb";
import { Search, X, Film, Tv, User, Building } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CollectionResult {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
}

interface SearchResult {
  id: string;
  title: string;
  type: 'movie' | 'tv' | 'person' | 'company';
  year?: number;
  overview?: string;
  poster_path?: string;
  profile_path?: string;
  logo_path?: string;
  vote_average?: number;
  known_for_department?: string;
  origin_country?: string;
}

export default function SearchModal({ open, onOpenChange }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'tv' | 'people' | 'companies' | 'collections'>('all');
  const [, setLocation] = useLocation();

  // Multi-search query
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['/api/tmdb/search/multi', query],
    queryFn: async () => {
      if (!query.trim()) return { results: [] };
      
      const results = await tmdbService.searchMulti(query);
      return results;
    },
    enabled: query.length >= 2
  });

  // Separate searches for specific types
  const { data: movieResults } = useQuery({
    queryKey: ['/api/tmdb/search/movies', query],
    queryFn: () => tmdbService.searchMovies(query),
    enabled: query.length >= 2 && activeTab === 'movies'
  });

  const { data: tvResults } = useQuery({
    queryKey: ['/api/tmdb/search/tv', query],
    queryFn: () => tmdbService.searchTVShows(query),
    enabled: query.length >= 2 && activeTab === 'tv'
  });

  const { data: personResults } = useQuery({
    queryKey: ['/api/tmdb/search/people', query],
    queryFn: () => tmdbService.searchPeople(query),
    enabled: query.length >= 2 && activeTab === 'people'
  });

  const { data: companyResults } = useQuery({
    queryKey: ['/api/tmdb/search/companies', query],
    queryFn: () => tmdbService.searchCompanies(query),
    enabled: query.length >= 2 && activeTab === 'companies'
  });

  const { data: collectionResults } = useQuery({
    queryKey: ['/api/tmdb/search/collections', query],
    queryFn: () => tmdbService.searchCollections(query),
    enabled: query.length >= 2 && activeTab === 'collections'
  });

  const sortByRelevance = (results: any[], searchQuery: string) => {
    if (!results || results.length === 0) return [];
    
    const query = searchQuery.toLowerCase().trim();
    
    return [...results].sort((a, b) => {
      const titleA = (a.title || a.name || '').toLowerCase();
      const titleB = (b.title || b.name || '').toLowerCase();
      
      const exactMatchA = titleA === query;
      const exactMatchB = titleB === query;
      if (exactMatchA && !exactMatchB) return -1;
      if (!exactMatchA && exactMatchB) return 1;
      
      const startsWithA = titleA.startsWith(query);
      const startsWithB = titleB.startsWith(query);
      if (startsWithA && !startsWithB) return -1;
      if (!startsWithA && startsWithB) return 1;
      
      const containsWordA = titleA.includes(` ${query}`) || titleA.startsWith(`${query} `);
      const containsWordB = titleB.includes(` ${query}`) || titleB.startsWith(`${query} `);
      if (containsWordA && !containsWordB) return -1;
      if (!containsWordA && containsWordB) return 1;
      
      const containsA = titleA.includes(query);
      const containsB = titleB.includes(query);
      if (containsA && !containsB) return -1;
      if (!containsA && containsB) return 1;
      
      const popularityA = a.popularity || 0;
      const popularityB = b.popularity || 0;
      return popularityB - popularityA;
    });
  };

  const getResults = () => {
    if (query.length < 2) return [];

    let results: any[] = [];
    switch (activeTab) {
      case 'movies':
        results = movieResults?.results || [];
        break;
      case 'tv':
        results = tvResults?.results || [];
        break;
      case 'people':
        results = personResults?.results || [];
        break;
      case 'companies':
        results = companyResults?.results || [];
        break;
      case 'collections':
        results = collectionResults?.results || [];
        break;
      default:
        results = searchResults?.results || [];
    }
    
    return sortByRelevance(results, query);
  };

  const handleResultClick = (result: any) => {
    onOpenChange(false);
    setQuery("");
    
    if (result.media_type === 'movie' || result.title) {
      setLocation(`/movie/${result.id}`);
    } else if (result.media_type === 'tv' || result.name) {
      setLocation(`/tv/${result.id}`);
    } else if (result.media_type === 'person' || result.known_for_department) {
      setLocation(`/person/${result.id}`);
    } else if (result.backdrop_path !== undefined || activeTab === 'collections') {
      setLocation(`/collection/${result.id}`);
    }
  };

  const getResultIcon = (result: any) => {
    if (result.media_type === 'movie' || result.title) return Film;
    if (result.media_type === 'tv' || result.first_air_date) return Tv;
    if (result.media_type === 'person' || result.known_for_department) return User;
    if (result.logo_path) return Building;
    return Film;
  };

  const getImageUrl = (result: any) => {
    if (result.poster_path) return tmdbService.getImageUrl(result.poster_path, 'poster');
    if (result.profile_path) return tmdbService.getImageUrl(result.profile_path, 'poster');
    if (result.logo_path) return tmdbService.getImageUrl(result.logo_path, 'poster');
    return null;
  };

  const tabs = [
    { id: 'all', label: 'All', count: searchResults?.results?.length || 0 },
    { id: 'movies', label: 'Movies', count: movieResults?.results?.length || 0 },
    { id: 'tv', label: 'TV Shows', count: tvResults?.results?.length || 0 },
    { id: 'collections', label: 'Franchises', count: collectionResults?.results?.length || 0 },
    { id: 'people', label: 'People', count: personResults?.results?.length || 0 },
    { id: 'companies', label: 'Companies', count: companyResults?.results?.length || 0 },
  ];

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveTab('all');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Search Movies, TV Shows & More</span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for movies, TV shows, franchises (e.g., 'Thor')..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-10"
              autoFocus
            />
            {query && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-2 top-2 h-6 w-6 p-0"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {query.length >= 2 && (
          <>
            {/* Tabs */}
            <div className="flex space-x-1 px-6 border-b">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "ghost"}
                  size="sm"
                  className="rounded-b-none"
                  onClick={() => setActiveTab(tab.id as any)}
                  disabled={tab.count === 0 && query.length >= 2}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {tab.count}
                    </Badge>
                  )}
                </Button>
              ))}
            </div>

            {/* Results */}
            <ScrollArea className="flex-1 px-6 pb-6">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    <div className="flex items-center space-x-2">
                      <Search className="h-4 w-4 animate-pulse" />
                      <span>Searching...</span>
                    </div>
                  </div>
                ) : getResults().length > 0 ? (
                  getResults().map((result: any, index: number) => {
                    const Icon = getResultIcon(result);
                    const imageUrl = getImageUrl(result);
                    const title = result.title || result.name;
                    const year = result.release_date ? new Date(result.release_date).getFullYear() : 
                                result.first_air_date ? new Date(result.first_air_date).getFullYear() : null;

                    return (
                      <div
                        key={`${result.id}-${index}`}
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleResultClick(result)}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={title}
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <Icon className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className="font-medium truncate">{title}</h4>
                            {year && (
                              <span className="text-sm text-muted-foreground">({year})</span>
                            )}
                          </div>
                          
                          {result.overview && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                              {result.overview}
                            </p>
                          )}
                          
                          {result.known_for_department && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {result.known_for_department}
                            </p>
                          )}
                          
                          <div className="flex items-center space-x-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {result.media_type === 'movie' || result.title ? 'Movie' :
                               result.media_type === 'tv' || result.first_air_date ? 'TV Show' :
                               result.media_type === 'person' || result.known_for_department ? 'Person' :
                               activeTab === 'collections' || (result.backdrop_path !== undefined && !result.overview) ? 'Collection' :
                               'Company'}
                            </Badge>
                            
                            {result.vote_average && result.vote_average > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                ⭐ {result.vote_average.toFixed(1)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center space-y-2">
                      <Search className="h-8 w-8" />
                      <p>No results found for "{query}"</p>
                      <p className="text-sm">Try searching for movies, TV shows, franchises, people, or companies</p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        {query.length < 2 && (
          <div className="px-6 pb-6">
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-4" />
              <p>Start typing to search...</p>
              <p className="text-sm mt-2">Search movies, TV shows, franchises (like Thor, Marvel), people, and companies</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}