/**
 * Unified TensorFlow.js Recommendation Service
 * 
 * Consolidates all recommendation functionality into one robust TensorFlow.js-based service:
 * - Replaces: recommendationEngine.ts, advancedRecommendationEngine.ts, aiRecommendationService.ts
 * - Uses: Multi-stage pipeline, contextual bandits, lambda architecture, diversity engine
 * - Integrates with: Gemini AI for natural language understanding
 */

import { db } from '../db';
import { eq, desc, sql, inArray, and, not } from 'drizzle-orm';
import {
  userRatings,
  userWatchlist,
  userPreferences,
  diversityMetrics,
  type InsertDiversityMetrics
} from '@shared/schema';
import type { TMDBMovie, TMDBGenre } from '@shared/tmdb-types';
import type { RecommendationRequest, RecommendationResult, RecommendationResponse } from '@shared/ml-types';
import { tmdbService } from '../tmdb';
import { multiStagePipeline } from './multiStagePipeline';
import { contextualBanditEngine } from './contextualBandits';
import { lambdaArchitecture } from './lambdaArchitecture';
import { diversityEngine, type DiversityCandidate, type DiversityConfig } from './diversityEngine';
import { explainabilityEngine } from './explainability';
import { tfPatternModel } from './tfPatternRecognition';

interface TMDBMediaItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  media_type?: string;
  genre_ids?: number[];
  genres?: TMDBGenre[];
  overview?: string;
  release_date?: string;
  first_air_date?: string;
}

interface PipelineRecommendation {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  score: number;
  diversityScore: number;
  reasons: string[];
  sources: string[];
  explanation?: {
    primaryReason: string;
    contributingFactors: Array<{
      featureName: string;
      importance: number;
      percentageContribution: number;
      humanReadable: string;
    }>;
    confidenceScore: number;
    explanationText?: string;
  };
  metadata?: {
    genres?: string[];
    voteAverage?: number;
    releaseDate?: string;
    overview?: string;
    [key: string]: unknown;
  };
}

interface LambdaRecommendation {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  score: number;
  reason?: string;
  diversityScore?: number;
  metadata?: {
    [key: string]: unknown;
  };
}

interface RecommendationContext {
  userId: string;
  requestType: 'general' | 'mood' | 'similar' | 'trending' | 'personalized';
  mood?: string;
  basedOnTmdbId?: number;
  basedOnMediaType?: string;
  limit?: number;
  useDiversity?: boolean;
  diversityConfig?: Partial<DiversityConfig>;
}

interface UnifiedRecommendation {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  score: number;
  confidence: number;
  reason: string;
  type: 'tensorflow' | 'hybrid' | 'collaborative' | 'content' | 'contextual_bandit' | 'pattern_lstm';
  explanation?: {
    primaryReason: string;
    contributingFactors: string[];
    confidence: number;
  };
  diversityScore?: number;
  strategy?: string;
  metadata?: {
    mood?: string;
    genres?: string[];
    voteAverage?: number;
    releaseDate?: string;
    overview?: string;
    [key: string]: unknown;
  };
}

/**
 * Unified Recommendation Service
 * Single entry point for all recommendation types
 */
