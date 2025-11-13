import { Router } from "express";
import { z } from "zod";
import { unifiedRecommendationService } from "../ml/unifiedRecommendationService";
import { db } from "../db";
import { userPreferences, recommendations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { handleApiError, handleValidationError } from "../utils/error-handler";

const router = Router();

// ===== Unified Recommendation Schemas (Phase 10) =====

const UnifiedRecommendationRequestSchema = z.object({
  userId: z.string(),
  context: z.object({
    requestType: z.enum(['personalized', 'similar', 'mood', 'search', 'auto']),
    query: z.string().optional(),
    mood: z.string().optional(),
    basedOn: z.object({
      tmdbId: z.number(),
      mediaType: z.string()
    }).optional(),
    preferences: z.any().optional()
  }),
  options: z.object({
    limit: z.number().default(20),
    useDiversity: z.boolean().default(true),
    explainability: z.boolean().default(false)
  }).optional().default({ limit: 20, useDiversity: true, explainability: false })
});

type UnifiedRecommendationRequest = z.infer<typeof UnifiedRecommendationRequestSchema>;

/**
 * Helper function to enrich context with user preferences and history
 */
async function enrichContext(req: UnifiedRecommendationRequest) {
  const { userId, context } = req;
  
  // Pull user preferences from database if not provided
  let userPrefs = context.preferences;
  if (!userPrefs) {
    const prefsResult = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    
    userPrefs = prefsResult[0] || null;
  }
  
  // Build enriched context for contextual bandit
  const { contextualBanditEngine } = await import("../ml/contextualBandits");
  const banditContext = await contextualBanditEngine.extractContext(userId, {
    mood: context.mood,
  });
  
  return {
    ...banditContext,
    requestType: context.requestType,
    query: context.query,
    mood: context.mood,
    basedOn: context.basedOn,
    userPreferences: userPrefs,
  };
}

// ===== Unified Recommendation Endpoint (Phase 10) =====

/**
 * Unified recommendation endpoint that consolidates all strategies
 * Uses contextual bandits for intelligent strategy selection
 * POST /api/recommendations/unified
 */
router.post("/unified", async (req, res) => {
  try {
    // Step 1: Validate request with Zod
    const validatedReq = UnifiedRecommendationRequestSchema.parse(req.body);
    const { userId, context, options } = validatedReq;
    
    console.log(`[Unified Rec] Request for ${userId}, type: ${context.requestType}`);
    
    // Step 2: Enrich context with user preferences and history
    const enrichedContext = await enrichContext(validatedReq);
    
    // Step 3: Use contextual bandits for strategy selection
    const { contextualBanditEngine } = await import("../ml/contextualBandits");
    const selectedArm = await contextualBanditEngine.selectContextualArm(enrichedContext);
    
    console.log(`[Unified Rec] Selected strategy: ${selectedArm.armChosen} (score: ${selectedArm.sampledReward.toFixed(3)})`);
    
    // Log experiment for future learning
    const experimentId = await contextualBanditEngine.logExperiment(
      userId,
      selectedArm.armChosen,
      enrichedContext,
      selectedArm.explorationRate
    );
    
    // Step 4: Route to appropriate service based on selected strategy
    let recommendations: any[] = [];
    
    // Determine the actual request type based on context
    // Map to valid types supported by unifiedRecommendationService
    let requestType: 'personalized' | 'similar' | 'mood' | 'trending' | 'general' = 
      context.requestType === 'auto' ? 'personalized' :
      context.requestType === 'search' ? 'general' :
      context.requestType as 'personalized' | 'similar' | 'mood' | 'trending' | 'general';
    
    // Map bandit strategy to service calls (with graceful error handling)
    try {
      if (selectedArm.armChosen === 'tensorflow_neural' || selectedArm.armChosen === 'hybrid_ensemble') {
        // Use unified recommendation service with TensorFlow
        recommendations = await unifiedRecommendationService.getRecommendations({
          userId,
          requestType,
          mood: context.mood,
          basedOnTmdbId: context.basedOn?.tmdbId,
          basedOnMediaType: context.basedOn?.mediaType,
          limit: options.limit * 2, // Get more for diversity filtering
          useDiversity: false // We'll apply diversity later if requested
        });
      } else if (selectedArm.armChosen === 'collaborative' || selectedArm.armChosen === 'content_based') {
        // Use multi-stage pipeline
        const { multiStagePipeline } = await import("../ml/multiStagePipeline");
        const pipelineRecs = await multiStagePipeline.getRecommendations(userId, {
          candidateCount: 2000,
          rankingLimit: 200,
          finalLimit: options.limit * 2
        });
        
        // Convert to unified format
        recommendations = pipelineRecs.map(rec => ({
          tmdbId: rec.tmdbId,
          mediaType: rec.mediaType,
          title: rec.title,
          posterPath: rec.posterPath,
          score: rec.score,
          confidence: rec.diversityScore || 0.8,
          reason: rec.reasons?.[0] ?? 'Recommended for you',
          type: 'collaborative' as const,
          diversityScore: rec.diversityScore,
          metadata: rec.metadata
        }));
      } else if (selectedArm.armChosen === 'trending') {
        // Use trending recommendations
        recommendations = await unifiedRecommendationService.getRecommendations({
          userId,
          requestType: 'trending',
          limit: options.limit * 2,
          useDiversity: false
        });
      } else if (selectedArm.armChosen === 'exploration_random') {
        // Exploration: use personalized with high diversity
        recommendations = await unifiedRecommendationService.getRecommendations({
          userId,
          requestType: 'personalized',
          limit: options.limit * 3, // Get more for exploration
          useDiversity: true,
          diversityConfig: {
            lambda: 0.3, // Lower lambda = more diversity
            serendipityRate: 0.4 // More surprising recommendations
          }
        });
      } else {
        // Default: use unified recommendation service
        recommendations = await unifiedRecommendationService.getRecommendations({
          userId,
          requestType,
          mood: context.mood,
          basedOnTmdbId: context.basedOn?.tmdbId,
          basedOnMediaType: context.basedOn?.mediaType,
          limit: options.limit * 2,
          useDiversity: false
        });
      }
    } catch (strategyError) {
      // If primary strategy fails, fall back to trending recommendations
      console.error(`[Unified Rec] Strategy ${selectedArm.armChosen} failed, falling back to trending:`, strategyError);
      
      try {
        recommendations = await unifiedRecommendationService.getRecommendations({
          userId,
          requestType: 'trending',
          limit: options.limit * 2,
          useDiversity: false
        });
      } catch (fallbackError) {
        console.error('[Unified Rec] Fallback to trending also failed:', fallbackError);
        // Return empty recommendations if everything fails
        recommendations = [];
      }
    }
    
    // Step 5: Apply diversity if requested (and not already applied)
    let diversityScore = 0;
    if (options.useDiversity && selectedArm.armChosen !== 'exploration_random') {
      const { diversityEngine } = await import("../ml/diversityEngine");
      
      // Convert to diversity candidates
      const candidates = recommendations.map(rec => ({
        id: `${rec.tmdbId}`,
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        score: rec.score || rec.confidence || 0.5,
        genres: rec.metadata?.genres?.map((g: any) => g.name || g) || [],
        metadata: rec.metadata
      }));
      
      // Apply comprehensive diversity
      const diversityConfig = {
        lambda: 0.7, // Balance between relevance and diversity
        epsilonExploration: 0.1,
        maxConsecutiveSameGenre: 3,
        serendipityRate: 0.2,
        diversityMetric: 'hybrid' as const
      };
      
      const diverseCandidates = await diversityEngine.applyDiversity(
        candidates,
        diversityConfig,
        enrichedContext.recentGenres || []
      );
      
      // Take top N after diversity
      const finalCandidates = diverseCandidates.slice(0, options.limit);
      
      // Map back to recommendations
      recommendations = finalCandidates.map((candidate: any) => {
        const original = recommendations.find((r: any) => r.tmdbId === candidate.tmdbId);
        return {
          ...original!,
          diversityScore: candidate.score
        };
      });
      
      // Calculate diversity metrics
      const metrics = diversityEngine.calculateMetrics(finalCandidates, enrichedContext.recentGenres || []);
      diversityScore = metrics.intraDiversity;
      
      console.log(`[Unified Rec] Applied diversity: ${diversityScore.toFixed(2)} intra-diversity`);
    } else {
      // Just take top N if no diversity needed
      recommendations = recommendations.slice(0, options.limit);
    }
    
    // Step 6: Add explainability if requested
    let explainabilityResults: any[] = [];
    if (options.explainability) {
      const { explainabilityEngine } = await import("../ml/explainability");
      
      // Get explanations for top 5 recommendations
      const topRecs = recommendations.slice(0, Math.min(5, recommendations.length));
      explainabilityResults = await Promise.all(
        topRecs.map((rec: any) => 
          explainabilityEngine.explainRecommendation(
            userId,
            rec.tmdbId,
            rec.mediaType
          )
        )
      );
      
      // Merge explanations back into recommendations
      topRecs.forEach((rec: any, index: number) => {
        const explanation = explainabilityResults[index];
        if (explanation) {
          rec.explanation = {
            primaryReason: explanation.primaryReason,
            contributingFactors: explanation.contributingFactors.map((f: any) => f.humanReadable),
            confidence: explanation.confidenceScore
          };
        }
      });
      
      console.log(`[Unified Rec] Added explanations for ${explainabilityResults.length} recommendations`);
    }
    
    // Step 7: Return unified response
    res.json({
      success: true,
      recommendations: recommendations.map(rec => ({
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        title: rec.title,
        posterPath: rec.posterPath,
        score: rec.score || rec.confidence || 0.5,
        confidence: rec.confidence || rec.score || 0.5,
        reason: rec.reason || 'Recommended for you',
        type: rec.type || 'unified',
        diversityScore: rec.diversityScore,
        explanation: rec.explanation,
        metadata: rec.metadata
      })),
      metadata: {
        experimentId,
        strategy: selectedArm.armChosen,
        strategyConfidence: selectedArm.sampledReward,
        explorationRate: selectedArm.explorationRate,
        allStrategyScores: selectedArm.allArmScores,
        diversityScore,
        usedDiversity: options.useDiversity,
        usedExplainability: options.explainability,
        count: recommendations.length,
        requestType: context.requestType,
        context: {
          timeOfDay: enrichedContext.timeOfDay,
          dayOfWeek: enrichedContext.dayOfWeek,
          recentInteractionCount: enrichedContext.recentInteractionCount
        }
      },
      message: `Recommendations using '${selectedArm.armChosen}' strategy (Thompson Sampling)`
    });
    
  } catch (error: any) {
    console.error('[Unified Rec] Error:', error);
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid request format',
        details: error.errors 
      });
    }
    
    handleApiError(res, error, "Failed to generate unified recommendations");
  }
});

