/**
 * Unified Semantic Search Service
 * 
 * Combines:
 * - 234K pre-computed database embeddings for speed
 * - USE (Universal Sentence Encoder) for query understanding and re-ranking
 * - Advanced filtering (genres, year, rating, language, mediaType, moods, runtime)
 * - Natural language query parsing
 */

import { db } from '../db';
import { semanticEmbeddings, tmdbTrainingData } from '@shared/schema';
import { useService } from './universalSentenceEncoder';
import { eq, and, sql, gte, lte, inArray, ilike, or } from 'drizzle-orm';

export interface SearchFilters {
  genres?: string[];
  yearRange?: [number, number];
  minRating?: number;
  maxRating?: number;
  mediaType?: string[]; // ['movies', 'tv', 'both']
  languages?: string[];
  moods?: string[];     // ['happy', 'scary', 'romantic', 'energetic', etc.]
  runtime?: string;     // 'short', 'medium', 'long'
  minPopularity?: number;
}

export interface QueryAnalysis {
  intent: 'similarity' | 'franchise' | 'mood' | 'genre' | 'general';
  extractedMovie?: string;
  extractedMoods?: string[];
  extractedGenres?: string[];
  refinedQuery: string;
  confidence: number;
}

export interface SearchResult {
  tmdbId: number;
  title: string;
  overview: string;
  posterPath: string | null;
  releaseDate: string | null;
  voteAverage: number;
  popularity: number;
  genres: string[];
  similarity: number;
  explanation: string;
}

export interface SearchResponse {
  results: SearchResult[];
  queryAnalysis: {
    intent: string;
    confidence: number;
  };
  totalMatches: number;
  searchTime: number;
}

class SemanticSearchService {
  private readonly EMBEDDING_VERSION = 'v1-use-512';
  
  // Mood to genre mapping
  private readonly MOOD_TO_GENRES: Record<string, string[]> = {
    'happy': ['Comedy', 'Family', 'Animation', 'Music'],
    'funny': ['Comedy'],
    'scary': ['Horror', 'Thriller', 'Mystery'],
    'romantic': ['Romance', 'Drama'],
    'energetic': ['Action', 'Adventure', 'Thriller'],
    'thoughtful': ['Drama', 'Documentary'],
    'nostalgic': ['Drama', 'Family'],
    'adventurous': ['Adventure', 'Action', 'Fantasy'],
    'mysterious': ['Mystery', 'Thriller', 'Crime'],
    'heartwarming': ['Family', 'Drama', 'Romance']
  };
  
  /**
   * Analyze query to detect patterns and intent
   * IMPORTANT: Always extract moods and genres, even when similarity/franchise is detected
   */
  async analyzeQuery(query: string): Promise<QueryAnalysis> {
    const queryLower = query.toLowerCase().trim();
    
    let primaryIntent: 'similarity' | 'franchise' | 'mood' | 'genre' | 'general' = 'general';
    let extractedMovie: string | undefined;
    let confidence = 0.6;
    
    // Pattern 1: "movies like X" or "films like X"
    const similarityPatterns = [
      /movies?\s+like\s+(.+)/i,
      /films?\s+like\s+(.+)/i,
      /similar\s+to\s+(.+)/i,
      /like\s+the\s+(?:movie|film)\s+(.+)/i
    ];
    
    for (const pattern of similarityPatterns) {
      const match = query.match(pattern);
      if (match) {
        primaryIntent = 'similarity';
        extractedMovie = match[1].trim();
        confidence = 0.9;
        break;
      }
    }
    
    // Pattern 2: "X all movies" or "X franchise"
    if (primaryIntent === 'general') {
      const franchisePatterns = [
        /(.+?)\s+all\s+movies/i,
        /(.+?)\s+franchise/i,
        /(.+?)\s+series/i,
        /all\s+(.+?)\s+movies/i
      ];
      
      for (const pattern of franchisePatterns) {
        const match = query.match(pattern);
        if (match) {
          primaryIntent = 'franchise';
          extractedMovie = match[1].trim();
          confidence = 0.85;
          break;
        }
      }
    }
    
    // Pattern 3: ALWAYS extract moods (even for similarity/franchise queries)
    const extractedMoods: string[] = [];
    for (const [mood, _] of Object.entries(this.MOOD_TO_GENRES)) {
      if (queryLower.includes(mood)) {
        extractedMoods.push(mood);
      }
    }
    
    // Pattern 4: ALWAYS extract genres (even for similarity/franchise queries)
    const genreKeywords = ['action', 'comedy', 'drama', 'horror', 'thriller', 'romance', 
                          'sci-fi', 'fantasy', 'adventure', 'documentary', 'animation'];
    const extractedGenres: string[] = [];
    for (const genre of genreKeywords) {
      if (queryLower.includes(genre)) {
        extractedGenres.push(genre.charAt(0).toUpperCase() + genre.slice(1));
      }
    }
    
    // Adjust intent if we found moods/genres but no similarity/franchise
    if (primaryIntent === 'general') {
      if (extractedMoods.length > 0 && extractedGenres.length > 0) {
        primaryIntent = 'mood';
        confidence = 0.8;
      } else if (extractedMoods.length > 0) {
        primaryIntent = 'mood';
        confidence = 0.75;
      } else if (extractedGenres.length > 0) {
        primaryIntent = 'genre';
        confidence = 0.7;
      }
    }
    
    // Build refined query (use extracted movie for similarity, else full query)
    const refinedQuery = extractedMovie || query;
    
    return {
      intent: primaryIntent,
      extractedMovie,
      extractedMoods: extractedMoods.length > 0 ? extractedMoods : undefined,
      extractedGenres: extractedGenres.length > 0 ? extractedGenres : undefined,
      refinedQuery,
      confidence
    };
  }
  
