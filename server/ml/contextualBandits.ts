import * as tf from '@tensorflow/tfjs';
import { db } from '../db';
import { banditExperiments } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Contextual Bandit Engine using Thompson Sampling
 * Balances exploration (trying new recommendations) vs exploitation (using known preferences)
 * 
 * Algorithm: Thompson Sampling with Beta posterior
 * - Maintains Beta(α, β) distribution for each arm (recommendation strategy)
 * - α = successes + 1, β = failures + 1
 * - Samples from each distribution and selects arm with highest sample
 */

export interface UserContext {
  userId: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: 'weekday' | 'weekend';
  sessionDuration: number; // minutes
  recentGenres: string[];
  recentInteractionCount: number;
  deviceType?: string;
  mood?: string; // from Gemini AI analysis
}

export interface BanditArm {
  name: string;
  alpha: number; // success count + 1
  beta: number;  // failure count + 1
  pulls: number;
  rewards: number;
  successRate: number;
}

export interface BanditSelection {
  armChosen: string;
  sampledReward: number;
  allArmScores: { arm: string; score: number }[];
  explorationRate: number;
}

export interface RewardFeedback {
  experimentId: string;
  reward: number; // 0-1 scale
  outcomeType: 'clicked' | 'watchlisted' | 'rated_high' | 'ignored' | 'dismissed' | 'preference_positive' | 'preference_negative';
}

export class ContextualBanditEngine {
  private readonly PRIOR_ALPHA = 1; // Prior belief in success
  private readonly PRIOR_BETA = 1;  // Prior belief in failure
  
  // Available recommendation arms (strategies)
  private readonly ARMS = [
    'tensorflow_neural',     // TensorFlow.js Two-Tower model
    'collaborative',         // Collaborative filtering
    'content_based',         // Genre/metadata matching
    'trending',              // Popular/trending items
    'dynamic_weights',       // Dynamic weight learning
    'hybrid_ensemble',       // Ensemble of multiple strategies
    'exploration_random'     // Pure exploration (random)
  ];

  /**
   * Extract user context features from current session
   */
  async extractContext(userId: string, additionalContext?: Partial<UserContext>): Promise<UserContext> {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Determine time of day
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 5 && hour < 12) timeOfDay = 'morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
    else if (hour >= 17 && hour < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';

    // Weekday vs weekend
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 ? 'weekend' : 'weekday';

    // Get recent interactions (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentExperiments = await db
      .select()
      .from(banditExperiments)
      .where(
        and(
          eq(banditExperiments.userId, userId),
          sql`${banditExperiments.createdAt} > ${oneDayAgo}`
        )
      )
      .limit(50);

    // Extract recent genres from context
    const recentGenres = recentExperiments
      .map((exp: any) => exp.context?.genres || [])
      .flat()
      .filter((genre: any, index: number, self: any[]) => self.indexOf(genre) === index)
      .slice(0, 5);

    return {
      userId,
      timeOfDay,
      dayOfWeek: isWeekend,
      sessionDuration: additionalContext?.sessionDuration || 0,
      recentGenres: recentGenres as string[],
      recentInteractionCount: recentExperiments.length,
      deviceType: additionalContext?.deviceType,
      mood: additionalContext?.mood,
    };
  }

  /**
   * Get current state of all bandit arms for a user
   */
  async getArmStates(userId: string): Promise<BanditArm[]> {
    const armStates: BanditArm[] = [];

    for (const armName of this.ARMS) {
      // Count successes and failures for this arm
      const experiments = await db
        .select()
        .from(banditExperiments)
        .where(
          and(
            eq(banditExperiments.userId, userId),
            eq(banditExperiments.armChosen, armName),
            sql`${banditExperiments.reward} IS NOT NULL`
          )
        );

      let successCount = 0;
      let totalCount = experiments.length;

      experiments.forEach((exp: any) => {
        if (exp.reward !== null && exp.reward >= 0.5) {
          successCount++;
        }
      });

      const alpha = successCount + this.PRIOR_ALPHA;
      const beta = (totalCount - successCount) + this.PRIOR_BETA;
      const successRate = totalCount > 0 ? successCount / totalCount : 0;

      armStates.push({
        name: armName,
        alpha,
        beta,
        pulls: totalCount,
        rewards: successCount,
        successRate
      });
    }

    return armStates;
  }

  /**
   * Sample from Beta distribution using TensorFlow.js
   * Beta(α, β) distribution for Thompson Sampling
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Use Gamma distribution to sample Beta
    // If X ~ Gamma(α, 1) and Y ~ Gamma(β, 1), then X/(X+Y) ~ Beta(α, β)
    
    return tf.tidy(() => {
      const gammaAlpha = tf.randomGamma([1], alpha, 1);
      const gammaBeta = tf.randomGamma([1], beta, 1);
      
      const sum = tf.add(gammaAlpha, gammaBeta);
      const betaSample = tf.div(gammaAlpha, sum);
      
      return betaSample.dataSync()[0];
    });
  }

  /**
   * Select best arm using Thompson Sampling
   * Samples from Beta distribution for each arm and picks highest
   */
  async selectArm(context: UserContext): Promise<BanditSelection> {
    const armStates = await this.getArmStates(context.userId);
    const armScores: { arm: string; score: number }[] = [];
    let maxScore = -1;
    let chosenArm = this.ARMS[0];

    // Sample from each arm's posterior distribution
    for (const armState of armStates) {
      const sampledReward = this.sampleBeta(armState.alpha, armState.beta);
      armScores.push({ arm: armState.name, score: sampledReward });

      if (sampledReward > maxScore) {
        maxScore = sampledReward;
        chosenArm = armState.name;
      }
    }

    // Calculate exploration rate (how uncertain we are)
    const chosenArmState = armStates.find(a => a.name === chosenArm);
    const explorationRate = chosenArmState 
      ? 1 / (1 + chosenArmState.pulls) // Higher uncertainty with fewer pulls
      : 1.0;

    return {
      armChosen: chosenArm,
      sampledReward: maxScore,
      allArmScores: armScores,
      explorationRate
    };
  }