// Generate AI-powered recommendations using TensorFlow.js
router.post("/ai-recommendations", async (req, res) => {
  try {
    const { userId, userMessage, preferences, context } = req.body;

    if (!userId || !userMessage) {
      return handleValidationError(res, "userId and userMessage are required");
    }

    // Use unified TensorFlow.js recommendation service
    const recommendations = await unifiedRecommendationService.getRecommendations({
      userId,
      requestType: 'personalized',
      limit: 20,
      useDiversity: true
    });

    res.json({
      recommendations: recommendations.map(rec => ({
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        title: rec.title,
        posterPath: rec.posterPath,
        score: rec.score,
        confidence: rec.confidence,
        reason: rec.reason
      })),
      message: userMessage
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate AI recommendations");
  }
});


// Save user preferences for better recommendations
router.post("/preferences", async (req, res) => {
  try {
    const { userId, preferences } = req.body;

    if (!userId) {
      return handleValidationError(res, "userId is required");
    }

    // Store user preferences in database
    await db
      .insert(userPreferences)
      .values({ userId, ...preferences })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: preferences
      });
      
    res.json({ success: true, message: "Preferences updated" });
  } catch (error) {
    handleApiError(res, error, "Failed to update preferences");
  }
});

// Get user's recommendation history
router.get("/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    const history = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.userId, userId))
      .limit(parseInt(limit as string))
      .orderBy(recommendations.createdAt);

    res.json(history);
  } catch (error) {
    handleApiError(res, error, "Failed to get recommendation history");
  }
});