  /**
   * Main unified search method
   */
  async search(
    query: string,
    options: {
      limit?: number;
      filters?: SearchFilters;
    } = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const limit = options.limit || 20;
    let filters = options.filters || {};
    
    console.log(`[Unified Search] Query: "${query}"`);
    console.log(`[Unified Search] Filters:`, filters);
    
    try {
      // Step 1: Analyze query to understand intent
      console.log('[Unified Search] Analyzing query...');
      const analysis = await this.analyzeQuery(query);
      console.log(`[Unified Search] Intent: ${analysis.intent} (${(analysis.confidence * 100).toFixed(0)}% confidence)`);
      
      // Step 2: Enhance filters based on query analysis
      filters = this.enhanceFilters(filters, analysis);
      
      // Step 3: Determine the search query for embeddings
      let searchQuery = query;
      
      if (analysis.intent === 'similarity' && analysis.extractedMovie) {
        // For "movies like X", search for X's content
        searchQuery = analysis.extractedMovie;
        console.log(`[Unified Search] Similarity search for: "${searchQuery}"`);
      } else if (analysis.intent === 'franchise' && analysis.extractedMovie) {
        // For franchise queries, search for the franchise name
        searchQuery = analysis.extractedMovie;
        console.log(`[Unified Search] Franchise search for: "${searchQuery}"`);
      }
      
      // Step 4: Generate query embedding
      console.log('[Unified Search] Generating query embedding...');
      const queryEmbedding = await useService.embedSingle(searchQuery);
      
      // Step 5: Get candidate embeddings from database with pre-filtering
      console.log('[Unified Search] Fetching candidate embeddings...');
      const candidates = await this.getCandidateEmbeddings(filters);
      
      console.log(`[Unified Search] Found ${candidates.length} candidates after filtering`);
      
      if (candidates.length === 0) {
        return {
          results: [],
          queryAnalysis: {
            intent: analysis.intent,
            confidence: analysis.confidence
          },
          totalMatches: 0,
          searchTime: Date.now() - startTime
        };
      }
      
      // Step 6: Calculate similarities using database embeddings
      console.log('[Unified Search] Calculating embedding similarities...');
      const scoredResults = this.calculateBatchSimilarity(
        queryEmbedding,
        candidates
      );
      
      // Step 7: Get top candidates for USE re-ranking
      const topCandidates = scoredResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, Math.min(100, scoredResults.length)); // Re-rank top 100
      
      console.log(`[Unified Search] Top embedding similarity: ${topCandidates[0]?.similarity.toFixed(3)}`);
      
      // Step 8: USE re-ranking for improved relevance
      console.log('[Unified Search] Applying USE re-ranking...');
      const rerankedResults = await this.useReranking(query, topCandidates);
      
      // Step 9: Get top K final results
      const finalResults = rerankedResults.slice(0, limit);
      
      // Step 10: Enrich with movie details
      const enrichedResults = await this.enrichResults(finalResults, query, analysis);
      
      const searchTime = Date.now() - startTime;
      console.log(`[Unified Search] Completed in ${searchTime}ms with ${enrichedResults.length} results`);
      
      return {
        results: enrichedResults,
        queryAnalysis: {
          intent: analysis.intent,
          confidence: analysis.confidence
        },
        totalMatches: scoredResults.length,
        searchTime
      };
      
    } catch (error) {
      console.error('[Unified Search] Error:', error);
      throw error;
    }
  }
  
  /**
   * Enhance filters based on query analysis
   */
  private enhanceFilters(
    filters: SearchFilters,
    analysis: QueryAnalysis
  ): SearchFilters {
    const enhanced = { ...filters };
    
    // Add mood-based genre filtering
    if (analysis.extractedMoods && analysis.extractedMoods.length > 0) {
      const moodGenres = new Set<string>();
      for (const mood of analysis.extractedMoods) {
        const genres = this.MOOD_TO_GENRES[mood] || [];
        genres.forEach(g => moodGenres.add(g));
      }
      
      // Merge with existing genre filters
      const moodGenresArray = Array.from(moodGenres);
      if (enhanced.genres && enhanced.genres.length > 0) {
        // Find intersection (must match both mood AND user preference)
        const intersection = enhanced.genres.filter(g => moodGenres.has(g));
        if (intersection.length > 0) {
          enhanced.genres = intersection;
        }
      } else if (moodGenresArray.length > 0) {
        // Use mood genres
        enhanced.genres = moodGenresArray;
      }
    }
    
    // Add extracted genres
    if (analysis.extractedGenres && analysis.extractedGenres.length > 0) {
      if (enhanced.genres && enhanced.genres.length > 0) {
        // Merge extracted genres with existing
        const merged = [...enhanced.genres, ...analysis.extractedGenres];
        enhanced.genres = Array.from(new Set(merged));
      } else {
        enhanced.genres = analysis.extractedGenres;
      }
    }
    
    return enhanced;
  }
  
  /**
   * Get candidate embeddings with comprehensive filtering
   */
  private async getCandidateEmbeddings(
    filters: SearchFilters
  ): Promise<Array<{
    tmdbId: number;
    embedding: number[];
    textSource: string;
  }>> {
    // Build WHERE conditions for mediaType
    const conditions: any[] = [];
    
    if (filters.mediaType && filters.mediaType.length > 0) {
      // Handle mediaType filter
      if (filters.mediaType.includes('both') || 
          (filters.mediaType.includes('movies') && filters.mediaType.includes('tv'))) {
        // Include both movies and TV
        conditions.push(or(
          eq(semanticEmbeddings.mediaType, 'movie'),
          eq(semanticEmbeddings.mediaType, 'tv')
        ));
      } else if (filters.mediaType.includes('movies')) {
        conditions.push(eq(semanticEmbeddings.mediaType, 'movie'));
      } else if (filters.mediaType.includes('tv')) {
        conditions.push(eq(semanticEmbeddings.mediaType, 'tv'));
      } else {
        // Default to movies
        conditions.push(eq(semanticEmbeddings.mediaType, 'movie'));
      }
    } else {
      // Default to movies only
      conditions.push(eq(semanticEmbeddings.mediaType, 'movie'));
    }
    
    // Get embeddings with basic filter
    // Limit to 5000 for performance - will still cover most popular content
    let embeddings = await db
      .select({
        tmdbId: semanticEmbeddings.tmdbId,
        embedding: semanticEmbeddings.embedding,
        textSource: semanticEmbeddings.textSource
      })
      .from(semanticEmbeddings)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(5000); // Reduced from 50000 for better performance (sub-2s target)
    
    // Apply additional filters via TMDB data join
    if (filters.genres?.length || filters.yearRange || filters.minRating || 
        filters.maxRating || filters.languages?.length || filters.runtime) {
      const tmdbIds = embeddings.map(e => e.tmdbId);
      
      if (tmdbIds.length === 0) {
        return [];
      }
      
      // Build filter conditions for TMDB data
      const tmdbConditions: any[] = [
        inArray(tmdbTrainingData.id, tmdbIds)
      ];
      
      if (filters.genres?.length) {
        // Filter by genres (genres are stored as CSV string)
        const genreConditions = filters.genres.map(genre =>
          ilike(tmdbTrainingData.genres, `%${genre}%`)
        );
        tmdbConditions.push(or(...genreConditions));
      }
      
      if (filters.yearRange) {
        tmdbConditions.push(
          gte(tmdbTrainingData.releaseDate, `${filters.yearRange[0]}-01-01`)
        );
        tmdbConditions.push(
          lte(tmdbTrainingData.releaseDate, `${filters.yearRange[1]}-12-31`)
        );
      }
      
      if (filters.minRating) {
        tmdbConditions.push(
          gte(tmdbTrainingData.voteAverage, filters.minRating)
        );
      }
      
      if (filters.maxRating) {
        tmdbConditions.push(
          lte(tmdbTrainingData.voteAverage, filters.maxRating)
        );
      }
      
      if (filters.languages?.length) {
        const langConditions = filters.languages.map(lang =>
          eq(tmdbTrainingData.originalLanguage, lang.toLowerCase())
        );
        tmdbConditions.push(or(...langConditions));
      }
      
      // Runtime filtering (assuming runtime is in minutes in tmdbTrainingData)
      if (filters.runtime) {
        if (filters.runtime === 'short') {
          tmdbConditions.push(lte(tmdbTrainingData.runtime, 90));
        } else if (filters.runtime === 'medium') {
          tmdbConditions.push(gte(tmdbTrainingData.runtime, 90));
          tmdbConditions.push(lte(tmdbTrainingData.runtime, 150));
        } else if (filters.runtime === 'long') {
          tmdbConditions.push(gte(tmdbTrainingData.runtime, 150));
        }
      }
      
      // Get filtered TMDB IDs
      const filteredMovies = await db
        .select({ id: tmdbTrainingData.id })
        .from(tmdbTrainingData)
        .where(and(...tmdbConditions));
      
      const filteredIds = new Set(filteredMovies.map(m => m.id));
      
      // Filter embeddings to only include movies that pass all filters
      embeddings = embeddings.filter(e => filteredIds.has(e.tmdbId));
    }
    
    return embeddings.map(e => ({
      tmdbId: e.tmdbId,
      embedding: Array.isArray(e.embedding) ? e.embedding : (e.embedding as any) as number[],
      textSource: e.textSource || ''
    }));
  }
  
  /**
   * Calculate cosine similarity for batch of embeddings
   */
  private calculateBatchSimilarity(
    queryEmbedding: number[],
    candidates: Array<{ tmdbId: number; embedding: number[]; textSource: string }>
  ): Array<{ tmdbId: number; similarity: number; textSource: string }> {
    return candidates.map(candidate => ({
      tmdbId: candidate.tmdbId,
      similarity: useService.cosineSimilarity(queryEmbedding, candidate.embedding),
      textSource: candidate.textSource
    }));
  }
  
  /**
   * USE re-ranking to improve relevance
   * Blends database embedding scores with fresh USE calculations
   */
  private async useReranking(
    query: string,
    candidates: Array<{ tmdbId: number; similarity: number; textSource: string }>
  ): Promise<Array<{ tmdbId: number; similarity: number; textSource: string }>> {
    if (candidates.length === 0) return [];
    
    try {
      // Prepare candidates for USE
      const useCandidates = candidates.map(c => ({
        tmdbId: c.tmdbId,
        text: c.textSource
      }));
      
      // Calculate USE similarity
      const useResults = await useService.semanticSearch(query, useCandidates, candidates.length);
      
      // Create USE score map
      const useScoreMap = new Map(
        useResults.map(r => [r.tmdbId, r.similarity])
      );
      
      // Blend scores: 60% database embedding + 40% USE
      const blendedResults = candidates.map(c => {
        const useScore = useScoreMap.get(c.tmdbId) || 0;
        const blendedScore = (c.similarity * 0.6) + (useScore * 0.4);
        
        return {
          tmdbId: c.tmdbId,
          similarity: blendedScore,
          textSource: c.textSource
        };
      });
      
      // Sort by blended score
      return blendedResults.sort((a, b) => b.similarity - a.similarity);
      
    } catch (error) {
      console.warn('[Unified Search] USE re-ranking failed, using database scores:', error);
      return candidates;
    }
  }
  
  /**
   * Enrich results with full movie details
   */
  private async enrichResults(
    scoredResults: Array<{ tmdbId: number; similarity: number; textSource: string }>,
    query: string,
    analysis: QueryAnalysis
  ): Promise<SearchResult[]> {
    if (scoredResults.length === 0) return [];
    
    const tmdbIds = scoredResults.map(r => r.tmdbId);
    
    // Fetch movie details
    const movies = await db
      .select({
        id: tmdbTrainingData.id,
        title: tmdbTrainingData.title,
        overview: tmdbTrainingData.overview,
        posterPath: tmdbTrainingData.posterPath,
        releaseDate: tmdbTrainingData.releaseDate,
        voteAverage: tmdbTrainingData.voteAverage,
        popularity: tmdbTrainingData.popularity,
        genres: tmdbTrainingData.genres
      })
      .from(tmdbTrainingData)
      .where(inArray(tmdbTrainingData.id, tmdbIds));
    
    // Create lookup map
    const movieMap = new Map(
      movies.map(m => [m.id, m])
    );
    
    // Merge results with movie details
    return scoredResults
      .map(result => {
        const movie = movieMap.get(result.tmdbId);
        if (!movie) return null;
        
        return {
          tmdbId: result.tmdbId,
          title: movie.title,
          overview: movie.overview || '',
          posterPath: movie.posterPath,
          releaseDate: movie.releaseDate,
          voteAverage: movie.voteAverage || 0,
          popularity: movie.popularity || 0,
          genres: this.parseGenres(movie.genres),
          similarity: result.similarity,
          explanation: this.generateExplanation(query, movie, result.similarity, analysis)
        };
      })
      .filter((r): r is SearchResult => r !== null);
  }
  
  /**
   * Parse genres from CSV string
   */
  private parseGenres(genresStr: string | null): string[] {
    if (!genresStr) return [];
    
    const separator = genresStr.includes('|') ? '|' : ',';
    return genresStr
      .split(separator)
      .map(g => g.trim())
      .filter(g => g.length > 0);
  }
  
  /**
   * Generate natural language explanation for the match
   */
  private generateExplanation(
    query: string,
    movie: any,
    similarity: number,
    analysis: QueryAnalysis
  ): string {
    const genres = this.parseGenres(movie.genres);
    const year = movie.releaseDate ? movie.releaseDate.substring(0, 4) : 'unknown';
    
    // Tailor explanation based on query intent
    if (analysis.intent === 'similarity' && analysis.extractedMovie) {
      if (similarity > 0.7) {
        return `Highly similar to ${analysis.extractedMovie} - ${genres.slice(0, 2).join(', ')}`;
      } else if (similarity > 0.5) {
        return `Similar themes to ${analysis.extractedMovie} - ${genres[0] || 'Drama'}`;
      } else {
        return `Related to ${analysis.extractedMovie}`;
      }
    } else if (analysis.intent === 'mood' && analysis.extractedMoods) {
      return `${analysis.extractedMoods.join(' & ')} ${genres[0] || 'film'} from ${year}`;
    } else if (analysis.intent === 'franchise') {
      return `Part of the series - ${genres.join(', ')}`;
    } else {
      // General explanation
      if (similarity > 0.7) {
        return `Strong match for "${query}" - ${genres.join(', ')} from ${year}`;
      } else if (similarity > 0.5) {
        return `Good match - Features elements of ${genres.slice(0, 2).join(' and ')}`;
      } else if (similarity > 0.3) {
        return `Moderate match - ${genres[0] || 'General'} film from ${year}`;
      } else {
        return `Related to your search`;
      }
    }
  }
  
  /**
   * Get embedding statistics
   */
  async getStats(): Promise<{
    totalEmbeddings: number;
    embeddingVersion: string;
    lastCreated: Date | null;
  }> {
    const [stats] = await db
      .select({
        count: sql<number>`count(*)::int`,
        maxCreated: sql<Date>`max(created_at)`
      })
      .from(semanticEmbeddings);
    
    return {
      totalEmbeddings: stats?.count || 0,
      embeddingVersion: this.EMBEDDING_VERSION,
      lastCreated: stats?.maxCreated || null
    };
  }
}

// Singleton instance
export const semanticSearchService = new SemanticSearchService();
