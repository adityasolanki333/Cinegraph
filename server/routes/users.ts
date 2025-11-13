import { Router } from "express";
import { db } from "../db";
import { users, userRatings, userWatchlist, userFavorites, viewingHistory, insertViewingHistorySchema, insertUserWatchlistSchema, userRecommendations, recommendationVotes, recommendationComments, insertRecommendationVoteSchema, insertRecommendationCommentSchema } from "@shared/schema";
import { eq, and, isNotNull, sql, like } from "drizzle-orm";
import { tmdbService } from "../tmdb";
import { z } from "zod";
import { handleApiError, handleValidationError, handleNotFoundError } from "../utils/error-handler";
import { userIdToUsername } from "@shared/helpers";

const router = Router();

// Schema for updating user profile
const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  bio: z.string().max(500).optional(),
});

// Upsert user (create or update)
router.post("/upsert", async (req, res) => {
  try {
    const { id, email, firstName, lastName, profileImageUrl } = req.body;

    if (!id) {
      return handleValidationError(res, "User ID is required");
    }

    // Upsert user - create if not exists, update if exists
    const [user] = await db
      .insert(users)
      .values({
        id,
        email: email || null,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: profileImageUrl || null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: email || null,
          firstName: firstName || null,
          lastName: lastName || null,
          profileImageUrl: profileImageUrl || null,
          updatedAt: new Date(),
        },
      })
      .returning();

    res.json(user);
  } catch (error) {
    handleApiError(res, error, "Failed to upsert user");
  }
});

// Get user by username (for clean URLs)
router.get("/by-username/:username", async (req, res) => {
  try {
    const { username } = req.params;

    if (!username) {
      return handleValidationError(res, "Username is required");
    }

    // Search for users whose ID matches the username pattern
    // This handles both exact matches and username-based IDs
    const allUsers = await db.select().from(users);
    
    // Find user by matching username pattern
    const user = allUsers.find(u => {
      const extractedUsername = userIdToUsername(u.id);
      return extractedUsername.toLowerCase() === username.toLowerCase() || u.id === username;
    });

    if (!user) {
      return handleNotFoundError(res, "User");
    }

    res.json(user);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user by username");
  }
});

router.get("/:userId/profile", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    // Fetch user basic information
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      return handleNotFoundError(res, "User");
    }

    // Fetch user ratings
    const ratings = await db
      .select()
      .from(userRatings)
      .where(eq(userRatings.userId, userId));

    // Fetch user watchlist
    const watchlist = await db
      .select()
      .from(userWatchlist)
      .where(eq(userWatchlist.userId, userId));

    // Calculate statistics
    const totalWatched = ratings.filter(r => r.isVerifiedPurchase).length;
    
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
      : 0;

    const watchlistCount = watchlist.length;

    const reviewsCount = ratings.filter(r => r.review && r.review.trim().length > 0).length;

    // Since there's no userFavorites table in the schema, return 0
    const favoritesCount = 0;

    // Calculate total hours from watched items (items with isVerifiedPurchase = true)
    const watchedItems = ratings.filter(r => r.isVerifiedPurchase);
    let totalHours = 0;

    // Fetch TMDB data for watched items to get runtime
    const runtimePromises = watchedItems.map(async (item) => {
      try {
        if (item.mediaType === 'movie') {
          const movieDetails = await tmdbService.getMovieDetails(item.tmdbId);
          return movieDetails?.runtime || 0;
        } else if (item.mediaType === 'tv') {
          const tvDetails = await tmdbService.getTVDetails(item.tmdbId);
          // For TV shows, estimate based on number of episodes and average runtime
          // This is an approximation since we don't know which episodes were watched
          const episodeRunTime = (tvDetails as any).episode_run_time?.[0] || 45;
          const numberOfSeasons = (tvDetails as any).number_of_seasons || 1;
          const numberOfEpisodes = (tvDetails as any).number_of_episodes || 10;
          return episodeRunTime * numberOfEpisodes;
        }
        return 0;
      } catch (error) {
        console.error(`Error fetching runtime for ${item.mediaType} ${item.tmdbId}:`, error);
        return 0;
      }
    });

    const runtimes = await Promise.all(runtimePromises);
    totalHours = Math.round(runtimes.reduce((sum, runtime) => sum + runtime, 0) / 60 * 10) / 10;

    // Extract favorite genres from rated movies
    const genreMap: Record<string, number> = {};
    
    const genrePromises = ratings.map(async (rating) => {
      try {
        let genres: any[] = [];
        if (rating.mediaType === 'movie') {
          const movieDetails = await tmdbService.getMovieDetails(rating.tmdbId);
          genres = (movieDetails as any).genres || [];
        } else if (rating.mediaType === 'tv') {
          const tvDetails = await tmdbService.getTVDetails(rating.tmdbId);
          genres = (tvDetails as any).genres || [];
        }
        
        genres.forEach((genre: any) => {
          if (genre.name) {
            genreMap[genre.name] = (genreMap[genre.name] || 0) + 1;
          }
        });
      } catch (error) {
        console.error(`Error fetching genres for ${rating.mediaType} ${rating.tmdbId}:`, error);
      }
    });

    await Promise.all(genrePromises);

    // Get top 4 favorite genres
    const favoriteGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([genre]) => genre);

    // Build response
    const profileData = {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        bio: user.bio,
        profileImageUrl: user.profileImageUrl,
        createdAt: user.createdAt,
      },
      statistics: {
        totalWatched,
        totalHours,
        avgRating: Math.round(avgRating * 10) / 10,
        favoritesCount,
        watchlistCount,
        reviewsCount,
      },
      favoriteGenres,
    };

    res.json(profileData);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user profile");
  }
});

