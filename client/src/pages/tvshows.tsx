import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Filter, TrendingUp, Clock, Tv, Star, Calendar,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// Types
interface TVShow {
  id: number;
  name: string;
  overview: string;
  first_air_date: string;
  vote_average: number;
  poster_path?: string;
  backdrop_path?: string;
  genre_ids?: number[];
  popularity: number;
}

interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

import MediaCard from "@/components/media-card";
import MediaCardSkeleton from "@/components/media-card-skeleton";
import { useWatchlist } from "@/hooks/useWatchlist";

// Genre emoji mapping
const genreEmojiMap: Record<string, string> = {
  "Action & Adventure": "⚔️",
  "Animation": "🎨",
  "Comedy": "😂",
  "Crime": "🔍",
  "Documentary": "🎬",
  "Drama": "🎭",
  "Family": "👨‍👩‍👧‍👦",
  "Kids": "👶",
  "Mystery": "🕵️",
  "News": "📰",
  "Reality": "📺",
  "Sci-Fi & Fantasy": "🚀",
  "Soap": "💭",
  "Talk": "🎤",
  "War & Politics": "🏛️",
  "Western": "🤠"
};

export default function TVShowsPage() {
  const [activeTab, setActiveTab] = useState("discover");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const { isInWatchlist, addToWatchlist } = useWatchlist();

  const [trendingPage, setTrendingPage] = useState(1);
  const [topRatedPage, setTopRatedPage] = useState(1);
  const [airingTodayPage, setAiringTodayPage] = useState(1);
  const [onTheAirPage, setOnTheAirPage] = useState(1);

  const [discoverPageInput, setDiscoverPageInput] = useState("1");
  const [trendingPageInput, setTrendingPageInput] = useState("1");
  const [topRatedPageInput, setTopRatedPageInput] = useState("1");
  const [airingTodayPageInput, setAiringTodayPageInput] = useState("1");
  const [onTheAirPageInput, setOnTheAirPageInput] = useState("1");

  // Fetch TV genres first
  const { data: genresData = [] } = useQuery({
    queryKey: ['/api/tmdb/genres/tv'],
    select: (data: {genres: Array<{id: number, name: string}>}) => data.genres || []
  });

  // Fetch popular TV shows for discover tab with pagination
  const { data: popularResponse, isLoading: isPopularLoading } = useQuery({
    queryKey: ['/api/tmdb/tv/popular', currentPage, selectedGenre, selectedYear, searchQuery],
    queryFn: async () => {
      const params: any = { page: currentPage };
      
      if (searchQuery) {
        // Use search API for TV shows when there's a search query
        const response = await fetch(`/api/tmdb/search/tv?query=${encodeURIComponent(searchQuery)}&page=${currentPage}`);
        if (!response.ok) throw new Error('Failed to search TV shows');
        return response.json();
      }
      
      // Use discover API for filtered results
      if (selectedGenre !== "all") {
        const genreId = genresData?.find((g: any) => g.name === selectedGenre)?.id;
        if (genreId) params.with_genres = genreId;
      }
      if (selectedYear !== "all") {
        params.first_air_date_year = selectedYear;
      }
      
      const queryString = new URLSearchParams(params).toString();
      // Always use discover API for consistent pagination support
      const endpoint = `/api/tmdb/discover/tv?${queryString}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch TV shows');
      return response.json();
    },
    enabled: activeTab === 'discover', // Only run for discover tab
  });

  const popularData = popularResponse?.results || [];
  const totalPages = popularResponse?.total_pages || 1;

  // Fetch trending TV shows with pagination
  const { data: trendingResponse, isLoading: isTrendingLoading } = useQuery({
    queryKey: ['/api/tmdb/trending', trendingPage],
    queryFn: async () => {
      const response = await fetch(`/api/tmdb/trending?page=${trendingPage}`);
      if (!response.ok) throw new Error('Failed to fetch trending');
      return response.json();
    }
  });

  const trendingData = trendingResponse?.results?.filter((item: any) => item.name || item.media_type === 'tv') || [];
  const trendingTotalPages = trendingResponse?.total_pages || 1;

  // Fetch top rated TV shows with pagination
  const { data: topRatedResponse, isLoading: isTopRatedLoading } = useQuery({
    queryKey: ['/api/tmdb/tv/top-rated', topRatedPage],
    queryFn: async () => {
      const response = await fetch(`/api/tmdb/tv/top-rated?page=${topRatedPage}`);
      if (!response.ok) throw new Error('Failed to fetch top rated');
      return response.json();
    }
  });

  const topRatedData = topRatedResponse?.results || [];
  const topRatedTotalPages = topRatedResponse?.total_pages || 1;

  // Fetch airing today TV shows with pagination
  const { data: airingTodayResponse, isLoading: isAiringTodayLoading } = useQuery({
    queryKey: ['/api/tmdb/tv/airing-today', airingTodayPage],
    queryFn: async () => {
      const response = await fetch(`/api/tmdb/tv/airing-today?page=${airingTodayPage}`);
      if (!response.ok) throw new Error('Failed to fetch airing today');
      return response.json();
    }
  });

  const airingTodayData = airingTodayResponse?.results || [];
  const airingTodayTotalPages = airingTodayResponse?.total_pages || 1;

  // Fetch on the air TV shows with pagination
  const { data: onTheAirResponse, isLoading: isOnTheAirLoading } = useQuery({
    queryKey: ['/api/tmdb/tv/on-the-air', onTheAirPage],
    queryFn: async () => {
      const response = await fetch(`/api/tmdb/tv/on-the-air?page=${onTheAirPage}`);
      if (!response.ok) throw new Error('Failed to fetch on the air');
      return response.json();
    }
  });

  const onTheAirData = onTheAirResponse?.results || [];
  const onTheAirTotalPages = onTheAirResponse?.total_pages || 1;



  // Generate years for filter (1990-2026)
  const years = Array.from({ length: 37 }, (_, i) => (2026 - i).toString());

  const handleAddToWatchlist = (showId: string) => {
    // The addToWatchlist function from useWatchlist hook will handle this
    console.log("Add to watchlist requested for show ID:", showId);
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedGenre, selectedYear]);

  // Scroll to top when pagination changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage, trendingPage, topRatedPage, airingTodayPage, onTheAirPage]);

  const renderPagination = (
    currentPage: number,
    totalPages: number,
    setPage: (page: number) => void,
    pageInput: string,
    setPageInput: (value: string) => void,
    testIdPrefix: string
  ) => {
    if (totalPages <= 1) return null;

    const handlePageJump = () => {
      const pageNum = parseInt(pageInput);
      if (pageNum >= 1 && pageNum <= totalPages) {
        setPage(pageNum);
      }
    };

    const renderPageNumbers = () => {
      const pageNumbers = [];
      
      if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) {
          pageNumbers.push(
            <Button
              key={i}
              variant={currentPage === i ? "default" : "outline"}
              size="sm"
              onClick={() => setPage(i)}
              data-testid={`${testIdPrefix}-page-${i}`}
            >
              {i}
            </Button>
          );
        }
      } else {
        if (currentPage <= 3) {
          for (let i = 1; i <= 5; i++) {
            pageNumbers.push(
              <Button
                key={i}
                variant={currentPage === i ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(i)}
                data-testid={`${testIdPrefix}-page-${i}`}
              >
                {i}
              </Button>
            );
          }
          pageNumbers.push(<span key="ellipsis" className="px-2">...</span>);
        } else if (currentPage >= totalPages - 2) {
          pageNumbers.push(<span key="ellipsis" className="px-2">...</span>);
          for (let i = totalPages - 4; i <= totalPages; i++) {
            pageNumbers.push(
              <Button
                key={i}
                variant={currentPage === i ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(i)}
                data-testid={`${testIdPrefix}-page-${i}`}
              >
                {i}
              </Button>
            );
          }
        } else {
          pageNumbers.push(<span key="ellipsis1" className="px-2">...</span>);
          for (let i = currentPage - 1; i <= currentPage + 1; i++) {
            pageNumbers.push(
              <Button
                key={i}
                variant={currentPage === i ? "default" : "outline"}
                size="sm"
                onClick={() => setPage(i)}
                data-testid={`${testIdPrefix}-page-${i}`}
              >
                {i}
              </Button>
            );
          }
          pageNumbers.push(<span key="ellipsis2" className="px-2">...</span>);
        }
      }
      
      return pageNumbers;
    };

    return (
      <div className="flex flex-col items-center justify-center gap-3 mt-8">
        {/* Page info - always visible */}
        <div className="text-sm text-muted-foreground font-medium">
          Page {currentPage} of {totalPages}
        </div>

        {/* Main pagination controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            data-testid={`${testIdPrefix}-first`}
            className="hidden sm:flex"
          >
            First
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            data-testid={`${testIdPrefix}-prev`}
          >
            Previous
          </Button>
          
          {/* Show page numbers on all devices */}
          <div className="flex items-center gap-1 sm:gap-2">
            {renderPageNumbers()}
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            data-testid={`${testIdPrefix}-next`}
          >
            Next
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(totalPages)}
            disabled={currentPage === totalPages}
            data-testid={`${testIdPrefix}-last`}
            className="hidden sm:flex"
          >
            Last
          </Button>
        </div>
        
        {/* Jump to page */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Jump to page:</span>
          <Input
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            className="w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            data-testid={`${testIdPrefix}-input`}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handlePageJump}
            data-testid={`${testIdPrefix}-go`}
          >
            Go
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">TV Shows & Series Discovery</h1>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 gap-0.5 sm:gap-1">
            <TabsTrigger value="discover" data-testid="tab-discover" className="text-xs sm:text-sm px-1 sm:px-3">
              <Filter className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline sm:ml-2">Discover</span>
            </TabsTrigger>
            <TabsTrigger value="trending" data-testid="tab-trending" className="text-xs sm:text-sm px-1 sm:px-3">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline sm:ml-2">Trending</span>
            </TabsTrigger>
            <TabsTrigger value="top-rated" data-testid="tab-top-rated" className="text-xs sm:text-sm px-1 sm:px-3">
              <Star className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline sm:ml-2">Top Rated</span>
            </TabsTrigger>
            <TabsTrigger value="airing-today" data-testid="tab-airing-today" className="text-xs sm:text-sm px-1 sm:px-3">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline sm:ml-2">Airing Today</span>
            </TabsTrigger>
            <TabsTrigger value="on-the-air" data-testid="tab-on-the-air" className="text-xs sm:text-sm px-1 sm:px-3">
              <Tv className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline sm:ml-2">On The Air</span>
            </TabsTrigger>
          </TabsList>

          {/* Discover Tab */}
          <TabsContent value="discover" className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <Filter className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search TV shows..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => {
                    const query = e.target.value;
                    setSearchQuery(query);
                  }}
                  data-testid="input-discover-search"
                />
              </div>
              
              <div className="flex gap-3 sm:gap-4">
                <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="🎭 All Genres" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">🎭 All Genres</SelectItem>
                    {genresData.map((genre: any) => (
                      <SelectItem key={genre.id} value={genre.name}>
                        {genreEmojiMap[genre.name] || "📺"} {genre.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="📅 All Years" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📅 All Years</SelectItem>
                    {years.map((year) => (
                      <SelectItem key={year} value={year}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isPopularLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {Array.from({ length: 10 }, (_, i) => (
                  <MediaCardSkeleton key={i} />
                ))}
              </div>
            ) : popularData.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  {searchQuery ? `No TV shows found for "${searchQuery}"` : "No TV shows found"}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {popularData.map((show: TVShow) => (
                    <MediaCard
                      key={show.id}
                      item={show}
                      mediaType="tv"
                    />
                  ))}
                </div>
                
                {renderPagination(
                  currentPage,
                  totalPages,
                  setCurrentPage,
                  discoverPageInput,
                  setDiscoverPageInput,
                  'discover'
                )}
              </>
            )}
          </TabsContent>

          {/* Trending Tab */}
          <TabsContent value="trending" className="space-y-6">
            {isTrendingLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {Array.from({ length: 20 }, (_, i) => (
                  <MediaCardSkeleton key={i} />
                ))}
              </div>
            ) : trendingData && trendingData.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {trendingData.map((show: TVShow) => (
                    <MediaCard
                      key={show.id}
                      item={show}
                      mediaType="tv"
                      onAddToWatchlist={handleAddToWatchlist}
                      isInWatchlist={isInWatchlist(show.id.toString())}
                    />
                  ))}
                </div>
                
                {renderPagination(
                  trendingPage,
                  trendingTotalPages,
                  setTrendingPage,
                  trendingPageInput,
                  setTrendingPageInput,
                  'trending'
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No trending data available</p>
              </div>
            )}
          </TabsContent>

          {/* Top Rated Tab */}
          <TabsContent value="top-rated" className="space-y-6">
            {isTopRatedLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {Array.from({ length: 20 }, (_, i) => (
                  <MediaCardSkeleton key={i} />
                ))}
              </div>
            ) : topRatedData && topRatedData.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {topRatedData.map((show: TVShow) => (
                    <MediaCard
                      key={show.id}
                      item={show}
                      mediaType="tv"
                      onAddToWatchlist={handleAddToWatchlist}
                      isInWatchlist={isInWatchlist(show.id.toString())}
                    />
                  ))}
                </div>
                
                {renderPagination(
                  topRatedPage,
                  topRatedTotalPages,
                  setTopRatedPage,
                  topRatedPageInput,
                  setTopRatedPageInput,
                  'top-rated'
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No top rated shows available</p>
              </div>
            )}
          </TabsContent>

          {/* Airing Today Tab */}
          <TabsContent value="airing-today" className="space-y-6">
            {isAiringTodayLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {Array.from({ length: 20 }, (_, i) => (
                  <MediaCardSkeleton key={i} />
                ))}
              </div>
            ) : airingTodayData && airingTodayData.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {airingTodayData.map((show: TVShow) => (
                    <MediaCard
                      key={show.id}
                      item={show}
                      mediaType="tv"
                      onAddToWatchlist={handleAddToWatchlist}
                      isInWatchlist={isInWatchlist(show.id.toString())}
                    />
                  ))}
                </div>
                
                {renderPagination(
                  airingTodayPage,
                  airingTodayTotalPages,
                  setAiringTodayPage,
                  airingTodayPageInput,
                  setAiringTodayPageInput,
                  'airing-today'
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No shows airing today</p>
              </div>
            )}
          </TabsContent>

          {/* On The Air Tab */}
          <TabsContent value="on-the-air" className="space-y-6">
            {isOnTheAirLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {Array.from({ length: 20 }, (_, i) => (
                  <MediaCardSkeleton key={i} />
                ))}
              </div>
            ) : onTheAirData && onTheAirData.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {onTheAirData.map((show: TVShow) => (
                    <MediaCard
                      key={show.id}
                      item={show}
                      mediaType="tv"
                      onAddToWatchlist={handleAddToWatchlist}
                      isInWatchlist={isInWatchlist(show.id.toString())}
                    />
                  ))}
                </div>
                
                {renderPagination(
                  onTheAirPage,
                  onTheAirTotalPages,
                  setOnTheAirPage,
                  onTheAirPageInput,
                  setOnTheAirPageInput,
                  'on-the-air'
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No shows currently on the air</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}