export class UnifiedRecommendationService {
  private genreMap: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Science Fiction",
    10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western"
  };

  /**
   * Main recommendation method - routes to appropriate strategy
   */
  async getRecommendations(context: RecommendationContext): Promise<UnifiedRecommendation[]> {
    console.log(`[UnifiedRec] Getting ${context.requestType} recommendations for user ${context.userId}`);

    try {
      switch (context.requestType) {
        case 'general':
        case 'personalized':
          return await this.getPersonalizedRecommendations(context);
        
        case 'mood':
          return await this.getMoodBasedRecommendations(context);
        
        case 'similar':
          return await this.getSimilarRecommendations(context);
        
        case 'trending':
          return await this.getTrendingRecommendations(context);
        
        default:
          return await this.getPersonalizedRecommendations(context);
      }
    } catch (error) {
      console.error('[UnifiedRec] Error:', error);
      // Fallback to simple trending recommendations
      return await this.getTrendingRecommendations({ ...context, limit: context.limit || 20 });
    }
  }

  /**
   * Personalized recommendations using full ML pipeline
   */
  private async getPersonalizedRecommendations(context: RecommendationContext): Promise<UnifiedRecommendation[]> {
    const limit = context.limit || 50;

    // Strategy 1: Use Lambda Architecture (batch + real-time)
    try {
      const lambdaRecs = await lambdaArchitecture.getRecommendations(context.userId, limit);
      
      if (lambdaRecs && Array.isArray(lambdaRecs) && lambdaRecs.length > 0) {
        console.log(`[UnifiedRec] Using Lambda Architecture: ${lambdaRecs.length} recommendations`);
        return this.formatLambdaRecommendations(lambdaRecs, context);
      }
    } catch (error) {
      console.log('[UnifiedRec] Lambda Architecture not available, using multi-stage pipeline');
    }

    // Strategy 2: Use Multi-Stage Pipeline with Contextual Bandits
    const userContext = await this.buildUserContext(context.userId);
    
    // Get bandit recommendation (which strategy to use)
    const banditContext = {
      userId: context.userId,
      timeOfDay: this.getTimeOfDay() as 'morning' | 'afternoon' | 'evening' | 'night',
      dayOfWeek: new Date().getDay() < 5 ? 'weekday' as const : 'weekend' as const,
      sessionDuration: 0,
      recentInteractionCount: 0,
      recentGenres: userContext.favoriteGenres.slice(0, 3),
    };

    const banditSelection = await contextualBanditEngine.selectContextualArm(banditContext);
    console.log(`[UnifiedRec] Bandit selected: ${banditSelection.armChosen} (reward: ${banditSelection.sampledReward.toFixed(3)})`);

    // Get recommendations from multi-stage pipeline
    const pipelineRecs = await multiStagePipeline.getRecommendations(context.userId, {
      candidateCount: 2000,
      rankingLimit: 200,
      finalLimit: limit * 2 // Get more for diversity filtering
    });

    // Apply diversity if requested
    let finalRecs = pipelineRecs;
    if (context.useDiversity !== false) {
      finalRecs = await this.applyDiversityOptimization(
        pipelineRecs,
        userContext.favoriteGenres,
        context.diversityConfig
      );
    }

    // Track diversity metrics
    await this.trackDiversityMetrics(context.userId, finalRecs, banditSelection.armChosen);

    // Add explanations
    const recsWithExplanations = await this.addExplanations(finalRecs.slice(0, limit), context.userId);

    return recsWithExplanations.map(rec => ({
      tmdbId: rec.tmdbId,
      mediaType: rec.mediaType,
      title: rec.title,
      posterPath: rec.posterPath,
      score: rec.score,
      confidence: rec.explanation?.confidenceScore || rec.diversityScore || 0.8,
      reason: rec.reasons[0] || 'Recommended for you',
      type: 'tensorflow' as const,
      explanation: rec.explanation ? {
        primaryReason: rec.explanation.primaryReason,
        contributingFactors: rec.explanation.contributingFactors.map(f => f.humanReadable),
        confidence: rec.explanation.confidenceScore
      } : undefined,
      diversityScore: rec.diversityScore,
      metadata: rec.metadata,
      strategy: banditSelection.armChosen // Include the strategy selected by contextual bandit
    }));
  }

  /**
   * Mood-based recommendations using pattern recognition
   */
  private async getMoodBasedRecommendations(context: RecommendationContext): Promise<UnifiedRecommendation[]> {
    const limit = context.limit || 20;
    const mood = context.mood || 'happy';

    console.log(`[UnifiedRec] Mood-based recommendations for mood: ${mood}`);

    // Use pattern recognition to predict what user might like based on mood
    const userContext = await this.buildUserContext(context.userId);
    
    // Get mood-appropriate candidates
    const moodGenres = this.getMoodGenres(mood);
    const candidates = await this.getCandidatesByGenres(moodGenres, limit * 3);

    // Apply ML ranking
    const pipelineRecs = await multiStagePipeline.getRecommendations(context.userId, {
      candidateCount: 1000,
      rankingLimit: 100,
      finalLimit: limit
    });

    return pipelineRecs.slice(0, limit).map(rec => ({
      tmdbId: rec.tmdbId,
      mediaType: rec.mediaType,
      title: rec.title,
      posterPath: rec.posterPath,
      score: rec.score,
      confidence: 0.75,
      reason: `Perfect for when you're feeling ${mood}`,
      type: 'pattern_lstm' as const,
      diversityScore: rec.diversityScore,
      metadata: { mood, ...rec.metadata }
    }));
  }

  /**
   * Similar item recommendations
   */
  private async getSimilarRecommendations(context: RecommendationContext): Promise<UnifiedRecommendation[]> {
    if (!context.basedOnTmdbId) {
      return await this.getPersonalizedRecommendations(context);
    }

    const limit = context.limit || 20;
    const mediaType = context.basedOnMediaType || 'movie';

    // Get similar items from TMDB
    const similar = mediaType === 'tv'
      ? await tmdbService.getSimilarTVShows(context.basedOnTmdbId.toString())
      : await tmdbService.getSimilarMovies(context.basedOnTmdbId.toString());

    if (!similar || !similar.results) {
      return [];
    }

    return similar.results.slice(0, limit).map((item: TMDBMediaItem) => ({
      tmdbId: item.id,
      mediaType,
      title: item.title || item.name || 'Unknown',
      posterPath: item.poster_path,
      score: item.vote_average / 10,
      confidence: 0.7,
      reason: 'Similar to what you viewed',
      type: 'content' as const,
      metadata: {
        voteAverage: item.vote_average,
        overview: item.overview,
        releaseDate: item.release_date || item.first_air_date
      }
    }));
  }

  /**
   * Trending recommendations
   */
  private async getTrendingRecommendations(context: RecommendationContext): Promise<UnifiedRecommendation[]> {
    const limit = context.limit || 20;

    // Get trending from TMDB
    const trending = await tmdbService.getTrendingAll(1);

    const allTrending = (trending?.results || []).map((item: TMDBMediaItem) => ({
      ...item,
      mediaType: item.media_type || 'movie'
    }));

    return allTrending.slice(0, limit).map((item: TMDBMediaItem & { mediaType: string }) => ({
      tmdbId: item.id,
      mediaType: item.mediaType,
      title: item.title || item.name || 'Unknown',
      posterPath: item.poster_path,
      score: item.vote_average / 10,
      confidence: 0.6,
      reason: 'Trending now',
      type: 'collaborative' as const,
      metadata: {
        voteAverage: item.vote_average,
        overview: item.overview,
        releaseDate: item.release_date || item.first_air_date
      }
    }));
  }

  /**
   * Apply diversity optimization
   */
  private async applyDiversityOptimization(
    recommendations: PipelineRecommendation[],
    userGenres: string[],
    configOverride?: Partial<DiversityConfig>
  ): Promise<PipelineRecommendation[]> {
    const diversityConfig: DiversityConfig = {
      lambda: 0.7, // Balance relevance vs diversity
      epsilonExploration: 0.1, // 10% exploration
      maxConsecutiveSameGenre: 3,
      serendipityRate: 0.15, // 15% surprising recommendations
      diversityMetric: 'hybrid',
      ...configOverride
    };

    // Convert to diversity candidates
    const candidates: DiversityCandidate[] = recommendations.map(rec => ({
      id: `${rec.tmdbId}_${rec.mediaType}`,
      tmdbId: rec.tmdbId,
      mediaType: rec.mediaType,
      score: rec.score,
      genres: this.extractGenres(rec),
      metadata: rec
    }));

    // Apply diversity
    const diversified = await diversityEngine.applyDiversity(
      candidates,
      diversityConfig,
      userGenres
    );

    // Calculate diversity metrics
    const metrics = diversityEngine.calculateMetrics(diversified, userGenres);
    console.log('[UnifiedRec] Diversity metrics:', metrics);

    // Convert back to recommendations
    return diversified.map(d => {
      const metadata = d.metadata as PipelineRecommendation;
      return {
        ...metadata,
        diversityScore: metrics.intraDiversity,
        metadata: {
          ...metadata.metadata,
          diversityMetrics: metrics
        }
      };
    });
  }

  /**
   * Add explanations to recommendations
   */
  private async addExplanations(recommendations: PipelineRecommendation[], userId: string): Promise<PipelineRecommendation[]> {
    const explained = await Promise.all(
      recommendations.map(async rec => {
        try {
          const explanation = await explainabilityEngine.explainRecommendation(
            userId,
            rec.tmdbId,
            rec.mediaType || 'movie'
          );
          return { ...rec, explanation };
        } catch (error) {
          console.error('[UnifiedRec] Error adding explanation:', error);
          return rec;
        }
      })
    );

    return explained;
  }

  /**
   * Track diversity metrics
   */
  private async trackDiversityMetrics(
    userId: string,
    recommendations: PipelineRecommendation[],
    recommendationType: string
  ): Promise<void> {
    // Skip diversity metrics tracking for guest/demo users to avoid foreign key violations
    if (userId === 'guest' || userId === 'demo_user') {
      console.log('[UnifiedRec] Skipping diversity metrics for guest/demo user');
      return;
    }

    try {
      const userGenres = await this.getUserFavoriteGenres(userId);
      
      const candidates: DiversityCandidate[] = recommendations.map(rec => ({
        id: `${rec.tmdbId}_${rec.mediaType}`,
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        score: rec.score,
        genres: this.extractGenres(rec),
      }));

      const metrics = diversityEngine.calculateMetrics(candidates, userGenres);

      const diversityMetric: InsertDiversityMetrics = {
        userId,
        sessionId: null,
        recommendationType,
        intraDiversity: metrics.intraDiversity,
        genreBalance: metrics.genreBalance,
        serendipityScore: metrics.serendipityScore,
        explorationRate: metrics.explorationRate,
        coverageScore: metrics.coverageScore,
        diversityConfig: { lambda: 0.7, epsilon: 0.1 },
        recommendationCount: recommendations.length,
      };

      await db.insert(diversityMetrics).values(diversityMetric);
    } catch (error) {
      console.error('[UnifiedRec] Error tracking diversity metrics:', error);
    }
  }

  /**
   * Helper: Build user context
   */
  private async buildUserContext(userId: string): Promise<{
    favoriteGenres: string[];
    averageRating: number;
    totalRatings: number;
    recentGenres: string[];
  }> {
    const [ratings, preferences] = await Promise.all([
      db.select().from(userRatings).where(eq(userRatings.userId, userId)),
      db.select().from(userPreferences).where(eq(userPreferences.userId, userId))
    ]);

    const favoriteGenres = preferences[0]?.preferredGenres || [];
    const averageRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : 5;

    return {
      favoriteGenres,
      averageRating,
      totalRatings: ratings.length,
      recentGenres: favoriteGenres.slice(0, 3)
    };
  }

  /**
   * Helper: Format Lambda recommendations
   */
  private formatLambdaRecommendations(lambdaRecs: LambdaRecommendation[], context: RecommendationContext): UnifiedRecommendation[] {
    return lambdaRecs.map(rec => ({
      tmdbId: rec.tmdbId,
      mediaType: rec.mediaType,
      title: rec.title,
      posterPath: rec.posterPath,
      score: rec.score,
      confidence: 0.85,
      reason: rec.reason || 'Recommended for you',
      type: 'tensorflow' as const,
      diversityScore: rec.diversityScore,
      metadata: rec.metadata || {}
    }));
  }

  /**
   * Helper: Get time of day
   */
  private getTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Helper: Get mood genres
   */
  private getMoodGenres(mood: string): string[] {
    const moodMap: Record<string, string[]> = {
      happy: ['Comedy', 'Animation', 'Family', 'Adventure'],
      romantic: ['Romance', 'Drama'],
      energetic: ['Action', 'Adventure', 'Thriller'],
      thoughtful: ['Drama', 'Documentary', 'Mystery'],
      adventurous: ['Adventure', 'Science Fiction', 'Fantasy'],
      scary: ['Horror', 'Thriller', 'Mystery'],
      relaxed: ['Comedy', 'Family', 'Animation']
    };

    return moodMap[mood] || moodMap.happy;
  }

  /**
   * Helper: Get candidates by genres
   */
  private async getCandidatesByGenres(genres: string[], limit: number): Promise<TMDBMediaItem[]> {
    // This is a simplified version - in production, query TMDB or cache
    const genreIds = genres.map(g => 
      Object.entries(this.genreMap).find(([_, name]) => name === g)?.[0]
    ).filter(Boolean).map(Number);

    const candidates = [];
    for (const genreId of genreIds.slice(0, 2)) {
      const results = await tmdbService.discoverMovies({ with_genres: genreId.toString() });
      if (results?.results) {
        candidates.push(...results.results.slice(0, limit / 2));
      }
    }

    return candidates;
  }

  /**
   * Helper: Extract genres from recommendation
   */
  private extractGenres(rec: PipelineRecommendation | TMDBMediaItem): string[] {
    // Check TMDBMediaItem genres (TMDBGenre[])
    if ('genre_ids' in rec && rec.genre_ids) {
      return rec.genre_ids.map((id: number) => this.genreMap[id]).filter((g): g is string => Boolean(g));
    }
    if ('genres' in rec && rec.genres && Array.isArray(rec.genres) && rec.genres.length > 0) {
      const firstGenre = rec.genres[0];
      if (typeof firstGenre === 'object' && firstGenre !== null && 'name' in firstGenre) {
        return (rec.genres as TMDBGenre[]).map((g: TMDBGenre) => g.name);
      }
    }
    // Check PipelineRecommendation metadata genres (string[])
    if ('metadata' in rec && rec.metadata?.genres && Array.isArray(rec.metadata.genres)) {
      return rec.metadata.genres;
    }
    if ('metadata' in rec && rec.metadata && 'genre_ids' in rec.metadata) {
      const genreIds = rec.metadata.genre_ids as number[] | undefined;
      if (genreIds && Array.isArray(genreIds)) {
        return genreIds.map((id: number) => this.genreMap[id]).filter((g): g is string => Boolean(g));
      }
    }
    return [];
  }

  /**
   * Helper: Get user favorite genres
   */
  private async getUserFavoriteGenres(userId: string): Promise<string[]> {
    const preferences = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
    return preferences[0]?.preferredGenres || [];
  }
}

// Export singleton
export const unifiedRecommendationService = new UnifiedRecommendationService();
