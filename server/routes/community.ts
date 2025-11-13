import { Router, Response } from "express";
import { db } from "../db";
import { 
  users,
  userFollows, 
  reviewComments, 
  reviewAwards, 
  userLists, 
  listItems,
  listFollows,
  userActivityStats,
  userRatings,
  userRecommendations,
  userSimilarity,
  userFavorites,
  notifications,
  listCollaborators,
  userBadges,
  engagementEvents,
  dailyUserActivity,
  dailyContentStats,
  popularContentRankings,
  recommendationPerformance,
  communityGrowthMetrics,
  insertUserFollowSchema,
  insertReviewCommentSchema,
  insertReviewAwardSchema,
  insertUserListSchema,
  insertListItemSchema,
  insertListFollowSchema,
  insertNotificationSchema,
  insertListCollaboratorSchema,
  insertUserBadgeSchema,
  insertEngagementEventSchema
} from "@shared/schema";
import { eq, and, desc, sql, isNotNull, or, ilike, gte, lte, sum, avg, count, inArray, ne } from "drizzle-orm";
import { requireAuth } from "../routes";
import { z } from "zod";
import { tmdbService } from "../tmdb";
import { handleApiError, handleValidationError, handleNotFoundError, handleUnauthorizedError, handleForbiddenError } from "../utils/error-handler";
import type { AuthRequest, DbTransaction, UserStatsUpdate, AwardGroup } from "../types";
import { broadcastNotification } from "../broadcast";

const router = Router();

// ============================================
// USER SEARCH ENDPOINTS
// ============================================

// Search users by name
router.get("/users/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!query || query.trim().length === 0) {
      return handleValidationError(res, "Search query is required");
    }

    const searchPattern = `%${query.trim()}%`;

    const foundUsers = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(
        or(
          ilike(users.firstName, searchPattern),
          ilike(users.lastName, searchPattern),
          ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, searchPattern)
        )
      )
      .limit(limit);

    // Get stats for each user
    const usersWithStats = await Promise.all(
      foundUsers.map(async (user) => {
        const [stats] = await db
          .select()
          .from(userActivityStats)
          .where(eq(userActivityStats.userId, user.id));

        return {
          ...user,
          stats: stats || {
            totalReviews: 0,
            totalLists: 0,
            totalFollowers: 0,
            totalFollowing: 0,
            userLevel: 1,
            experiencePoints: 0,
          }
        };
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    handleApiError(res, error, "Failed to search users");
  }
});

// Get similar users based on taste
router.get("/users/:userId/similar", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get current user's ratings
    const userRatingsData = await db
      .select({
        tmdbId: userRatings.tmdbId,
        rating: userRatings.rating,
      })
      .from(userRatings)
      .where(eq(userRatings.userId, userId));

    if (userRatingsData.length === 0) {
      return res.json([]);
    }

    // Create a map of user's ratings for quick lookup
    const userRatingsMap = new Map(
      userRatingsData.map(r => [r.tmdbId, r.rating])
    );
    const userTmdbIds = userRatingsData.map(r => r.tmdbId);

    // Find other users who have rated the same content
    const otherUsersRatings = await db
      .select({
        userId: userRatings.userId,
        tmdbId: userRatings.tmdbId,
        rating: userRatings.rating,
      })
      .from(userRatings)
      .where(
        and(
          inArray(userRatings.tmdbId, userTmdbIds),
          ne(userRatings.userId, userId)
        )
      );

    // Calculate similarity scores
    const userSimilarityMap = new Map<string, { commonCount: number; totalDiff: number }>();

    for (const rating of otherUsersRatings) {
      const userRating = userRatingsMap.get(rating.tmdbId);
      if (userRating !== undefined) {
        const existing = userSimilarityMap.get(rating.userId) || { commonCount: 0, totalDiff: 0 };
        existing.commonCount++;
        existing.totalDiff += Math.abs(userRating - rating.rating);
        userSimilarityMap.set(rating.userId, existing);
      }
    }

    // Filter users with at least 3 common ratings and calculate similarity
    const similarUsers = Array.from(userSimilarityMap.entries())
      .filter(([_, data]) => data.commonCount >= 3)
      .map(([otherUserId, data]) => ({
        userId: otherUserId,
        commonMovies: data.commonCount,
        avgDifference: data.totalDiff / data.commonCount,
        similarityScore: Math.max(0, 1 - (data.totalDiff / (data.commonCount * 10)))
      }))
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, limit);

    if (similarUsers.length === 0) {
      return res.json([]);
    }

    // Get user details and stats
    const userIds = similarUsers.map(u => u.userId);

    const usersWithDetails = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    // Get stats for each user
    const usersWithStats = await Promise.all(
      usersWithDetails.map(async (user) => {
        const [stats] = await db
          .select()
          .from(userActivityStats)
          .where(eq(userActivityStats.userId, user.id));

        const similarityData = similarUsers.find(s => s.userId === user.id);

        return {
          ...user,
          stats: stats || {
            totalReviews: 0,
            totalLists: 0,
            totalFollowers: 0,
            totalFollowing: 0,
            userLevel: 1,
            experiencePoints: 0,
          },
          similarityScore: similarityData?.similarityScore || 0,
          commonMovies: similarityData?.commonMovies || 0,
          matchPercentage: Math.round((similarityData?.similarityScore || 0) * 100),
        };
      })
    );

    // Sort by similarity score
    usersWithStats.sort((a, b) => b.similarityScore - a.similarityScore);

    res.json(usersWithStats);
  } catch (error) {
    handleApiError(res, error, "Failed to find similar users");
  }
});

// ============================================
// USER FOLLOWS ENDPOINTS
// ============================================

// Check if user is following another user
router.get("/:userId/following/:targetUserId", async (req, res) => {
  try {
    const { userId, targetUserId } = req.params;

    const existing = await db
      .select()
      .from(userFollows)
      .where(and(
        eq(userFollows.followerId, userId),
        eq(userFollows.followingId, targetUserId)
      ))
      .limit(1);

    res.json({ isFollowing: existing.length > 0 });
  } catch (error) {
    handleApiError(res, error, "Failed to check follow status");
  }
});

// Combined follow/unfollow endpoint (used by profile page)
router.post("/follow", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { targetUserId, action } = authReq.body;

    if (!targetUserId || !action) {
      return handleValidationError(res, "Missing required fields: targetUserId and action");
    }

    if (action !== 'follow' && action !== 'unfollow') {
      return handleValidationError(res, "Action must be 'follow' or 'unfollow'");
    }

    if (userId === targetUserId) {
      return handleValidationError(res, "Cannot follow yourself");
    }

    if (action === 'follow') {
      // Check if already following
      const existing = await db
        .select()
        .from(userFollows)
        .where(and(
          eq(userFollows.followerId, userId),
          eq(userFollows.followingId, targetUserId)
        ));

      if (existing.length > 0) {
        return res.json({ message: "Already following this user", isFollowing: true });
      }

      // Create follow relationship in a transaction
      const follow = await db.transaction(async (tx) => {
        const [newFollow] = await tx
          .insert(userFollows)
          .values({ followerId: userId, followingId: targetUserId })
          .returning();

        // Update activity stats for both users
        await updateUserStatsInTx(tx, userId, { totalFollowing: sql`total_following + 1` });
        await updateUserStatsInTx(tx, targetUserId, { totalFollowers: sql`total_followers + 1` });

        // Create notification for followed user
        const [notification] = await tx.insert(notifications).values({
          userId: targetUserId,
          actorId: userId,
          type: "follow",
          entityType: "user",
          entityId: userId,
          message: `started following you`,
          isRead: false,
        }).returning();

        return { newFollow, notification };
      });

      // Broadcast notification via WebSocket for real-time update
      if (broadcastNotification && follow.notification) {
        broadcastNotification(targetUserId, follow.notification);
      }

      res.status(201).json({ message: "Followed successfully", isFollowing: true });
    } else {
      // Unfollow in a transaction
      const result = await db.transaction(async (tx) => {
        const deleted = await tx
          .delete(userFollows)
          .where(and(
            eq(userFollows.followerId, userId),
            eq(userFollows.followingId, targetUserId)
          ))
          .returning();

        if (deleted.length === 0) {
          return null;
        }

        // Update activity stats for both users
        await updateUserStatsInTx(tx, userId, { totalFollowing: sql`total_following - 1` });
        await updateUserStatsInTx(tx, targetUserId, { totalFollowers: sql`total_followers - 1` });

        return deleted;
      });

      if (!result) {
        return res.json({ message: "Not following this user", isFollowing: false });
      }

      res.json({ message: "Unfollowed successfully", isFollowing: false });
    }
  } catch (error) {
    handleApiError(res, error, "Failed to update follow status");
  }
});

// Follow a user
router.post("/:userId/follow", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const authenticatedUserId = authReq.userId;
    if (!authenticatedUserId) return res.status(401).json({ error: "Unauthorized" });

    const { userId } = authReq.params;
    
    // Verify authenticated user matches userId in URL
    if (authenticatedUserId !== userId) {
      return handleForbiddenError(res, "Cannot perform actions for other users");
    }

    // Validate input
    const validationResult = insertUserFollowSchema.safeParse({
      followerId: userId,
      followingId: authReq.body.followingId
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    const { followingId } = validationResult.data;

    if (userId === followingId) {
      return handleValidationError(res, "Cannot follow yourself");
    }

    // Check if already following
    const existing = await db
      .select()
      .from(userFollows)
      .where(and(
        eq(userFollows.followerId, userId),
        eq(userFollows.followingId, followingId)
      ));

    if (existing.length > 0) {
      return handleValidationError(res, "Already following this user");
    }

    // Create follow relationship in a transaction
    const follow = await db.transaction(async (tx) => {
      const [newFollow] = await tx
        .insert(userFollows)
        .values({ followerId: userId, followingId })
        .returning();

      // Update activity stats for both users
      await updateUserStatsInTx(tx, userId, { totalFollowing: sql`total_following + 1` });
      await updateUserStatsInTx(tx, followingId, { totalFollowers: sql`total_followers + 1` });

      // Create notification for followed user
      await tx.insert(notifications).values({
        userId: followingId,
        actorId: userId,
        type: "follow",
        entityType: "user",
        entityId: userId,
        message: `started following you`,
        isRead: false,
      });

      return newFollow;
    });

    res.status(201).json(follow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to follow user");
  }
});

// Unfollow a user
router.delete("/:userId/follow/:followingId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const authenticatedUserId = authReq.userId;
    if (!authenticatedUserId) return res.status(401).json({ error: "Unauthorized" });

    const { userId, followingId } = authReq.params;

    // Verify authenticated user matches userId in URL
    if (authenticatedUserId !== userId) {
      return handleForbiddenError(res, "Cannot perform actions for other users");
    }

    // Unfollow in a transaction
    const result = await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(userFollows)
        .where(and(
          eq(userFollows.followerId, userId),
          eq(userFollows.followingId, followingId)
        ))
        .returning();

      if (deleted.length === 0) {
        return null; // Return null instead of throwing
      }

      // Update activity stats for both users
      await updateUserStatsInTx(tx, userId, { totalFollowing: sql`total_following - 1` });
      await updateUserStatsInTx(tx, followingId, { totalFollowers: sql`total_followers - 1` });

      return deleted;
    });

    if (!result) {
      return handleNotFoundError(res, "Follow relationship");
    }

    res.json({ message: "Unfollowed successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to unfollow user");
  }
});

