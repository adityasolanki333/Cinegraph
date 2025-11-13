/**
 * Multi-Stage Recommendation Pipeline (Phase 4)
 * 
 * Three-stage architecture for production-grade recommendations:
 * 1. Candidate Generation (Recall): 1000-5000 candidates
 * 2. Precision Ranking: Score and rank to top 100-200
 * 3. Re-ranking & Diversification: Final 20-50 recommendations
 */

import { db } from '../db';
import { eq, desc, sql, inArray, and } from 'drizzle-orm';
import { userRatings, userWatchlist, userPreferences } from '@shared/schema';
import { tmdbService } from '../tmdb';
import { tmdbDatabaseService } from '../services/tmdbDatabaseService';
import { tfRecommendationModel } from './tfRecommendationModel';
import { tfDynamicWeightLearner } from './tfDynamicWeightLearner';
import { tfPatternModel } from './tfPatternRecognition';
import { diversityEngine } from './diversityEngine';
import type { DiversityCandidate } from './diversityEngine';
import { diversityMetrics } from '@shared/schema';

interface Candidate {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  source: string;
  score: number;
}

interface ScoredItem {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  score: number;
  features: {
    twoTowerScore: number;
    collaborativeScore: number;
    genreMatch: number;
    qualityScore: number;
    popularityScore: number;
  };
  sources: string[];
}

interface FinalRecommendation {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  score: number;
  diversityScore: number;
  reasons: string[];
  sources: string[];
  metadata?: any;
}

interface UserContext {
  userId: string;
  favoriteGenres: string[];
  averageRating: number;
  totalRatings: number;
  recentGenres: string[];
}

/**
 * Stage 1: Candidate Generation
 * Retrieves 1000-5000 candidates using multiple strategies
 */