  /**
   * Log a bandit experiment (arm selection)
   */
  async logExperiment(
    userId: string,
    armChosen: string,
    context: UserContext,
    explorationRate: number
  ): Promise<string> {
    const [experiment] = await db
      .insert(banditExperiments)
      .values({
        userId,
        experimentType: 'thompson_sampling',
        armChosen,
        context: context as any,
        explorationRate,
        reward: null, // Will be updated later when user interacts
      })
      .returning();

    return experiment.id;
  }

  /**
   * Update experiment with reward (user feedback)
   */
  async updateReward(feedback: RewardFeedback): Promise<void> {
    await db
      .update(banditExperiments)
      .set({ 
        reward: feedback.reward,
        context: sql`jsonb_set(context, '{outcomeType}', ${JSON.stringify(feedback.outcomeType)}::jsonb)`
      })
      .where(eq(banditExperiments.id, feedback.experimentId));
  }

  /**
   * Get bandit statistics for monitoring
   */
  async getStatistics(userId: string): Promise<{
    armPerformance: BanditArm[];
    totalExperiments: number;
    averageReward: number;
    bestArm: string;
    explorationRate: number;
  }> {
    const armStates = await this.getArmStates(userId);
    const totalExperiments = armStates.reduce((sum, arm) => sum + arm.pulls, 0);
    const totalRewards = armStates.reduce((sum, arm) => sum + arm.rewards, 0);
    const averageReward = totalExperiments > 0 ? totalRewards / totalExperiments : 0;
    
    const bestArm = armStates.reduce((best, arm) => 
      arm.successRate > best.successRate ? arm : best, 
      armStates[0]
    );

    const explorationRate = totalExperiments > 0 
      ? 1 / Math.sqrt(totalExperiments) 
      : 1.0;

    return {
      armPerformance: armStates,
      totalExperiments,
      averageReward,
      bestArm: bestArm.name,
      explorationRate
    };
  }

  /**
   * Contextual arm selection with feature-based weighting
   * Adjusts arm probabilities based on context features
   */
  async selectContextualArm(context: UserContext): Promise<BanditSelection> {
    const armStates = await this.getArmStates(context.userId);
    const armScores: { arm: string; score: number }[] = [];
    let maxScore = -1;
    let chosenArm = this.ARMS[0];

    // Sample from each arm's posterior and adjust for context
    for (const armState of armStates) {
      let sampledReward = this.sampleBeta(armState.alpha, armState.beta);
      
      // Context-based boosting
      const contextBoost = this.getContextBoost(armState.name, context);
      sampledReward = sampledReward * (1 + contextBoost * 0.2); // Up to 20% boost

      armScores.push({ arm: armState.name, score: sampledReward });

      if (sampledReward > maxScore) {
        maxScore = sampledReward;
        chosenArm = armState.name;
      }
    }

    const chosenArmState = armStates.find(a => a.name === chosenArm);
    const explorationRate = chosenArmState 
      ? 1 / (1 + chosenArmState.pulls)
      : 1.0;

    return {
      armChosen: chosenArm,
      sampledReward: maxScore,
      allArmScores: armScores,
      explorationRate
    };
  }

  /**
   * Calculate context-based boost for an arm
   * Returns 0-1 multiplier based on how well context matches arm strength
   */
  private getContextBoost(armName: string, context: UserContext): number {
    let boost = 0;

    // Neural network performs well with established users (more data)
    if (armName === 'tensorflow_neural' && context.recentInteractionCount > 10) {
      boost += 0.3;
    }

    // Collaborative filtering works better on weekends (more browsing)
    if (armName === 'collaborative' && context.dayOfWeek === 'weekend') {
      boost += 0.2;
    }

    // Trending works well in evening (leisure time)
    if (armName === 'trending' && context.timeOfDay === 'evening') {
      boost += 0.25;
    }

    // Content-based good for new users (cold start)
    if (armName === 'content_based' && context.recentInteractionCount < 5) {
      boost += 0.4;
    }

    // Exploration during short sessions (user exploring)
    if (armName === 'exploration_random' && context.sessionDuration < 5) {
      boost += 0.3;
    }

    // Dynamic weights good for engaged users
    if (armName === 'dynamic_weights' && context.sessionDuration > 15) {
      boost += 0.25;
    }

    return Math.min(boost, 1.0); // Cap at 1.0
  }

  /**
   * Calculate reward from user interaction
   * Converts user actions to 0-1 reward signal
   */
  calculateReward(outcomeType: string): number {
    const rewardMap: Record<string, number> = {
      'clicked': 0.3,
      'watchlisted': 0.6,
      'rated_high': 1.0,      // Rating >= 7
      'rated_medium': 0.4,    // Rating 5-6
      'rated_low': 0.1,       // Rating <= 4
      'ignored': 0.0,
      'dismissed': -0.2,      // Negative signal
      'preference_positive': 0.8,  // User explicitly likes recommendation
      'preference_negative': -0.1,  // User explicitly dislikes recommendation (mild negative signal)
    };

    return rewardMap[outcomeType] || 0;
  }
}

// Singleton instance
export const contextualBanditEngine = new ContextualBanditEngine();