router.patch("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    // Validate request body
    const validationResult = updateUserProfileSchema.safeParse(req.body);
    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input", validationResult.error.errors);
    }

    const { firstName, lastName, bio } = validationResult.data;

    // Update user in database
    const [updatedUser] = await db
      .update(users)
      .set({ 
        firstName, 
        lastName,
        bio: bio !== undefined ? bio : undefined,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updatedUser) {
      return handleNotFoundError(res, "User");
    }

    res.json(updatedUser);
  } catch (error) {
    handleApiError(res, error, "Failed to update user profile");
  }
});

router.get("/:userId/watched", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const watchedItems = await db
      .select()
      .from(viewingHistory)
      .where(eq(viewingHistory.userId, userId));

    res.json(watchedItems);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch watched items");
  }
});

router.post("/:userId/watched", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const validationResult = insertViewingHistorySchema.safeParse({
      userId,
      ...req.body
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input", validationResult.error.errors);
    }

    const existingItem = await db
      .select()
      .from(viewingHistory)
      .where(
        and(
          eq(viewingHistory.userId, userId),
          eq(viewingHistory.tmdbId, validationResult.data.tmdbId)
        )
      );

    if (existingItem.length > 0) {
      return handleValidationError(res, "Item already marked as watched");
    }

    const [newWatchedItem] = await db
      .insert(viewingHistory)
      .values(validationResult.data)
      .returning();

    res.status(201).json(newWatchedItem);
  } catch (error) {
    handleApiError(res, error, "Failed to add watched item");
  }
});

router.delete("/:userId/watched/:tmdbId", async (req, res) => {
  try {
    const { userId, tmdbId } = req.params;

    if (!userId || !tmdbId) {
      return handleValidationError(res, "User ID and TMDB ID are required");
    }

    const deletedItem = await db
      .delete(viewingHistory)
      .where(
        and(
          eq(viewingHistory.userId, userId),
          eq(viewingHistory.tmdbId, parseInt(tmdbId))
        )
      )
      .returning();

    if (deletedItem.length === 0) {
      return handleNotFoundError(res, "Watched item");
    }

    res.json({ message: "Watched item removed successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to remove watched item");
  }
});

// Watchlist endpoints
router.get("/:userId/watchlist", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const watchlistItems = await db
      .select()
      .from(userWatchlist)
      .where(eq(userWatchlist.userId, userId));

    res.json(watchlistItems);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch watchlist");
  }
});