// Track recommendation interaction
router.post("/interaction", async (req, res) => {
  try {
    const { recommendationId, userId, interactionType } = req.body;

    if (!recommendationId || !userId || !interactionType) {
      return handleValidationError(res, "Missing required fields");
    }

    // Track interaction using TensorFlow.js contextual bandits
    const { contextualBanditEngine } = await import('../ml/contextualBandits');
    
    // Map interaction to reward (0-1 scale)
    const rewardMap: Record<string, number> = {
      'clicked': 0.5,
      'watchlisted': 0.7,
      'rated_high': 1.0,
      'dismissed': 0,
      'ignored': 0
    };
    
    await contextualBanditEngine.updateReward({
      experimentId: recommendationId,
      reward: rewardMap[interactionType] || 0,
      outcomeType: interactionType as any
    });

    res.json({ success: true, message: "Interaction tracked" });
  } catch (error) {
    handleApiError(res, error, "Failed to track interaction");
  }
});


// DEPRECATED: Multi-Stage Pipeline recommendations (Phase 4)
// Use POST /api/recommendations/unified instead
router.get("/pipeline/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      limit = 50,
      candidateCount = 2000,
      rankingLimit = 200
    } = req.query;

    console.warn('[DEPRECATED] GET /api/recommendations/pipeline/:userId is deprecated. Use POST /api/recommendations/unified instead.');

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    // Import pipeline
    const { multiStagePipeline } = await import("../ml/multiStagePipeline");

    // Get recommendations using multi-stage pipeline
    const recommendations = await multiStagePipeline.getRecommendations(userId, {
      candidateCount: parseInt(candidateCount as string),
      rankingLimit: parseInt(rankingLimit as string),
      finalLimit: parseInt(limit as string)
    });

    res.json({
      recommendations,
      type: "multi-stage-pipeline",
      message: "Recommendations from 3-stage pipeline: Candidate Gen → Ranking → Re-ranking",
      pipeline: {
        stage1: `${candidateCount} candidates generated`,
        stage2: `Top ${rankingLimit} ranked`,
        stage3: `Final ${recommendations.length} with diversity`
      },
      deprecated: true,
      deprecationMessage: "This endpoint is deprecated. Please use POST /api/recommendations/unified"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate pipeline recommendations");
  }
});