export class CandidateGenerator {
  private genreMap: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
  };

  /**
   * Generate candidates from all retrieval strategies
   */
  async generate(userId: string, targetCount: number = 2000): Promise<Candidate[]> {
    console.log(`[Stage 1] Generating ${targetCount} candidates for user ${userId}`);
    
    const userContext = await this.buildUserContext(userId);
    
    // Run all retrieval strategies in parallel
    const [genreBased, collaborative, trending, topRated] = await Promise.all([
      this.genreRetrieval(userContext, Math.floor(targetCount * 0.4)),
      this.collaborativeRetrieval(userContext, Math.floor(targetCount * 0.3)),
      this.getTrending(Math.floor(targetCount * 0.2)),
      this.getTopRated(Math.floor(targetCount * 0.1))
    ]);

    // Merge and deduplicate
    const allCandidates = [...genreBased, ...collaborative, ...trending, ...topRated];
    const uniqueCandidates = this.deduplicateCandidates(allCandidates);
    
    console.log(`[Stage 1] Generated ${uniqueCandidates.length} unique candidates from ${allCandidates.length} total`);
    
    return uniqueCandidates.slice(0, targetCount);
  }

  /**
   * Build user context for retrieval (DATABASE-FIRST - no API calls)
   */
  private async buildUserContext(userId: string): Promise<UserContext> {
    const [ratings, preferences] = await Promise.all([
      db.select().from(userRatings).where(eq(userRatings.userId, userId)),
      db.select().from(userPreferences).where(eq(userPreferences.userId, userId))
    ]);

    // Calculate favorite genres - USE DATABASE BATCH QUERY (no API calls!)
    const genreFrequency: Record<string, number> = {};
    
    // Prepare batch request for metadata
    const batchItems = ratings.map(rating => ({
      tmdbId: rating.tmdbId,
      mediaType: rating.mediaType as 'movie' | 'tv',
      title: rating.title,
      posterPath: rating.posterPath
    }));
    
    // Fetch all metadata from database in ONE batch operation (no individual API calls)
    const metadataResults = await tmdbDatabaseService.getBatchMovieMetadata(batchItems);
    
    // Process all details from database results
    for (let i = 0; i < ratings.length; i++) {
      const rating = ratings[i];
      const metadataResult = metadataResults[i];
      const details = metadataResult?.metadata;
      
      if (details) {
        const genres = (details as any).genres || [];
        for (const genre of genres) {
          genreFrequency[genre.name] = (genreFrequency[genre.name] || 0) + (rating.rating / 10);
        }
      }
    }

    const favoriteGenres = Object.entries(genreFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => genre);

    // Recent genres (last 10 ratings) - use database results
    const recentGenreSet = new Set<string>();
    const recentMetadata = metadataResults.slice(-10);
    
    for (const metadataResult of recentMetadata) {
      const details = metadataResult?.metadata;
      if (details) {
        const genres = (details as any).genres || [];
        genres.forEach((g: any) => recentGenreSet.add(g.name));
      }
    }

    return {
      userId,
      favoriteGenres,
      averageRating: ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 7.0,
      totalRatings: ratings.length,
      recentGenres: Array.from(recentGenreSet)
    };
  }

  /**
   * Genre-based retrieval with pagination
   */
  private async genreRetrieval(context: UserContext, limit: number): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const genresToFetch = context.favoriteGenres.slice(0, 3);
    const pagesPerGenre = 5; // Fetch 5 pages per genre (~100 results per genre)

    for (const genre of genresToFetch) {
      const genreId = this.getGenreId(genre);
      if (!genreId) continue;

      try {
        // Fetch multiple pages in parallel
        const pagePromises = [];
        for (let page = 1; page <= pagesPerGenre; page++) {
          pagePromises.push(
            tmdbService.discoverMovies({
              with_genres: genreId.toString(),
              sort_by: 'popularity.desc',
              'vote_count.gte': '100',
              page: page.toString()
            })
          );
        }

        const pageResults = await Promise.all(pagePromises);
        
        // Combine all results from all pages
        for (const movies of pageResults) {
          const results = movies.results || [];
          for (const movie of results) {
            candidates.push({
              tmdbId: movie.id,
              mediaType: 'movie',
              title: movie.title || movie.name || 'Unknown',
              posterPath: movie.poster_path,
              source: `genre:${genre}`,
              score: 0.8
            });
          }
        }
      } catch (error) {
        console.error(`Error fetching genre ${genre}:`, error);
      }
    }

    return candidates;
  }

  /**
   * Collaborative filtering retrieval
   */
  private async collaborativeRetrieval(context: UserContext, limit: number): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    // Get similar users
    const similarUsers = await this.findSimilarUsers(context.userId, 10);
    
    if (similarUsers.length === 0) {
      return candidates;
    }

    // Get their highly rated items
    const similarUserIds = similarUsers.map(su => su.userId);
    const similarUsersRatings = await db
      .select()
      .from(userRatings)
      .where(
        sql`${userRatings.userId} IN (${sql.join(similarUserIds.map(id => sql`${id}`), sql`, `)}) 
        AND ${userRatings.rating} >= 8`
      )
      .limit(limit);

    for (const rating of similarUsersRatings) {
      candidates.push({
        tmdbId: rating.tmdbId,
        mediaType: rating.mediaType,
        title: rating.title,
        posterPath: rating.posterPath,
        source: 'collaborative',
        score: 0.7
      });
    }

    return candidates;
  }

  /**
   * Get trending items with pagination
   */
  private async getTrending(limit: number): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const pagesToFetch = 10; // Fetch 10 pages (~200 results)

    try {
      // Fetch multiple pages in parallel
      const pagePromises = [];
      for (let page = 1; page <= pagesToFetch; page++) {
        pagePromises.push(tmdbService.getTrendingAll(page));
      }

      const pageResults = await Promise.all(pagePromises);
      
      // Combine all results from all pages
      for (const trending of pageResults) {
        const results = trending.results || [];
        for (const movie of results) {
          candidates.push({
            tmdbId: movie.id,
            mediaType: movie.media_type || 'movie',
            title: movie.title || movie.name || 'Unknown',
            posterPath: movie.poster_path,
            source: 'trending',
            score: 0.6
          });
        }
      }
    } catch (error) {
      console.error('Error fetching trending:', error);
    }

    return candidates;
  }

  /**
   * Get top rated items with pagination
   */
  private async getTopRated(limit: number): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    const pagesToFetch = 10; // Fetch 10 pages (~200 results)

    try {
      // Fetch multiple pages in parallel
      const pagePromises = [];
      for (let page = 1; page <= pagesToFetch; page++) {
        pagePromises.push(tmdbService.getTopRatedMovies(page));
      }

      const pageResults = await Promise.all(pagePromises);
      
      // Combine all results from all pages
      for (const topRated of pageResults) {
        const results = topRated.results || [];
        for (const movie of results) {
          candidates.push({
            tmdbId: movie.id,
            mediaType: 'movie',
            title: movie.title || movie.name || 'Unknown',
            posterPath: movie.poster_path,
            source: 'top_rated',
            score: 0.7
          });
        }
      }
    } catch (error) {
      console.error('Error fetching top rated:', error);
    }

    return candidates;
  }

  /**
   * Find similar users using cosine similarity (OPTIMIZED with LIMIT)
   */
  private async findSimilarUsers(userId: string, limit: number): Promise<Array<{ userId: string; similarity: number }>> {
    // CRITICAL FIX: Limit the data we load to prevent memory issues
    const MAX_RATINGS_TO_LOAD = 10000; // Only load 10k most recent ratings
    
    // Get current user's ratings
    const currentUserRatings = await db
      .select()
      .from(userRatings)
      .where(eq(userRatings.userId, userId))
      .orderBy(desc(userRatings.createdAt));
    
    const userRatingsMap = new Map<string, number>();
    currentUserRatings.forEach(r => 
      userRatingsMap.set(`${r.tmdbId}_${r.mediaType}`, r.rating)
    );
    
    if (userRatingsMap.size === 0) {
      return [];
    }
    
    // Load limited set of other users' ratings (most recent)
    const otherRatings = await db
      .select()
      .from(userRatings)
      .where(sql`${userRatings.userId} != ${userId}`)
      .orderBy(desc(userRatings.createdAt))
      .limit(MAX_RATINGS_TO_LOAD);
    
    const otherUsersRatings = new Map<string, Map<string, number>>();
    otherRatings.forEach(r => {
      if (!otherUsersRatings.has(r.userId)) {
        otherUsersRatings.set(r.userId, new Map());
      }
      otherUsersRatings.get(r.userId)!.set(`${r.tmdbId}_${r.mediaType}`, r.rating);
    });
    
    const similarityScores: Array<{ userId: string; similarity: number }> = [];
    
    for (const [otherUserId, otherRatings] of Array.from(otherUsersRatings.entries())) {
      const commonItems: string[] = [];
      for (const itemKey of Array.from(userRatingsMap.keys())) {
        if (otherRatings.has(itemKey)) {
          commonItems.push(itemKey);
        }
      }
      
      if (commonItems.length < 2) continue;
      
      let dotProduct = 0, userMagnitude = 0, otherMagnitude = 0;
      
      for (const itemKey of commonItems) {
        const userRating = userRatingsMap.get(itemKey)!;
        const otherRating = otherRatings.get(itemKey)!;
        dotProduct += userRating * otherRating;
        userMagnitude += userRating * userRating;
        otherMagnitude += otherRating * otherRating;
      }
      
      const similarity = dotProduct / (Math.sqrt(userMagnitude) * Math.sqrt(otherMagnitude));
      similarityScores.push({ userId: otherUserId, similarity });
    }
    
    return similarityScores.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * Deduplicate candidates
   */
  private deduplicateCandidates(candidates: Candidate[]): Candidate[] {
    const seen = new Map<string, Candidate>();
    
    for (const candidate of candidates) {
      const key = `${candidate.tmdbId}_${candidate.mediaType}`;
      if (!seen.has(key) || seen.get(key)!.score < candidate.score) {
        seen.set(key, candidate);
      }
    }
    
    return Array.from(seen.values());
  }

  /**
   * Get genre ID from genre name
   */
  private getGenreId(genreName: string): number | null {
    const entry = Object.entries(this.genreMap).find(([_, name]) => name === genreName);
    return entry ? parseInt(entry[0]) : null;
  }
}

