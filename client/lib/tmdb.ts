// TMDB API will be called through our backend proxy endpoints
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1920_and_h800_multi_faces';

export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  runtime?: number;
  number_of_seasons?: number;
  media_type?: string;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBMovieDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genres: TMDBGenre[];
  runtime?: number;
  number_of_seasons?: number;
  credits?: {
    cast: Array<{
      name: string;
      character: string;
    }>;
    crew: Array<{
      name: string;
      job: string;
    }>;
  };
}

export interface TMDBResponse<T> {
  results: T[];
  total_pages: number;
  total_results: number;
}

class TMDBService {
  // Use our backend proxy endpoints instead of direct TMDB calls
  private async fetchFromBackend<T>(endpoint: string): Promise<T> {
    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`Backend API error: ${response.statusText}`);
    }
    
    return response.json();
  }

  async getPopularMovies(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/movies/popular');
  }

  async getTopRatedMovies(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/movies/top-rated');
  }

  async getTrendingAll(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/trending');
  }

  async getPopularTVShows(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/tv/popular');
  }

  // Note: These methods would need additional backend endpoints to work
  async getMovieDetails(movieId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/movie/${movieId}`);
  }

  async getTVShowDetails(tvId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/tv/${tvId}`);
  }

  async searchMovies(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/search/movies?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchTVShows(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/search/tv?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async getMovieGenres(): Promise<{genres: Array<{id: number, name: string}>}> {
    return this.fetchFromBackend('/api/tmdb/genres/movies');
  }

  async getTVGenres(): Promise<{genres: Array<{id: number, name: string}>}> {
    return this.fetchFromBackend('/api/tmdb/genres/tv');
  }

  async discoverMovies(params: Record<string, any> = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryString = new URLSearchParams(params).toString();
    return this.fetchFromBackend(`/api/tmdb/discover/movies?${queryString}`);
  }

  async discoverTVShows(params: Record<string, any> = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryString = new URLSearchParams(params).toString();
    return this.fetchFromBackend(`/api/tmdb/discover/tv?${queryString}`);
  }

  async getNowPlayingMovies(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/movies/now-playing');
  }

  async getUpcomingMovies(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/movies/upcoming');
  }

  async getTopRatedTVShows(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/tv/top-rated');
  }

  async getAiringTodayTVShows(): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend('/api/tmdb/tv/airing-today');
  }

  async searchMulti(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchPeople(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/search/people?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchCompanies(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/search/companies?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchCollections(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/search/collections?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async getPersonDetails(personId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/person/${personId}`);
  }

  async getCompanyDetails(companyId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/company/${companyId}`);
  }

  async getCollectionDetails(collectionId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/collection/${collectionId}`);
  }

  async getMovieCredits(movieId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/movie/${movieId}/credits`);
  }

  async getTVCredits(tvId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/tv/${tvId}/credits`);
  }

  async getMovieVideos(movieId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/movie/${movieId}/videos`);
  }

  async getTVVideos(tvId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/tv/${tvId}/videos`);
  }

  async getMovieReviews(movieId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/movie/${movieId}/reviews`);
  }

  async getTVReviews(tvId: string): Promise<any> {
    return this.fetchFromBackend(`/api/tmdb/tv/${tvId}/reviews`);
  }

  async getMovieRecommendations(movieId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/movie/${movieId}/recommendations`);
  }

  async getTVRecommendations(tvId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/tv/${tvId}/recommendations`);
  }

  async getSimilarMovies(movieId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/movie/${movieId}/similar`);
  }

  async getSimilarTVShows(tvId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromBackend(`/api/tmdb/tv/${tvId}/similar`);
  }

  getImageUrl(path: string | null, size: 'poster' | 'backdrop' = 'poster'): string {
    if (!path) {
      return size === 'poster' 
        ? 'https://images.unsplash.com/photo-1489599558473-7636b88d6e6a?ixlib=rb-4.0.3&w=400&h=600&fit=crop'
        : 'https://images.unsplash.com/photo-1489599558473-7636b88d6e6a?ixlib=rb-4.0.3&w=1920&h=1080&fit=crop';
    }
    
    const baseUrl = size === 'backdrop' ? TMDB_BACKDROP_BASE_URL : TMDB_IMAGE_BASE_URL;
    return `${baseUrl}${path}`;
  }

  // Convert TMDB data to our app's Movie format
  convertToMovie(tmdbMovie: TMDBMovie | TMDBMovieDetails, type: 'movie' | 'tv' = 'movie'): any {
    const title = tmdbMovie.title || tmdbMovie.name || 'Unknown Title';
    const releaseDate = tmdbMovie.release_date || tmdbMovie.first_air_date || '';
    const year = releaseDate ? new Date(releaseDate).getFullYear() : new Date().getFullYear();
    
    // Get director from crew if it's detailed data
    const director = 'credits' in tmdbMovie 
      ? tmdbMovie.credits?.crew.find(person => person.job === 'Director')?.name
      : undefined;

    // Get cast from credits if it's detailed data
    const cast = 'credits' in tmdbMovie 
      ? tmdbMovie.credits?.cast.slice(0, 5).map(person => person.name) || []
      : [];

    // Map genre IDs to genre names (we'll need to maintain a mapping)
    const genreMap: Record<number, string> = {
      28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
      99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
      27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Science Fiction',
      10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western', 10759: 'Action & Adventure',
      10762: 'Kids', 10763: 'News', 10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap',
      10767: 'Talk', 10768: 'War & Politics'
    };

    const genres = 'genres' in tmdbMovie 
      ? tmdbMovie.genres?.map(g => g.name) || []
      : tmdbMovie.genre_ids?.map(id => genreMap[id]).filter(Boolean) || [];

    return {
      id: tmdbMovie.id.toString(),
      title,
      synopsis: tmdbMovie.overview || 'No synopsis available.',
      posterUrl: this.getImageUrl(tmdbMovie.poster_path, 'poster'),
      backdropUrl: this.getImageUrl(tmdbMovie.backdrop_path, 'backdrop'),
      rating: Math.round(tmdbMovie.vote_average * 10) / 10,
      year,
      genre: genres[0] || 'Unknown',
      genres,
      type,
      director,
      cast,
      duration: tmdbMovie.runtime,
      seasons: tmdbMovie.number_of_seasons,
      number_of_seasons: tmdbMovie.number_of_seasons  // Preserve for MediaCard
    };
  }
}

export const tmdbService = new TMDBService();