// Get user's followers
router.get("/:userId/followers", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const results = await db
      .select({
        id: userFollows.id,
        followerId: userFollows.followerId,
        createdAt: userFollows.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followerId, users.id))
      .where(eq(userFollows.followingId, userId))
      .orderBy(desc(userFollows.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    res.json(data);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch followers");
  }
});

// Get users being followed
router.get("/:userId/following", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const results = await db
      .select({
        id: userFollows.id,
        followingId: userFollows.followingId,
        createdAt: userFollows.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userFollows)
      .innerJoin(users, eq(userFollows.followingId, users.id))
      .where(eq(userFollows.followerId, userId))
      .orderBy(desc(userFollows.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    res.json(data);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch following");
  }
});

// Check if following a user
router.get("/:userId/is-following/:targetUserId", async (req, res) => {
  try {
    const { userId, targetUserId } = req.params;

    const result = await db
      .select()
      .from(userFollows)
      .where(and(
        eq(userFollows.followerId, userId),
        eq(userFollows.followingId, targetUserId)
      ));

    res.json({ isFollowing: result.length > 0 });
  } catch (error) {
    handleApiError(res, error, "Failed to check follow status");
  }
});

// ============================================
// REVIEW COMMENTS ENDPOINTS
// ============================================

// Add comment to review
router.post("/reviews/:reviewId/comments", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { reviewId } = authReq.params;

    // Validate input using schema
    const validationResult = insertReviewCommentSchema.safeParse({
      userId: userId,
      reviewId,
      comment: authReq.body.comment,
      parentCommentId: authReq.body.parentCommentId || null
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    const { comment, parentCommentId } = validationResult.data;

    const result = await db.transaction(async (tx) => {
      const [newComment] = await tx
        .insert(reviewComments)
        .values({
          userId: userId,
          reviewId,
          comment,
          parentCommentId
        })
        .returning();

      // Update user stats
      await updateUserStatsInTx(tx, userId, { totalComments: sql`total_comments + 1` });

      // Fetch review to get author
      const [review] = await tx
        .select()
        .from(userRatings)
        .where(eq(userRatings.id, reviewId));

      // Create notification for review author (if not commenting on own review)
      if (review && review.userId !== userId) {
        await tx.insert(notifications).values({
          userId: review.userId,
          actorId: userId,
          type: "comment",
          entityType: "review",
          entityId: reviewId,
          message: `commented on your review`,
          isRead: false,
        });
      }

      // Fetch user details for response
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId));

      return { ...newComment, user };
    });

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to add comment");
  }
});

// Get comments for review
router.get("/reviews/:reviewId/comments", async (req, res) => {
  try {
    const { reviewId } = req.params;

    const comments = await db
      .select({
        id: reviewComments.id,
        userId: reviewComments.userId,
        reviewId: reviewComments.reviewId,
        comment: reviewComments.comment,
        parentCommentId: reviewComments.parentCommentId,
        createdAt: reviewComments.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(reviewComments)
      .innerJoin(users, eq(reviewComments.userId, users.id))
      .where(eq(reviewComments.reviewId, reviewId))
      .orderBy(reviewComments.createdAt);

    res.json(comments);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch comments");
  }
});

// Delete comment
router.delete("/reviews/:reviewId/comments/:commentId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { commentId } = authReq.params;

    // Delete only if the authenticated user owns the comment
    const result = await db
      .delete(reviewComments)
      .where(and(
        eq(reviewComments.id, commentId),
        eq(reviewComments.userId, userId)
      ))
      .returning();

    if (result.length === 0) {
      return handleNotFoundError(res, "Comment");
    }

    // Update user stats
    await updateUserStats(userId, { totalComments: sql`total_comments - 1` });

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to delete comment");
  }
});

// ============================================
// REVIEW AWARDS ENDPOINTS
// ============================================

// Give award to review
router.post("/reviews/:reviewId/awards", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { reviewId } = authReq.params;

    // Validate input using schema
    const validationResult = insertReviewAwardSchema.safeParse({
      userId: userId,
      reviewId,
      awardType: authReq.body.awardType
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    const { awardType } = validationResult.data;

    // Check if user already gave this award to this review
    const existing = await db
      .select()
      .from(reviewAwards)
      .where(and(
        eq(reviewAwards.userId, userId),
        eq(reviewAwards.reviewId, reviewId),
        eq(reviewAwards.awardType, awardType)
      ));

    if (existing.length > 0) {
      return handleValidationError(res, "Award already given");
    }

    const award = await db.transaction(async (tx) => {
      const [newAward] = await tx
        .insert(reviewAwards)
        .values({ userId: userId, reviewId, awardType })
        .returning();

      // Update stats for giver
      await updateUserStatsInTx(tx, userId, { totalAwardsGiven: sql`total_awards_given + 1` });

      // Update stats for review author
      const [review] = await tx
        .select()
        .from(userRatings)
        .where(eq(userRatings.id, reviewId));

      if (review) {
        await updateUserStatsInTx(tx, review.userId, { totalAwardsReceived: sql`total_awards_received + 1` });
        
        // Create notification for review author (if not awarding own review)
        if (review.userId !== userId) {
          await tx.insert(notifications).values({
            userId: review.userId,
            actorId: userId,
            type: "award",
            entityType: "review",
            entityId: reviewId,
            message: `gave an award to your review`,
            isRead: false,
          });
        }
      }

      return newAward;
    });

    res.status(201).json(award);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to give award");
  }
});