// ===== Contextual Bandit Routes (Phase 5) =====

// Select best recommendation strategy using Thompson Sampling
router.post("/bandit/select-arm", async (req, res) => {
  try {
    const { userId, context } = req.body;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { contextualBanditEngine } = await import("../ml/contextualBandits");

    // Extract or use provided context
    const userContext = context 
      ? { ...context, userId }
      : await contextualBanditEngine.extractContext(userId);

    // Select best arm using Thompson Sampling
    const selection = await contextualBanditEngine.selectContextualArm(userContext);

    // Log the experiment
    const experimentId = await contextualBanditEngine.logExperiment(
      userId,
      selection.armChosen,
      userContext,
      selection.explorationRate
    );

    res.json({
      experimentId,
      armChosen: selection.armChosen,
      sampledReward: selection.sampledReward,
      explorationRate: selection.explorationRate,
      allArmScores: selection.allArmScores,
      context: userContext,
      message: `Selected '${selection.armChosen}' strategy using Thompson Sampling`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to select bandit arm");
  }
});

// Update experiment with user feedback (reward signal)
router.post("/bandit/update-reward", async (req, res) => {
  try {
    const { experimentId, outcomeType } = req.body;

    if (!experimentId || !outcomeType) {
      return handleValidationError(res, "experimentId and outcomeType are required");
    }

    const { contextualBanditEngine } = await import("../ml/contextualBandits");

    // Calculate reward from outcome
    const reward = contextualBanditEngine.calculateReward(outcomeType);

    // Update the experiment
    await contextualBanditEngine.updateReward({
      experimentId,
      reward,
      outcomeType
    });

    res.json({
      success: true,
      experimentId,
      outcomeType,
      reward,
      message: "Bandit experiment updated with reward signal"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to update bandit reward");
  }
});

// Get bandit statistics for a user
router.get("/bandit/stats/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { contextualBanditEngine } = await import("../ml/contextualBandits");

    const stats = await contextualBanditEngine.getStatistics(userId);

    res.json({
      userId,
      statistics: stats,
      message: "Contextual bandit performance statistics"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get bandit statistics");
  }
});

// Get bandit-optimized recommendations (intelligent exploration/exploitation)
router.get("/bandit/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { contextualBanditEngine } = await import("../ml/contextualBandits");
    const { multiStagePipeline } = await import("../ml/multiStagePipeline");

    // Extract user context
    const context = await contextualBanditEngine.extractContext(userId);

    // Select best recommendation strategy
    const selection = await contextualBanditEngine.selectContextualArm(context);

    // Log experiment
    const experimentId = await contextualBanditEngine.logExperiment(
      userId,
      selection.armChosen,
      context,
      selection.explorationRate
    );

    // Get recommendations using selected strategy
    let recommendations;
    
    // For now, all strategies use the multi-stage pipeline
    // The strategy selection influences future learning but uses the same recommendation source
    recommendations = await multiStagePipeline.getRecommendations(userId, {
      finalLimit: parseInt(limit as string),
      // Apply exploration boost for certain strategies
      candidateCount: selection.armChosen === 'exploration_random' ? 5000 : 2000
    });

    res.json({
      recommendations,
      experimentId,
      strategy: selection.armChosen,
      explorationRate: selection.explorationRate,
      context,
      type: "contextual-bandit",
      message: `Recommendations using '${selection.armChosen}' (Thompson Sampling, ${(selection.explorationRate * 100).toFixed(1)}% exploration)`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate bandit recommendations");
  }
});

// ===== Lambda Architecture Routes (Phase 6) =====

// Get Lambda Architecture recommendations (batch + real-time)
router.get("/lambda/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      limit = 20,
      skipCache = false 
    } = req.query;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { lambdaArchitecture } = await import("../ml/lambdaArchitecture");

    // Get recommendations using Lambda Architecture serving layer
    const recommendations = await lambdaArchitecture.getRecommendations(
      userId,
      parseInt(limit as string),
      skipCache === 'true'
    );

    res.json({
      recommendations,
      type: "lambda-architecture",
      message: "Recommendations from Lambda Architecture (batch + real-time processing)"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate Lambda recommendations");
  }
});

// Trigger batch job manually
router.post("/lambda/batch-job", async (req, res) => {
  try {
    const { lambdaArchitecture } = await import("../ml/lambdaArchitecture");

    // Run batch update
    const result = await lambdaArchitecture.runBatchUpdate();

    res.json({
      success: true,
      message: "Batch job completed successfully",
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleApiError(res, error, "Failed to run batch job");
  }
});

// Get Lambda Architecture system status
router.get("/lambda/status", async (req, res) => {
  try {
    const { lambdaArchitecture } = await import("../ml/lambdaArchitecture");

    const status = await lambdaArchitecture.getStatus();

    res.json({
      status,
      message: "Lambda Architecture system status"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get system status");
  }
});

// Clear recommendation cache
router.delete("/lambda/cache/:userId?", async (req, res) => {
  try {
    const { userId } = req.params;
    const { recommendationCache } = await import("../ml/lambdaArchitecture");

    if (userId) {
      // Clear cache for specific user
      await recommendationCache.invalidate(userId);
      res.json({
        success: true,
        message: `Cache cleared for user ${userId}`
      });
    } else {
      // Clear all cache
      await recommendationCache.clear();
      res.json({
        success: true,
        message: "All recommendation cache cleared"
      });
    }
  } catch (error) {
    handleApiError(res, error, "Failed to clear cache");
  }
});

// Get Lambda Architecture statistics
router.get("/lambda/statistics", async (req, res) => {
  try {
    const { lambdaArchitecture, recommendationCache } = await import("../ml/lambdaArchitecture");

    const stats = {
      systemStatus: await lambdaArchitecture.getStatus(),
      lambdaStats: await lambdaArchitecture.getStatistics(),
      cacheStats: await recommendationCache.getStats()
    };

    res.json({
      statistics: stats,
      message: "Lambda Architecture performance statistics"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get Lambda statistics");
  }
});

// ===== Pattern Recognition Routes (Phase 7) =====

// Get pattern predictions for a user
router.get("/pattern/predict/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { tfPatternModel } = await import("../ml/tfPatternRecognition");

    const prediction = await tfPatternModel.predict(userId);

    res.json({
      userId,
      prediction,
      type: "pattern-recognition",
      message: "LSTM-based viewing pattern prediction"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to predict viewing pattern");
  }
});

// Analyze user viewing patterns
router.get("/pattern/analyze/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { tfPatternModel } = await import("../ml/tfPatternRecognition");

    const analysis = await tfPatternModel.analyzePatterns(userId);

    res.json({
      userId,
      analysis,
      type: "pattern-analysis",
      message: "Comprehensive viewing pattern analysis"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to analyze viewing patterns");
  }
});

// Get session-based recommendations
router.post("/pattern/session/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { sessionData } = req.body;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { tfPatternModel } = await import("../ml/tfPatternRecognition");

    const recommendations = await tfPatternModel.getSessionRecommendations(
      userId,
      sessionData
    );

    res.json({
      userId,
      recommendations,
      sessionData: sessionData || "No session data provided",
      type: "session-recommendations",
      message: "Fast session-based recommendations using LSTM"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get session recommendations");
  }
});

// Train pattern recognition model
router.post("/pattern/train", async (req, res) => {
  try {
    console.log('Starting pattern recognition model training...');
    
    const { tfPatternModel } = await import("../ml/tfPatternRecognition");

    const metrics = await tfPatternModel.train();

    res.json({
      success: true,
      message: "Pattern recognition model trained successfully",
      metrics: {
        loss: metrics.loss.toFixed(4),
        accuracy: `${(metrics.accuracy * 100).toFixed(2)}%`
      }
    });
  } catch (error) {
    handleApiError(res, error, "Failed to train pattern recognition model");
  }
});

// ===== Explainability Routes (Phase 8) =====

// Explain a specific recommendation
router.get("/explain/:recommendationId", async (req, res) => {
  try {
    const { recommendationId } = req.params;

    if (!recommendationId) {
      return handleValidationError(res, "Recommendation ID is required");
    }

    const { explainabilityEngine } = await import("../ml/explainability");

    const explanation = await explainabilityEngine.explainByRecommendationId(recommendationId);

    if (!explanation) {
      return res.status(404).json({ 
        error: "Recommendation not found",
        recommendationId 
      });
    }

    res.json({
      explanation,
      type: "recommendation-explanation",
      message: "Detailed explanation of why this was recommended"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate explanation");
  }
});

// Explain why a specific item was/would be recommended to a user
router.get("/explain/:userId/:tmdbId", async (req, res) => {
  try {
    const { userId, tmdbId } = req.params;
    const { mediaType = 'movie' } = req.query;

    if (!userId || !tmdbId) {
      return handleValidationError(res, "User ID and TMDB ID are required");
    }

    const { explainabilityEngine } = await import("../ml/explainability");

    const explanation = await explainabilityEngine.explainRecommendation(
      userId,
      parseInt(tmdbId),
      mediaType as string
    );

    res.json({
      explanation,
      type: "item-explanation",
      message: `Explanation for why ${mediaType} ${tmdbId} was recommended to user ${userId}`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate explanation");
  }
});

// Get batch explanations for multiple items
router.post("/explain/batch", async (req, res) => {
  try {
    const { userId, items } = req.body;

    if (!userId || !items || !Array.isArray(items)) {
      return handleValidationError(res, "userId and items array are required");
    }

    const { explainabilityEngine } = await import("../ml/explainability");

    const explanations = await explainabilityEngine.explainBatch(userId, items);

    res.json({
      userId,
      explanations,
      count: explanations.length,
      type: "batch-explanations",
      message: `Generated ${explanations.length} explanations`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate batch explanations");
  }
});

// Get feature importance breakdown for a recommendation
router.get("/explain/:userId/:tmdbId/features", async (req, res) => {
  try {
    const { userId, tmdbId } = req.params;
    const { mediaType = 'movie' } = req.query;

    if (!userId || !tmdbId) {
      return handleValidationError(res, "User ID and TMDB ID are required");
    }

    const { explainabilityEngine } = await import("../ml/explainability");

    const explanation = await explainabilityEngine.explainRecommendation(
      userId,
      parseInt(tmdbId),
      mediaType as string
    );

    res.json({
      userId,
      tmdbId: parseInt(tmdbId),
      mediaType,
      contributingFactors: explanation.contributingFactors,
      visualBreakdown: explanation.visualBreakdown,
      confidenceScore: explanation.confidenceScore,
      type: "feature-importance",
      message: "Feature importance breakdown for visualization"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get feature importance");
  }
});

// ===== Production Infrastructure Routes (Phase 10) =====

// Get cache statistics
router.get("/infrastructure/cache/stats", async (req, res) => {
  try {
    const { cacheManager } = await import("../ml/productionCache");
    
    const stats = cacheManager.getAllStats();
    
    res.json({
      cacheStats: stats,
      type: "cache-statistics",
      message: "Multi-level cache statistics"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get cache stats");
  }
});

// Clear cache (all or specific)
router.delete("/infrastructure/cache/:namespace?", async (req, res) => {
  try {
    const { namespace } = req.params;
    const { cacheManager, tmdbCache, embeddingsCache, recommendationsCache, predictionsCache } = await import("../ml/productionCache");
    
    if (namespace) {
      // Clear specific cache
      const caches: Record<string, any> = {
        tmdb: tmdbCache,
        embeddings: embeddingsCache,
        recommendations: recommendationsCache,
        predictions: predictionsCache
      };
      
      if (caches[namespace]) {
        await caches[namespace].clear();
        res.json({
          success: true,
          message: `Cache '${namespace}' cleared successfully`
        });
      } else {
        return res.status(404).json({
          error: `Cache '${namespace}' not found`
        });
      }
    } else {
      // Clear all caches
      await cacheManager.clearAll();
      res.json({
        success: true,
        message: "All caches cleared successfully"
      });
    }
  } catch (error) {
    handleApiError(res, error, "Failed to clear cache");
  }
});

// Get training pipeline status
router.get("/infrastructure/training/status", async (req, res) => {
  try {
    const { trainingPipeline } = await import("../ml/trainingPipeline");
    
    const status = trainingPipeline.getTrainingStatus();
    
    res.json({
      status,
      type: "training-status",
      message: "Training pipeline status and history"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get training status");
  }
});

// Trigger batch training
router.post("/infrastructure/training/batch", async (req, res) => {
  try {
    const { trainingPipeline } = await import("../ml/trainingPipeline");
    
    // Run batch training asynchronously
    trainingPipeline.runBatchTraining()
      .then(result => {
        console.log('Batch training completed:', result);
      })
      .catch(err => {
        console.error('Batch training failed:', err);
      });
    
    res.json({
      success: true,
      message: "Batch training started in background"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to start batch training");
  }
});

// Trigger incremental training
router.post("/infrastructure/training/incremental", async (req, res) => {
  try {
    const { trainingPipeline } = await import("../ml/trainingPipeline");
    
    const result = await trainingPipeline.runIncrementalTraining();
    
    res.json({
      success: result.success,
      result,
      message: result.success ? "Incremental training completed" : "Incremental training failed"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to run incremental training");
  }
});

// Start automated training schedulers
router.post("/infrastructure/training/start-scheduler", async (req, res) => {
  try {
    const { trainingPipeline } = await import("../ml/trainingPipeline");
    
    trainingPipeline.startAutomatedTraining();
    
    res.json({
      success: true,
      message: "Automated training schedulers started"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to start training schedulers");
  }
});

// Stop automated training schedulers
router.post("/infrastructure/training/stop-scheduler", async (req, res) => {
  try {
    const { trainingPipeline } = await import("../ml/trainingPipeline");
    
    trainingPipeline.stopAutomatedTraining();
    
    res.json({
      success: true,
      message: "Automated training schedulers stopped"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to stop training schedulers");
  }
});

// ===== Enhanced Semantic Search Routes (Phase 12) =====

// Enhanced semantic search using 512-dim embeddings
router.get("/semantic-search", async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;
    
    if (!query || typeof query !== 'string') {
      return handleValidationError(res, "Search query is required");
    }
    
    const { intelligentQueryService } = await import("../ml/intelligentQueryService");
    
    const startTime = Date.now();
    const queryResult = await intelligentQueryService.processQuery(query);
    const results = (queryResult.semanticResults || []).slice(0, parseInt(limit as string));
    const duration = Date.now() - startTime;
    
    // Get method used (enhanced or legacy)
    const method = results.length > 0 ? results[0].method : 'intelligent-query-service';
    
    res.json({
      query,
      results,
      count: results.length,
      duration: `${duration}ms`,
      method,
      type: "semantic-search",
      message: `Found ${results.length} semantically similar items using ${method} search (${duration}ms)`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to perform semantic search");
  }
});

// Generate embeddings for a specific movie/TV show
router.post("/semantic/generate-embedding", async (req, res) => {
  try {
    const { tmdbId, mediaType, title, overview } = req.body;
    
    if (!tmdbId || !mediaType || !title || !overview) {
      return handleValidationError(res, "tmdbId, mediaType, title, and overview are required");
    }
    
    const { useService } = await import("../ml/universalSentenceEncoder");
    
    const textContent = `${title} ${overview}`;
    
    await useService.storeEmbedding(
      parseInt(tmdbId),
      mediaType,
      textContent
    );
    
    // Update TF-IDF statistics
    useService.updateTFIDFStats(textContent);
    
    res.json({
      success: true,
      tmdbId: parseInt(tmdbId),
      mediaType,
      message: "Embedding generated and stored successfully"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to generate embedding");
  }
});

// Batch generate embeddings
router.post("/semantic/batch-generate", async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return handleValidationError(res, "items array is required");
    }
    
    const { useService } = await import("../ml/universalSentenceEncoder");
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const item of items) {
      try {
        const { tmdbId, mediaType, title, overview } = item;
        
        if (!tmdbId || !mediaType || !title || !overview) {
          errorCount++;
          continue;
        }
        
        const textContent = `${title} ${overview}`;
        
        await useService.storeEmbedding(
          parseInt(tmdbId),
          mediaType,
          textContent
        );
        
        useService.updateTFIDFStats(textContent);
        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Error generating embedding for item:', error);
      }
    }
    
    res.json({
      success: true,
      processed: items.length,
      successCount,
      errorCount,
      message: `Generated ${successCount} embeddings (${errorCount} errors)`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to batch generate embeddings");
  }
});

// Get semantic embedding statistics
router.get("/semantic/stats", async (req, res) => {
  try {
    const { useService } = await import("../ml/universalSentenceEncoder");
    
    const stats = useService.getStats();
    
    res.json({
      stats,
      type: "semantic-stats",
      message: "Universal Sentence Encoder statistics"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get semantic statistics");
  }
});

// ===== Phase 12 Advanced ML Routes =====

// ===== Tone Analysis Routes (Phase 12) =====

// Analyze tone from text
router.post("/tone-analysis", async (req, res) => {
  try {
    const { text, userId } = req.body;
    
    if (!text) {
      return handleValidationError(res, "Text is required");
    }
    
    const { toneAnalysisService } = await import("../ml/toneAnalysisService");
    
    const result = await toneAnalysisService.analyzeText(text, userId);
    
    res.json({
      ...result,
      type: "tone-analysis",
      message: `Detected tone: ${result.detectedTone} (${(result.confidence * 100).toFixed(1)}% confidence)`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to analyze tone");
  }
});

// Get user's tone profile
router.get("/tone-analysis/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }
    
    const { toneAnalysisService } = await import("../ml/toneAnalysisService");
    
    const profile = await toneAnalysisService.getUserToneProfile(userId);
    
    if (!profile) {
      return res.status(404).json({
        error: "No tone analysis data found for user",
        message: "User needs to provide text samples for tone analysis"
      });
    }
    
    res.json({
      profile,
      type: "tone-profile",
      message: `User's dominant tone: ${profile.dominantTone}`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get tone profile");
  }
});

// ===== PANAS Mood Analysis Routes (Phase 12) =====

// Analyze mood from text (lightweight)
router.post("/mood-analysis/text", async (req, res) => {
  try {
    const { text, userId } = req.body;
    
    if (!text) {
      return handleValidationError(res, "Text is required");
    }
    
    const { panasAnalysisService } = await import("../ml/panasAnalysisService");
    
    const scores = await panasAnalysisService.analyzeMoodFromText(text, userId);
    
    res.json({
      ...scores,
      type: "mood-analysis",
      message: `Detected moods: ${scores.detectedMoods.join(', ')}`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to analyze mood from text");
  }
});

// Submit PANAS questionnaire
router.post("/mood-analysis/questionnaire", async (req, res) => {
  try {
    const { userId, responses } = req.body;
    
    if (!userId || !responses || !Array.isArray(responses)) {
      return handleValidationError(res, "userId and responses array are required");
    }
    
    const { panasAnalysisService } = await import("../ml/panasAnalysisService");
    
    const scores = await panasAnalysisService.storePANASResults(userId, responses);
    
    res.json({
      ...scores,
      type: "panas-results",
      message: "PANAS questionnaire results stored successfully"
    });
  } catch (error) {
    handleApiError(res, error, "Failed to process PANAS questionnaire");
  }
});

// Get user's current mood
router.get("/mood-analysis/:userId/current", async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }
    
    const { panasAnalysisService } = await import("../ml/panasAnalysisService");
    
    const mood = await panasAnalysisService.getUserCurrentMood(userId);
    
    if (!mood) {
      return res.status(404).json({
        error: "No mood data found for user",
        message: "User needs to complete a mood analysis first"
      });
    }
    
    res.json({
      mood,
      type: "current-mood",
      message: `Current moods: ${mood.detectedMoods.join(', ')}`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get current mood");
  }
});

// Get user's mood history
router.get("/mood-analysis/:userId/history", async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 30 } = req.query;
    
    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }
    
    const { panasAnalysisService } = await import("../ml/panasAnalysisService");
    
    const history = await panasAnalysisService.getUserMoodHistory(userId, parseInt(limit as string));
    
    res.json({
      history,
      count: history.length,
      type: "mood-history",
      message: `Retrieved ${history.length} mood entries`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get mood history");
  }
});




// NLP Query Analysis - Extract intent, entities, mood, and genres from search queries
router.post("/nlp/analyze", async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return handleValidationError(res, "Search query is required");
    }
    
    const { intelligentQueryService } = await import("../ml/intelligentQueryService");
    
    const startTime = Date.now();
    const queryResult = await intelligentQueryService.processQuery(query);
    const analysis = queryResult.parsed.intent;
    const duration = Date.now() - startTime;
    
    res.json({
      query,
      analysis,
      duration: `${duration}ms`,
      type: "nlp-analysis",
      message: `Analyzed query with ${analysis.confidence.toFixed(2)} confidence (intent: ${analysis.type})`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to analyze query");
  }
});

// Semantic Search - Natural language movie search using pre-computed embeddings
router.post("/semantic-search", async (req, res) => {
  try {
    const { query, limit, filters } = req.body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return handleValidationError(res, "Search query is required");
    }
    
    if (query.trim().length < 3) {
      return handleValidationError(res, "Query must be at least 3 characters");
    }
    
    const { semanticSearchService } = await import("../ml/semanticSearchService");
    
    console.log(`[Semantic Search API] Query: "${query}"`);
    
    const searchResponse = await semanticSearchService.search(query, {
      limit: limit || 20,
      filters: filters || {}
    });
    
    res.json({
      success: true,
      ...searchResponse,
      type: "semantic-search",
      message: `Found ${searchResponse.totalMatches} matches in ${searchResponse.searchTime}ms`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to perform semantic search");
  }
});

// Semantic Search Status - Get embedding statistics
router.get("/semantic-search/status", async (req, res) => {
  try {
    const { semanticSearchService } = await import("../ml/semanticSearchService");
    
    const stats = await semanticSearchService.getStats();
    
    res.json({
      success: true,
      ...stats,
      type: "semantic-search-status",
      message: `${stats.totalEmbeddings.toLocaleString()} movies embedded (${stats.embeddingVersion})`
    });
  } catch (error) {
    handleApiError(res, error, "Failed to get semantic search status");
  }
});

export default router;