/**
 * Stage 2: Precision Ranking
 * Scores candidates using full feature set and ML models
 */
export class PrecisionRanker {
  private genreMap: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
  };

  /**
   * Rank candidates using ensemble of models
   */
  async rank(candidates: Candidate[], userId: string, limit: number = 200): Promise<ScoredItem[]> {
    console.log(`[Stage 2] Ranking ${candidates.length} candidates for user ${userId}`);
    
    // Filter out already rated/watchlisted items
    const [ratings, watchlist] = await Promise.all([
      db.select().from(userRatings).where(eq(userRatings.userId, userId)),
      db.select().from(userWatchlist).where(eq(userWatchlist.userId, userId))
    ]);
    
    const ratedIds = new Set(ratings.map(r => `${r.tmdbId}_${r.mediaType}`));
    const watchlistIds = new Set(watchlist.map(w => `${w.tmdbId}_${w.mediaType}`));
    
    const filteredCandidates = candidates.filter(c => {
      const key = `${c.tmdbId}_${c.mediaType}`;
      return !ratedIds.has(key) && !watchlistIds.has(key);
    });

    console.log(`[Stage 2] Filtered to ${filteredCandidates.length} unseen candidates`);

    // Get user preferences for genre matching
    const userPrefs = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
    const favoriteGenres = userPrefs[0]?.preferredGenres || [];

    // Get pattern recognition predictions (Phase 7 integration)
    let patternPrediction = null;
    try {
      patternPrediction = await tfPatternModel.predict(userId);
      console.log(`[Stage 2] Pattern prediction: nextGenre=${patternPrediction.nextGenre}, sessionType=${patternPrediction.sessionType}`);
    } catch (error) {
      console.log('[Stage 2] Pattern prediction unavailable (model not trained)');
    }

    // Score candidates with TensorFlow.js model (uses fallback if model not trained)
    const twoTowerScores = await Promise.all(
      filteredCandidates.map(async (candidate) => {
        try {
          const score = await tfRecommendationModel.predictScore(
            userId,
            candidate.tmdbId,
            candidate.mediaType
          );
          return {
            tmdbId: candidate.tmdbId,
            mediaType: candidate.mediaType,
            score
          };
        } catch (error) {
          // Fallback to candidate base score if prediction fails
          console.warn(`[Stage 2] Failed to score ${candidate.tmdbId}, using fallback`);
          return {
            tmdbId: candidate.tmdbId,
            mediaType: candidate.mediaType,
            score: candidate.score || 0.5
          };
        }
      })
    );

    const twoTowerMap = new Map(twoTowerScores.map((s: { tmdbId: number; mediaType: string; score: number }) => [`${s.tmdbId}_${s.mediaType}`, s.score]));

    // Get dynamic weights
    const weights = await tfDynamicWeightLearner.getAdaptiveWeights(userId);

    // Score each candidate with ensemble (using cached data, NO TMDB calls)
    const scoredItems: ScoredItem[] = [];

    for (const candidate of filteredCandidates) {
      try {
        const key = `${candidate.tmdbId}_${candidate.mediaType}`;
        const twoTowerScore = twoTowerMap.get(key) || 0;

        // Use candidate's base score for quality (from TMDB discover/trending)
        const qualityScore = candidate.score || 0.5;
        
        // Collaborative score from candidate source
        const collaborativeScore = candidate.source === 'collaborative' ? 0.8 : 0.0;

        // Genre match using candidate source (genre-based retrieval already filtered by genre)
        const genreMatch = candidate.source === 'genre-based' ? 0.8 : 0.3;

        // Popularity from source priority
        const popularityScore = candidate.source === 'trending' ? 0.9 : 0.5;

        // Pattern recognition boost (Phase 7) - skip for now, no genre data
        const patternBoost = 0;

        // Ensemble scoring (weighted combination) - simplified without TMDB calls
        const rawEnsembleScore = 
          twoTowerScore * 0.50 +                    // 50% TensorFlow.js model
          genreMatch * weights.genreMatch * 0.25 +   // 25% Genre match (estimated)
          collaborativeScore * 0.15 +                // 15% Collaborative
          qualityScore * weights.ratingQuality * 0.10; // 10% Quality (from candidate)

        // Normalize score to 0-1 range for ML recommendation scores
        // This ensures frontend display shows proper percentages (0-100%)
        const ensembleScore = Math.min(1.0, Math.max(0.0, rawEnsembleScore));

        scoredItems.push({
          tmdbId: candidate.tmdbId,
          mediaType: candidate.mediaType,
          title: candidate.title,
          posterPath: candidate.posterPath,
          score: ensembleScore,
          features: {
            twoTowerScore,
            collaborativeScore,
            genreMatch,
            qualityScore,
            popularityScore
          },
          sources: [candidate.source, 'TensorFlow.js', 'Dynamic Weights']
        });
      } catch (error) {
        console.error(`Error scoring candidate ${candidate.tmdbId}:`, error);
      }
    }

    // Sort by ensemble score and return top N
    const rankedItems = scoredItems.sort((a, b) => b.score - a.score).slice(0, limit);
    
    console.log(`[Stage 2] Ranked top ${rankedItems.length} items`);
    
    return rankedItems;
  }
}