router.post("/:userId/watchlist", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const validationResult = insertUserWatchlistSchema.safeParse({
      userId,
      ...req.body
    });

    if (!validationResult.success) {
      return handleValidationError(res, "Invalid input", validationResult.error.errors);
    }

    // Check if item already exists in watchlist
    const existingItem = await db
      .select()
      .from(userWatchlist)
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, validationResult.data.tmdbId)
        )
      );

    if (existingItem.length > 0) {
      return handleValidationError(res, "Item already in watchlist");
    }

    const [newWatchlistItem] = await db
      .insert(userWatchlist)
      .values(validationResult.data)
      .returning();

    res.status(201).json(newWatchlistItem);
  } catch (error) {
    handleApiError(res, error, "Failed to add to watchlist");
  }
});

router.delete("/:userId/watchlist/:tmdbId", async (req, res) => {
  try {
    const { userId, tmdbId } = req.params;

    if (!userId || !tmdbId) {
      return handleValidationError(res, "User ID and TMDB ID are required");
    }

    const deletedItem = await db
      .delete(userWatchlist)
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, parseInt(tmdbId))
        )
      )
      .returning();

    if (deletedItem.length === 0) {
      return handleNotFoundError(res, "Watchlist item");
    }

    res.json({ message: "Item removed from watchlist successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to remove from watchlist");
  }
});

// Ratings endpoint
router.get("/:userId/ratings", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const ratings = await db
      .select()
      .from(userRatings)
      .where(eq(userRatings.userId, userId));

    res.json(ratings);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch ratings");
  }
});

// Favorites endpoints
router.get("/:userId/favorites", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const favorites = await db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId));

    res.json(favorites);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch favorites");
  }
});

router.post("/:userId/favorites", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { tmdbId, mediaType, title, posterPath } = req.body;

    if (!tmdbId || !mediaType || !title) {
      return handleValidationError(res, "tmdbId, mediaType, and title are required");
    }

    // Check if already favorited
    const existingFavorite = await db
      .select()
      .from(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.tmdbId, tmdbId)
        )
      );

    if (existingFavorite.length > 0) {
      return handleValidationError(res, "Item already in favorites");
    }

    const [newFavorite] = await db
      .insert(userFavorites)
      .values({ userId, tmdbId, mediaType, title, posterPath })
      .returning();

    res.status(201).json(newFavorite);
  } catch (error) {
    handleApiError(res, error, "Failed to add to favorites");
  }
});

router.delete("/:userId/favorites/:tmdbId", async (req, res) => {
  try {
    const { userId, tmdbId } = req.params;

    if (!userId || !tmdbId) {
      return handleValidationError(res, "User ID and TMDB ID are required");
    }

    const deletedItem = await db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, userId),
          eq(userFavorites.tmdbId, parseInt(tmdbId))
        )
      )
      .returning();

    if (deletedItem.length === 0) {
      return handleNotFoundError(res, "Favorite item");
    }

    res.json({ message: "Item removed from favorites successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to remove from favorites");
  }
});

// User recommendations endpoints
router.get("/:userId/recommendations/submitted", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const recommendations = await db
      .select()
      .from(userRecommendations)
      .where(eq(userRecommendations.userId, userId));

    res.json(recommendations);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch user recommendations");
  }
});