// Get awards for review
router.get("/reviews/:reviewId/awards", async (req, res) => {
  try {
    const { reviewId } = req.params;

    const awards = await db
      .select({
        id: reviewAwards.id,
        userId: reviewAwards.userId,
        awardType: reviewAwards.awardType,
        createdAt: reviewAwards.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(reviewAwards)
      .leftJoin(users, eq(reviewAwards.userId, users.id))
      .where(eq(reviewAwards.reviewId, reviewId));

    res.json(awards);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch awards");
  }
});

// Get user's awards for a specific review (to show which awards the current user has given)
router.get("/reviews/:reviewId/user-awards", async (req, res: Response) => {
  try {
    // Get userId from header (optional - returns empty array if not authenticated)
    const userId = req.headers['x-user-id'] as string;
    const { reviewId } = req.params;

    if (!userId) {
      // Not authenticated - return empty array (no awards given by this user)
      return res.json([]);
    }

    const userAwards = await db
      .select()
      .from(reviewAwards)
      .where(and(
        eq(reviewAwards.reviewId, reviewId),
        eq(reviewAwards.userId, userId)
      ));

    res.json(userAwards);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user awards");
  }
});

// Remove award
router.delete("/reviews/:reviewId/awards/:awardId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { awardId } = authReq.params;

    // Delete only if the authenticated user owns the award
    const result = await db
      .delete(reviewAwards)
      .where(and(
        eq(reviewAwards.id, awardId),
        eq(reviewAwards.userId, userId)
      ))
      .returning();

    if (result.length === 0) {
      return handleNotFoundError(res, "Award");
    }

    // Update stats
    await updateUserStats(userId, { totalAwardsGiven: sql`total_awards_given - 1` });

    res.json({ message: "Award removed successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to remove award");
  }
});

// ============================================
// USER ACTIVITY STATS
// ============================================

// Get user activity stats
router.get("/:userId/stats", async (req, res) => {
  try {
    const { userId } = req.params;

    let [stats] = await db
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    // If no stats exist, create them
    if (!stats) {
      [stats] = await db
        .insert(userActivityStats)
        .values({ userId })
        .returning();
    }

    res.json(stats);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user stats");
  }
});

// Helper function to update user stats
export async function updateUserStats(userId: string, updates: UserStatsUpdate) {
  try {
    // Check if stats exist
    const [existing] = await db
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    if (existing) {
      // Update existing stats
      await db
        .update(userActivityStats)
        .set({ ...updates, lastActivityAt: new Date() })
        .where(eq(userActivityStats.userId, userId));
    } else {
      // Create new stats row first, then apply updates
      await db
        .insert(userActivityStats)
        .values({ userId });
      
      // Now apply the updates to the newly created row
      await db
        .update(userActivityStats)
        .set({ ...updates, lastActivityAt: new Date() })
        .where(eq(userActivityStats.userId, userId));
    }

    // Calculate and update level based on XP
    await calculateUserLevel(userId);
  } catch (error) {
    console.error("Error updating user stats:", error);
  }
}

// Helper function to update user stats within a transaction
async function updateUserStatsInTx(tx: DbTransaction, userId: string, updates: UserStatsUpdate) {
  try {
    // Check if stats exist
    const [existing] = await tx
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    if (existing) {
      // Update existing stats
      await tx
        .update(userActivityStats)
        .set({ ...updates, lastActivityAt: new Date() })
        .where(eq(userActivityStats.userId, userId));
    } else {
      // Create new stats row first, then apply updates
      await tx
        .insert(userActivityStats)
        .values({ userId });
      
      // Now apply the updates to the newly created row
      await tx
        .update(userActivityStats)
        .set({ ...updates, lastActivityAt: new Date() })
        .where(eq(userActivityStats.userId, userId));
    }

    // Calculate and update level based on XP
    await calculateUserLevelInTx(tx, userId);
  } catch (error) {
    console.error("Error updating user stats in transaction:", error);
    throw error;
  }
}

// Calculate user level based on activity
async function calculateUserLevel(userId: string) {
  try {
    const [stats] = await db
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    if (!stats) return;

    // XP calculation
    const xp = 
      ((stats.totalReviews ?? 0) * 10) +
      ((stats.totalLists ?? 0) * 15) +
      ((stats.totalAwardsReceived ?? 0) * 5) +
      ((stats.totalFollowers ?? 0) * 3) +
      ((stats.totalComments ?? 0) * 2);

    // Level thresholds
    let level = 1;
    if (xp >= 5000) level = 5;
    else if (xp >= 1500) level = 4;
    else if (xp >= 500) level = 3;
    else if (xp >= 100) level = 2;

    await db
      .update(userActivityStats)
      .set({ experiencePoints: xp, userLevel: level })
      .where(eq(userActivityStats.userId, userId));
  } catch (error) {
    console.error("Error calculating user level:", error);
  }
}

// Calculate user level based on activity within a transaction
async function calculateUserLevelInTx(tx: DbTransaction, userId: string) {
  try {
    const [stats] = await tx
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    if (!stats) return;

    // XP calculation
    const xp = 
      ((stats.totalReviews ?? 0) * 10) +
      ((stats.totalLists ?? 0) * 15) +
      ((stats.totalAwardsReceived ?? 0) * 5) +
      ((stats.totalFollowers ?? 0) * 3) +
      ((stats.totalComments ?? 0) * 2);

    // Level thresholds
    let level = 1;
    if (xp >= 5000) level = 5;
    else if (xp >= 1500) level = 4;
    else if (xp >= 500) level = 3;
    else if (xp >= 100) level = 2;

    await tx
      .update(userActivityStats)
      .set({ experiencePoints: xp, userLevel: level })
      .where(eq(userActivityStats.userId, userId));
  } catch (error) {
    console.error("Error calculating user level in transaction:", error);
    throw error;
  }
}

// ============================================
// USER LISTS ENDPOINTS
// ============================================

// Create new list
router.post("/lists", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Validate input using schema
    const validationResult = insertUserListSchema.safeParse({
      userId: userId,
      title: authReq.body.title,
      description: authReq.body.description || null,
      isPublic: authReq.body.isPublic !== undefined ? authReq.body.isPublic : true
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    const { title, description, isPublic } = validationResult.data;

    const [list] = await db
      .insert(userLists)
      .values({
        userId: userId,
        title,
        description,
        isPublic
      })
      .returning();

    // Update user stats
    await updateUserStats(userId, { totalLists: sql`total_lists + 1` });

    res.status(201).json(list);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to create list");
  }
});

// Get list details with items
router.get("/lists/:listId", async (req, res: Response) => {
  try {
    const { listId } = req.params;
    // Get requesting user ID from auth header (optional for public lists)
    const requestingUserId = req.headers['x-user-id'] as string | undefined;

    const [list] = await db
      .select({
        id: userLists.id,
        userId: userLists.userId,
        title: userLists.title,
        description: userLists.description,
        isPublic: userLists.isPublic,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
        createdAt: userLists.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    // Check privacy: allow access only if list is public OR user is the authenticated owner
    if (!list.isPublic) {
      // Private list requires authentication
      if (!requestingUserId) {
        return res.status(401).json({ 
          error: "Authentication required to view this private list" 
        });
      }
      // Only the owner can view their private list
      if (list.userId !== requestingUserId) {
        return res.status(403).json({ 
          error: "This list is private and you do not have permission to view it" 
        });
      }
    }

    // Get list items
    const items = await db
      .select()
      .from(listItems)
      .where(eq(listItems.listId, listId))
      .orderBy(listItems.position);

    res.json({ ...list, items });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch list");
  }
});

// Get user's lists (with items for membership checking)
router.get("/users/:userId/lists", async (req, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUserId = req.headers['x-user-id'] as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    
    // If requesting user is the authenticated owner, show all lists (public and private)
    // Otherwise, only show public lists
    const isOwner = requestingUserId && userId === requestingUserId;
    
    const whereCondition = isOwner 
      ? eq(userLists.userId, userId)
      : and(eq(userLists.userId, userId), eq(userLists.isPublic, true));

    const lists = await db
      .select()
      .from(userLists)
      .where(whereCondition)
      .orderBy(desc(userLists.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = lists.length > limit;
    const listsToReturn = hasMore ? lists.slice(0, limit) : lists;

    // Fetch items for each list to enable membership checking in AddToListButton
    const listsWithItems = await Promise.all(
      listsToReturn.map(async (list) => {
        const items = await db
          .select()
          .from(listItems)
          .where(eq(listItems.listId, list.id))
          .orderBy(listItems.position);
        
        return { ...list, items };
      })
    );

    res.json(listsWithItems);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user lists");
  }
});

// Get public/popular lists
router.get("/lists", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const results = await db
      .select({
        id: userLists.id,
        userId: userLists.userId,
        title: userLists.title,
        description: userLists.description,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
        createdAt: userLists.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(eq(userLists.isPublic, true))
      .orderBy(desc(userLists.followerCount), desc(userLists.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    res.json(data);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch public lists");
  }
});

// Search lists by keyword
router.get("/lists/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!query || query.trim().length === 0) {
      return handleValidationError(res, "Search query is required");
    }

    const searchPattern = `%${query.trim()}%`;

    const results = await db
      .select({
        id: userLists.id,
        userId: userLists.userId,
        title: userLists.title,
        description: userLists.description,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
        createdAt: userLists.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(
        and(
          eq(userLists.isPublic, true),
          or(
            ilike(userLists.title, searchPattern),
            ilike(userLists.description, searchPattern)
          )
        )
      )
      .orderBy(desc(userLists.followerCount), desc(userLists.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + limit : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to search lists");
  }
});

// Get recommended lists based on user's taste
router.get("/lists/recommended/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get user's highly-rated movies/shows (rating >= 7) to determine taste
    const userRatingsData = await db
      .select({
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        rating: userRatings.rating,
      })
      .from(userRatings)
      .where(
        and(
          eq(userRatings.userId, userId),
          gte(userRatings.rating, 7)
        )
      )
      .orderBy(desc(userRatings.rating))
      .limit(50); // Use top 50 highly-rated items for taste profiling

    if (userRatingsData.length === 0) {
      return res.json([]);
    }

    // Extract tmdbIds from user's favorites
    const favoriteTmdbIds = userRatingsData.map(r => r.tmdbId);

    // Guard: Return early if no items to match
    if (favoriteTmdbIds.length === 0) {
      return res.json([]);
    }

    // Find public lists that contain items the user loves
    const listsWithMatchingItems = await db
      .select({
        listId: listItems.listId,
        matchCount: sql<number>`count(distinct ${listItems.tmdbId})`.as('match_count'),
      })
      .from(listItems)
      .innerJoin(userLists, eq(listItems.listId, userLists.id))
      .where(
        and(
          inArray(listItems.tmdbId, favoriteTmdbIds),
          eq(userLists.isPublic, true),
          ne(userLists.userId, userId) // Don't recommend user's own lists
        )
      )
      .groupBy(listItems.listId)
      .orderBy(desc(sql`count(distinct ${listItems.tmdbId})`))
      .limit(limit);

    if (listsWithMatchingItems.length === 0) {
      return res.json([]);
    }

    // Get full list details with user info
    const recommendedListIds = listsWithMatchingItems.map(l => l.listId);

    // Guard: Protect against empty array
    if (recommendedListIds.length === 0) {
      return res.json([]);
    }

    const listsWithDetails = await db
      .select({
        id: userLists.id,
        userId: userLists.userId,
        title: userLists.title,
        description: userLists.description,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
        createdAt: userLists.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(inArray(userLists.id, recommendedListIds));

    // Combine with match counts
    const recommendedLists = listsWithDetails.map(list => {
      const matchData = listsWithMatchingItems.find(m => m.listId === list.id);
      const itemCount = list.itemCount || 0;
      return {
        ...list,
        matchCount: matchData?.matchCount || 0,
        matchPercentage: itemCount > 0 
          ? Math.round(((matchData?.matchCount || 0) / itemCount) * 100)
          : 0,
      };
    });

    // Sort by match count (already sorted from query, but ensure consistency)
    recommendedLists.sort((a, b) => b.matchCount - a.matchCount);

    res.json(recommendedLists);
  } catch (error) {
    handleApiError(res, error, "Failed to get recommended lists");
  }
});

// Get similar lists (lists with shared content)
router.get("/lists/:listId/similar", async (req, res) => {
  try {
    const { listId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    // Get the source list to verify it exists
    const [sourceList] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!sourceList) {
      return handleNotFoundError(res, "List");
    }

    // Get all items from the source list
    const sourceItems = await db
      .select()
      .from(listItems)
      .where(eq(listItems.listId, listId));

    if (sourceItems.length === 0) {
      return res.json([]);
    }

    // Extract tmdbIds from source list
    const sourceTmdbIds = sourceItems.map(item => item.tmdbId);

    // Guard: Return early if no items to compare (prevents SQL errors with empty arrays)
    if (sourceTmdbIds.length === 0) {
      return res.json([]);
    }

    // Find public lists that share items with the source list (with public filter)
    const publicListsWithSharedItems = await db
      .select({
        listId: listItems.listId,
        isPublic: userLists.isPublic,
        sharedCount: sql<number>`count(distinct ${listItems.tmdbId})`.as('shared_count'),
      })
      .from(listItems)
      .innerJoin(userLists, eq(listItems.listId, userLists.id))
      .where(
        and(
          inArray(listItems.tmdbId, sourceTmdbIds),
          ne(listItems.listId, listId),
          eq(userLists.isPublic, true)
        )
      )
      .groupBy(listItems.listId, userLists.isPublic)
      .orderBy(desc(sql`count(distinct ${listItems.tmdbId})`))
      .limit(limit);

    if (publicListsWithSharedItems.length === 0) {
      return res.json([]);
    }

    // Get full list details
    const similarListIds = publicListsWithSharedItems.map(sl => sl.listId);
    
    // Guard: Should not happen but protect against empty array
    if (similarListIds.length === 0) {
      return res.json([]);
    }

    const listsWithDetails = await db
      .select({
        id: userLists.id,
        userId: userLists.userId,
        title: userLists.title,
        description: userLists.description,
        isPublic: userLists.isPublic,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
        createdAt: userLists.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(inArray(userLists.id, similarListIds));

    // Get shared items for all similar lists in one query
    const allSharedItems = await db
      .select({
        listId: listItems.listId,
        id: listItems.id,
        tmdbId: listItems.tmdbId,
        mediaType: listItems.mediaType,
        title: listItems.title,
        posterPath: listItems.posterPath,
        position: listItems.position,
      })
      .from(listItems)
      .where(
        and(
          inArray(listItems.listId, similarListIds),
          inArray(listItems.tmdbId, sourceTmdbIds)
        )
      )
      .orderBy(listItems.listId, listItems.position);

    // Group shared items by list and combine with list details
    const sharedItemsByList = allSharedItems.reduce((acc, item) => {
      if (!acc[item.listId]) {
        acc[item.listId] = [];
      }
      if (acc[item.listId].length < 5) { // Limit to 5 items per list
        acc[item.listId].push({
          id: item.id,
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
        });
      }
      return acc;
    }, {} as Record<string, any[]>);

    const result = listsWithDetails.map(list => {
      const sharedData = publicListsWithSharedItems.find(sl => sl.listId === list.id);
      const sharedCount = sharedData?.sharedCount || 0;
      const overlapPercentage = Math.round((sharedCount / sourceItems.length) * 100);
      
      return {
        ...list,
        sharedItemCount: sharedCount,
        overlapPercentage,
        sharedItems: sharedItemsByList[list.id] || [],
      };
    });

    // Sort by shared count (descending)
    result.sort((a, b) => b.sharedItemCount - a.sharedItemCount);

    res.json(result);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch similar lists");
  }
});

// Get lists containing a specific movie/TV show
router.get("/lists/containing/:tmdbId/:mediaType", async (req, res) => {
  try {
    const { tmdbId, mediaType } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const tmdbIdNum = parseInt(tmdbId);
    if (isNaN(tmdbIdNum)) {
      return handleValidationError(res, "Invalid tmdbId");
    }

    // Find public lists containing this movie/TV show
    const listsContainingMedia = await db
      .select({
        listId: listItems.listId,
        itemCount: userLists.itemCount,
      })
      .from(listItems)
      .innerJoin(userLists, eq(listItems.listId, userLists.id))
      .where(
        and(
          eq(listItems.tmdbId, tmdbIdNum),
          eq(listItems.mediaType, mediaType),
          eq(userLists.isPublic, true)
        )
      )
      .groupBy(listItems.listId, userLists.itemCount)
      .orderBy(desc(userLists.itemCount))
      .limit(limit);

    if (listsContainingMedia.length === 0) {
      return res.json([]);
    }

    const listIds = listsContainingMedia.map(l => l.listId);
    
    // Guard against empty array
    if (listIds.length === 0) {
      return res.json([]);
    }

    // Get full list details with user info
    const listsWithDetails = await db
      .select({
        id: userLists.id,
        userId: userLists.userId,
        title: userLists.title,
        description: userLists.description,
        isPublic: userLists.isPublic,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
        createdAt: userLists.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(inArray(userLists.id, listIds));

    // Get preview items for each list (up to 4 items)
    const allPreviewItems = await db
      .select({
        listId: listItems.listId,
        id: listItems.id,
        tmdbId: listItems.tmdbId,
        mediaType: listItems.mediaType,
        title: listItems.title,
        posterPath: listItems.posterPath,
        position: listItems.position,
      })
      .from(listItems)
      .where(inArray(listItems.listId, listIds))
      .orderBy(listItems.listId, listItems.position);

    // Group preview items by list (limit to 4 per list)
    const previewItemsByList = allPreviewItems.reduce((acc, item) => {
      if (!acc[item.listId]) {
        acc[item.listId] = [];
      }
      if (acc[item.listId].length < 4) {
        acc[item.listId].push({
          id: item.id,
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
        });
      }
      return acc;
    }, {} as Record<string, any[]>);

    const result = listsWithDetails.map(list => ({
      ...list,
      items: previewItemsByList[list.id] || [],
    }));

    // Sort by item count (more items = more curated)
    result.sort((a, b) => (b.itemCount || 0) - (a.itemCount || 0));

    res.json(result);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch lists");
  }
});

// Update list
router.put("/lists/:listId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId } = authReq.params;

    // Validate input using schema
    const validationResult = insertUserListSchema.safeParse({
      userId: userId,
      title: authReq.body.title,
      description: authReq.body.description,
      isPublic: authReq.body.isPublic
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    const { title, description, isPublic } = validationResult.data;

    // Update only if the authenticated user owns the list
    const [list] = await db
      .update(userLists)
      .set({ title, description, isPublic, updatedAt: new Date() })
      .where(and(
        eq(userLists.id, listId),
        eq(userLists.userId, userId)
      ))
      .returning();

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    // Notify all list followers about the update
    const followers = await db
      .select({ userId: listFollows.userId })
      .from(listFollows)
      .where(eq(listFollows.listId, listId));

    // Create notifications for all followers
    if (followers.length > 0) {
      await db.insert(notifications).values(
        followers.map(follower => ({
          userId: follower.userId,
          actorId: userId,
          type: "list_update",
          entityType: "list",
          entityId: listId,
          message: `updated the list "${list.title}"`,
          isRead: false,
        }))
      );
    }

    res.json(list);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to update list");
  }
});

// Delete list
router.delete("/lists/:listId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId } = authReq.params;

    // Delete list items first
    await db.delete(listItems).where(eq(listItems.listId, listId));

    // Delete list follows
    await db.delete(listFollows).where(eq(listFollows.listId, listId));

    // Delete only if the authenticated user owns the list
    const result = await db
      .delete(userLists)
      .where(and(
        eq(userLists.id, listId),
        eq(userLists.userId, userId)
      ))
      .returning();

    if (result.length === 0) {
      return handleNotFoundError(res, "List");
    }

    // Update user stats
    await updateUserStats(userId, { totalLists: sql`total_lists - 1` });

    res.json({ message: "List deleted successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to delete list");
  }
});

// Add item to list
router.post("/lists/:listId/items", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId } = authReq.params;

    // First verify the list belongs to the authenticated user
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Cannot modify other users' lists");
    }

    // Validate input using schema
    const validationResult = insertListItemSchema.safeParse({
      listId,
      tmdbId: authReq.body.tmdbId,
      mediaType: authReq.body.mediaType,
      title: authReq.body.title,
      posterPath: authReq.body.posterPath || null,
      note: authReq.body.note || null,
      position: 0
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    const { tmdbId, mediaType, title, posterPath, note } = validationResult.data;

    // Get current item count for position
    const existingItems = await db
      .select()
      .from(listItems)
      .where(eq(listItems.listId, listId));

    const [item] = await db
      .insert(listItems)
      .values({
        listId,
        tmdbId,
        mediaType,
        title,
        posterPath,
        note,
        position: existingItems.length
      })
      .returning();

    // Update list item count
    await db
      .update(userLists)
      .set({ itemCount: sql`item_count + 1` })
      .where(eq(userLists.id, listId));

    res.status(201).json(item);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to add list item");
  }
});

// Remove item from list
router.delete("/lists/:listId/items/:itemId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId, itemId } = authReq.params;

    // First verify the list belongs to the authenticated user
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Cannot modify other users' lists");
    }

    const result = await db
      .delete(listItems)
      .where(and(
        eq(listItems.id, itemId),
        eq(listItems.listId, listId)
      ))
      .returning();

    if (result.length === 0) {
      return handleNotFoundError(res, "List item");
    }

    // Update list item count
    await db
      .update(userLists)
      .set({ itemCount: sql`item_count - 1` })
      .where(eq(userLists.id, listId));

    res.json({ message: "Item removed successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to remove list item");
  }
});

// Reorder list items
router.put("/lists/:listId/items/:itemId/position", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId, itemId} = authReq.params;

    // First verify the list belongs to the authenticated user
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Cannot modify other users' lists");
    }

    const { position } = authReq.body;

    if (position === undefined) {
      return handleValidationError(res, "Position is required");
    }

    await db
      .update(listItems)
      .set({ position })
      .where(eq(listItems.id, itemId));

    res.json({ message: "Position updated successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to update position");
  }
});

// Update list item note
router.put("/lists/:listId/items/:itemId/note", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId, itemId } = authReq.params;

    // First verify the list belongs to the authenticated user
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Cannot modify other users' lists");
    }

    const { note } = authReq.body;

    await db
      .update(listItems)
      .set({ note: note || null })
      .where(eq(listItems.id, itemId));

    res.json({ message: "Note updated successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to update note");
  }
});