/**
 * Stage 3: Re-ranking & Diversification
 * Applies business rules and diversity constraints
 */
export class ReRanker {
  /**
   * Re-rank with diversity and exploration
   */
  async rerank(scored: ScoredItem[], limit: number = 50): Promise<FinalRecommendation[]> {
    console.log(`[Stage 3] Re-ranking ${scored.length} items with diversity`);
    
    // Apply Maximal Marginal Relevance (MMR) for diversity
    const diversified = this.applyMMR(scored, limit * 2, 0.7); // lambda = 0.7 (70% relevance, 30% diversity)
    
    // Apply genre balancing
    const balanced = this.balanceGenres(diversified);
    
    // Add exploration (10% random highly-rated items)
    const explored = this.addExploration(balanced, 0.1);
    
    // Fetch TMDB metadata from database (with API fallback) in one batch operation
    const exploredLimited = explored.slice(0, limit);
    
    // Prepare batch request
    const batchItems = exploredLimited.map(item => ({
      tmdbId: item.tmdbId,
      mediaType: item.mediaType as 'movie' | 'tv',
      title: item.title,
      posterPath: item.posterPath,
    }));
    
    // Fetch all metadata in one optimized batch
    const metadataResults = await tmdbDatabaseService.getBatchMovieMetadata(batchItems);
    
    // Map results to final recommendations
    const finalRecs = exploredLimited.map((item, index) => {
      const metadataResult = metadataResults[index];
      const details = metadataResult?.metadata;
      
      if (!details) {
        // If no details returned, use default metadata
        return {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
          score: item.score,
          diversityScore: this.calculateDiversityScore(item, explored),
          strategy: this.deriveStrategy(item.sources),
          reasons: this.generateReasons(item),
          sources: item.sources,
          metadata: {
            voteAverage: 0,
            vote_average: 0,
            releaseDate: '',
            release_date: '',
            overview: '',
            genres: [],
            genreIds: [],
            genre_ids: [],
            runtime: null
          }
        };
      }
      
      return {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: details.poster_path || item.posterPath,
        score: item.score,
        diversityScore: this.calculateDiversityScore(item, explored),
        strategy: this.deriveStrategy(item.sources),
        reasons: this.generateReasons(item),
        sources: item.sources,
        metadata: {
          voteAverage: details.vote_average || 0,
          vote_average: details.vote_average || 0,
          releaseDate: (details as any).release_date || (details as any).first_air_date || '',
          release_date: (details as any).release_date || (details as any).first_air_date || '',
          overview: details.overview || '',
          genres: (details as any).genres || [],
          genreIds: details.genre_ids || [],
          genre_ids: details.genre_ids || [],
          runtime: (details as any).runtime || null
        }
      };
    });

    console.log(`[Stage 3] Final ${finalRecs.length} recommendations with diversity and metadata`);
    
    return finalRecs;
  }

