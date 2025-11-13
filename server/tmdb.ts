const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Simple in-memory cache for TMDB responses
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class TMDBCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly TTL = 3600000; // 1 hour in milliseconds
  private readonly MAX_SIZE = 1000; // Maximum cache entries

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    // Simple LRU: Remove oldest entry if cache is full
    if (this.cache.size >= this.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }
}

const tmdbCache = new TMDBCache();

class RateLimiter {
  private queue: Array<() => void> = [];
  private processing = false;
  private readonly minDelay = 50;
  private lastRequestTime = 0;

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          
          if (timeSinceLastRequest < this.minDelay) {
            await new Promise(r => setTimeout(r, this.minDelay - timeSinceLastRequest));
          }
          
          this.lastRequestTime = Date.now();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    
    while (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        await next();
      }
    }

    this.processing = false;
  }
}

const rateLimiter = new RateLimiter();

function getTMDBApiKey(): string | null {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    console.warn('TMDB_API_KEY is not configured. Please set TMDB_API_KEY in Replit Secrets or .env file.');
    return null;
  }
  return apiKey;
}

export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  last_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  runtime?: number;
  number_of_seasons?: number;
  media_type?: string;
  popularity?: number;
  belongs_to_collection?: {
    id: number;
    name: string;
    poster_path: string | null;
    backdrop_path: string | null;
  } | null;
  recommendations?: TMDBResponse<TMDBMovie>;
  similar?: TMDBResponse<TMDBMovie>;
}

export interface TMDBResponse<T> {
  results: T[];
  total_pages: number;
  total_results: number;
}