// ============================================
// LIST FOLLOWS ENDPOINTS
// ============================================

// Follow a list
router.post("/lists/:listId/follow", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId } = authReq.params;

    // Validate input using schema
    const validationResult = insertListFollowSchema.safeParse({
      userId: userId,
      listId
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input data", validationResult.error.errors);
    }

    // Check if already following
    const existing = await db
      .select()
      .from(listFollows)
      .where(and(
        eq(listFollows.userId, userId),
        eq(listFollows.listId, listId)
      ));

    if (existing.length > 0) {
      return handleValidationError(res, "Already following this list");
    }

    // Create follow relationship
    const [follow] = await db
      .insert(listFollows)
      .values({ userId: userId, listId })
      .returning();

    // Update list follower count
    await db
      .update(userLists)
      .set({ followerCount: sql`follower_count + 1` })
      .where(eq(userLists.id, listId));

    res.status(201).json(follow);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to follow list");
  }
});

// Unfollow a list
router.delete("/lists/:listId/follow", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId } = authReq.params;

    const result = await db
      .delete(listFollows)
      .where(and(
        eq(listFollows.userId, userId),
        eq(listFollows.listId, listId)
      ))
      .returning();

    if (result.length === 0) {
      return handleNotFoundError(res, "List follow");
    }

    // Update list follower count
    await db
      .update(userLists)
      .set({ followerCount: sql`follower_count - 1` })
      .where(eq(userLists.id, listId));

    res.json({ message: "Unfollowed list successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to unfollow list");
  }
});

// Get lists followed by user
router.get("/users/:userId/followed-lists", async (req, res) => {
  try {
    const { userId } = req.params;

    const followedLists = await db
      .select({
        id: listFollows.id,
        listId: listFollows.listId,
        createdAt: listFollows.createdAt,
        list: {
          id: userLists.id,
          userId: userLists.userId,
          title: userLists.title,
          description: userLists.description,
          followerCount: userLists.followerCount,
          itemCount: userLists.itemCount,
        }
      })
      .from(listFollows)
      .innerJoin(userLists, eq(listFollows.listId, userLists.id))
      .where(eq(listFollows.userId, userId))
      .orderBy(desc(listFollows.createdAt));

    res.json(followedLists);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch followed lists");
  }
});

// ============================================
// COMMUNITY FEED & DISCOVERY
// ============================================

// Get activity feed for followed users
router.get("/feed/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get users being followed
    const following = await db
      .select({ followingId: userFollows.followingId })
      .from(userFollows)
      .where(eq(userFollows.followerId, userId));

    const followingIds = following.map(f => f.followingId);

    // If no follows exist, return TMDB trending as fallback
    if (followingIds.length === 0) {
      const tmdbData = await tmdbService.getTrendingAll();
      const allResults = tmdbData.results.map(item => ({
        type: 'trending' as const,
        tmdbId: item.id,
        mediaType: item.media_type || 'movie',
        title: item.title || item.name,
        posterPath: item.poster_path,
        overview: item.overview,
        voteAverage: item.vote_average,
        isFallback: true
      }));
      const paginatedResults = allResults.slice(offset, offset + limit + 1);
      const hasMore = paginatedResults.length > limit;
      const data = hasMore ? paginatedResults.slice(0, limit) : paginatedResults;
      
      return res.json({
        data,
        hasMore,
        nextOffset: hasMore ? offset + limit : null
      });
    }

    // Get recent reviews from followed users
    const recentReviews = await db
      .select({
        type: sql<string>`'review'`,
        id: userRatings.id,
        userId: userRatings.userId,
        createdAt: userRatings.createdAt,
        content: userRatings.review,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userRatings)
      .innerJoin(users, eq(userRatings.userId, users.id))
      .where(and(
        or(...followingIds.map(id => eq(userRatings.userId, id))),
        isNotNull(userRatings.review)
      ))
      .orderBy(desc(userRatings.createdAt))
      .limit(Math.floor(limit / 2) + 1)
      .offset(offset);

    // Get recent public lists from followed users
    const recentLists = await db
      .select({
        type: sql<string>`'list'`,
        id: userLists.id,
        userId: userLists.userId,
        createdAt: userLists.createdAt,
        title: userLists.title,
        description: userLists.description,
        itemCount: userLists.itemCount,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(and(
        or(...followingIds.map(id => eq(userLists.userId, id))),
        eq(userLists.isPublic, true)
      ))
      .orderBy(desc(userLists.createdAt))
      .limit(Math.floor(limit / 2) + 1)
      .offset(offset);

    // Combine and sort by date
    const combinedFeed = [...recentReviews, ...recentLists]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit + 1);

    // If feed is empty, return TMDB trending as fallback
    if (combinedFeed.length === 0) {
      const tmdbData = await tmdbService.getTrendingAll();
      const allResults = tmdbData.results.map(item => ({
        type: 'trending' as const,
        tmdbId: item.id,
        mediaType: item.media_type || 'movie',
        title: item.title || item.name,
        posterPath: item.poster_path,
        overview: item.overview,
        voteAverage: item.vote_average,
        isFallback: true
      }));
      const paginatedResults = allResults.slice(offset, offset + limit + 1);
      const hasMore = paginatedResults.length > limit;
      const data = hasMore ? paginatedResults.slice(0, limit) : paginatedResults;
      
      return res.json({
        data,
        hasMore,
        nextOffset: hasMore ? offset + limit : null
      });
    }

    const hasMore = combinedFeed.length > limit;
    const data = hasMore ? combinedFeed.slice(0, limit) : combinedFeed;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + limit : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch feed");
  }
});

