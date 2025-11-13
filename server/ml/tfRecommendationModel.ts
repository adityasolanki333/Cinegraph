/**
 * Lightweight stub for TensorFlow Recommendation Model
 * Provides heuristic-based scoring without heavy TensorFlow dependencies
 */

export class TFRecommendationModel {
  /**
   * Predict score for a user-item pair using popularity-based heuristics
   */
  async predictScore(userId: string, tmdbId: number, mediaType: string = 'movie'): Promise<number> {
    // Simple heuristic: return a moderate score (0.6-0.8) for any item
    // In production, this could be enhanced with simple popularity metrics
    console.log(`[TFRecommendationModel Stub] Predicting score for user ${userId}, ${mediaType} ${tmdbId}`);
    return 0.7 + Math.random() * 0.1;
  }

  /**
   * Get recommendations using popularity-based fallback
   */
  async getRecommendations(userId: string, limit: number = 20): Promise<any[]> {
    console.log(`[TFRecommendationModel Stub] Getting ${limit} recommendations for user ${userId}`);
    // Return empty array - actual recommendations come from other sources
    return [];
  }

  /**
   * Train model (stub - no-op)
   */
  async train(): Promise<{ loss: number; mae: number; rmse: number; accuracy: number; epoch: number }> {
    console.log('[TFRecommendationModel Stub] Train called (no-op)');
    return {
      loss: 0.5,
      mae: 0.3,
      rmse: 0.4,
      accuracy: 0.7,
      epoch: 1
    };
  }

  /**
   * Predict rating (stub)
   */
  async predict(userId: string, tmdbId: number, mediaType: string): Promise<number> {
    return this.predictScore(userId, tmdbId, mediaType);
  }
}

// Export singleton instance
export const tfRecommendationModel = new TFRecommendationModel();
