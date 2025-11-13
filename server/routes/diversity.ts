import { Router } from 'express';
import { db } from '../db';
import { diversityMetrics } from '@shared/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';
import { diversityEngine } from '../ml/diversityEngine';
import type { DiversityCandidate, DiversityConfig, DiversityMetrics } from '../ml/diversityEngine';

const router = Router();

/**
 * Track diversity metrics for a recommendation session
 */
router.post('/track', async (req, res) => {
  try {
    const {
      userId,
      sessionId,
      recommendationType,
      recommendations,
      userGenrePreferences = [],
      diversityConfig
    } = req.body;

    if (!userId || !recommendationType || !recommendations) {
      return res.status(400).json({
        error: 'userId, recommendationType, and recommendations are required'
      });
    }

    // Convert recommendations to DiversityCandidate format
    const candidates: DiversityCandidate[] = recommendations.map((rec: any) => ({
      id: rec.id || `${rec.tmdbId}_${rec.mediaType}`,
      tmdbId: rec.tmdbId,
      mediaType: rec.mediaType || 'movie',
      score: rec.score || 0,
      genres: rec.genres || [],
      embeddings: rec.embeddings
    }));

    // Calculate diversity metrics
    const metrics: DiversityMetrics = diversityEngine.calculateMetrics(
      candidates,
      userGenrePreferences
    );

    // Persist to database
    const [result] = await db.insert(diversityMetrics).values({
      userId,
      sessionId: sessionId || null,
      recommendationType,
      intraDiversity: metrics.intraDiversity,
      genreBalance: metrics.genreBalance,
      serendipityScore: metrics.serendipityScore,
      explorationRate: metrics.explorationRate,
      coverageScore: metrics.coverageScore,
      diversityConfig: diversityConfig || null,
      recommendationCount: recommendations.length
    }).returning();

    res.json({
      success: true,
      metrics: {
        ...metrics,
        id: result.id,
        timestamp: result.createdAt
      },
      message: 'Diversity metrics tracked successfully'
    });
  } catch (error: any) {
    console.error('[Diversity] Error tracking metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get diversity metrics for a specific user
 */
router.get('/metrics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, recommendationType } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let query = db
      .select()
      .from(diversityMetrics)
      .where(eq(diversityMetrics.userId, userId))
      .orderBy(desc(diversityMetrics.createdAt))
      .limit(parseInt(limit as string));

    if (recommendationType) {
      query = db
        .select()
        .from(diversityMetrics)
        .where(and(
          eq(diversityMetrics.userId, userId),
          eq(diversityMetrics.recommendationType, recommendationType as string)
        ))
        .orderBy(desc(diversityMetrics.createdAt))
        .limit(parseInt(limit as string));
    }

    const metrics = await query;

    // Calculate averages
    const averages = metrics.length > 0 ? {
      avgIntraDiversity: metrics.reduce((sum, m) => sum + (m.intraDiversity || 0), 0) / metrics.length,
      avgGenreBalance: metrics.reduce((sum, m) => sum + (m.genreBalance || 0), 0) / metrics.length,
      avgSerendipityScore: metrics.reduce((sum, m) => sum + (m.serendipityScore || 0), 0) / metrics.length,
      avgExplorationRate: metrics.reduce((sum, m) => sum + (m.explorationRate || 0), 0) / metrics.length,
      avgCoverageScore: metrics.reduce((sum, m) => sum + (m.coverageScore || 0), 0) / metrics.length
    } : null;

    res.json({
      userId,
      metrics,
      summary: {
        totalSessions: metrics.length,
        averages
      }
    });
  } catch (error: any) {
    console.error('[Diversity] Error fetching user metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get aggregate diversity metrics across all users
 */
router.get('/aggregate', async (req, res) => {
  try {
    const { 
      timeWindow = '7d',
      recommendationType 
    } = req.query;

    // Calculate time threshold
    const now = new Date();
    let since: Date;
    switch (timeWindow) {
      case '1d':
        since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Build query
    let whereClause = gte(diversityMetrics.createdAt, since);
    if (recommendationType) {
      whereClause = and(
        whereClause,
        eq(diversityMetrics.recommendationType, recommendationType as string)
      ) as any;
    }

    const metrics = await db
      .select()
      .from(diversityMetrics)
      .where(whereClause)
      .orderBy(desc(diversityMetrics.createdAt));

    // Calculate aggregate statistics
    const totalSessions = metrics.length;
    const uniqueUsers = new Set(metrics.map(m => m.userId)).size;
    
    const aggregateStats = totalSessions > 0 ? {
      avgIntraDiversity: metrics.reduce((sum, m) => sum + (m.intraDiversity || 0), 0) / totalSessions,
      avgGenreBalance: metrics.reduce((sum, m) => sum + (m.genreBalance || 0), 0) / totalSessions,
      avgSerendipityScore: metrics.reduce((sum, m) => sum + (m.serendipityScore || 0), 0) / totalSessions,
      avgExplorationRate: metrics.reduce((sum, m) => sum + (m.explorationRate || 0), 0) / totalSessions,
      avgCoverageScore: metrics.reduce((sum, m) => sum + (m.coverageScore || 0), 0) / totalSessions,
      
      // Min/Max for monitoring
      minIntraDiversity: Math.min(...metrics.map(m => m.intraDiversity || 0)),
      maxIntraDiversity: Math.max(...metrics.map(m => m.intraDiversity || 0)),
      minGenreBalance: Math.min(...metrics.map(m => m.genreBalance || 0)),
      maxGenreBalance: Math.max(...metrics.map(m => m.genreBalance || 0))
    } : null;

    // Group by recommendation type
    const byType: Record<string, any> = {};
    metrics.forEach(m => {
      if (!byType[m.recommendationType]) {
        byType[m.recommendationType] = {
          count: 0,
          totalIntraDiversity: 0,
          totalGenreBalance: 0,
          totalSerendipity: 0
        };
      }
      byType[m.recommendationType].count++;
      byType[m.recommendationType].totalIntraDiversity += m.intraDiversity || 0;
      byType[m.recommendationType].totalGenreBalance += m.genreBalance || 0;
      byType[m.recommendationType].totalSerendipity += m.serendipityScore || 0;
    });

    const typeBreakdown = Object.entries(byType).map(([type, stats]: [string, any]) => ({
      recommendationType: type,
      sessionCount: stats.count,
      avgIntraDiversity: stats.totalIntraDiversity / stats.count,
      avgGenreBalance: stats.totalGenreBalance / stats.count,
      avgSerendipity: stats.totalSerendipity / stats.count
    }));

    res.json({
      timeWindow,
      period: {
        from: since,
        to: now
      },
      summary: {
        totalSessions,
        uniqueUsers,
        aggregateStats
      },
      byRecommendationType: typeBreakdown
    });
  } catch (error: any) {
    console.error('[Diversity] Error calculating aggregate metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get diversity trends over time
 */
router.get('/trends/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { days = 30 } = req.query;

    const since = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000);

    const metrics = await db
      .select()
      .from(diversityMetrics)
      .where(and(
        eq(diversityMetrics.userId, userId),
        gte(diversityMetrics.createdAt, since)
      ))
      .orderBy(diversityMetrics.createdAt);

    // Group by day for trend visualization
    const trendsByDay: Record<string, any[]> = {};
    metrics.forEach(m => {
      const day = m.createdAt?.toISOString().split('T')[0] || 'unknown';
      if (!trendsByDay[day]) {
        trendsByDay[day] = [];
      }
      trendsByDay[day].push(m);
    });

    const trends = Object.entries(trendsByDay).map(([date, dayMetrics]) => ({
      date,
      avgIntraDiversity: dayMetrics.reduce((sum, m) => sum + (m.intraDiversity || 0), 0) / dayMetrics.length,
      avgGenreBalance: dayMetrics.reduce((sum, m) => sum + (m.genreBalance || 0), 0) / dayMetrics.length,
      avgSerendipity: dayMetrics.reduce((sum, m) => sum + (m.serendipityScore || 0), 0) / dayMetrics.length,
      sessionCount: dayMetrics.length
    }));

    res.json({
      userId,
      period: {
        days: parseInt(days as string),
        from: since,
        to: new Date()
      },
      trends: trends.sort((a, b) => a.date.localeCompare(b.date))
    });
  } catch (error: any) {
    console.error('[Diversity] Error calculating trends:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