  /**
   * Derive a strategy name from sources array
   * Converts sources like ['genre:Action', 'TensorFlow.js'] to 'pipeline'
   */
  private deriveStrategy(sources: string[]): string {
    // Always return 'pipeline' for multi-stage pipeline recommendations
    // since they use ensemble scoring combining multiple strategies
    return 'pipeline';
  }

  /**
   * Maximal Marginal Relevance (MMR) algorithm
   * Balances relevance and diversity
   */
  private applyMMR(items: ScoredItem[], limit: number, lambda: number): ScoredItem[] {
    if (items.length === 0) return [];

    const selected: ScoredItem[] = [];
    const remaining = [...items];

    // Select first item (highest score)
    selected.push(remaining.shift()!);

    // Iteratively select items that maximize MMR
    while (selected.length < limit && remaining.length > 0) {
      let bestMMRScore = -Infinity;
      let bestIndex = 0;

      for (let i = 0; i < remaining.length; i++) {
        const item = remaining[i];
        
        // Calculate max similarity to already selected items
        const maxSimilarity = Math.max(...selected.map(s => this.calculateSimilarity(item, s)));
        
        // MMR score: λ * relevance - (1-λ) * maxSimilarity
        const mmrScore = lambda * item.score - (1 - lambda) * maxSimilarity;
        
        if (mmrScore > bestMMRScore) {
          bestMMRScore = mmrScore;
          bestIndex = i;
        }
      }

      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
  }

  /**
   * Calculate similarity between two items (based on genres)
   */
  private calculateSimilarity(item1: ScoredItem, item2: ScoredItem): number {
    // Simple similarity: same genre = high similarity
    // In production, use embedding cosine similarity
    
    // For now, penalize items from same source
    if (item1.sources[0] === item2.sources[0]) {
      return 0.7;
    }
    return 0.3;
  }

  /**
   * Balance genres to avoid filter bubbles
   */
  private balanceGenres(items: ScoredItem[]): ScoredItem[] {
    const result: ScoredItem[] = [];
    const genreCount = new Map<string, number>();

    for (const item of items) {
      const primarySource = item.sources[0];
      const count = genreCount.get(primarySource) || 0;
      
      // Penalize if too many consecutive items from same source/genre
      if (count >= 3) {
        // Add penalty to score
        item.score *= 0.8;
      }
      
      result.push(item);
      genreCount.set(primarySource, count + 1);
    }

    // Re-sort after penalties
    return result.sort((a, b) => b.score - a.score);
  }

  /**
   * Add exploration items (serendipity)
   */
  private addExploration(items: ScoredItem[], explorationRate: number): ScoredItem[] {
    const explorationCount = Math.floor(items.length * explorationRate);
    
    if (explorationCount === 0) return items;

    // Take some random items from lower ranks (but still good quality)
    const explorationCandidates = items.slice(items.length / 2);
    const randomExploration = explorationCandidates
      .sort(() => Math.random() - 0.5)
      .slice(0, explorationCount);

    // Mix exploration items into results
    const result = [...items.slice(0, items.length - explorationCount), ...randomExploration];
    
    return result;
  }

  /**
   * Calculate diversity score for an item
   */
  private calculateDiversityScore(item: ScoredItem, allItems: ScoredItem[]): number {
    const avgSimilarity = allItems
      .filter(other => other.tmdbId !== item.tmdbId)
      .map(other => this.calculateSimilarity(item, other))
      .reduce((sum, sim) => sum + sim, 0) / Math.max(allItems.length - 1, 1);
    
    return 1 - avgSimilarity; // Higher score = more diverse
  }

  /**
   * Generate human-readable reasons
   */
  private generateReasons(item: ScoredItem): string[] {
    const reasons: string[] = [];

    if (item.features.twoTowerScore > 0.7) {
      reasons.push(`Strong neural network match (${(item.features.twoTowerScore * 100).toFixed(0)}%)`);
    }

    if (item.features.genreMatch > 0.5) {
      reasons.push('Matches your favorite genres');
    }

    if (item.features.collaborativeScore > 0.5) {
      reasons.push('Loved by similar users');
    }

    if (item.features.qualityScore > 0.8) {
      reasons.push('Highly rated by critics');
    }

    if (reasons.length === 0) {
      reasons.push('Recommended for you');
    }

    return reasons;
  }
}

/**
 * Multi-Stage Pipeline Orchestrator
 */
export class MultiStagePipeline {
  private candidateGenerator = new CandidateGenerator();
  private precisionRanker = new PrecisionRanker();
  private reRanker = new ReRanker();