router.get("/recommendations/for/:tmdbId/:mediaType", async (req, res) => {
  try {
    const { tmdbId, mediaType } = req.params;
    const currentUserId = req.query.userId as string | undefined;

    if (!tmdbId || !mediaType) {
      return handleValidationError(res, "TMDB ID and media type are required");
    }

    // Get recommendations with vote counts
    const recommendations = await db
      .select({
        id: userRecommendations.id,
        userId: userRecommendations.userId,
        recommendedTmdbId: userRecommendations.recommendedTmdbId,
        recommendedMediaType: userRecommendations.recommendedMediaType,
        recommendedTitle: userRecommendations.recommendedTitle,
        recommendedPosterPath: userRecommendations.recommendedPosterPath,
        reason: userRecommendations.reason,
        createdAt: userRecommendations.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(userRecommendations)
      .leftJoin(users, eq(userRecommendations.userId, users.id))
      .where(
        and(
          eq(userRecommendations.forTmdbId, parseInt(tmdbId)),
          eq(userRecommendations.forMediaType, mediaType)
        )
      );

    // Get vote counts and user votes for each recommendation
    const recommendationsWithVotes = await Promise.all(
      recommendations.map(async (rec) => {
        // Get all votes for this recommendation
        const votes = await db
          .select()
          .from(recommendationVotes)
          .where(eq(recommendationVotes.recommendationId, rec.id));

        const likeCount = votes.filter(v => v.voteType === 'like').length;
        const dislikeCount = votes.filter(v => v.voteType === 'dislike').length;
        const score = likeCount - dislikeCount;

        // Get current user's vote if userId is provided
        let userVote = null;
        if (currentUserId) {
          const userVoteData = votes.find(v => v.userId === currentUserId);
          userVote = userVoteData?.voteType || null;
        }

        // Get comment count
        const comments = await db
          .select()
          .from(recommendationComments)
          .where(eq(recommendationComments.recommendationId, rec.id));

        return {
          ...rec,
          likeCount,
          dislikeCount,
          score,
          userVote,
          commentCount: comments.length,
        };
      })
    );

    // Sort by score (highest first), then by creation date
    recommendationsWithVotes.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    res.json(recommendationsWithVotes);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch recommendations");
  }
});

router.post("/:userId/recommendations", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return handleValidationError(res, "User ID is required");
    }

    const { forTmdbId, forMediaType, recommendedTmdbId, recommendedMediaType, recommendedTitle, recommendedPosterPath, reason } = req.body;

    if (!forTmdbId || !forMediaType || !recommendedTmdbId || !recommendedMediaType || !recommendedTitle) {
      return handleValidationError(res, "Missing required fields");
    }

    // Check for duplicate recommendation
    const existingRecommendation = await db
      .select()
      .from(userRecommendations)
      .where(
        and(
          eq(userRecommendations.userId, userId),
          eq(userRecommendations.forTmdbId, forTmdbId),
          eq(userRecommendations.forMediaType, forMediaType),
          eq(userRecommendations.recommendedTmdbId, recommendedTmdbId),
          eq(userRecommendations.recommendedMediaType, recommendedMediaType)
        )
      )
      .limit(1);

    if (existingRecommendation.length > 0) {
      return res.status(409).json({ 
        error: "You have already recommended this movie/show for this title" 
      });
    }

    const [newRecommendation] = await db
      .insert(userRecommendations)
      .values({
        userId,
        forTmdbId,
        forMediaType,
        recommendedTmdbId,
        recommendedMediaType,
        recommendedTitle,
        recommendedPosterPath,
        reason
      })
      .returning();

    // If a reason was provided, automatically add it as the first comment
    if (reason && reason.trim()) {
      await db
        .insert(recommendationComments)
        .values({
          recommendationId: newRecommendation.id,
          userId,
          comment: reason
        });
    }

    res.status(201).json(newRecommendation);
  } catch (error) {
    handleApiError(res, error, "Failed to create recommendation");
  }
});