// Get community-wide activity feed
router.get("/community-feed", async (req, res) => {
  try {
    const { timeFilter = 'weekly', limit = '20' } = req.query;
    const offset = parseInt(req.query.offset as string) || 0;
    const parsedLimit = parseInt(limit as string);
    const currentUserId = (req as AuthRequest).userId;
    
    // Calculate date threshold based on timeFilter
    let dateThreshold = new Date();
    if (timeFilter === 'daily') {
      dateThreshold.setDate(dateThreshold.getDate() - 1);
    } else if (timeFilter === 'weekly') {
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (timeFilter === 'monthly') {
      dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    }

    // Get recent reviews with reviews (within time filter) - fetch more than needed for pagination
    const recentReviews = await db
      .select({
        type: sql<string>`'review'`,
        id: userRatings.id,
        userId: userRatings.userId,
        createdAt: userRatings.createdAt,
        content: userRatings.review,
        review: userRatings.review,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userRatings)
      .innerJoin(users, eq(userRatings.userId, users.id))
      .where(and(
        isNotNull(userRatings.review),
        gte(userRatings.createdAt, dateThreshold)
      ))
      .orderBy(desc(userRatings.createdAt))
      .limit(100);

    // Get recent public lists (within time filter)
    const recentLists = await db
      .select({
        type: sql<string>`'list'`,
        id: userLists.id,
        userId: userLists.userId,
        createdAt: userLists.createdAt,
        title: userLists.title,
        description: userLists.description,
        itemCount: userLists.itemCount,
        followerCount: sql<number>`(SELECT COUNT(*) FROM ${listFollows} WHERE ${listFollows.listId} = ${userLists.id})`.as('followerCount'),
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(and(
        eq(userLists.isPublic, true),
        gte(userLists.createdAt, dateThreshold)
      ))
      .orderBy(desc(userLists.createdAt))
      .limit(100);

    // Combine and sort by date
    let allFeed = [...recentReviews, ...recentLists]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    
    // Add social context if user is authenticated
    if (currentUserId) {
      // Get user's followed users
      const followedUsers = await db
        .select({ followingId: userFollows.followingId })
        .from(userFollows)
        .where(eq(userFollows.followerId, currentUserId));
      
      const followedUserIds = followedUsers.map(f => f.followingId);
      
      if (followedUserIds.length > 0) {
        // Add social context to each feed item
        allFeed = await Promise.all(allFeed.map(async (item) => {
          const socialContext: any = {
            followedUsersEngaged: [],
            totalEngagement: 0
          };
          
          if (item.type === 'review') {
            // Get awards from followed users
            const followedAwards = await db
              .select({
                userId: reviewAwards.userId,
                firstName: users.firstName,
                lastName: users.lastName,
                awardType: reviewAwards.awardType,
              })
              .from(reviewAwards)
              .innerJoin(users, eq(reviewAwards.userId, users.id))
              .where(and(
                eq(reviewAwards.reviewId, item.id),
                inArray(reviewAwards.userId, followedUserIds)
              ))
              .limit(3);
            
            if (followedAwards.length > 0) {
              socialContext.followedUsersEngaged = followedAwards.map(a => ({
                firstName: a.firstName,
                lastName: a.lastName,
                action: `gave ${a.awardType}`
              }));
            }
            
            // Get total awards count
            const totalAwards = await db
              .select({ count: sql<number>`COUNT(*)` })
              .from(reviewAwards)
              .where(eq(reviewAwards.reviewId, item.id));
            
            socialContext.totalEngagement = Number(totalAwards[0]?.count) || 0;
          } else if (item.type === 'list') {
            // Get follows from followed users
            const followedFollows = await db
              .select({
                userId: listFollows.userId,
                firstName: users.firstName,
                lastName: users.lastName,
              })
              .from(listFollows)
              .innerJoin(users, eq(listFollows.userId, users.id))
              .where(and(
                eq(listFollows.listId, item.id),
                inArray(listFollows.userId, followedUserIds)
              ))
              .limit(3);
            
            if (followedFollows.length > 0) {
              socialContext.followedUsersEngaged = followedFollows.map(f => ({
                firstName: f.firstName,
                lastName: f.lastName,
                action: 'follows this'
              }));
            }
            
            socialContext.totalEngagement = (item as any).followerCount || 0;
          }
          
          return { ...item, socialContext };
        }));
      }
    }
    
    // Apply offset and limit, fetch one extra to check if there are more
    const paginatedFeed = allFeed.slice(offset, offset + parsedLimit + 1);
    const hasMore = paginatedFeed.length > parsedLimit;
    const data = hasMore ? paginatedFeed.slice(0, parsedLimit) : paginatedFeed;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + parsedLimit : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch community feed");
  }
});

// Get top reviews with time filter
router.get("/top-reviews", async (req, res) => {
  try {
    const { timeFilter = 'weekly', sortBy = 'awards', limit = 20 } = req.query;
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Calculate date threshold
    let dateThreshold = new Date();
    if (timeFilter === 'daily') {
      dateThreshold.setDate(dateThreshold.getDate() - 1);
    } else if (timeFilter === 'weekly') {
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (timeFilter === 'monthly') {
      dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    }

    // Get reviews with award counts
    const results = await db
      .select({
        id: userRatings.id,
        userId: userRatings.userId,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
        review: userRatings.review,
        helpfulCount: userRatings.helpfulCount,
        createdAt: userRatings.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
        awardCount: sql<number>`COUNT(DISTINCT ${reviewAwards.id})`,
        commentCount: sql<number>`COUNT(DISTINCT ${reviewComments.id})`
      })
      .from(userRatings)
      .innerJoin(users, eq(userRatings.userId, users.id))
      .leftJoin(reviewAwards, eq(reviewAwards.reviewId, userRatings.id))
      .leftJoin(reviewComments, eq(reviewComments.reviewId, userRatings.id))
      .where(and(
        gte(userRatings.createdAt, dateThreshold),
        isNotNull(userRatings.review)
      ))
      .groupBy(userRatings.id, users.id)
      .orderBy(
        sortBy === 'awards' ? desc(sql`COUNT(DISTINCT ${reviewAwards.id})`) :
        sortBy === 'comments' ? desc(sql`COUNT(DISTINCT ${reviewComments.id})`) :
        desc(userRatings.helpfulCount)
      )
      .limit(parseInt(limit as string) + 1)
      .offset(offset);

    // If no reviews exist, return TMDB popular movies with high ratings as fallback
    if (results.length === 0) {
      const tmdbData = await tmdbService.getTopRatedMovies();
      const fallbackReviews = tmdbData.results.slice(offset, offset + parseInt(limit as string) + 1).map(item => ({
        tmdbId: item.id,
        mediaType: 'movie' as const,
        title: item.title,
        posterPath: item.poster_path,
        rating: item.vote_average,
        review: null,
        helpfulCount: 0,
        awardCount: 0,
        commentCount: 0,
        createdAt: new Date().toISOString(),
        user: null,
        isFallback: true,
        voteAverage: item.vote_average,
        overview: item.overview
      }));
      
      const hasMore = fallbackReviews.length > parseInt(limit as string);
      const data = hasMore ? fallbackReviews.slice(0, parseInt(limit as string)) : fallbackReviews;
      
      return res.json({ 
        data,
        hasMore,
        nextOffset: hasMore ? offset + parseInt(limit as string) : null,
        message: `No reviews found for the ${timeFilter} period. Explore top-rated content below!`,
        isFallback: true
      });
    }

    const hasMore = results.length > parseInt(limit as string);
    const data = hasMore ? results.slice(0, parseInt(limit as string)) : results;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + parseInt(limit as string) : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch top reviews");
  }
});

// Get leaderboards
router.get("/leaderboards", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    // Execute all leaderboard queries in parallel for better performance
    const [topReviewers, topListCreators, mostFollowed, mostAwarded] = await Promise.all([
      // Top reviewers (most reviews)
      db
        .select({
          userId: userActivityStats.userId,
          totalReviews: userActivityStats.totalReviews,
          userLevel: userActivityStats.userLevel,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          }
        })
        .from(userActivityStats)
        .innerJoin(users, eq(userActivityStats.userId, users.id))
        .where(sql`${userActivityStats.totalReviews} > 0`)
        .orderBy(desc(userActivityStats.totalReviews))
        .limit(limit),

      // Top list creators (most public lists only)
      db
        .select({
          userId: userLists.userId,
          totalLists: sql<number>`COUNT(*)`.as('total_lists'),
          userLevel: userActivityStats.userLevel,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          }
        })
        .from(userLists)
        .innerJoin(users, eq(userLists.userId, users.id))
        .leftJoin(userActivityStats, eq(userLists.userId, userActivityStats.userId))
        .where(eq(userLists.isPublic, true))
        .groupBy(userLists.userId, users.id, users.firstName, users.lastName, users.profileImageUrl, userActivityStats.userLevel)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(limit),

      // Most followed users
      db
        .select({
          userId: userActivityStats.userId,
          totalFollowers: userActivityStats.totalFollowers,
          userLevel: userActivityStats.userLevel,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          }
        })
        .from(userActivityStats)
        .innerJoin(users, eq(userActivityStats.userId, users.id))
        .where(sql`${userActivityStats.totalFollowers} > 0`)
        .orderBy(desc(userActivityStats.totalFollowers))
        .limit(limit),

      // Most awarded (received awards)
      db
        .select({
          userId: userActivityStats.userId,
          totalAwardsReceived: userActivityStats.totalAwardsReceived,
          userLevel: userActivityStats.userLevel,
          user: {
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            profileImageUrl: users.profileImageUrl,
          }
        })
        .from(userActivityStats)
        .innerJoin(users, eq(userActivityStats.userId, users.id))
        .where(sql`${userActivityStats.totalAwardsReceived} > 0`)
        .orderBy(desc(userActivityStats.totalAwardsReceived))
        .limit(limit)
    ]);

    res.json({
      topReviewers,
      topListCreators,
      mostFollowed,
      mostAwarded
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch leaderboards");
  }
});

// Get trending/popular content
router.get("/trending", async (req, res) => {
  try {
    const { timeFilter = 'weekly', limit = 10 } = req.query;
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Calculate date threshold
    let dateThreshold = new Date();
    if (timeFilter === 'daily') {
      dateThreshold.setDate(dateThreshold.getDate() - 1);
    } else if (timeFilter === 'weekly') {
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (timeFilter === 'monthly') {
      dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    }

    // Get most reviewed/rated content with pagination
    const trending = await db
      .select({
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        ratingCount: sql<number>`COUNT(*)`,
        avgRating: sql<number>`AVG(${userRatings.rating})`
      })
      .from(userRatings)
      .where(gte(userRatings.createdAt, dateThreshold))
      .groupBy(userRatings.tmdbId, userRatings.mediaType, userRatings.title, userRatings.posterPath)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(parseInt(limit as string) + 1)
      .offset(offset);

    // If no user ratings exist, return TMDB trending data as fallback
    if (trending.length === 0) {
      const tmdbData = await tmdbService.getTrendingAll();
      const allResults = tmdbData.results.map(item => ({
        tmdbId: item.id,
        mediaType: item.media_type || 'movie',
        title: item.title || item.name,
        posterPath: item.poster_path,
        ratingCount: 0,
        avgRating: item.vote_average,
        isFallback: true
      }));
      
      const paginatedResults = allResults.slice(offset, offset + parseInt(limit as string) + 1);
      const hasMore = paginatedResults.length > parseInt(limit as string);
      const data = hasMore ? paginatedResults.slice(0, parseInt(limit as string)) : paginatedResults;
      
      return res.json({
        data,
        hasMore,
        nextOffset: hasMore ? offset + parseInt(limit as string) : null
      });
    }

    const hasMore = trending.length > parseInt(limit as string);
    const data = hasMore ? trending.slice(0, parseInt(limit as string)) : trending;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + parseInt(limit as string) : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch trending content");
  }
});

// Get most recommended content
router.get("/most-recommended", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    const mostRecommended = await db
      .select({
        tmdbId: userRecommendations.recommendedTmdbId,
        mediaType: userRecommendations.recommendedMediaType,
        title: userRecommendations.recommendedTitle,
        posterPath: userRecommendations.recommendedPosterPath,
        recommendationCount: sql<number>`COUNT(*)`
      })
      .from(userRecommendations)
      .groupBy(
        userRecommendations.recommendedTmdbId,
        userRecommendations.recommendedMediaType,
        userRecommendations.recommendedTitle,
        userRecommendations.recommendedPosterPath
      )
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit + 1)
      .offset(offset);

    // If no user recommendations exist, return TMDB popular movies and TV shows as fallback
    if (mostRecommended.length === 0) {
      const [popularMovies, popularTV] = await Promise.all([
        tmdbService.getPopularMovies(),
        tmdbService.getPopularTVShows()
      ]);

      // Combine and shuffle movies and TV shows for variety
      const combined = [
        ...popularMovies.results.slice(0, Math.ceil(limit / 2)).map(item => ({
          tmdbId: item.id,
          mediaType: 'movie' as const,
          title: item.title,
          posterPath: item.poster_path,
          recommendationCount: 0,
          voteAverage: item.vote_average,
          isFallback: true
        })),
        ...popularTV.results.slice(0, Math.floor(limit / 2)).map(item => ({
          tmdbId: item.id,
          mediaType: 'tv' as const,
          title: item.name,
          posterPath: item.poster_path,
          recommendationCount: 0,
          voteAverage: item.vote_average,
          isFallback: true
        }))
      ];

      // Shuffle and apply pagination
      const shuffled = combined.sort(() => Math.random() - 0.5);
      const paginatedResults = shuffled.slice(offset, offset + limit + 1);
      const hasMore = paginatedResults.length > limit;
      const data = hasMore ? paginatedResults.slice(0, limit) : paginatedResults;
      
      return res.json({
        data,
        hasMore,
        nextOffset: hasMore ? offset + limit : null
      });
    }

    const hasMore = mostRecommended.length > limit;
    const data = hasMore ? mostRecommended.slice(0, limit) : mostRecommended;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + limit : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch most recommended content");
  }
});