  /**
   * Get recommendations using full pipeline
   */
  async getRecommendations(
    userId: string,
    options: {
      candidateCount?: number;
      rankingLimit?: number;
      finalLimit?: number;
    } = {}
  ): Promise<FinalRecommendation[]> {
    const {
      candidateCount = 2000,
      rankingLimit = 200,
      finalLimit = 50
    } = options;

    console.log(`\n=== Multi-Stage Pipeline for user ${userId} ===`);
    console.log(`Candidates: ${candidateCount} → Ranking: ${rankingLimit} → Final: ${finalLimit}\n`);

    // Stage 1: Generate candidates
    const candidates = await this.candidateGenerator.generate(userId, candidateCount);

    // Stage 2: Precision ranking
    const ranked = await this.precisionRanker.rank(candidates, userId, rankingLimit);

    // Stage 3: Re-ranking & diversification
    const final = await this.reRanker.rerank(ranked, finalLimit);

    console.log(`\n=== Pipeline Complete: ${final.length} recommendations ===\n`);

    // Track diversity metrics asynchronously (don't block response)
    this.trackDiversityMetrics(userId, final, 'multi-stage-pipeline').catch(err => {
      console.error('[Pipeline] Failed to track diversity metrics:', err);
    });

    return final;
  }

  /**
   * Track diversity metrics for recommendations
   */
  private async trackDiversityMetrics(
    userId: string,
    recommendations: FinalRecommendation[],
    recommendationType: string
  ): Promise<void> {
    // Skip diversity metrics tracking for guest/demo users to avoid foreign key violations
    if (userId === 'guest' || userId === 'demo_user') {
      console.log('[Pipeline] Skipping diversity metrics for guest/demo user');
      return;
    }

    try {
      // Get user's genre preferences for diversity calculation
      const [ratings, preferences] = await Promise.all([
        db.select().from(userRatings).where(eq(userRatings.userId, userId)).limit(50),
        db.select().from(userPreferences).where(eq(userPreferences.userId, userId))
      ]);

      // Extract genre preferences
      const userGenrePreferences: string[] = [];
      if (preferences.length > 0 && preferences[0].preferredGenres) {
        userGenrePreferences.push(...preferences[0].preferredGenres);
      }

      // Get genres from recommendations using batch database lookup
      const metadataResults = await tmdbDatabaseService.getBatchMovieMetadata(
        recommendations.map(rec => ({
          tmdbId: rec.tmdbId,
          mediaType: rec.mediaType as 'movie' | 'tv',
          title: rec.title,
          posterPath: rec.posterPath || null
        }))
      );
      
      const recsWithGenres = recommendations.map((rec, index) => {
        const metadataResult = metadataResults[index];
        const details = metadataResult?.metadata;
        return {
          ...rec,
          genres: details?.genre_ids ? details.genre_ids.map((id: number) => this.genreIdToName(id)) : []
        };
      });

      // Convert to DiversityCandidate format
      const candidates: DiversityCandidate[] = recsWithGenres.map(rec => ({
        id: `${rec.tmdbId}_${rec.mediaType}`,
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        score: rec.score,
        genres: rec.genres
      }));

      // Calculate metrics
      const metrics = diversityEngine.calculateMetrics(candidates, userGenrePreferences);

      // Persist to database
      await db.insert(diversityMetrics).values({
        userId,
        recommendationType,
        intraDiversity: metrics.intraDiversity,
        genreBalance: metrics.genreBalance,
        serendipityScore: metrics.serendipityScore,
        explorationRate: metrics.explorationRate,
        coverageScore: metrics.coverageScore,
        recommendationCount: recommendations.length,
        diversityConfig: {
          lambda: 0.7,
          epsilonExploration: 0.1,
          maxConsecutiveSameGenre: 3,
          serendipityRate: 0.15,
          diversityMetric: 'mmr'
        }
      });

      console.log('[Pipeline] Diversity metrics tracked:', {
        intraDiversity: metrics.intraDiversity.toFixed(3),
        genreBalance: metrics.genreBalance.toFixed(3),
        serendipityScore: metrics.serendipityScore.toFixed(3)
      });
    } catch (error) {
      console.error('[Pipeline] Error tracking diversity metrics:', error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Helper to convert genre ID to name
   */
  private genreIdToName(id: number): string {
    const genreMap: Record<number, string> = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
      27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
      10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
    };
    return genreMap[id] || 'Unknown';
  }
}

// Export singleton instance
export const multiStagePipeline = new MultiStagePipeline();
