import { db } from '../db.js';
import { tmdbTrainingData, tmdbMovies, semanticEmbeddings } from '../../shared/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { tmdbService } from '../tmdb.js';

interface MovieMetadata {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  genres?: Array<{ id: number; name: string }>;
  runtime?: number;
  number_of_seasons?: number;
  media_type?: string;
  popularity?: number;
}

interface BatchItem {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title?: string;
  posterPath?: string | null;
}

interface BatchResult {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  metadata: MovieMetadata | null;
  source: 'training_data' | 'tmdb_cache' | 'api' | 'not_found';
}

/**
 * Database-first metadata service
 * Queries: tmdb_training_data → tmdb_movies → TMDB API
 */
class TMDBDatabaseService {
  /**
   * Get movie metadata from database with API fallback
   */
  async getMovieMetadataFromDB(tmdbId: number, mediaType: 'movie' | 'tv'): Promise<MovieMetadata | null> {
    // Strategy 1: Query tmdb_training_data (most comprehensive, has embeddings)
    if (mediaType === 'movie') {
      try {
        const trainingData = await db
          .select()
          .from(tmdbTrainingData)
          .where(eq(tmdbTrainingData.id, tmdbId))
          .limit(1);

        if (trainingData.length > 0) {
          const movie = trainingData[0];
          console.log(`[DB] Metadata hit (training_data): ${tmdbId}`);
          
          // Parse genres from CSV string
          const genresArray = movie.genres ? movie.genres.split(',').map(g => g.trim()) : [];
          const genres = genresArray.map((name, idx) => ({ id: idx, name }));
          
          return {
            id: movie.id,
            title: movie.title,
            overview: movie.overview || '',
            poster_path: movie.posterPath || null,
            backdrop_path: null,
            release_date: movie.releaseDate || '',
            vote_average: movie.voteAverage || 0,
            genre_ids: genres.map((_, idx) => idx),
            genres: genres,
            runtime: movie.runtime || undefined,
            popularity: movie.popularity || 0,
          };
        }
      } catch (error) {
        console.warn(`[DB] Error querying training_data for ${tmdbId}:`, error);
      }
    }

    // Strategy 2: Query tmdb_movies cache
    try {
      const cachedMovies = await db
        .select()
        .from(tmdbMovies)
        .where(eq(tmdbMovies.tmdbId, tmdbId))
        .limit(1);

      if (cachedMovies.length > 0) {
        const cached = cachedMovies[0];
        console.log(`[DB] Metadata hit (tmdb_cache): ${tmdbId}`);
        
        // Use rawData if available, otherwise construct from columns
        if (cached.rawData && typeof cached.rawData === 'object') {
          return cached.rawData as MovieMetadata;
        }
        
        return {
          id: cached.tmdbId,
          title: cached.title,
          overview: cached.overview || '',
          poster_path: cached.posterPath || null,
          backdrop_path: cached.backdropPath || null,
          release_date: cached.releaseDate || '',
          vote_average: cached.voteAverage || 0,
          genre_ids: cached.genreIds || [],
          genres: [],
          popularity: cached.popularity || 0,
        };
      }
    } catch (error: any) {
      // Silently skip if table doesn't exist
      if (error?.code !== '42P01') {
        console.warn(`[DB] Error querying tmdb_movies for ${tmdbId}:`, error);
      }
    }

    // Strategy 3: Fallback to TMDB API
    try {
      console.log(`[DB] Falling back to API for ${mediaType} ${tmdbId}`);
      const apiData = mediaType === 'tv'
        ? await tmdbService.getTVDetails(tmdbId)
        : await tmdbService.getMovieDetails(tmdbId);
      
      if (apiData) {
        // Cache the API response for future use (if table exists)
        try {
          await db.insert(tmdbMovies).values({
            tmdbId: tmdbId,
            mediaType: mediaType,
            title: (apiData as any).title || (apiData as any).name || 'Unknown',
            overview: apiData.overview || '',
            posterPath: apiData.poster_path || null,
            backdropPath: (apiData as any).backdrop_path || null,
            releaseDate: (apiData as any).release_date || (apiData as any).first_air_date || '',
            voteAverage: apiData.vote_average || 0,
            voteCount: (apiData as any).vote_count || 0,
            popularity: (apiData as any).popularity || 0,
            genreIds: apiData.genre_ids || [],
            originalLanguage: (apiData as any).original_language || '',
            adult: (apiData as any).adult || false,
            rawData: apiData as any,
          }).onConflictDoNothing();
        } catch (cacheError: any) {
          // Silently skip caching if table doesn't exist
          if (cacheError?.code !== '42P01') {
            console.warn(`[DB] Failed to cache API response for ${tmdbId}:`, cacheError);
          }
        }
        
        return apiData as MovieMetadata;
      }
    } catch (error) {
      console.error(`[DB] API fallback failed for ${mediaType} ${tmdbId}:`, error);
    }

    return null;
  }

