import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Database, 
  Play, 
  Trash2, 
  Search, 
  Sparkles, 
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Film
} from "lucide-react";

interface EmbeddingStats {
  totalRecords: number;
  embeddedRecords: number;
  pendingRecords: number;
  lastGenerated?: string;
}

interface SearchResult {
  id: number;
  title: string;
  overview: string;
  genres: string;
  releaseDate: string;
  voteAverage: number;
  popularity: number;
  posterPath: string;
  distance: number;
}

export default function EmbeddingsPage() {
  const { toast } = useToast();
  const [batchSize, setBatchSize] = useState(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [similarMovieId, setSimilarMovieId] = useState("");
  const [similarResults, setSimilarResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isFindingSimilar, setIsFindingSimilar] = useState(false);

  // Fetch embedding statistics
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<EmbeddingStats>({
    queryKey: ["/api/embeddings/stats"],
  });

  // Generate embeddings mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/embeddings/generate", { batchSize });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Embeddings Generated",
        description: `Processed ${data.processed} records with ${data.errors} errors.`,
      });
      refetchStats();
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate embeddings",
        variant: "destructive",
      });
    },
  });

  // Create index mutation
  const createIndexMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/embeddings/index/create");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Index Created",
        description: "HNSW index created successfully for fast vector search.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Index Creation Failed",
        description: error.message || "Failed to create index",
        variant: "destructive",
      });
    },
  });

  // Drop index mutation
  const dropIndexMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/embeddings/index");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Index Dropped",
        description: "HNSW index removed successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Index Deletion Failed",
        description: error.message || "Failed to drop index",
        variant: "destructive",
      });
    },
  });

  // Semantic search
  const handleSemanticSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Empty Query",
        description: "Please enter a search query",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`/api/embeddings/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      const data = await response.json();
      setSearchResults(data);
      toast({
        title: "Search Complete",
        description: `Found ${data.length} similar movies`,
      });
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to perform semantic search",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Find similar movies
  const handleFindSimilar = async () => {
    if (!similarMovieId.trim()) {
      toast({
        title: "Missing Movie ID",
        description: "Please enter a movie ID",
        variant: "destructive",
      });
      return;
    }

    setIsFindingSimilar(true);
    try {
      const response = await fetch(`/api/embeddings/similar/${similarMovieId}?limit=10`);
      const data = await response.json();
      setSimilarResults(data);
      toast({
        title: "Similar Movies Found",
        description: `Found ${data.length} similar movies`,
      });
    } catch (error: any) {
      toast({
        title: "Search Failed",
        description: error.message || "Failed to find similar movies",
        variant: "destructive",
      });
    } finally {
      setIsFindingSimilar(false);
    }
  };

  const completionPercentage = stats 
    ? Math.round((stats.embeddedRecords / stats.totalRecords) * 100) 
    : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2" data-testid="heading-embeddings">
          Vector Embeddings
        </h1>
        <p className="text-muted-foreground">
          Manage semantic search embeddings powered by Google Vertex AI
        </p>
      </div>

      {/* Statistics Dashboard */}
      <div className="grid gap-6 md:grid-cols-3 mb-8">
        <Card data-testid="card-total-records">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-total-records">
                {stats?.totalRecords.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-embedded-records">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Embedded</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div>
                <div className="text-2xl font-bold" data-testid="text-embedded-records">
                  {stats?.embeddedRecords.toLocaleString() || 0}
                </div>
                <Progress value={completionPercentage} className="mt-2" data-testid="progress-completion" />
                <p className="text-xs text-muted-foreground mt-1">
                  {completionPercentage}% complete
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-pending-records">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold" data-testid="text-pending-records">
                {stats?.pendingRecords.toLocaleString() || 0}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="generate" data-testid="tab-generate">
            <Sparkles className="h-4 w-4 mr-2" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="search" data-testid="tab-search">
            <Search className="h-4 w-4 mr-2" />
            Semantic Search
          </TabsTrigger>
          <TabsTrigger value="similar" data-testid="tab-similar">
            <Film className="h-4 w-4 mr-2" />
            Similar Movies
          </TabsTrigger>
          <TabsTrigger value="index" data-testid="tab-index">
            <TrendingUp className="h-4 w-4 mr-2" />
            Index
          </TabsTrigger>
        </TabsList>

        {/* Generate Embeddings Tab */}
        <TabsContent value="generate" className="space-y-4">
          <Card data-testid="card-generate-embeddings">
            <CardHeader>
              <CardTitle>Generate Embeddings</CardTitle>
              <CardDescription>
                Generate vector embeddings for movies without them using Vertex AI text-embedding-004
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats && stats.pendingRecords === 0 ? (
                <Alert data-testid="alert-all-complete">
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>All embeddings generated</AlertTitle>
                  <AlertDescription>
                    All {stats.totalRecords.toLocaleString()} records have embeddings. 
                    {stats.lastGenerated && (
                      <span className="block mt-1">
                        Last generated: {new Date(stats.lastGenerated).toLocaleString()}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert data-testid="alert-pending-records">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Embeddings needed</AlertTitle>
                  <AlertDescription>
                    {stats?.pendingRecords.toLocaleString() || 0} records need embeddings
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label htmlFor="batchSize" className="text-sm font-medium mb-1 block">
                    Batch Size
                  </label>
                  <Input
                    id="batchSize"
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value) || 100)}
                    min={1}
                    max={1000}
                    disabled={generateMutation.isPending}
                    data-testid="input-batch-size"
                  />
                </div>
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending || stats?.pendingRecords === 0}
                  className="mt-6"
                  data-testid="button-generate"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Generate Embeddings
                    </>
                  )}
                </Button>
              </div>

              {generateMutation.isPending && (
                <div className="bg-muted p-4 rounded-lg" data-testid="div-generation-progress">
                  <p className="text-sm text-muted-foreground">
                    Processing batch of {batchSize} records. This may take a few minutes...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Semantic Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <Card data-testid="card-semantic-search">
            <CardHeader>
              <CardTitle>Semantic Search</CardTitle>
              <CardDescription>
                Search movies by meaning, not just keywords
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="e.g., 'epic space battles with stunning visuals'"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSemanticSearch()}
                  disabled={isSearching}
                  data-testid="input-search-query"
                />
                <Button 
                  onClick={handleSemanticSearch}
                  disabled={isSearching || !searchQuery.trim()}
                  data-testid="button-search"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3" data-testid="div-search-results">
                  <h3 className="font-semibold">Results ({searchResults.length})</h3>
                  {searchResults.map((movie) => (
                    <div 
                      key={movie.id} 
                      className="border rounded-lg p-4 hover:bg-accent transition-colors"
                      data-testid={`result-${movie.id}`}
                    >
                      <div className="flex gap-4">
                        {movie.posterPath && (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${movie.posterPath}`}
                            alt={movie.title}
                            className="w-16 h-24 object-cover rounded"
                            data-testid={`poster-${movie.id}`}
                          />
                        )}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold" data-testid={`title-${movie.id}`}>
                                {movie.title}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {movie.releaseDate?.substring(0, 4)} • {movie.genres}
                              </p>
                            </div>
                            <Badge variant="secondary" data-testid={`similarity-${movie.id}`}>
                              {((1 - movie.distance) * 100).toFixed(1)}% match
                            </Badge>
                          </div>
                          <p className="text-sm mt-2 line-clamp-2">{movie.overview}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">★ {movie.voteAverage.toFixed(1)}</Badge>
                            <Badge variant="outline">ID: {movie.id}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Similar Movies Tab */}
        <TabsContent value="similar" className="space-y-4">
          <Card data-testid="card-similar-movies">
            <CardHeader>
              <CardTitle>Find Similar Movies</CardTitle>
              <CardDescription>
                Find movies similar to a specific movie by ID
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Enter TMDB movie ID (e.g., 550 for Fight Club)"
                  value={similarMovieId}
                  onChange={(e) => setSimilarMovieId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFindSimilar()}
                  disabled={isFindingSimilar}
                  data-testid="input-movie-id"
                />
                <Button 
                  onClick={handleFindSimilar}
                  disabled={isFindingSimilar || !similarMovieId.trim()}
                  data-testid="button-find-similar"
                >
                  {isFindingSimilar ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Finding...
                    </>
                  ) : (
                    <>
                      <Film className="h-4 w-4 mr-2" />
                      Find Similar
                    </>
                  )}
                </Button>
              </div>

              {similarResults.length > 0 && (
                <div className="space-y-3" data-testid="div-similar-results">
                  <h3 className="font-semibold">Similar Movies ({similarResults.length})</h3>
                  {similarResults.map((movie) => (
                    <div 
                      key={movie.id} 
                      className="border rounded-lg p-4 hover:bg-accent transition-colors"
                      data-testid={`similar-result-${movie.id}`}
                    >
                      <div className="flex gap-4">
                        {movie.posterPath && (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${movie.posterPath}`}
                            alt={movie.title}
                            className="w-16 h-24 object-cover rounded"
                            data-testid={`similar-poster-${movie.id}`}
                          />
                        )}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold" data-testid={`similar-title-${movie.id}`}>
                                {movie.title}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {movie.releaseDate?.substring(0, 4)} • {movie.genres}
                              </p>
                            </div>
                            <Badge variant="secondary" data-testid={`similar-similarity-${movie.id}`}>
                              {((1 - movie.distance) * 100).toFixed(1)}% similar
                            </Badge>
                          </div>
                          <p className="text-sm mt-2 line-clamp-2">{movie.overview}</p>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">★ {movie.voteAverage.toFixed(1)}</Badge>
                            <Badge variant="outline">ID: {movie.id}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Index Management Tab */}
        <TabsContent value="index" className="space-y-4">
          <Card data-testid="card-index-management">
            <CardHeader>
              <CardTitle>Index Management</CardTitle>
              <CardDescription>
                Manage HNSW index for fast approximate nearest neighbor search
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertTitle>About HNSW Index</AlertTitle>
                <AlertDescription>
                  The HNSW (Hierarchical Navigable Small World) index enables sub-linear search time
                  for vector similarity. Create it after generating embeddings for optimal performance.
                </AlertDescription>
              </Alert>

              <div className="flex gap-4">
                <Button
                  onClick={() => createIndexMutation.mutate()}
                  disabled={createIndexMutation.isPending || stats?.embeddedRecords === 0}
                  variant="default"
                  data-testid="button-create-index"
                >
                  {createIndexMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating Index...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Create HNSW Index
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => dropIndexMutation.mutate()}
                  disabled={dropIndexMutation.isPending}
                  variant="destructive"
                  data-testid="button-drop-index"
                >
                  {dropIndexMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Dropping Index...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Drop Index
                    </>
                  )}
                </Button>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <h4 className="font-semibold text-sm">Index Parameters</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>m:</strong> 16 (max connections per layer)</li>
                  <li>• <strong>ef_construction:</strong> 64 (candidate list size)</li>
                  <li>• <strong>Distance metric:</strong> Cosine similarity</li>
                  <li>• <strong>Performance:</strong> ~99%+ accuracy vs exact search</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