router.delete("/:userId/recommendations/:recommendationId", async (req, res) => {
  try {
    const { userId, recommendationId } = req.params;

    if (!userId || !recommendationId) {
      return handleValidationError(res, "User ID and recommendation ID are required");
    }

    // Check if the recommendation has any likes
    const votes = await db
      .select()
      .from(recommendationVotes)
      .where(eq(recommendationVotes.recommendationId, recommendationId));

    const likeCount = votes.filter(v => v.voteType === 'like').length;

    if (likeCount > 0) {
      return res.status(403).json({ 
        error: "Cannot delete recommendation with likes",
        message: `This recommendation has ${likeCount} ${likeCount === 1 ? 'like' : 'likes'}. Recommendations that others have found valuable cannot be deleted.`
      });
    }

    // Delete associated comments first
    await db
      .delete(recommendationComments)
      .where(eq(recommendationComments.recommendationId, recommendationId));

    // Delete associated votes
    await db
      .delete(recommendationVotes)
      .where(eq(recommendationVotes.recommendationId, recommendationId));

    // Now delete the recommendation
    const deletedItem = await db
      .delete(userRecommendations)
      .where(
        and(
          eq(userRecommendations.id, recommendationId),
          eq(userRecommendations.userId, userId)
        )
      )
      .returning();

    if (deletedItem.length === 0) {
      return handleNotFoundError(res, "Recommendation");
    }

    res.json({ message: "Recommendation deleted successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to delete recommendation");
  }
});

// Vote on a recommendation (like/dislike)
router.post("/:userId/recommendations/:recommendationId/vote", async (req, res) => {
  try {
    const { userId, recommendationId } = req.params;
    const { voteType } = req.body;

    if (!userId || !recommendationId) {
      return handleValidationError(res, "User ID and recommendation ID are required");
    }

    if (!voteType || !["like", "dislike"].includes(voteType)) {
      return handleValidationError(res, "Vote type must be 'like' or 'dislike'");
    }

    // Check if user already voted
    const existingVote = await db
      .select()
      .from(recommendationVotes)
      .where(
        and(
          eq(recommendationVotes.userId, userId),
          eq(recommendationVotes.recommendationId, recommendationId)
        )
      )
      .limit(1);

    if (existingVote.length > 0) {
      // If same vote type, remove it (toggle off)
      if (existingVote[0].voteType === voteType) {
        await db
          .delete(recommendationVotes)
          .where(eq(recommendationVotes.id, existingVote[0].id));
        return res.json({ message: "Vote removed", voteType: null });
      } else {
        // Update to new vote type
        const [updatedVote] = await db
          .update(recommendationVotes)
          .set({ voteType })
          .where(eq(recommendationVotes.id, existingVote[0].id))
          .returning();
        return res.json(updatedVote);
      }
    }

    // Create new vote
    const [newVote] = await db
      .insert(recommendationVotes)
      .values({ userId, recommendationId, voteType })
      .returning();

    res.status(201).json(newVote);
  } catch (error) {
    handleApiError(res, error, "Failed to vote on recommendation");
  }
});

// Delete a vote on a recommendation
router.delete("/:userId/recommendations/:recommendationId/vote", async (req, res) => {
  try {
    const { userId, recommendationId } = req.params;

    if (!userId || !recommendationId) {
      return handleValidationError(res, "User ID and recommendation ID are required");
    }

    await db
      .delete(recommendationVotes)
      .where(
        and(
          eq(recommendationVotes.userId, userId),
          eq(recommendationVotes.recommendationId, recommendationId)
        )
      );

    res.json({ message: "Vote removed successfully" });
  } catch (error) {
    handleApiError(res, error, "Failed to remove vote");
  }
});

// Add a comment to a recommendation
router.post("/:userId/recommendations/:recommendationId/comments", async (req, res) => {
  try {
    const { userId, recommendationId } = req.params;
    const { comment } = req.body;

    if (!userId || !recommendationId) {
      return handleValidationError(res, "User ID and recommendation ID are required");
    }

    if (!comment || comment.trim().length === 0) {
      return handleValidationError(res, "Comment text is required");
    }

    const [newComment] = await db
      .insert(recommendationComments)
      .values({ userId, recommendationId, comment: comment.trim() })
      .returning();

    // Fetch user details to return with comment
    const commentWithUser = await db
      .select({
        id: recommendationComments.id,
        userId: recommendationComments.userId,
        recommendationId: recommendationComments.recommendationId,
        comment: recommendationComments.comment,
        createdAt: recommendationComments.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(recommendationComments)
      .leftJoin(users, eq(recommendationComments.userId, users.id))
      .where(eq(recommendationComments.id, newComment.id))
      .limit(1);

    res.status(201).json(commentWithUser[0]);
  } catch (error) {
    handleApiError(res, error, "Failed to add comment");
  }
});

// Get all comments for a recommendation
router.get("/recommendations/:recommendationId/comments", async (req, res) => {
  try {
    const { recommendationId } = req.params;

    if (!recommendationId) {
      return handleValidationError(res, "Recommendation ID is required");
    }

    const comments = await db
      .select({
        id: recommendationComments.id,
        userId: recommendationComments.userId,
        recommendationId: recommendationComments.recommendationId,
        comment: recommendationComments.comment,
        createdAt: recommendationComments.createdAt,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(recommendationComments)
      .leftJoin(users, eq(recommendationComments.userId, users.id))
      .where(eq(recommendationComments.recommendationId, recommendationId))
      .orderBy(recommendationComments.createdAt);

    res.json(comments);
  } catch (error) {
    handleApiError(res, error, "Failed to fetch comments");
  }
});

export default router;