// ============================================
// NOTIFICATIONS API
// ============================================

// Get user notifications
router.get("/notifications", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const limit = parseInt(authReq.query.limit as string) || 50;
    const unreadOnly = authReq.query.unreadOnly === 'true';

    const whereConditions = unreadOnly
      ? and(eq(notifications.userId, userId), eq(notifications.isRead, false))
      : eq(notifications.userId, userId);

    const userNotifications = await db
      .select({
        id: notifications.id,
        actorId: notifications.actorId,
        type: notifications.type,
        entityType: notifications.entityType,
        entityId: notifications.entityId,
        message: notifications.message,
        isRead: notifications.isRead,
        createdAt: notifications.createdAt,
        actor: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(whereConditions)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    res.json(userNotifications);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch notifications");
  }
});

// Mark notification as read
router.put("/notifications/:notificationId/read", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { notificationId } = authReq.params;

    // Verify notification belongs to user
    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

    if (!notification) {
      return handleNotFoundError(res, "Notification");
    }

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Failed to mark notification as read");
  }
});

// Mark all notifications as read
router.put("/notifications/read-all", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Failed to mark all notifications as read");
  }
});

// Delete notification
router.delete("/notifications/:notificationId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { notificationId } = authReq.params;

    // Verify notification belongs to user
    const [notification] = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));

    if (!notification) {
      return handleNotFoundError(res, "Notification");
    }

    await db.delete(notifications).where(eq(notifications.id, notificationId));

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Failed to delete notification");
  }
});

// Get unread notification count
router.get("/notifications/unread/count", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));

    res.json({ count: result?.count || 0 });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch unread count");
  }
});

// ============================================
// LIST COLLABORATORS API
// ============================================

// Get list collaborators
router.get("/lists/:listId/collaborators", async (req, res) => {
  try {
    const { listId } = req.params;

    const collaborators = await db
      .select({
        id: listCollaborators.id,
        userId: listCollaborators.userId,
        permission: listCollaborators.permission,
        invitedBy: listCollaborators.invitedBy,
        createdAt: listCollaborators.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        }
      })
      .from(listCollaborators)
      .leftJoin(users, eq(listCollaborators.userId, users.id))
      .where(eq(listCollaborators.listId, listId));

    res.json(collaborators);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch collaborators");
  }
});

// Add list collaborator
router.post("/lists/:listId/collaborators", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId } = authReq.params;

    // Verify user owns the list
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Only the list owner can add collaborators");
    }

    const validatedData = insertListCollaboratorSchema.parse({
      ...authReq.body,
      listId,
      invitedBy: userId,
    });

    const [newCollaborator] = await db
      .insert(listCollaborators)
      .values(validatedData)
      .returning();

    // Create notification for the collaborator
    await db.insert(notifications).values({
      userId: validatedData.userId,
      actorId: userId,
      type: "list_collaboration",
      entityType: "list",
      entityId: listId,
      message: `invited you to collaborate on "${list.title}"`,
      isRead: false,
    });

    res.status(201).json(newCollaborator);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to add collaborator");
  }
});

// Update collaborator permission
router.put("/lists/:listId/collaborators/:collaboratorId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId, collaboratorId } = authReq.params;
    const { permission } = authReq.body;

    // Verify user owns the list
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Only the list owner can update permissions");
    }

    await db
      .update(listCollaborators)
      .set({ permission })
      .where(eq(listCollaborators.id, collaboratorId));

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Failed to update collaborator permission");
  }
});

// Remove list collaborator
router.delete("/lists/:listId/collaborators/:collaboratorId", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { listId, collaboratorId } = authReq.params;

    // Verify user owns the list
    const [list] = await db
      .select()
      .from(userLists)
      .where(eq(userLists.id, listId));

    if (!list) {
      return handleNotFoundError(res, "List");
    }

    if (list.userId !== userId) {
      return handleForbiddenError(res, "Only the list owner can remove collaborators");
    }

    await db
      .delete(listCollaborators)
      .where(eq(listCollaborators.id, collaboratorId));

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Failed to remove collaborator");
  }
});

// ============================================
// USER BADGES API
// ============================================

// Get user badges
router.get("/users/:userId/badges", async (req, res) => {
  try {
    const { userId } = req.params;

    const badges = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId))
      .orderBy(desc(userBadges.earnedAt));

    res.json(badges);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user badges");
  }
});

// Award badge to user (internal use or admin only)
router.post("/users/:userId/badges", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const { userId } = authReq.params;
    
    const validatedData = insertUserBadgeSchema.parse({
      ...authReq.body,
      userId,
    });

    // Check if badge already exists
    const [existingBadge] = await db
      .select()
      .from(userBadges)
      .where(and(eq(userBadges.userId, userId), eq(userBadges.badgeType, validatedData.badgeType)));

    if (existingBadge) {
      return handleValidationError(res, "Badge already awarded");
    }

    const [newBadge] = await db
      .insert(userBadges)
      .values(validatedData)
      .returning();

    // Create notification for badge recipient
    await db.insert(notifications).values({
      userId: userId,
      actorId: null,
      type: "badge_earned",
      entityType: "badge",
      entityId: newBadge.id,
      message: `You earned the "${validatedData.badgeName}" badge!`,
      isRead: false,
    });

    res.status(201).json(newBadge);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to award badge");
  }
});

// ============================================
// ANALYTICS ENDPOINTS
// ============================================

// 1. Engagement Tracking API - Track user engagement events
router.post("/analytics/track-event", requireAuth, async (req, res: Response) => {
  const authReq = req as AuthRequest;
  try {
    const userId = authReq.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const validationResult = insertEngagementEventSchema.safeParse({
      userId: userId,
      eventType: authReq.body.eventType,
      entityType: authReq.body.entityType,
      entityId: authReq.body.entityId,
      metadata: authReq.body.metadata,
      sessionId: authReq.body.sessionId || (req as any).sessionID
    });

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid input data",
        details: validationResult.error.errors
      });
    }

    const [event] = await db
      .insert(engagementEvents)
      .values(validationResult.data)
      .returning();

    res.status(201).json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(res, "Validation error", error.errors);
    }
    handleApiError(res, error, "Failed to track engagement event");
  }
});