class TMDBService {
  private async fetchFromTMDB<T>(endpoint: string, options?: any, retryCount = 0): Promise<T> {
    const apiKey = getTMDBApiKey();
    
    if (!apiKey) {
      throw new Error('TMDB API key not configured. Please set TMDB_API_KEY in environment variables.');
    }

    // Create cache key from endpoint and options
    const cacheKey = `${endpoint}${options ? JSON.stringify(options) : ''}`;
    
    // Check cache for GET requests
    if (!options?.method || options.method === 'GET') {
      const cached = tmdbCache.get<T>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Use rate limiter to throttle requests
    return rateLimiter.throttle(async () => {
      const url = `${TMDB_BASE_URL}${endpoint}`;
      
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json'
      };

      if (options?.body) {
        headers['content-type'] = 'application/json';
      }
      
      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers,
        body: options?.body
      });
      
      if (!response.ok) {
        if (response.status === 429 && retryCount < 3) {
          const retryDelay = Math.pow(2, retryCount) * 1000;
          console.log(`Rate limited, retrying in ${retryDelay}ms (attempt ${retryCount + 1}/3)`);
          await new Promise(r => setTimeout(r, retryDelay));
          return this.fetchFromTMDB<T>(endpoint, options, retryCount + 1);
        }
        
        const errorText = await response.text();
        console.error(`TMDB API error (${response.status}):`, errorText);
        throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Cache GET responses
      if (!options?.method || options.method === 'GET') {
        tmdbCache.set(cacheKey, data);
      }
      
      return data;
    });
  }

  // Clear the cache (useful for testing or when needed)
  clearCache(): void {
    tmdbCache.clear();
    console.log('TMDB cache cleared');
  }

  async getTrendingAll(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/trending/all/week?page=${page}`);
  }

  async getPopularMovies(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/movie/popular?page=${page}`);
  }

  async getTopRatedMovies(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/movie/top_rated?page=${page}`);
  }

  async getPopularTVShows(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/tv/popular?page=${page}`);
  }

  async getTopRatedTVShows(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/tv/top_rated?page=${page}`);
  }

  async getAiringTodayTVShows(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/tv/airing_today?page=${page}`);
  }

  async getOnTheAirTVShows(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/tv/on_the_air?page=${page}`);
  }

  async getNowPlayingMovies(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/movie/now_playing?page=${page}`);
  }

  async getUpcomingMovies(page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/movie/upcoming?page=${page}`);
  }

  async getMovieDetails(movieId: number): Promise<TMDBMovie | null> {
    try {
      return await this.fetchFromTMDB(`/movie/${movieId}?append_to_response=credits,videos,images,similar,recommendations,external_ids`);
    } catch (error) {
      // Return null for 404 errors (item not found) to allow graceful handling
      if (error instanceof Error && error.message.includes('404')) {
        console.log(`Movie ${movieId} not found in TMDB, returning null`);
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getTVDetails(tvId: number): Promise<TMDBMovie | null> {
    try {
      return await this.fetchFromTMDB(`/tv/${tvId}?append_to_response=credits,videos,images,similar,recommendations,external_ids`);
    } catch (error) {
      // Return null for 404 errors (item not found) to allow graceful handling
      if (error instanceof Error && error.message.includes('404')) {
        console.log(`TV show ${tvId} not found in TMDB, returning null`);
        return null;
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getPersonDetails(personId: number): Promise<any> {
    return this.fetchFromTMDB(`/person/${personId}?append_to_response=movie_credits,tv_credits,combined_credits`);
  }

  async searchMovies(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/search/movie?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchTVShows(query: string, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/search/tv?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchPeople(query: string, page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/search/person?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchMulti(query: string, page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async discoverMovies(params: Record<string, any> = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryString = new URLSearchParams(params).toString();
    return this.fetchFromTMDB(`/discover/movie?${queryString}`);
  }

  async discoverTVShows(params: Record<string, any> = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryString = new URLSearchParams(params).toString();
    return this.fetchFromTMDB(`/discover/tv?${queryString}`);
  }

  async getMovieGenres(): Promise<{ genres: any[] }> {
    return this.fetchFromTMDB('/genre/movie/list?language=en');
  }

  async getTVGenres(): Promise<{ genres: any[] }> {
    return this.fetchFromTMDB('/genre/tv/list?language=en');
  }

  async getConfiguration(): Promise<any> {
    return this.fetchFromTMDB('/configuration');
  }

  async getAccountFavoriteTVShows(accountId: number, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/account/${accountId}/favorite/tv?page=${page}`);
  }

  async getAccountWatchlistTVShows(accountId: number, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/account/${accountId}/watchlist/tv?page=${page}`);
  }

  async getAccountRatedTVShows(accountId: number, page: number = 1): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/account/${accountId}/rated/tv?page=${page}`);
  }

  // Additional search methods
  async searchCompanies(query: string, page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/search/company?query=${encodeURIComponent(query)}&page=${page}`);
  }

  async searchCollections(query: string, page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/search/collection?query=${encodeURIComponent(query)}&page=${page}`);
  }



  async getAccountLists(accountId: string, page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/account/${accountId}/lists?page=${page}`);
  }

  async addToFavorites(accountId: string, mediaType: 'movie' | 'tv', mediaId: number, favorite: boolean): Promise<any> {
    return this.fetchFromTMDB(`/account/${accountId}/favorite`, {
      method: 'POST',
      body: JSON.stringify({
        media_type: mediaType,
        media_id: mediaId,
        favorite
      })
    });
  }

  async addToWatchlist(accountId: string, mediaType: 'movie' | 'tv', mediaId: number, watchlist: boolean): Promise<any> {
    return this.fetchFromTMDB(`/account/${accountId}/watchlist`, {
      method: 'POST',
      body: JSON.stringify({
        media_type: mediaType,
        media_id: mediaId,
        watchlist
      })
    });
  }

  // Authentication methods
  async getGuestSession(): Promise<any> {
    return this.fetchFromTMDB('/authentication/guest_session/new');
  }

  async getRequestToken(): Promise<any> {
    return this.fetchFromTMDB('/authentication/token/new');
  }

  async createSession(requestToken: string): Promise<any> {
    return this.fetchFromTMDB('/authentication/session/new', {
      method: 'POST',
      body: JSON.stringify({ request_token: requestToken })
    });
  }

  async deleteSession(sessionId: string): Promise<any> {
    return this.fetchFromTMDB('/authentication/session', {
      method: 'DELETE',
      body: JSON.stringify({ session_id: sessionId })
    });
  }

  // Certification methods
  async getMovieCertifications(): Promise<any> {
    return this.fetchFromTMDB('/certification/movie/list');
  }

  async getTVCertifications(): Promise<any> {
    return this.fetchFromTMDB('/certification/tv/list');
  }

  // Changes methods
  async getMovieChanges(page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/movie/changes?page=${page}`);
  }

  async getPersonChanges(page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/person/changes?page=${page}`);
  }

  async getTVChanges(page: number = 1): Promise<any> {
    return this.fetchFromTMDB(`/tv/changes?page=${page}`);
  }

  // Collection methods

  async getCollectionImages(collectionId: string): Promise<any> {
    return this.fetchFromTMDB(`/collection/${collectionId}/images`);
  }

  async getCollectionTranslations(collectionId: string): Promise<any> {
    return this.fetchFromTMDB(`/collection/${collectionId}/translations`);
  }

  // Find method
  async findByExternalId(externalId: string, externalSource: string): Promise<any> {
    return this.fetchFromTMDB(`/find/${externalId}?external_source=${externalSource}`);
  }

  // Detail methods

  async getCompanyDetails(companyId: string): Promise<any> {
    return this.fetchFromTMDB(`/company/${companyId}`);
  }

  async getCollectionDetails(collectionId: string): Promise<any> {
    return this.fetchFromTMDB(`/collection/${collectionId}?language=en-US`);
  }

  // Credits, videos, reviews, and recommendations
  async getMovieCredits(movieId: string): Promise<any> {
    return this.fetchFromTMDB(`/movie/${movieId}/credits`);
  }

  async getTVCredits(tvId: string): Promise<any> {
    return this.fetchFromTMDB(`/tv/${tvId}/credits`);
  }

  async getTVSeasons(tvId: string): Promise<any> {
    return this.fetchFromTMDB(`/tv/${tvId}`);
  }

  async getTVSeasonDetails(tvId: string, seasonNumber: number): Promise<any> {
    return this.fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}`);
  }

  async getTVEpisodeDetails(tvId: string, seasonNumber: number, episodeNumber: number): Promise<any> {
    return this.fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`);
  }

  async getMovieVideos(movieId: string): Promise<any> {
    return this.fetchFromTMDB(`/movie/${movieId}/videos`);
  }

  async getTVVideos(tvId: string): Promise<any> {
    return this.fetchFromTMDB(`/tv/${tvId}/videos`);
  }

  async getMovieReviews(movieId: string, page: number = 1): Promise<any> {
    const params = new URLSearchParams({ page: page.toString() });
    return this.fetchFromTMDB(`/movie/${movieId}/reviews?${params.toString()}`);
  }

  async getTVReviews(tvId: string, page: number = 1): Promise<any> {
    const params = new URLSearchParams({ page: page.toString() });
    return this.fetchFromTMDB(`/tv/${tvId}/reviews?${params.toString()}`);
  }

  async getReviewDetails(reviewId: string): Promise<any> {
    return this.fetchFromTMDB(`/review/${reviewId}`);
  }

  async getMovieImages(movieId: string): Promise<any> {
    return this.fetchFromTMDB(`/movie/${movieId}/images`);
  }

  async getMovieKeywords(movieId: string): Promise<any> {
    return this.fetchFromTMDB(`/movie/${movieId}/keywords`);
  }

  async getMovieWatchProviders(movieId: string): Promise<any> {
    return this.fetchFromTMDB(`/movie/${movieId}/watch/providers`);
  }

  async getTVWatchProviders(tvId: string): Promise<any> {
    return this.fetchFromTMDB(`/tv/${tvId}/watch/providers`);
  }

  async getMovieRecommendations(movieId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/movie/${movieId}/recommendations`);
  }

  async getTVRecommendations(tvId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/tv/${tvId}/recommendations`);
  }

  async getSimilarMovies(movieId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/movie/${movieId}/similar`);
  }

  async getSimilarTVShows(tvId: string): Promise<TMDBResponse<TMDBMovie>> {
    return this.fetchFromTMDB(`/tv/${tvId}/similar`);
  }

  // Account-related methods for TMDB integration
  async getAccountDetails(accountId: string | number): Promise<any> {
    return this.fetchFromTMDB(`/account/${accountId}`);
  }

  async getAccountWatchlistMovies(accountId: string, params: {
    language?: string;
    page?: number;
    sort_by?: string;
  } = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    
    return this.fetchFromTMDB(`/account/${accountId}/watchlist/movies?${queryParams.toString()}`);
  }

  async getAccountWatchlistTV(accountId: string, params: {
    language?: string;
    page?: number;
    sort_by?: string;
  } = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    
    return this.fetchFromTMDB(`/account/${accountId}/watchlist/tv?${queryParams.toString()}`);
  }

  async addToAccountWatchlist(accountId: string, params: {
    media_type: string;
    media_id: number;
    watchlist: boolean;
  }): Promise<any> {
    return this.fetchFromTMDB(`/account/${accountId}/watchlist`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  async getAccountFavoriteMovies(accountId: string, params: {
    language?: string;
    page?: number;
    sort_by?: string;
  } = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    
    return this.fetchFromTMDB(`/account/${accountId}/favorite/movies?${queryParams.toString()}`);
  }

  async getAccountFavoriteTV(accountId: string, params: {
    language?: string;
    page?: number;
    sort_by?: string;
  } = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    
    return this.fetchFromTMDB(`/account/${accountId}/favorite/tv?${queryParams.toString()}`);
  }

  async addToAccountFavorites(accountId: string, params: {
    media_type: string;
    media_id: number;
    favorite: boolean;
  }): Promise<any> {
    return this.fetchFromTMDB(`/account/${accountId}/favorite`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  }

  async getAccountRatedMovies(accountId: string, params: {
    language?: string;
    page?: number;
    sort_by?: string;
  } = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    
    return this.fetchFromTMDB(`/account/${accountId}/rated/movies?${queryParams.toString()}`);
  }

  async getAccountRatedTV(accountId: string, params: {
    language?: string;
    page?: number;
    sort_by?: string;
  } = {}): Promise<TMDBResponse<TMDBMovie>> {
    const queryParams = new URLSearchParams();
    if (params.language) queryParams.append('language', params.language);
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.sort_by) queryParams.append('sort_by', params.sort_by);
    
    return this.fetchFromTMDB(`/account/${accountId}/rated/tv?${queryParams.toString()}`);
  }

  // Rating methods for movies and TV shows
  async rateMovie(movieId: string, rating: number, sessionId?: string): Promise<any> {
    const endpoint = sessionId 
      ? `/movie/${movieId}/rating?session_id=${sessionId}`
      : `/movie/${movieId}/rating`;
    
    return this.fetchFromTMDB(endpoint, {
      method: 'POST',
      body: JSON.stringify({ value: rating })
    });
  }

  async rateTVShow(tvId: string, rating: number, sessionId?: string): Promise<any> {
    const endpoint = sessionId 
      ? `/tv/${tvId}/rating?session_id=${sessionId}`
      : `/tv/${tvId}/rating`;
    
    return this.fetchFromTMDB(endpoint, {
      method: 'POST',
      body: JSON.stringify({ value: rating })
    });
  }

  async deleteMovieRating(movieId: string, sessionId?: string): Promise<any> {
    const endpoint = sessionId 
      ? `/movie/${movieId}/rating?session_id=${sessionId}`
      : `/movie/${movieId}/rating`;
    
    return this.fetchFromTMDB(endpoint, {
      method: 'DELETE'
    });
  }

  async deleteTVRating(tvId: string, sessionId?: string): Promise<any> {
    const endpoint = sessionId 
      ? `/tv/${tvId}/rating?session_id=${sessionId}`
      : `/tv/${tvId}/rating`;
    
    return this.fetchFromTMDB(endpoint, {
      method: 'DELETE'
    });
  }
}

export const tmdbService = new TMDBService();