  /**
   * Batch fetch metadata for multiple items
   * Optimized to minimize database queries and API calls
   */
  async getBatchMovieMetadata(items: BatchItem[]): Promise<BatchResult[]> {
    console.log(`[DB Batch] Fetching metadata for ${items.length} items`);
    
    const results: BatchResult[] = [];
    const movieIds = items.filter(item => item.mediaType === 'movie').map(item => item.tmdbId);
    const tvIds = items.filter(item => item.mediaType === 'tv').map(item => item.tmdbId);
    
    // Track found items
    const foundMovies = new Map<number, MovieMetadata>();
    const foundTV = new Map<number, MovieMetadata>();
    
    // Step 1: Bulk query tmdb_training_data for movies
    if (movieIds.length > 0) {
      try {
        const trainingDataResults = await db
          .select()
          .from(tmdbTrainingData)
          .where(inArray(tmdbTrainingData.id, movieIds));
        
        console.log(`[DB Batch] Found ${trainingDataResults.length}/${movieIds.length} movies in training_data`);
        
        for (const movie of trainingDataResults) {
          const genresArray = movie.genres ? movie.genres.split(',').map(g => g.trim()) : [];
          const genres = genresArray.map((name, idx) => ({ id: idx, name }));
          
          foundMovies.set(movie.id, {
            id: movie.id,
            title: movie.title,
            overview: movie.overview || '',
            poster_path: movie.posterPath || null,
            backdrop_path: null,
            release_date: movie.releaseDate || '',
            vote_average: movie.voteAverage || 0,
            genre_ids: genres.map((_, idx) => idx),
            genres: genres,
            runtime: movie.runtime || undefined,
            popularity: movie.popularity || 0,
          });
        }
      } catch (error) {
        console.warn('[DB Batch] Error querying training_data:', error);
      }
    }
    
    // Step 2: Query tmdb_movies cache for remaining items
    // Note: This table may not exist yet, skip if not available
    const remainingIds = items
      .filter(item => 
        (item.mediaType === 'movie' && !foundMovies.has(item.tmdbId)) ||
        (item.mediaType === 'tv' && !foundTV.has(item.tmdbId))
      )
      .map(item => item.tmdbId);
    
    if (remainingIds.length > 0) {
      try {
        const cachedResults = await db
          .select()
          .from(tmdbMovies)
          .where(inArray(tmdbMovies.tmdbId, remainingIds));
        
        console.log(`[DB Batch] Found ${cachedResults.length}/${remainingIds.length} items in tmdb_cache`);
        
        for (const cached of cachedResults) {
          const metadata: MovieMetadata = cached.rawData && typeof cached.rawData === 'object'
            ? (cached.rawData as MovieMetadata)
            : {
                id: cached.tmdbId,
                title: cached.title,
                overview: cached.overview || '',
                poster_path: cached.posterPath || null,
                backdrop_path: cached.backdropPath || null,
                release_date: cached.releaseDate || '',
                vote_average: cached.voteAverage || 0,
                genre_ids: cached.genreIds || [],
                genres: [],
                popularity: cached.popularity || 0,
              };
          
          if (cached.mediaType === 'movie') {
            foundMovies.set(cached.tmdbId, metadata);
          } else {
            foundTV.set(cached.tmdbId, metadata);
          }
        }
      } catch (error: any) {
        // Silently skip if table doesn't exist (not critical, will use API fallback)
        if (error?.code !== '42P01') {
          console.warn('[DB Batch] Error querying tmdb_movies cache:', error);
        }
      }
    }
    
    // Step 3: SKIP API calls - use database only (prevents unlimited API calls)
    const notFoundItems = items.filter(item => 
      (item.mediaType === 'movie' && !foundMovies.has(item.tmdbId)) ||
      (item.mediaType === 'tv' && !foundTV.has(item.tmdbId))
    );
    
    if (notFoundItems.length > 0) {
      console.log(`[DB Batch] Skipping API fallback for ${notFoundItems.length} items not in database`);
      // Note: Items not in database will have null metadata - this prevents unlimited API calls
    }
    
    // Step 4: Build final results in original order
    for (const item of items) {
      const metadata = item.mediaType === 'movie' 
        ? foundMovies.get(item.tmdbId)
        : foundTV.get(item.tmdbId);
      
      let source: BatchResult['source'] = 'not_found';
      if (metadata) {
        // Determine source based on which map it came from
        if (item.mediaType === 'movie' && foundMovies.has(item.tmdbId)) {
          // Check if it was in training data originally
          source = movieIds.includes(item.tmdbId) && foundMovies.has(item.tmdbId) 
            ? 'training_data' 
            : 'tmdb_cache';
        } else if (item.mediaType === 'tv' && foundTV.has(item.tmdbId)) {
          source = 'tmdb_cache';
        }
      }
      
      results.push({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        metadata: metadata || null,
        source,
      });
    }
    
    // Log statistics
    const stats = {
      training_data: results.filter(r => r.source === 'training_data').length,
      tmdb_cache: results.filter(r => r.source === 'tmdb_cache').length,
      api: 0, // No API calls made anymore
      not_found: results.filter(r => r.source === 'not_found').length,
    };
    console.log(`[DB Batch] Results: ${stats.training_data} training_data, ${stats.tmdb_cache} cache, ${stats.api} API, ${stats.not_found} not found`);
    
    return results;
  }
}

export const tmdbDatabaseService = new TMDBDatabaseService();