// 2. User Engagement Metrics API - Get user engagement summary
router.get("/analytics/user/:userId/engagement", async (req, res) => {
  try {
    const { userId } = req.params;
    const timeframe = (req.query.timeframe as string) || "all_time";

    let dateFilter;
    const now = new Date();

    switch (timeframe) {
      case "daily":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        dateFilter = gte(dailyUserActivity.date, yesterday);
        break;
      case "weekly":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = gte(dailyUserActivity.date, weekAgo);
        break;
      case "monthly":
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFilter = gte(dailyUserActivity.date, monthAgo);
        break;
      default:
        dateFilter = undefined;
    }

    const conditions = dateFilter
      ? and(eq(dailyUserActivity.userId, userId), dateFilter)
      : eq(dailyUserActivity.userId, userId);

    const activities = await db
      .select({
        pageViews: sum(dailyUserActivity.pageViews),
        contentViews: sum(dailyUserActivity.contentViews),
        searchQueries: sum(dailyUserActivity.searchQueries),
        ratingsGiven: sum(dailyUserActivity.ratingsGiven),
        reviewsWritten: sum(dailyUserActivity.reviewsWritten),
        listsCreated: sum(dailyUserActivity.listsCreated),
        commentsPosted: sum(dailyUserActivity.commentsPosted),
        awardsGiven: sum(dailyUserActivity.awardsGiven),
        sessionDuration: sum(dailyUserActivity.sessionDuration),
      })
      .from(dailyUserActivity)
      .where(conditions);

    const metrics = activities[0] || {
      pageViews: 0,
      contentViews: 0,
      searchQueries: 0,
      ratingsGiven: 0,
      reviewsWritten: 0,
      listsCreated: 0,
      commentsPosted: 0,
      awardsGiven: 0,
      sessionDuration: 0,
    };

    res.json({
      userId,
      timeframe,
      metrics: {
        pageViews: Number(metrics.pageViews) || 0,
        contentViews: Number(metrics.contentViews) || 0,
        searchQueries: Number(metrics.searchQueries) || 0,
        ratingsGiven: Number(metrics.ratingsGiven) || 0,
        reviewsWritten: Number(metrics.reviewsWritten) || 0,
        listsCreated: Number(metrics.listsCreated) || 0,
        commentsPosted: Number(metrics.commentsPosted) || 0,
        awardsGiven: Number(metrics.awardsGiven) || 0,
        sessionDuration: Number(metrics.sessionDuration) || 0,
      }
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user engagement metrics");
  }
});

// 3. Content Performance API - Get content performance metrics
router.get("/analytics/content/:tmdbId/stats", async (req, res) => {
  try {
    const tmdbId = parseInt(req.params.tmdbId);
    const mediaType = req.query.mediaType as string || "movie";
    const timeframe = (req.query.timeframe as string) || "all_time";

    if (isNaN(tmdbId)) {
      return res.status(400).json({ error: "Invalid tmdbId" });
    }

    let dateFilter;
    const now = new Date();

    switch (timeframe) {
      case "daily":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        dateFilter = gte(dailyContentStats.date, yesterday);
        break;
      case "weekly":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = gte(dailyContentStats.date, weekAgo);
        break;
      case "monthly":
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFilter = gte(dailyContentStats.date, monthAgo);
        break;
      default:
        dateFilter = undefined;
    }

    const conditions = dateFilter
      ? and(
          eq(dailyContentStats.tmdbId, tmdbId),
          eq(dailyContentStats.mediaType, mediaType),
          dateFilter
        )
      : and(
          eq(dailyContentStats.tmdbId, tmdbId),
          eq(dailyContentStats.mediaType, mediaType)
        );

    const stats = await db
      .select({
        views: sum(dailyContentStats.views),
        ratings: sum(dailyContentStats.ratings),
        avgRating: avg(dailyContentStats.avgRating),
        reviews: sum(dailyContentStats.reviews),
        watchlistAdds: sum(dailyContentStats.watchlistAdds),
        listAdds: sum(dailyContentStats.listAdds),
        recommendationClicks: sum(dailyContentStats.recommendationClicks),
        trendingScore: avg(dailyContentStats.trendingScore),
      })
      .from(dailyContentStats)
      .where(conditions);

    const metrics = stats[0] || {
      views: 0,
      ratings: 0,
      avgRating: 0,
      reviews: 0,
      watchlistAdds: 0,
      listAdds: 0,
      recommendationClicks: 0,
      trendingScore: 0,
    };

    res.json({
      tmdbId,
      mediaType,
      timeframe,
      stats: {
        views: Number(metrics.views) || 0,
        ratings: Number(metrics.ratings) || 0,
        avgRating: Number(metrics.avgRating) || 0,
        reviews: Number(metrics.reviews) || 0,
        watchlistAdds: Number(metrics.watchlistAdds) || 0,
        listAdds: Number(metrics.listAdds) || 0,
        recommendationClicks: Number(metrics.recommendationClicks) || 0,
        trendingScore: Number(metrics.trendingScore) || 0,
      }
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch content performance stats");
  }
});

// 4. Popular Content Rankings API - Get popular content rankings
router.get("/analytics/popular", async (req, res) => {
  try {
    const rankType = (req.query.rankType as string) || "trending";
    const timeframe = (req.query.timeframe as string) || "weekly";
    const limit = parseInt(req.query.limit as string) || 20;

    const rankings = await db
      .select()
      .from(popularContentRankings)
      .where(
        and(
          eq(popularContentRankings.rankType, rankType),
          eq(popularContentRankings.timeframe, timeframe)
        )
      )
      .orderBy(popularContentRankings.rank)
      .limit(limit);

    res.json({
      rankType,
      timeframe,
      count: rankings.length,
      rankings
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch popular content rankings");
  }
});

// 5. Recommendation Effectiveness API - Get recommendation performance metrics
router.get("/analytics/recommendations/performance", async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as string) || "weekly";

    let dateFilter;
    const now = new Date();

    switch (timeframe) {
      case "daily":
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        dateFilter = gte(recommendationPerformance.date, yesterday);
        break;
      case "weekly":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = gte(recommendationPerformance.date, weekAgo);
        break;
      case "monthly":
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFilter = gte(recommendationPerformance.date, monthAgo);
        break;
      default:
        const defaultStart = new Date(now);
        defaultStart.setDate(defaultStart.getDate() - 7);
        dateFilter = gte(recommendationPerformance.date, defaultStart);
    }

    const performance = await db
      .select({
        recommendationType: recommendationPerformance.recommendationType,
        impressions: sum(recommendationPerformance.impressions),
        clicks: sum(recommendationPerformance.clicks),
        watchlistAdds: sum(recommendationPerformance.watchlistAdds),
        ratings: sum(recommendationPerformance.ratings),
        avgRating: avg(recommendationPerformance.avgRating),
        clickThroughRate: avg(recommendationPerformance.clickThroughRate),
        conversionRate: avg(recommendationPerformance.conversionRate),
      })
      .from(recommendationPerformance)
      .where(dateFilter)
      .groupBy(recommendationPerformance.recommendationType);

    const formattedPerformance = performance.map(p => ({
      recommendationType: p.recommendationType,
      impressions: Number(p.impressions) || 0,
      clicks: Number(p.clicks) || 0,
      watchlistAdds: Number(p.watchlistAdds) || 0,
      ratings: Number(p.ratings) || 0,
      avgRating: Number(p.avgRating) || 0,
      clickThroughRate: Number(p.clickThroughRate) || 0,
      conversionRate: Number(p.conversionRate) || 0,
    }));

    res.json({
      timeframe,
      performance: formattedPerformance
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch recommendation performance");
  }
});

// 6. Community Growth Metrics API - Get community growth metrics
router.get("/analytics/growth", async (req, res) => {
  try {
    const timeframe = (req.query.timeframe as string) || "last_30_days";

    let dateFilter;
    const now = new Date();

    switch (timeframe) {
      case "last_7_days":
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = gte(communityGrowthMetrics.date, weekAgo);
        break;
      case "last_30_days":
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        dateFilter = gte(communityGrowthMetrics.date, monthAgo);
        break;
      case "last_90_days":
        const quarterAgo = new Date(now);
        quarterAgo.setDate(quarterAgo.getDate() - 90);
        dateFilter = gte(communityGrowthMetrics.date, quarterAgo);
        break;
      default:
        const defaultStart = new Date(now);
        defaultStart.setDate(defaultStart.getDate() - 30);
        dateFilter = gte(communityGrowthMetrics.date, defaultStart);
    }

    const metrics = await db
      .select()
      .from(communityGrowthMetrics)
      .where(dateFilter)
      .orderBy(desc(communityGrowthMetrics.date));

    if (metrics.length === 0) {
      return res.json({
        timeframe,
        metrics: {
          totalUsers: 0,
          newUsers: 0,
          activeUsers: 0,
          totalReviews: 0,
          newReviews: 0,
          totalLists: 0,
          newLists: 0,
          totalFollows: 0,
          newFollows: 0,
          totalComments: 0,
          newComments: 0,
          avgSessionDuration: 0,
          retentionRate: 0,
        },
        history: []
      });
    }

    const latestMetrics = metrics[0];
    const aggregatedMetrics = {
      totalUsers: latestMetrics.totalUsers,
      newUsers: metrics.reduce((sum, m) => sum + (m.newUsers || 0), 0),
      activeUsers: latestMetrics.activeUsers,
      totalReviews: latestMetrics.totalReviews,
      newReviews: metrics.reduce((sum, m) => sum + (m.newReviews || 0), 0),
      totalLists: latestMetrics.totalLists,
      newLists: metrics.reduce((sum, m) => sum + (m.newLists || 0), 0),
      totalFollows: latestMetrics.totalFollows,
      newFollows: metrics.reduce((sum, m) => sum + (m.newFollows || 0), 0),
      totalComments: latestMetrics.totalComments,
      newComments: metrics.reduce((sum, m) => sum + (m.newComments || 0), 0),
      avgSessionDuration: metrics.reduce((sum, m) => sum + (m.avgSessionDuration || 0), 0) / metrics.length,
      retentionRate: metrics.reduce((sum, m) => sum + (m.retentionRate || 0), 0) / metrics.length,
    };

    res.json({
      timeframe,
      metrics: aggregatedMetrics,
      history: metrics.slice(0, 30)
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch community growth metrics");
  }
});

// 7. Analytics Dashboard Summary API - Get dashboard overview
router.get("/analytics/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now);
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [activeUsersResult] = await db
      .select({ count: count() })
      .from(dailyUserActivity)
      .where(gte(dailyUserActivity.date, oneDayAgo));

    const [totalEventsResult] = await db
      .select({ count: count() })
      .from(engagementEvents)
      .where(gte(engagementEvents.createdAt, oneDayAgo));

    const trendingContent = await db
      .select()
      .from(popularContentRankings)
      .where(
        and(
          eq(popularContentRankings.rankType, "trending"),
          eq(popularContentRankings.timeframe, "daily")
        )
      )
      .orderBy(popularContentRankings.rank)
      .limit(5);

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const recPerformance = await db
      .select({
        recommendationType: recommendationPerformance.recommendationType,
        impressions: sum(recommendationPerformance.impressions),
        clicks: sum(recommendationPerformance.clicks),
        clickThroughRate: avg(recommendationPerformance.clickThroughRate),
      })
      .from(recommendationPerformance)
      .where(gte(recommendationPerformance.date, weekAgo))
      .groupBy(recommendationPerformance.recommendationType);

    const [latestGrowth] = await db
      .select()
      .from(communityGrowthMetrics)
      .orderBy(desc(communityGrowthMetrics.date))
      .limit(1);

    res.json({
      activeUsers: activeUsersResult.count || 0,
      totalEngagementEvents24h: totalEventsResult.count || 0,
      trendingContent: trendingContent.slice(0, 5),
      recommendationPerformance: recPerformance.map(p => ({
        recommendationType: p.recommendationType,
        impressions: Number(p.impressions) || 0,
        clicks: Number(p.clicks) || 0,
        clickThroughRate: Number(p.clickThroughRate) || 0,
      })),
      recentGrowth: latestGrowth || {
        totalUsers: 0,
        newUsers: 0,
        activeUsers: 0,
        retentionRate: 0,
      }
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch analytics dashboard");
  }
});

// Get personalized feed (only from followed users)
router.get("/personalized-feed/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeFilter = 'weekly', limit = '20' } = req.query;
    const offset = parseInt(req.query.offset as string) || 0;
    const parsedLimit = parseInt(limit as string);
    
    // Get user's followed users
    const followedUsers = await db
      .select({ followingId: userFollows.followingId })
      .from(userFollows)
      .where(eq(userFollows.followerId, userId));
    
    const followedUserIds = followedUsers.map(f => f.followingId);
    
    if (followedUserIds.length === 0) {
      return res.json({
        data: [],
        hasMore: false,
        nextOffset: null,
        message: "Follow users to see their activity in your personalized feed!"
      });
    }
    
    // Calculate date threshold
    let dateThreshold = new Date();
    if (timeFilter === 'daily') {
      dateThreshold.setDate(dateThreshold.getDate() - 1);
    } else if (timeFilter === 'weekly') {
      dateThreshold.setDate(dateThreshold.getDate() - 7);
    } else if (timeFilter === 'monthly') {
      dateThreshold.setMonth(dateThreshold.getMonth() - 1);
    }

    // Get reviews from followed users
    const followedReviews = await db
      .select({
        type: sql<string>`'review'`,
        id: userRatings.id,
        userId: userRatings.userId,
        createdAt: userRatings.createdAt,
        review: userRatings.review,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(userRatings)
      .innerJoin(users, eq(userRatings.userId, users.id))
      .where(and(
        isNotNull(userRatings.review),
        inArray(userRatings.userId, followedUserIds),
        gte(userRatings.createdAt, dateThreshold)
      ))
      .orderBy(desc(userRatings.createdAt))
      .limit(100);

    // Get lists from followed users
    const followedLists = await db
      .select({
        type: sql<string>`'list'`,
        id: userLists.id,
        userId: userLists.userId,
        createdAt: userLists.createdAt,
        title: userLists.title,
        description: userLists.description,
        itemCount: userLists.itemCount,
        followerCount: sql<number>`(SELECT COUNT(*) FROM ${listFollows} WHERE ${listFollows.listId} = ${userLists.id})`.as('followerCount'),
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(userLists)
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(and(
        eq(userLists.isPublic, true),
        inArray(userLists.userId, followedUserIds),
        gte(userLists.createdAt, dateThreshold)
      ))
      .orderBy(desc(userLists.createdAt))
      .limit(100);

    // Combine and sort by date
    const allFeed = [...followedReviews, ...followedLists]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    
    // Apply offset and limit
    const paginatedFeed = allFeed.slice(offset, offset + parsedLimit + 1);
    const hasMore = paginatedFeed.length > parsedLimit;
    const data = hasMore ? paginatedFeed.slice(0, parsedLimit) : paginatedFeed;

    res.json({
      data,
      hasMore,
      nextOffset: hasMore ? offset + parsedLimit : null
    });
  } catch (error) {
    handleApiError(res, error, "Failed to fetch personalized feed");
  }
});

// Get activity prompts for user (community flywheel encouragement)
router.get("/activity-prompts/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const prompts = [];

    // Get user's recent ratings without reviews
    const ratingsWithoutReviews = await db
      .select({
        id: userRatings.id,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
        createdAt: userRatings.createdAt,
      })
      .from(userRatings)
      .where(and(
        eq(userRatings.userId, userId),
        sql`${userRatings.review} IS NULL OR ${userRatings.review} = ''`,
        gte(userRatings.createdAt, sql`NOW() - INTERVAL '7 days'`)
      ))
      .orderBy(desc(userRatings.createdAt))
      .limit(3);

    if (ratingsWithoutReviews.length > 0) {
      const item = ratingsWithoutReviews[0];
      prompts.push({
        id: `review-${item.id}`,
        type: 'review',
        priority: 'high',
        title: 'Share your thoughts!',
        description: `You rated "${item.title}" ${item.rating}/10. Add a review to help others discover it.`,
        action: {
          label: 'Write Review',
          url: `/${item.mediaType}/${item.tmdbId}`,
        },
        metadata: {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          posterPath: item.posterPath,
        }
      });
    }

    // Get count of user's ratings to suggest list creation
    const ratingsCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userRatings)
      .where(eq(userRatings.userId, userId));

    const totalRatings = Number(ratingsCount[0]?.count) || 0;
    
    // Check if user has any lists
    const userListsCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userLists)
      .where(eq(userLists.userId, userId));

    const totalLists = Number(userListsCount[0]?.count) || 0;

    if (totalRatings >= 5 && totalLists === 0) {
      prompts.push({
        id: 'create-list',
        type: 'list',
        priority: 'high',
        title: 'Create your first list!',
        description: `You've rated ${totalRatings} items. Share your favorites by creating a curated list.`,
        action: {
          label: 'Create List',
          url: '/lists?create=true',
        }
      });
    } else if (totalRatings >= 10 && totalLists < 3) {
      prompts.push({
        id: 'create-list',
        type: 'list',
        priority: 'medium',
        title: 'Curate another collection',
        description: `With ${totalRatings} ratings, you could create themed lists to share your taste.`,
        action: {
          label: 'Create List',
          url: '/lists?create=true',
        }
      });
    }

    // Check if user is following anyone
    const followingCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(userFollows)
      .where(eq(userFollows.followerId, userId));

    const totalFollowing = Number(followingCount[0]?.count) || 0;

    if (totalFollowing === 0 && totalRatings >= 3) {
      // Get similar users
      const similarUsersData = await db
        .select({
          userId: userSimilarity.userId2,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
          similarityScore: userSimilarity.similarityScore,
        })
        .from(userSimilarity)
        .innerJoin(users, eq(userSimilarity.userId2, users.id))
        .where(eq(userSimilarity.userId1, userId))
        .orderBy(desc(userSimilarity.similarityScore))
        .limit(1);

      if (similarUsersData.length > 0) {
        const similarUser = similarUsersData[0];
        prompts.push({
          id: `follow-${similarUser.userId}`,
          type: 'follow',
          priority: 'medium',
          title: 'Connect with similar tastes',
          description: `${similarUser.firstName} ${similarUser.lastName} has similar movie preferences. Follow them to discover new content!`,
          action: {
            label: 'View Profile',
            url: `/profile/${similarUser.userId}`,
          },
          metadata: {
            userId: similarUser.userId,
            profileImageUrl: similarUser.profileImageUrl,
          }
        });
      }
    }

    // Check for highly rated items to add to favorites
    const highlyRatedItems = await db
      .select({
        id: userRatings.id,
        tmdbId: userRatings.tmdbId,
        mediaType: userRatings.mediaType,
        title: userRatings.title,
        posterPath: userRatings.posterPath,
        rating: userRatings.rating,
      })
      .from(userRatings)
      .where(and(
        eq(userRatings.userId, userId),
        gte(userRatings.rating, 9)
      ))
      .limit(1);

    if (highlyRatedItems.length > 0) {
      const item = highlyRatedItems[0];
      // Check if already in favorites
      const inFavorites = await db
        .select()
        .from(userFavorites)
        .where(and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.tmdbId, item.tmdbId)
        ))
        .limit(1);

      if (inFavorites.length === 0) {
        prompts.push({
          id: `favorite-${item.id}`,
          type: 'favorite',
          priority: 'low',
          title: 'Add to favorites?',
          description: `You gave "${item.title}" a ${item.rating}/10. Make it a favorite!`,
          action: {
            label: 'Add to Favorites',
            url: `/${item.mediaType}/${item.tmdbId}`,
          },
          metadata: {
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            title: item.title,
            posterPath: item.posterPath,
          }
        });
      }
    }

    // Sort by priority (high > medium > low)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    prompts.sort((a, b) => priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder]);

    res.json(prompts.slice(0, 3)); // Return top 3 prompts
  } catch (error) {
    handleApiError(res, error, "Failed to fetch activity prompts");
  }
});

// Get lists containing a specific media item (for cross-promotion)
router.get("/lists/containing/:tmdbId/:mediaType", async (req, res) => {
  try {
    const { tmdbId, mediaType } = req.params;
    const limit = parseInt(req.query.limit as string) || 5;

    if (!tmdbId || !mediaType) {
      return handleValidationError(res, "tmdbId and mediaType are required");
    }

    const listsContainingMedia = await db
      .select({
        id: userLists.id,
        title: userLists.title,
        description: userLists.description,
        isPublic: userLists.isPublic,
        createdAt: userLists.createdAt,
        userId: userLists.userId,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
        itemCount: sql<number>`(
          SELECT COUNT(*)::int 
          FROM ${listItems} 
          WHERE ${listItems.listId} = ${userLists.id}
        )`,
        followerCount: sql<number>`(
          SELECT COUNT(*)::int 
          FROM ${listFollows} 
          WHERE ${listFollows.listId} = ${userLists.id}
        )`,
      })
      .from(listItems)
      .innerJoin(userLists, eq(listItems.listId, userLists.id))
      .innerJoin(users, eq(userLists.userId, users.id))
      .where(and(
        eq(listItems.tmdbId, parseInt(tmdbId)),
        eq(listItems.mediaType, mediaType),
        eq(userLists.isPublic, true)
      ))
      .groupBy(userLists.id, users.id)
      .orderBy(desc(sql`(
        SELECT COUNT(*) 
        FROM ${listFollows} 
        WHERE ${listFollows.listId} = ${userLists.id}
      )`))
      .limit(limit);

    res.json(listsContainingMedia);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch lists containing media");
  }
});

// ============================================
// USER IMPACT DASHBOARD ENDPOINT
// ============================================

// Get user impact data for dashboard
router.get("/user-impact/:userId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { userId } = req.params;
    
    // Security: Ensure users can only view their own impact data
    if (req.userId !== userId) {
      return handleUnauthorizedError(res, "You can only view your own impact dashboard");
    }

    // Fetch user activity stats
    const [userStats] = await db
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    // If no stats exist, initialize with zeros
    const stats = userStats || {
      totalReviews: 0,
      totalLists: 0,
      totalFollowers: 0,
      totalFollowing: 0,
      totalAwardsReceived: 0,
      totalComments: 0,
    };

    // Get review stats
    const reviewsData = await db
      .select({
        rating: userRatings.rating,
        mediaType: userRatings.mediaType,
        helpfulCount: userRatings.helpfulCount,
      })
      .from(userRatings)
      .where(eq(userRatings.userId, userId));

    const totalReviews = reviewsData.length;
    const averageRatingGiven = totalReviews > 0
      ? reviewsData.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;
    
    // Calculate most active media type as a proxy for genre
    const mediaTypeCounts = reviewsData.reduce((acc, r) => {
      acc[r.mediaType] = (acc[r.mediaType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostActiveGenre = Object.entries(mediaTypeCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Calculate total review likes
    const totalReviewLikes = reviewsData.reduce((sum, r) => sum + (r.helpfulCount || 0), 0);

    // Get list stats
    const listsData = await db
      .select({
        id: userLists.id,
        followerCount: userLists.followerCount,
        itemCount: userLists.itemCount,
      })
      .from(userLists)
      .where(eq(userLists.userId, userId));

    const totalLists = listsData.length;
    const totalListFollowers = listsData.reduce((sum, l) => sum + (l.followerCount || 0), 0);
    const totalItemsInLists = listsData.reduce((sum, l) => sum + (l.itemCount || 0), 0);

    // Get engagement stats
    const [awardsResult] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(reviewAwards)
      .innerJoin(userRatings, eq(reviewAwards.reviewId, userRatings.id))
      .where(eq(userRatings.userId, userId));

    const totalAwardsReceived = awardsResult?.count || 0;

    const [commentsResult] = await db
      .select({
        count: sql<number>`COUNT(*)::int`,
      })
      .from(reviewComments)
      .innerJoin(userRatings, eq(reviewComments.reviewId, userRatings.id))
      .where(eq(userRatings.userId, userId));

    const totalCommentsReceived = commentsResult?.count || 0;

    // Calculate community rank
    // Formula: (reviews * 2) + (lists * 5) + (awards * 1) + (followers * 3)
    const engagementScore = 
      (totalReviews * 2) + 
      (totalLists * 5) + 
      (totalAwardsReceived * 1) + 
      ((stats.totalFollowers || 0) * 3);

    // Determine rank tier
    let rank: string;
    let nextRankScore: number;
    
    if (engagementScore <= 10) {
      rank = "Newcomer";
      nextRankScore = 11;
    } else if (engagementScore <= 50) {
      rank = "Contributor";
      nextRankScore = 51;
    } else if (engagementScore <= 200) {
      rank = "Active Member";
      nextRankScore = 201;
    } else if (engagementScore <= 500) {
      rank = "Expert";
      nextRankScore = 501;
    } else {
      rank = "Legend";
      nextRankScore = engagementScore; // Already at max rank
    }

    const progressToNextRank = rank === "Legend" 
      ? 100 
      : Math.min(100, Math.round((engagementScore / nextRankScore) * 100));

    // Build response
    const impactData = {
      reviewStats: {
        totalReviews,
        averageRatingGiven: Math.round(averageRatingGiven * 10) / 10,
        mostActiveGenre,
      },
      listStats: {
        totalLists,
        totalListFollowers,
        totalItemsInLists,
      },
      socialStats: {
        followerCount: stats.totalFollowers,
        followingCount: stats.totalFollowing,
        profileViews: 0, // Not tracking profile views yet
      },
      engagementReceived: {
        totalAwardsReceived,
        totalCommentsReceived,
        totalReviewLikes,
      },
      communityRank: {
        level: userStats?.userLevel || 1,
        rank,
        engagementScore,
        nextRankScore,
        progressToNextRank,
      },
    };

    res.json(impactData);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user impact data");
  }
});

export default router;
