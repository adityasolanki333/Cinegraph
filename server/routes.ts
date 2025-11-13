import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertMovieSchema, insertUserRatingSchema, insertUserWatchlistSchema, insertReviewInteractionSchema, tmdbTrainingData } from "@shared/schema";
import { z } from "zod";
import { tmdbService } from "./tmdb";
import { analyzeSentiment, analyzeSentimentEnhanced, getSentimentSummary, getSentimentInsights, generateReviewSummary } from "./sentiment.js";
import { geminiChatService } from "./services/geminiChatService";
import { unifiedRecommendationService } from './ml/unifiedRecommendationService';
import { intelligentQueryService } from './ml/intelligentQueryService';
import { useService } from './ml/universalSentenceEncoder';
import { db } from "./db";
import { sql, ilike, or, and, gte, lte } from "drizzle-orm";
import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import communityRouter from "./routes/community";
import externalRouter from "./routes/external";
import recommendationsRouter from "./routes/recommendations";
import diversityRouter from "./routes/diversity";
import { setBroadcastFunctions } from "./broadcast";

// Error handling helper function
function handleApiError(error: unknown, res: any, defaultMessage: string) {
  console.error(`API Error - ${defaultMessage}:`, error);
  
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    return res.status(400).json({ 
      error: "Validation error", 
      details: error.errors 
    });
  }
  
  // Handle typed errors with status codes
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    
    // Check for 404 errors
    if (errorMessage.includes('404') || errorMessage.includes('not found')) {
      return res.status(404).json({ 
        error: defaultMessage,
        message: "Resource not found"
      });
    }
    
    // Check for 401/403 authentication/authorization errors
    if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || 
        errorMessage.includes('403') || errorMessage.includes('forbidden')) {
      return res.status(401).json({ 
        error: "Authentication required",
        message: defaultMessage
      });
    }
    
    // Check for 400 bad request errors
    if (errorMessage.includes('400') || errorMessage.includes('bad request') || 
        errorMessage.includes('invalid')) {
      return res.status(400).json({ 
        error: "Invalid request",
        message: defaultMessage
      });
    }
    
    // Check for network errors
    if (errorMessage.includes('econnrefused') || errorMessage.includes('etimedout') || 
        errorMessage.includes('enotfound') || errorMessage.includes('network')) {
      return res.status(503).json({ 
        error: "Service unavailable",
        message: "Unable to connect to external service. Please try again later."
      });
    }
  }
  
  // Default to 500 for unknown server errors
  return res.status(500).json({ 
    error: defaultMessage,
    message: error instanceof Error ? error.message : "An unexpected error occurred"
  });
}

// Helper function to map new intent types to legacy format
function mapIntentToLegacy(intentType: string): 'specific' | 'general' | 'mood' | 'genre' {
  switch (intentType) {
    case 'content_similarity':
    case 'franchise':
      return 'specific';
    case 'attribute':
      return 'genre';
    case 'semantic':
    case 'contextual':
    case 'hybrid':
    default:
      return 'general';
  }
}

import { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "./types";
import { strictLimiter, aiLimiter } from "./middleware/rateLimiter";

// Authentication middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = req.headers['x-user-id'] || req.body.userId;
  
  if (!userId) {
    return res.status(401).json({ error: "Authentication required. Please log in to submit reviews and ratings." });
  }
  
  // Add userId to request for downstream use
  (req as AuthRequest).userId = userId as string;
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server first for WebSocket
  const httpServer = createServer(app);
  
  // WebSocket server for real-time notifications
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store connected clients with their user IDs
  const clients = new Map<string, WebSocket>();
  
  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;
    
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle authentication
        if (data.type === 'auth' && data.userId) {
          const newUserId = data.userId as string;
          userId = newUserId;
          clients.set(newUserId, ws);
          console.log(`[WebSocket] User ${newUserId} connected`);
          
          // Send connection confirmation
          ws.send(JSON.stringify({ type: 'connected', userId: newUserId }));
        }
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
      }
    });
    
    ws.on('close', () => {
      if (userId) {
        clients.delete(userId);
        console.log(`[WebSocket] User ${userId} disconnected`);
      }
    });
    
    ws.on('error', (error) => {
      console.error('[WebSocket] Error:', error);
    });
  });
  
  // Broadcast function to send notifications to specific user
  const broadcastNotification = (userId: string, notification: any) => {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'notification',
        data: notification
      }));
    }
  };
  
  // Broadcast function to send community updates to all connected clients
  const broadcastCommunityUpdate = (update: any) => {
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'community_update',
          data: update
        }));
      }
    });
  };
  
  // Store broadcast functions on the server for use in routes
  (httpServer as any).broadcastNotification = broadcastNotification;
  (httpServer as any).broadcastCommunityUpdate = broadcastCommunityUpdate;
  
  // Make broadcast functions available to other modules
  setBroadcastFunctions(broadcastNotification, broadcastCommunityUpdate);
  
  // Mount auth router
  app.use("/api/auth", authRouter);
  
  // Mount users router
  app.use("/api/users", usersRouter);
  
  // Mount community router
  app.use("/api/community", communityRouter);
  
  // Mount external APIs router
  app.use("/api/external", externalRouter);
  
  // Mount recommendations router (ML endpoints)
  app.use("/api/recommendations", recommendationsRouter);
  
  // Mount diversity metrics router
  app.use("/api/diversity", diversityRouter);

  // Movies endpoints
  app.get("/api/movies", async (req, res) => {
    try {
      const { search, genre, year, type } = req.query;
      let movies = await storage.getMovies();
      
      // Apply filters
      if (search) {
        movies = await storage.searchMovies(search as string);
      }
      
      if (genre && genre !== "all") {
        movies = movies.filter(movie => movie.genre === genre);
      }
      
      if (year && year !== "all") {
        movies = movies.filter(movie => movie.year.toString() === year);
      }
      
      if (type && type !== "all") {
        movies = movies.filter(movie => movie.type === type);
      }
      
      res.json(movies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch movies" });
    }
  });

  app.get("/api/movies/:id", async (req, res) => {
    try {
      const movie = await storage.getMovie(req.params.id);
      if (!movie) {
        return res.status(404).json({ error: "Movie not found" });
      }
      res.json(movie);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch movie" });
    }
  });

  app.post("/api/movies", async (req, res) => {
    try {
      const movieData = insertMovieSchema.parse(req.body);
      const movie = await storage.createMovie(movieData);
      res.status(201).json(movie);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid movie data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create movie" });
    }
  });

  // User ratings endpoints
  app.get("/api/users/:userId/ratings", async (req, res) => {
    try {
      const ratings = await storage.getUserRatings(req.params.userId);
      res.json(ratings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user ratings" });
    }
  });

  app.post("/api/users/:userId/ratings", async (req, res) => {
    try {
      const ratingData = insertUserRatingSchema.parse({
        ...req.body,
        userId: req.params.userId,
      });
      const rating = await storage.createUserRating(ratingData);
      res.status(201).json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid rating data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create rating" });
    }
  });

  // Watchlist endpoints
  app.get("/api/users/:userId/watchlist", async (req, res) => {
    try {
      const watchlist = await storage.getUserWatchlist(req.params.userId);
      
      // Return watchlist items as they already contain movie data from TMDB
      res.json(watchlist);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch watchlist" });
    }
  });

  app.post("/api/users/:userId/watchlist", async (req, res) => {
    try {
      const watchlistData = insertUserWatchlistSchema.parse({
        ...req.body,
        userId: req.params.userId,
      });
      const watchlistItem = await storage.addToWatchlist(watchlistData);
      res.status(201).json(watchlistItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid watchlist data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  });

  app.delete("/api/users/:userId/watchlist/:movieId", async (req, res) => {
    try {
      const success = await storage.removeFromWatchlist(req.params.userId, req.params.movieId);
      if (!success) {
        return res.status(404).json({ error: "Watchlist item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  });

  // Favorites endpoints
  app.get("/api/users/:userId/favorites", async (req, res) => {
    try {
      const favorites = await storage.getUserFavorites(req.params.userId);
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });

  app.post("/api/users/:userId/favorites", async (req, res) => {
    try {
      const { insertUserFavoritesSchema } = await import("@shared/schema");
      const favoriteData = insertUserFavoritesSchema.parse({
        ...req.body,
        userId: req.params.userId,
      });
      const favoriteItem = await storage.addToFavorites(favoriteData);
      res.status(201).json(favoriteItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid favorite data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to add to favorites" });
    }
  });

  app.delete("/api/users/:userId/favorites/:tmdbId", async (req, res) => {
    try {
      const success = await storage.removeFromFavorites(req.params.userId, req.params.tmdbId);
      if (!success) {
        return res.status(404).json({ error: "Favorite item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove from favorites" });
    }
  });

  // User recommendations endpoints - for users to recommend similar content to others
  app.get("/api/recommendations/user/:tmdbId/:mediaType", async (req, res) => {
    try {
      const { tmdbId, mediaType } = req.params;
      const recommendations = await storage.getUserRecommendationsForMedia(
        parseInt(tmdbId),
        mediaType
      );
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user recommendations" });
    }
  });

  app.post("/api/recommendations/user", requireAuth, async (req, res) => {
    try {
      // Get userId from auth middleware (stored in headers by requireAuth)
      const userId = req.headers['x-user-id'] as string;
      const { forTmdbId, forMediaType, recommendedTmdbId, recommendedMediaType, recommendedTitle, recommendedPosterPath, reason } = req.body;
      
      if (!forTmdbId || !forMediaType || !recommendedTmdbId || !recommendedMediaType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const recommendation = await storage.createUserRecommendation({
        userId,
        forTmdbId: parseInt(forTmdbId),
        forMediaType,
        recommendedTmdbId: parseInt(recommendedTmdbId),
        recommendedMediaType,
        recommendedTitle: recommendedTitle || '',
        recommendedPosterPath: recommendedPosterPath || null,
        reason: reason || null
      });

      res.status(201).json(recommendation);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid recommendation data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create recommendation" });
    }
  });

  app.delete("/api/recommendations/user/:recommendationId", requireAuth, async (req, res) => {
    try {
      const userId = req.headers['x-user-id'] || req.body.userId;
      const success = await storage.deleteUserRecommendation(req.params.recommendationId, userId as string);
      
      if (!success) {
        return res.status(404).json({ error: "Recommendation not found or unauthorized" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete recommendation" });
    }
  });

  app.get("/api/users/:userId/recommendations", async (req, res) => {
    try {
      const recommendations = await storage.getUserSubmittedRecommendations(req.params.userId);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user recommendations" });
    }
  });

  // Hybrid personalized recommendations endpoint (now using TensorFlow.js)
  app.get("/api/recommendations/hybrid/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 8;
      
      console.log(`[TF.js Recommendations] Generating for user: ${userId}, limit: ${limit}`);
      
      // Get recommendations using unified TensorFlow.js service
      const recommendations = await unifiedRecommendationService.getRecommendations({
        userId,
        requestType: 'personalized',
        limit,
        useDiversity: true
      });
      
      console.log(`[TF.js Recommendations] Generated ${recommendations.length} recommendations`);
      
      // Format response for frontend
      const formattedRecs = recommendations.map(rec => ({
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        title: rec.title,
        posterPath: rec.posterPath,
        voteAverage: rec.metadata?.voteAverage || rec.metadata?.vote_average || 0, // Use actual TMDB rating
        releaseDate: rec.metadata?.releaseDate || rec.metadata?.release_date || rec.metadata?.first_air_date || '',
        explanation: rec.explanation?.primaryReason || rec.reason,
        features: rec.explanation?.contributingFactors || [rec.type],
        matchScore: Math.round(rec.score * 100), // Convert 0-1 to 0-100 percentage
        confidence: rec.confidence,
        genreIds: rec.metadata?.genreIds || rec.metadata?.genre_ids || [],
        strategy: rec.strategy // Include contextual bandit strategy
      }));
      
      console.log(`[TF.js Recommendations] Returning ${formattedRecs.length} formatted recommendations`);
      
      res.json({ recommendations: formattedRecs });
    } catch (error) {
      console.error('Error generating TensorFlow.js recommendations:', error);
      res.status(500).json({ error: 'Failed to generate recommendations' });
    }
  });

  // Recommendation explanation endpoint (using explainability engine)
  app.get("/api/recommendations/hybrid/:userId/explain/:movieId", async (req, res) => {
    try {
      const { userId, movieId } = req.params;
      const mediaType = (req.query.mediaType as string) || 'movie';
      
      const { explainabilityEngine } = await import('./ml/explainability');
      const explanation = await explainabilityEngine.explainRecommendation(
        userId,
        parseInt(movieId),
        mediaType
      );
      
      res.json(explanation);
    } catch (error) {
      console.error('Error explaining recommendation:', error);
      res.status(500).json({ error: 'Failed to explain recommendation' });
    }
  });

  // Pattern-enhanced recommendations endpoint (using TensorFlow.js LSTM)
  app.get("/api/recommendations/pattern-enhanced/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;
      
      console.log(`[TF.js Pattern Recommendations] Generating for user: ${userId}, limit: ${limit}`);
      
      // Get pattern-enhanced recommendations using unified service
      const recommendations = await unifiedRecommendationService.getRecommendations({
        userId,
        requestType: 'personalized',
        limit,
        useDiversity: true
      });
      
      console.log(`[TF.js Pattern Recommendations] Generated ${recommendations.length} recommendations`);
      
      // Format response for frontend
      const formattedRecs = recommendations.map(rec => ({
        tmdbId: rec.tmdbId,
        mediaType: rec.mediaType,
        title: rec.title,
        posterPath: rec.posterPath,
        voteAverage: rec.metadata?.voteAverage || rec.metadata?.vote_average || 0, // Use actual TMDB rating
        releaseDate: rec.metadata?.releaseDate || rec.metadata?.release_date || rec.metadata?.first_air_date || '',
        explanation: rec.explanation?.primaryReason || rec.reason,
        features: rec.explanation?.contributingFactors || [rec.type],
        matchScore: Math.round(rec.score * 100), // Convert 0-1 to 0-100 percentage
        confidence: rec.confidence,
        genreIds: rec.metadata?.genreIds || rec.metadata?.genre_ids || []
      }));
      
      console.log(`[TF.js Pattern Recommendations] Returning ${formattedRecs.length} formatted recommendations`);
      
      res.json({ recommendations: formattedRecs });
    } catch (error) {
      console.error('Error generating TensorFlow.js pattern recommendations:', error);
      res.status(500).json({ error: 'Failed to generate pattern-enhanced recommendations' });
    }
  });

  // Personalized recommendations endpoint
  app.get("/api/recommendations/personalized/:userId", async (req, res) => {
    try {
      const { userId } = req.params;

      // Fetch all user data in parallel
      const [watchlist, ratings, favorites, userRecommendations] = await Promise.all([
        storage.getUserWatchlist(userId),
        storage.getUserRatings(userId),
        storage.getUserFavorites(userId),
        storage.getUserSubmittedRecommendations(userId)
      ]);

      // Fetch genre lists from TMDB
      const [movieGenres, tvGenres] = await Promise.all([
        tmdbService.getMovieGenres(),
        tmdbService.getTVGenres()
      ]);

      const allGenres = [...(movieGenres.genres || []), ...(tvGenres.genres || [])];
      const genreMap: Record<number, string> = {};
      allGenres.forEach(g => { genreMap[g.id] = g.name; });

      // Analyze user data
      const genreFrequency: Record<number, number> = {};
      const mediaTypeCount: Record<string, number> = { movie: 0, tv: 0 };
      
      // Collect all TMDB IDs to exclude from recommendations
      const excludedIds = new Set<number>();
      watchlist.forEach(item => excludedIds.add(item.tmdbId));
      favorites.forEach(item => excludedIds.add(item.tmdbId));
      ratings.forEach(item => excludedIds.add(item.tmdbId));

      // Get highly rated items (rating >= 8) for recommendations
      const highlyRated = ratings.filter(r => r.rating >= 8).sort((a, b) => b.rating - a.rating);

      // Fetch details for highly rated items to extract genres
      const detailsPromises = highlyRated.slice(0, 10).map(async (rating) => {
        try {
          const details = rating.mediaType === 'tv' 
            ? await tmdbService.getTVDetails(rating.tmdbId)
            : await tmdbService.getMovieDetails(rating.tmdbId);
          return { ...rating, details };
        } catch (error) {
          return { ...rating, details: null };
        }
      });

      const detailedRatings = await Promise.all(detailsPromises);

      // Extract genre preferences from highly rated items
      detailedRatings.forEach(item => {
        const genres = (item.details as any)?.genres || [];
        genres.forEach((genre: any) => {
          genreFrequency[genre.id] = (genreFrequency[genre.id] || 0) + item.rating;
        });
        mediaTypeCount[item.mediaType] = (mediaTypeCount[item.mediaType] || 0) + 1;
      });

      // Extract genres from watchlist and favorites
      [...watchlist, ...favorites].forEach(item => {
        mediaTypeCount[item.mediaType] = (mediaTypeCount[item.mediaType] || 0) + 1;
      });

      // Calculate statistics
      const averageRating = ratings.length > 0 
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
        : 7;

      const favoriteGenreIds = Object.entries(genreFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([id]) => parseInt(id));

      const favoriteGenres = favoriteGenreIds.map(id => genreMap[id]).filter(Boolean);
      const preferredMediaType = mediaTypeCount.movie >= mediaTypeCount.tv ? 'movie' : 'tv';

      // Generate recommendations from multiple sources
      const recommendationCandidates: any[] = [];

      // 1. Get recommendations based on favorite genres
      if (favoriteGenreIds.length > 0) {
        const genreDiscoverPromises = favoriteGenreIds.slice(0, 2).map(async (genreId) => {
          try {
            const params = {
              with_genres: genreId.toString(),
              sort_by: 'vote_average.desc',
              'vote_count.gte': '100',
              'vote_average.gte': (averageRating - 1).toString()
            };
            
            const results = preferredMediaType === 'tv'
              ? await tmdbService.discoverTVShows(params)
              : await tmdbService.discoverMovies(params);
            
            return (results.results || []).slice(0, 10).map((item: any) => ({
              ...item,
              recommendationType: 'genre',
              baseGenre: genreMap[genreId]
            }));
          } catch (error) {
            return [];
          }
        });

        const genreResults = await Promise.all(genreDiscoverPromises);
        recommendationCandidates.push(...genreResults.flat());
      }

      // 2. Get TMDB recommendations from highly rated items
      if (highlyRated.length > 0) {
        const tmdbRecPromises = highlyRated.slice(0, 3).map(async (rating) => {
          try {
            const results = rating.mediaType === 'tv'
              ? await tmdbService.getTVRecommendations(rating.tmdbId.toString())
              : await tmdbService.getMovieRecommendations(rating.tmdbId.toString());
            
            return (results.results || []).slice(0, 10).map((item: any) => ({
              ...item,
              recommendationType: 'similar',
              basedOn: { tmdbId: rating.tmdbId, title: rating.title, rating: rating.rating }
            }));
          } catch (error) {
            return [];
          }
        });

        const tmdbResults = await Promise.all(tmdbRecPromises);
        recommendationCandidates.push(...tmdbResults.flat());
      }

      // 3. Get popular content in preferred media type
      try {
        const popularResults = preferredMediaType === 'tv'
          ? await tmdbService.getPopularTVShows(1)
          : await tmdbService.getPopularMovies(1);
        
        recommendationCandidates.push(...(popularResults.results || []).slice(0, 10).map((item: any) => ({
          ...item,
          recommendationType: 'popular'
        })));
      } catch (error) {
        console.error('Error fetching popular content:', error);
      }

      // Filter out duplicates and already watched/favorited items
      const seenIds = new Set<number>();
      const uniqueRecommendations = recommendationCandidates.filter(rec => {
        const id = rec.id;
        if (excludedIds.has(id) || seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      });

      // Score and rank recommendations
      const scoredRecommendations = uniqueRecommendations.map(rec => {
        let score = 0;
        const features: string[] = [];
        let explanation = '';

        // Genre match score
        const recGenres = rec.genre_ids || [];
        const genreMatches = recGenres.filter((gid: number) => favoriteGenreIds.includes(gid));
        if (genreMatches.length > 0) {
          score += genreMatches.length * 20;
          features.push(`${genreMatches.map((gid: number) => genreMap[gid]).join(', ')}`);
        }

        // Rating quality score
        const voteAvg = rec.vote_average || 0;
        if (voteAvg >= 8) {
          score += 30;
          features.push('Highly rated');
        } else if (voteAvg >= 7) {
          score += 20;
          features.push('Well rated');
        }

        // Popularity score
        if (rec.popularity > 100) {
          score += 10;
          features.push('Trending');
        }

        // Generate explanation based on recommendation type
        if (rec.recommendationType === 'similar' && rec.basedOn) {
          explanation = `Because you loved "${rec.basedOn.title}" (${rec.basedOn.rating}/10)`;
        } else if (rec.recommendationType === 'genre' && rec.baseGenre) {
          explanation = `Based on your interest in ${rec.baseGenre}`;
        } else if (rec.recommendationType === 'popular') {
          explanation = `Popular ${preferredMediaType === 'tv' ? 'TV show' : 'movie'} you might enjoy`;
        } else {
          explanation = watchlist.length > 0 ? 'Similar to items in your watchlist' : 'Recommended for you';
        }

        return {
          tmdbId: rec.id,
          mediaType: rec.media_type || (rec.title ? 'movie' : 'tv'),
          title: rec.title || rec.name,
          posterPath: rec.poster_path,
          voteAverage: rec.vote_average || 0,
          releaseDate: rec.release_date || rec.first_air_date || '',
          explanation,
          features: features.slice(0, 3),
          genreIds: rec.genre_ids || [],
          score
        };
      });

      // Sort by score and limit to top 6
      const topRecommendations = scoredRecommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(({ score, ...rec }) => rec); // Remove score from final output

      // Return formatted response
      res.json({
        recommendations: topRecommendations,
        userPreferences: {
          favoriteGenres,
          averageRating: parseFloat(averageRating.toFixed(1)),
          totalRatings: ratings.length,
          watchlistCount: watchlist.length
        }
      });
    } catch (error) {
      handleApiError(error, res, "Failed to generate personalized recommendations");
    }
  });

  // User profile update endpoint
  app.patch("/api/users/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const { firstName, lastName } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({ error: "First name and last name are required" });
      }

      // Since users are stored in localStorage, just return the updated data
      // The frontend will handle updating localStorage
      const updatedUser = {
        id: userId,
        firstName,
        lastName,
        updatedAt: new Date()
      };

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update user profile" });
    }
  });

  // Enhanced rating and review endpoints with sentiment analysis
  app.get("/api/ratings", async (req, res) => {
    try {
      const { tmdbId, mediaType, userId, sortBy = 'latest' } = req.query;
      
      if (!tmdbId || !mediaType) {
        return res.status(400).json({ error: "tmdbId and mediaType are required" });
      }
      
      const ratings = await storage.getRatingsByMedia(
        parseInt(tmdbId as string), 
        mediaType as string,
        userId as string,
        sortBy as string
      );
      
      res.json(ratings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ratings" });
    }
  });

  app.post("/api/ratings", requireAuth, strictLimiter, async (req, res) => {
    try {
      const ratingData = insertUserRatingSchema.parse(req.body);
      
      // Check if user already has a rating for this media
      const existingRatings = await storage.getRatingsByMedia(
        ratingData.tmdbId,
        ratingData.mediaType,
        ratingData.userId
      );
      
      if (existingRatings.length > 0) {
        return res.status(400).json({ 
          error: "You have already reviewed this item. Please update your existing review instead." 
        });
      }
      
      // Analyze sentiment if review is provided
      let sentimentData: { sentimentScore: number | null; sentimentLabel: string | null } = { sentimentScore: null, sentimentLabel: null };
      if (ratingData.review && ratingData.review.trim()) {
        const sentiment = analyzeSentiment(ratingData.review);
        sentimentData = {
          sentimentScore: sentiment.score,
          sentimentLabel: sentiment.label
        };
      }
      
      const enhancedRatingData = {
        ...ratingData,
        ...sentimentData
      };
      
      const rating = await storage.createUserRating(enhancedRatingData);
      
      // Automatically add to viewing history (for pattern recognition)
      try {
        const existingHistory = await storage.getUserViewingHistory(rating.userId);
        const alreadyWatched = existingHistory.some(h => h.tmdbId === rating.tmdbId && h.mediaType === rating.mediaType);
        
        if (!alreadyWatched) {
          await storage.createViewingHistory({
            userId: rating.userId,
            tmdbId: rating.tmdbId,
            mediaType: rating.mediaType,
            title: rating.title,
            posterPath: rating.posterPath,
            watchedAt: new Date(),
            watchDuration: null // We don't know actual watch duration from rating
          });
        }
      } catch (historyError) {
        console.error("Failed to add to viewing history:", historyError);
        // Don't fail the rating if history update fails
      }
      
      // Update user activity stats - increment total reviews and add XP
      const { sql } = await import('drizzle-orm');
      const { updateUserStats } = await import('./routes/community');
      await updateUserStats(rating.userId, { 
        totalReviews: sql`total_reviews + 1`,
        experiencePoints: sql`experience_points + 10`
      });
      
      // Check for badge awards
      const { checkAndAwardBadges } = await import('./badges');
      await checkAndAwardBadges(rating.userId);
      
      // Broadcast community update for real-time feed
      broadcastCommunityUpdate({
        type: 'review',
        action: 'created',
        userId: rating.userId,
        tmdbId: rating.tmdbId,
        mediaType: rating.mediaType
      });
      
      res.status(201).json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid rating data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create rating" });
    }
  });

  app.put("/api/ratings/:id", requireAuth, strictLimiter, async (req, res) => {
    try {
      const { rating, review } = req.body;
      
      // Analyze sentiment if review is provided
      let sentimentData: { sentimentScore: number | null; sentimentLabel: string | null } = { sentimentScore: null, sentimentLabel: null };
      if (review && review.trim()) {
        const sentiment = analyzeSentiment(review);
        sentimentData = {
          sentimentScore: sentiment.score,
          sentimentLabel: sentiment.label
        };
      }
      
      const updateData = {
        rating,
        review,
        ...sentimentData
      };
      
      const updatedRating = await storage.updateUserRating(req.params.id, updateData);
      
      if (!updatedRating) {
        return res.status(404).json({ error: "Rating not found" });
      }
      
      // Broadcast community update for real-time feed
      broadcastCommunityUpdate({
        type: 'review',
        action: 'updated',
        userId: updatedRating.userId,
        tmdbId: updatedRating.tmdbId,
        mediaType: updatedRating.mediaType
      });
      
      res.json(updatedRating);
    } catch (error) {
      res.status(500).json({ error: "Failed to update rating" });
    }
  });

  app.delete("/api/ratings/:id", requireAuth, strictLimiter, async (req, res) => {
    try {
      // Get the rating before deleting to access userId
      const { db } = await import('./db');
      const { userRatings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const [ratingToDelete] = await db.select().from(userRatings).where(eq(userRatings.id, req.params.id));
      
      const success = await storage.deleteUserRating(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Rating not found" });
      }
      
      // Update user activity stats - decrement total reviews and subtract XP
      if (ratingToDelete) {
        const { sql } = await import('drizzle-orm');
        const { updateUserStats } = await import('./routes/community');
        await updateUserStats(ratingToDelete.userId, { 
          totalReviews: sql`GREATEST(total_reviews - 1, 0)`,
          experiencePoints: sql`GREATEST(experience_points - 10, 0)`
        });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete rating" });
    }
  });

  // Review interaction endpoints (helpful votes, reports)
  app.post("/api/reviews/:reviewId/interact", requireAuth, strictLimiter, async (req, res) => {
    try {
      const interactionData = insertReviewInteractionSchema.parse({
        ...req.body,
        reviewId: req.params.reviewId
      });
      
      const interaction = await storage.createReviewInteraction(interactionData);
      
      // Update helpful count if it's a helpful/not_helpful interaction
      if (interactionData.interactionType === 'helpful') {
        await storage.incrementHelpfulCount(req.params.reviewId);
      }
      
      res.status(201).json(interaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid interaction data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create interaction" });
    }
  });

  // TMDB API endpoints
  app.get("/api/tmdb/trending", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getTrendingAll(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch trending content");
    }
  });

  app.get("/api/tmdb/movies/popular", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getPopularMovies(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch popular movies");
    }
  });

  app.get("/api/tmdb/movies/top-rated", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getTopRatedMovies(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch top rated movies");
    }
  });

  app.get("/api/tmdb/movies/now-playing", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getNowPlayingMovies(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch now playing movies");
    }
  });

  app.get("/api/tmdb/movies/upcoming", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getUpcomingMovies(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch upcoming movies");
    }
  });

  app.get("/api/tmdb/movies/indian", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      
      // TMDB discover API parameters for Indian movies
      const params = {
        page: page.toString(),
        region: 'IN',
        with_original_language: 'hi|ta|te|ml|kn|bn', // Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali
        sort_by: 'popularity.desc'
      };
      
      const data = await tmdbService.discoverMovies(params);
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch Indian movies");
    }
  });

  app.get("/api/tmdb/tv/popular", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getPopularTVShows(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch popular TV shows");
    }
  });

  app.get("/api/tmdb/tv/top-rated", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getTopRatedTVShows(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch top rated TV shows");
    }
  });

  app.get("/api/tmdb/tv/airing-today", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getAiringTodayTVShows(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch airing today TV shows");
    }
  });

  app.get("/api/tmdb/tv/on-the-air", async (req, res) => {
    try {
      const { page = '1' } = req.query;
      const data = await tmdbService.getOnTheAirTVShows(parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch on the air TV shows");
    }
  });

  app.get("/api/tmdb/movie/:id", async (req, res) => {
    try {
      const movieId = parseInt(req.params.id);
      console.log(`🎬 [ENHANCED MOVIE LOOKUP] Fetching movie ID: ${movieId}`);
      if (!movieId || isNaN(movieId)) {
        return res.status(400).json({ error: "Invalid movie ID" });
      }
      
      // Fetch from TMDB API
      const data = await tmdbService.getMovieDetails(movieId);
      console.log(`🎬 [ENHANCED MOVIE LOOKUP] TMDB returned:`, data ? 'FOUND' : 'NULL');
      
      if (!data) {
        return res.status(404).json({ 
          error: "Movie not found",
          message: "This movie is not available in the TMDB database."
        });
      }
      
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch movie details");
    }
  });

  app.get("/api/tmdb/tv/:id", async (req, res) => {
    try {
      const tvId = parseInt(req.params.id);
      if (!tvId || isNaN(tvId)) {
        return res.status(400).json({ error: "Invalid TV show ID" });
      }
      
      try {
        // Try primary TMDB API first
        const data = await tmdbService.getTVDetails(tvId);
        res.json(data);
      } catch (primaryError: any) {
        // If TMDB API fails with 404, provide a helpful message
        if (primaryError?.message?.includes('404') || primaryError?.message?.includes('not found')) {
          console.log(`[TV Details] TMDB ID ${tvId} not found`);
          res.status(404).json({ 
            error: "TV show not found",
            message: "This TV show may have been removed from TMDB or is no longer available."
          });
        } else {
          throw primaryError;
        }
      }
    } catch (error) {
      handleApiError(error, res, "Failed to fetch TV show details");
    }
  });

  app.get("/api/tmdb/person/:id", async (req, res) => {
    try {
      const personId = parseInt(req.params.id);
      if (!personId || isNaN(personId)) {
        return res.status(400).json({ error: "Invalid person ID" });
      }
      const data = await tmdbService.getPersonDetails(personId);
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch person details");
    }
  });

  app.get("/api/tmdb/search/movies", async (req, res) => {
    try {
      const { query, page = 1 } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const data = await tmdbService.searchMovies(query as string, parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to search movies");
    }
  });

  app.get("/api/tmdb/search/tv", async (req, res) => {
    try {
      const { query, page = 1 } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const data = await tmdbService.searchTVShows(query as string, parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to search TV shows");
    }
  });

  app.get("/api/tmdb/search/people", async (req, res) => {
    try {
      const { query, page = 1 } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const data = await tmdbService.searchPeople(query as string, parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to search people");
    }
  });

  app.get("/api/tmdb/search/multi", async (req, res) => {
    try {
      const { query, page = 1 } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const data = await tmdbService.searchMulti(query as string, parseInt(page as string));
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to perform multi search");
    }
  });

  app.get("/api/tmdb/discover/movies", async (req, res) => {
    try {
      const data = await tmdbService.discoverMovies(req.query as Record<string, any>);
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to discover movies");
    }
  });

  app.get("/api/tmdb/discover/tv", async (req, res) => {
    try {
      const data = await tmdbService.discoverTVShows(req.query as Record<string, any>);
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to discover TV shows");
    }
  });

  app.get("/api/tmdb/genres/movies", async (req, res) => {
    try {
      const data = await tmdbService.getMovieGenres();
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch movie genres");
    }
  });

  app.get("/api/tmdb/genres/tv", async (req, res) => {
    try {
      const data = await tmdbService.getTVGenres();
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch TV genres");
    }
  });

  app.get("/api/tmdb/configuration", async (req, res) => {
    try {
      const data = await tmdbService.getConfiguration();
      res.json(data);
    } catch (error) {
      handleApiError(error, res, "Failed to fetch configuration");
    }
  });

  // TMDB Movie Review and Rating API endpoints
  app.get("/api/tmdb/movie/:id/reviews", async (req, res) => {
    try {
      const movieId = req.params.id;
      const page = parseInt(req.query.page as string) || 1;
      const reviews = await tmdbService.getMovieReviews(movieId, page);
      console.log(`Movie Reviews for ${movieId}, page ${page}:`, JSON.stringify({
        total_results: reviews.total_results,
        total_pages: reviews.total_pages,
        current_page: reviews.page,
        results_count: reviews.results?.length
      }));
      res.json(reviews);
    } catch (error) {
      console.error('Error fetching TMDB movie reviews:', error);
      res.status(500).json({ error: "Failed to fetch movie reviews from TMDB" });
    }
  });

  app.get("/api/tmdb/review/:id", async (req, res) => {
    try {
      const reviewId = req.params.id;
      const review = await tmdbService.getReviewDetails(reviewId);
      res.json(review);
    } catch (error) {
      console.error('Error fetching TMDB review details:', error);
      res.status(500).json({ error: "Failed to fetch review details from TMDB" });
    }
  });

  app.post("/api/tmdb/movie/:id/rating", async (req, res) => {
    try {
      const movieId = req.params.id;
      const { rating, sessionId } = req.body;
      
      if (!rating || rating < 0.5 || rating > 10) {
        return res.status(400).json({ error: "Rating must be between 0.5 and 10" });
      }
      
      const result = await tmdbService.rateMovie(movieId, rating, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Error rating movie on TMDB:', error);
      res.status(500).json({ error: "Failed to rate movie on TMDB" });
    }
  });

  app.delete("/api/tmdb/movie/:id/rating", async (req, res) => {
    try {
      const movieId = req.params.id;
      const { sessionId } = req.body;
      
      const result = await tmdbService.deleteMovieRating(movieId, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting movie rating on TMDB:', error);
      res.status(500).json({ error: "Failed to delete movie rating on TMDB" });
    }
  });

  // Sentiment analytics endpoint - includes both local and TMDB reviews
  app.get("/api/sentiment/:tmdbId/:mediaType", async (req, res) => {
    try {
      const { tmdbId, mediaType } = req.params;
      
      // Return minimal sentiment data to avoid database connection issues during long AI operations
      // TODO: Re-enable full sentiment analysis after implementing proper connection pooling
      res.json({
        summary: {
          avgScore: 0,
          distribution: { positive: 0, negative: 0, neutral: 0 },
          totalReviews: 0
        },
        insights: ['Sentiment analysis temporarily disabled'],
        aiSummary: '',
        tmdbId: parseInt(tmdbId),
        mediaType,
        sources: {
          local: 0,
          tmdb: 0
        }
      });
    } catch (error) {
      console.error('Sentiment endpoint error:', error);
      res.status(500).json({ error: "Failed to analyze sentiment" });
    }
  });

  // User communities endpoint
  app.get("/api/users/:userId/communities", async (req, res) => {
    try {
      const communities = await storage.getUserCommunities(req.params.userId);
      res.json(communities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user communities" });
    }
  });

  // Viewing history / Watched endpoints
  app.get("/api/users/:userId/viewing-history", async (req, res) => {
    try {
      const history = await storage.getUserViewingHistory(req.params.userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch viewing history" });
    }
  });

  app.get("/api/users/:userId/watched", async (req, res) => {
    try {
      const history = await storage.getUserViewingHistory(req.params.userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch watched items" });
    }
  });

  app.post("/api/users/:userId/watched", async (req, res) => {
    try {
      const { insertViewingHistorySchema } = await import("@shared/schema");
      const watchedData = insertViewingHistorySchema.parse({
        ...req.body,
        userId: req.params.userId,
      });
      const watchedItem = await storage.createViewingHistory(watchedData);
      res.status(201).json(watchedItem);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid watched data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to add watched item" });
    }
  });

  app.delete("/api/users/:userId/watched/:tmdbId", async (req, res) => {
    try {
      const success = await storage.removeWatchedItem(req.params.userId, parseInt(req.params.tmdbId));
      if (!success) {
        return res.status(404).json({ error: "Watched item not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to remove watched item" });
    }
  });

  // Recommendations endpoint
  app.get("/api/users/:userId/recommendations", async (req, res) => {
    try {
      const recommendations = await storage.getUserRecommendations(req.params.userId);
      res.json(recommendations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch recommendations" });
    }
  });

  // Mood-based movie/TV recommendations using TMDB discover API
  app.get("/api/recommendations/mood/:mood", async (req, res) => {
    try {
      const { mood } = req.params;
      const { page = 1, type = 'movie', seed } = req.query;
      
      // Map moods to TMDB genres and parameters (with different date fields for movies vs TV)
      const dateField = type === 'tv' ? 'first_air_date' : 'primary_release_date';
      
      const moodMapping: Record<string, any> = {
        happy: {
          with_genres: type === 'tv' ? '35,10751' : '35,10751,16', // TV: Comedy, Family; Movies: Comedy, Family, Animation
          sort_by: 'popularity.desc',
          'vote_average.gte': 6.0,
          [`${dateField}.gte`]: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 10 years
        },
        romantic: {
          with_genres: type === 'tv' ? '18' : '10749', // TV uses Drama for romantic shows; Movies: Romance
          sort_by: 'popularity.desc',
          'vote_average.gte': type === 'tv' ? 7.0 : 6.5,
          [`${dateField}.gte`]: new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 5 years
        },
        energetic: {
          with_genres: type === 'tv' ? '10759' : '28,12,53', // TV: Action & Adventure only (more content); Movies: Action, Adventure, Thriller
          sort_by: 'popularity.desc',
          'vote_average.gte': type === 'tv' ? 5.5 : 6.0,
          [`${dateField}.gte`]: new Date(Date.now() - 15 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 15 years
        },
        thoughtful: {
          with_genres: '18', // Drama (same ID for both)
          sort_by: 'vote_average.desc',
          'vote_average.gte': 7.0,
          'vote_count.gte': type === 'tv' ? 50 : 100,
          [`${dateField}.gte`]: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 10 years
        },
        scary: {
          with_genres: type === 'tv' ? '9648,10765' : '27,53', // TV: Mystery, Sci-Fi & Fantasy; Movies: Horror, Thriller
          sort_by: 'popularity.desc',
          'vote_average.gte': type === 'tv' ? 6.5 : 5.5,
          [`${dateField}.gte`]: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 10 years
        },
        nostalgic: {
          sort_by: 'vote_average.desc',
          'vote_average.gte': type === 'tv' ? 7.0 : 7.5,
          'vote_count.gte': type === 'tv' ? 100 : 500,
          [`${dateField}.gte`]: type === 'tv' ? '1990-01-01' : '1980-01-01',
          [`${dateField}.lte`]: type === 'tv' ? '2010-12-31' : '2000-12-31'
        },
        animated: {
          with_genres: '16', // Animation (same ID for both)
          sort_by: 'popularity.desc',
          'vote_average.gte': type === 'tv' ? 7.0 : 6.5,
          [`${dateField}.gte`]: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 10 years
        },
        indie: {
          with_companies: type === 'tv' ? undefined : '25,41', // Companies only for movies
          with_genres: type === 'tv' ? '18,9648' : undefined, // TV: Drama, Mystery; Movies: use companies
          sort_by: 'vote_average.desc',
          'vote_average.gte': type === 'tv' ? 7.5 : 7.0,
          'vote_count.gte': type === 'tv' ? 100 : 50,
          [`${dateField}.gte`]: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Last 10 years
        }
      };

      const params = moodMapping[mood];
      if (!params) {
        return res.status(400).json({ error: "Invalid mood provided" });
      }

      // Remove undefined properties
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([_, value]) => value !== undefined)
      );

      // Use seed for deterministic randomization or generate random page (1-10 for more variety)
      const seedValue = seed ? parseInt(seed as string) : Date.now();
      const randomPage = ((seedValue % 10) + 1); // Pages 1-10 based on seed
      cleanParams.page = randomPage;
      
      // Use appropriate discover method based on type
      const data = type === 'tv' 
        ? await tmdbService.discoverTVShows(cleanParams)
        : await tmdbService.discoverMovies(cleanParams);
      
      // Shuffle results using seed for consistent but different results each time
      const shuffled = [...(data.results || [])];
      const random = (seed: number) => {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };
      
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random(seedValue + i) * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      res.json({
        recommendations: shuffled,
        page: (data as any).page || 1,
        total_pages: (data as any).total_pages || 1,
        total_results: (data as any).total_results || 0,
        mood,
        type,
        applied_filters: cleanParams
      });
    } catch (error) {
      console.error("Mood recommendation error:", error);
      res.status(500).json({ error: "Failed to fetch mood-based recommendations" });
    }
  });

  // TMDB API endpoints
  app.get("/api/tmdb/trending", async (req, res) => {
    try {
      const trending = await tmdbService.getTrendingAll();
      res.json(trending);
    } catch (error) {
      console.error("TMDB trending error:", error);
      // Return fallback data with clear error indication
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  app.get("/api/tmdb/movies/popular", async (req, res) => {
    try {
      const movies = await tmdbService.getPopularMovies();
      res.json(movies);
    } catch (error) {
      console.error("TMDB popular movies error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  app.get("/api/tmdb/movies/top-rated", async (req, res) => {
    try {
      const movies = await tmdbService.getTopRatedMovies();
      res.json(movies);
    } catch (error) {
      console.error("TMDB top rated movies error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  app.get("/api/tmdb/tv/popular", async (req, res) => {
    try {
      const shows = await tmdbService.getPopularTVShows();
      res.json(shows);
    } catch (error) {
      console.error("TMDB popular TV shows error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  // Additional TV show endpoints (put before dynamic routes)
  app.get("/api/tmdb/tv/top-rated", async (req, res) => {
    try {
      const shows = await tmdbService.getTopRatedTVShows();
      res.json(shows);
    } catch (error) {
      console.error("TMDB top rated TV shows error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  app.get("/api/tmdb/tv/airing-today", async (req, res) => {
    try {
      const shows = await tmdbService.getAiringTodayTVShows();
      res.json(shows);
    } catch (error) {
      console.error("TMDB airing today TV shows error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  app.get("/api/tmdb/tv/on-the-air", async (req, res) => {
    try {
      const shows = await tmdbService.getOnTheAirTVShows();
      res.json(shows);
    } catch (error) {
      console.error("TMDB on the air TV shows error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  // Additional movie endpoints  
  app.get("/api/tmdb/movies/now-playing", async (req, res) => {
    try {
      const movies = await tmdbService.getNowPlayingMovies();
      res.json(movies);
    } catch (error) {
      console.error("TMDB now playing movies error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  app.get("/api/tmdb/movies/upcoming", async (req, res) => {
    try {
      const movies = await tmdbService.getUpcomingMovies();
      res.json(movies);
    } catch (error) {
      console.error("TMDB upcoming movies error:", error);
      res.json({
        results: [],
        total_pages: 0,
        total_results: 0,
        error: "TMDB API key invalid or missing. Please provide a valid API key."
      });
    }
  });

  // Search endpoints
  app.get("/api/tmdb/search/movies", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchMovies(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search movies error:", error);
      res.status(500).json({ error: "Failed to search movies" });
    }
  });

  app.get("/api/tmdb/search/tv", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchTVShows(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search TV shows error:", error);
      res.status(500).json({ error: "Failed to search TV shows" });
    }
  });

  app.get("/api/tmdb/search/people", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchPeople(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search people error:", error);
      res.status(500).json({ error: "Failed to search people" });
    }
  });

  app.get("/api/tmdb/search/companies", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchCompanies(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search companies error:", error);
      res.status(500).json({ error: "Failed to search companies" });
    }
  });

  app.get("/api/tmdb/search/collections", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchCollections(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search collections error:", error);
      res.status(500).json({ error: "Failed to search collections" });
    }
  });

  app.get("/api/tmdb/search/multi", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchMulti(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search multi error:", error);
      res.status(500).json({ error: "Failed to search" });
    }
  });

  // Person details endpoint
  app.get("/api/tmdb/person/:id", async (req, res) => {
    try {
      const personId = req.params.id;
      const person = await tmdbService.getPersonDetails(parseInt(personId));
      res.json(person);
    } catch (error) {
      console.error("TMDB person details error:", error);
      res.status(500).json({ error: "Failed to fetch person details" });
    }
  });

  // TV Show detail endpoints
  app.get("/api/tmdb/tv/:id", async (req, res) => {
    try {
      const tvId = req.params.id;
      const tvShow = await tmdbService.getTVDetails(parseInt(tvId));
      res.json(tvShow);
    } catch (error) {
      console.error("TMDB TV show details error:", error);
      res.status(500).json({ error: "Failed to fetch TV show details" });
    }
  });

  app.get("/api/tmdb/tv/:id/season/:seasonNumber", async (req, res) => {
    try {
      const { id, seasonNumber } = req.params;
      const season = await tmdbService.getTVSeasonDetails(id, parseInt(seasonNumber));
      res.json(season);
    } catch (error) {
      console.error("TMDB TV season details error:", error);
      res.status(500).json({ error: "Failed to fetch season details" });
    }
  });

  app.get("/api/tmdb/tv/:id/season/:seasonNumber/episode/:episodeNumber", async (req, res) => {
    try {
      const { id, seasonNumber, episodeNumber } = req.params;
      const episode = await tmdbService.getTVEpisodeDetails(id, parseInt(seasonNumber), parseInt(episodeNumber));
      res.json(episode);
    } catch (error) {
      console.error("TMDB TV episode details error:", error);
      res.status(500).json({ error: "Failed to fetch episode details" });
    }
  });

  // TV Show credits endpoint
  app.get("/api/tmdb/tv/:id/credits", async (req, res) => {
    try {
      const tvId = req.params.id;
      const credits = await tmdbService.getTVCredits(tvId);
      res.json(credits);
    } catch (error) {
      console.error("TMDB TV credits error:", error);
      res.status(500).json({ error: "Failed to fetch TV credits" });
    }
  });

  // TV Show videos endpoint
  app.get("/api/tmdb/tv/:id/videos", async (req, res) => {
    try {
      const tvId = req.params.id;
      const videos = await tmdbService.getTVVideos(tvId);
      res.json(videos);
    } catch (error) {
      console.error("TMDB TV videos error:", error);
      res.status(500).json({ error: "Failed to fetch TV videos" });
    }
  });

  // TV Show watch providers endpoint
  app.get("/api/tmdb/tv/:id/watch/providers", async (req, res) => {
    try {
      const tvId = req.params.id;
      const providers = await tmdbService.getTVWatchProviders(tvId.toString());
      res.json(providers);
    } catch (error) {
      console.error("TMDB TV watch providers error:", error);
      res.status(500).json({ error: "Failed to fetch TV watch providers" });
    }
  });

  // TV Show reviews endpoint
  app.get("/api/tmdb/tv/:id/reviews", async (req, res) => {
    try {
      const tvId = req.params.id;
      const page = parseInt(req.query.page as string) || 1;
      const reviews = await tmdbService.getTVReviews(tvId, page);
      console.log(`TV Reviews for ${tvId}, page ${page}:`, JSON.stringify({
        total_results: reviews.total_results,
        total_pages: reviews.total_pages,
        current_page: reviews.page,
        results_count: reviews.results?.length
      }));
      res.json(reviews);
    } catch (error) {
      console.error("TMDB TV reviews error:", error);
      res.status(500).json({ error: "Failed to fetch TV reviews" });
    }
  });

  // TV Show rating endpoints
  app.post("/api/tmdb/tv/:id/rating", async (req, res) => {
    try {
      const tvId = req.params.id;
      const { rating, sessionId } = req.body;
      
      if (!rating || rating < 0.5 || rating > 10) {
        return res.status(400).json({ error: "Rating must be between 0.5 and 10" });
      }
      
      const result = await tmdbService.rateTVShow(tvId, rating, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Error rating TV show on TMDB:', error);
      res.status(500).json({ error: "Failed to rate TV show on TMDB" });
    }
  });

  app.delete("/api/tmdb/tv/:id/rating", async (req, res) => {
    try {
      const tvId = req.params.id;
      const { sessionId } = req.body;
      
      const result = await tmdbService.deleteTVRating(tvId, sessionId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting TV show rating on TMDB:', error);
      res.status(500).json({ error: "Failed to delete TV show rating on TMDB" });
    }
  });

  // TV Show recommendations endpoint
  app.get("/api/tmdb/tv/:id/recommendations", async (req, res) => {
    try {
      const tvId = req.params.id;
      const recommendations = await tmdbService.getTVRecommendations(tvId);
      res.json(recommendations);
    } catch (error) {
      console.error("TMDB TV recommendations error:", error);
      res.status(500).json({ error: "Failed to fetch TV recommendations" });
    }
  });

  // TV Show similar endpoint
  app.get("/api/tmdb/tv/:id/similar", async (req, res) => {
    try {
      const tvId = req.params.id;
      const similar = await tmdbService.getSimilarTVShows(tvId);
      res.json(similar);
    } catch (error) {
      console.error("TMDB TV similar error:", error);
      res.status(500).json({ error: "Failed to fetch similar TV shows" });
    }
  });

  // Company details endpoint
  app.get("/api/tmdb/company/:id", async (req, res) => {
    try {
      const companyId = req.params.id;
      const company = await tmdbService.getCompanyDetails(companyId);
      res.json(company);
    } catch (error) {
      console.error("TMDB company details error:", error);
      res.status(500).json({ error: "Failed to fetch company details" });
    }
  });

  // Collection details endpoint
  app.get("/api/tmdb/collection/:id", async (req, res) => {
    try {
      const collectionId = req.params.id;
      const collection = await tmdbService.getCollectionDetails(collectionId);
      res.json(collection);
    } catch (error) {
      console.error("TMDB collection details error:", error);
      res.status(500).json({ error: "Failed to fetch collection details" });
    }
  });

  // Movie credits endpoint
  app.get("/api/tmdb/movie/:id/credits", async (req, res) => {
    try {
      const movieId = req.params.id;
      const credits = await tmdbService.getMovieCredits(movieId);
      res.json(credits);
    } catch (error) {
      console.error("TMDB movie credits error:", error);
      res.status(500).json({ error: "Failed to fetch movie credits" });
    }
  });

  // Movie videos endpoint
  app.get("/api/tmdb/movie/:id/videos", async (req, res) => {
    try {
      const movieId = req.params.id;
      const videos = await tmdbService.getMovieVideos(movieId);
      res.json(videos);
    } catch (error) {
      console.error("TMDB movie videos error:", error);
      res.status(500).json({ error: "Failed to fetch movie videos" });
    }
  });

  // Movie images endpoint
  app.get("/api/tmdb/movie/:id/images", async (req, res) => {
    try {
      const movieId = req.params.id;
      const images = await tmdbService.getMovieImages(movieId.toString());
      res.json(images);
    } catch (error) {
      console.error("TMDB movie images error:", error);
      res.status(500).json({ error: "Failed to fetch movie images" });
    }
  });

  // Movie keywords endpoint  
  app.get("/api/tmdb/movie/:id/keywords", async (req, res) => {
    try {
      const movieId = req.params.id;
      const keywords = await tmdbService.getMovieKeywords(movieId.toString());
      res.json(keywords);
    } catch (error) {
      console.error("TMDB movie keywords error:", error);
      res.status(500).json({ error: "Failed to fetch movie keywords" });
    }
  });


  // Movie watch providers endpoint
  app.get("/api/tmdb/movie/:id/watch/providers", async (req, res) => {
    try {
      const movieId = req.params.id;
      const providers = await tmdbService.getMovieWatchProviders(movieId.toString());
      res.json(providers);
    } catch (error) {
      console.error("TMDB movie watch providers error:", error);
      res.status(500).json({ error: "Failed to fetch movie watch providers" });
    }
  });

  // Movie recommendations endpoint
  app.get("/api/tmdb/movie/:id/recommendations", async (req, res) => {
    try {
      const movieId = req.params.id;
      const recommendations = await tmdbService.getMovieRecommendations(movieId);
      res.json(recommendations);
    } catch (error) {
      console.error("TMDB movie recommendations error:", error);
      res.status(500).json({ error: "Failed to fetch movie recommendations" });
    }
  });

  // Movie similar endpoint
  app.get("/api/tmdb/movie/:id/similar", async (req, res) => {
    try {
      const movieId = req.params.id;
      const similar = await tmdbService.getSimilarMovies(movieId);
      res.json(similar);
    } catch (error) {
      console.error("TMDB movie similar error:", error);
      res.status(500).json({ error: "Failed to fetch similar movies" });
    }
  });

  // Search companies endpoint
  app.get("/api/tmdb/search/companies", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchCompanies(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search companies error:", error);
      res.status(500).json({ error: "Failed to search companies" });
    }
  });

  // Search collections endpoint
  app.get("/api/tmdb/search/collections", async (req, res) => {
    try {
      const { query, page } = req.query;
      if (!query) {
        return res.status(400).json({ error: "Query parameter is required" });
      }
      const results = await tmdbService.searchCollections(query as string, page ? parseInt(page as string) : 1);
      res.json(results);
    } catch (error) {
      console.error("TMDB search collections error:", error);
      res.status(500).json({ error: "Failed to search collections" });
    }
  });

  // Discover endpoints
  app.get("/api/tmdb/discover/movies", async (req, res) => {
    try {
      const params = { ...req.query };
      const results = await tmdbService.discoverMovies(params);
      res.json(results);
    } catch (error) {
      console.error("TMDB discover movies error:", error);
      res.status(500).json({ error: "Failed to discover movies" });
    }
  });

  app.get("/api/tmdb/discover/tv", async (req, res) => {
    try {
      const params = { ...req.query };
      const results = await tmdbService.discoverTVShows(params);
      res.json(results);
    } catch (error) {
      console.error("TMDB discover TV shows error:", error);
      res.status(500).json({ error: "Failed to discover TV shows" });
    }
  });

  // Genre endpoints
  app.get("/api/tmdb/genres/movies", async (req, res) => {
    try {
      const genres = await tmdbService.getMovieGenres();
      res.json(genres);
    } catch (error) {
      console.error("TMDB movie genres error:", error);
      res.status(500).json({ error: "Failed to fetch movie genres" });
    }
  });

  app.get("/api/tmdb/genres/tv", async (req, res) => {
    try {
      const genres = await tmdbService.getTVGenres();
      res.json(genres);
    } catch (error) {
      console.error("TMDB TV genres error:", error);
      res.status(500).json({ error: "Failed to fetch TV genres" });
    }
  });

  // Configuration endpoint
  app.get("/api/tmdb/configuration", async (req, res) => {
    try {
      const config = await tmdbService.getConfiguration();
      res.json(config);
    } catch (error) {
      console.error("TMDB configuration error:", error);
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  // Account endpoints (these require session ID in production)
  app.get("/api/tmdb/account/:accountId", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const account = await tmdbService.getAccountDetails(accountId);
      res.json(account);
    } catch (error) {
      console.error("TMDB account details error:", error);
      res.status(500).json({ error: "Failed to fetch account details" });
    }
  });

  // Account watchlist endpoints
  app.get("/api/tmdb/account/:accountId/watchlist/movies", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { language = 'en-US', page = 1, sort_by = 'created_at.asc' } = req.query;
      const watchlist = await tmdbService.getAccountWatchlistMovies(accountId, {
        language: language as string,
        page: parseInt(page as string),
        sort_by: sort_by as string
      });
      res.json(watchlist);
    } catch (error) {
      console.error("TMDB account watchlist movies error:", error);
      res.status(500).json({ error: "Failed to fetch account watchlist movies" });
    }
  });

  app.get("/api/tmdb/account/:accountId/watchlist/tv", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { language = 'en-US', page = 1, sort_by = 'created_at.asc' } = req.query;
      const watchlist = await tmdbService.getAccountWatchlistTV(accountId, {
        language: language as string,
        page: parseInt(page as string),
        sort_by: sort_by as string
      });
      res.json(watchlist);
    } catch (error) {
      console.error("TMDB account watchlist TV error:", error);
      res.status(500).json({ error: "Failed to fetch account watchlist TV shows" });
    }
  });

  app.post("/api/tmdb/account/:accountId/watchlist", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { media_type, media_id, watchlist } = req.body;
      const result = await tmdbService.addToAccountWatchlist(accountId, {
        media_type,
        media_id,
        watchlist
      });
      res.json(result);
    } catch (error) {
      console.error("TMDB account add to watchlist error:", error);
      res.status(500).json({ error: "Failed to add to account watchlist" });
    }
  });

  // Account favorites endpoints
  app.get("/api/tmdb/account/:accountId/favorite/movies", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { language = 'en-US', page = 1, sort_by = 'created_at.asc' } = req.query;
      const favorites = await tmdbService.getAccountFavoriteMovies(accountId, {
        language: language as string,
        page: parseInt(page as string),
        sort_by: sort_by as string
      });
      res.json(favorites);
    } catch (error) {
      console.error("TMDB account favorite movies error:", error);
      res.status(500).json({ error: "Failed to fetch account favorite movies" });
    }
  });

  app.get("/api/tmdb/account/:accountId/favorite/tv", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { language = 'en-US', page = 1, sort_by = 'created_at.asc' } = req.query;
      const favorites = await tmdbService.getAccountFavoriteTV(accountId, {
        language: language as string,
        page: parseInt(page as string),
        sort_by: sort_by as string
      });
      res.json(favorites);
    } catch (error) {
      console.error("TMDB account favorite TV error:", error);
      res.status(500).json({ error: "Failed to fetch account favorite TV shows" });
    }
  });

  app.post("/api/tmdb/account/:accountId/favorite", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { media_type, media_id, favorite } = req.body;
      const result = await tmdbService.addToAccountFavorites(accountId, {
        media_type,
        media_id,
        favorite
      });
      res.json(result);
    } catch (error) {
      console.error("TMDB account add to favorites error:", error);
      res.status(500).json({ error: "Failed to add to account favorites" });
    }
  });

  // Account rated movies/TV endpoints
  app.get("/api/tmdb/account/:accountId/rated/movies", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { language = 'en-US', page = 1, sort_by = 'created_at.asc' } = req.query;
      const rated = await tmdbService.getAccountRatedMovies(accountId, {
        language: language as string,
        page: parseInt(page as string),
        sort_by: sort_by as string
      });
      res.json(rated);
    } catch (error) {
      console.error("TMDB account rated movies error:", error);
      res.status(500).json({ error: "Failed to fetch account rated movies" });
    }
  });

  app.get("/api/tmdb/account/:accountId/rated/tv", async (req, res) => {
    try {
      const { accountId } = req.params;
      const { language = 'en-US', page = 1, sort_by = 'created_at.asc' } = req.query;
      const rated = await tmdbService.getAccountRatedTV(accountId, {
        language: language as string,
        page: parseInt(page as string),
        sort_by: sort_by as string
      });
      res.json(rated);
    } catch (error) {
      console.error("TMDB account rated TV error:", error);
      res.status(500).json({ error: "Failed to fetch account rated TV shows" });
    }
  });

  // Rating endpoints for movies and TV shows  
  app.post("/api/tmdb/movie/:movieId/rating", async (req, res) => {
    try {
      const { movieId } = req.params;
      const { rating, sessionId } = req.body;
      const result = await tmdbService.rateMovie(movieId, rating, sessionId);
      res.json(result);
    } catch (error) {
      console.error("TMDB rate movie error:", error);
      res.status(500).json({ error: "Failed to rate movie" });
    }
  });

  app.post("/api/tmdb/tv/:tvId/rating", async (req, res) => {
    try {
      const { tvId } = req.params;
      const { rating, sessionId } = req.body;
      const result = await tmdbService.rateTVShow(tvId, rating, sessionId);
      res.json(result);
    } catch (error) {
      console.error("TMDB rate TV show error:", error);
      res.status(500).json({ error: "Failed to rate TV show" });
    }
  });

  app.delete("/api/tmdb/movie/:movieId/rating", async (req, res) => {
    try {
      const { movieId } = req.params;
      const { sessionId } = req.body;
      const result = await tmdbService.deleteMovieRating(movieId, sessionId);
      res.json(result);
    } catch (error) {
      console.error("TMDB delete movie rating error:", error);
      res.status(500).json({ error: "Failed to delete movie rating" });
    }
  });

  app.delete("/api/tmdb/tv/:tvId/rating", async (req, res) => {
    try {
      const { tvId } = req.params;
      const { sessionId } = req.body;
      const result = await tmdbService.deleteTVRating(tvId, sessionId);
      res.json(result);
    } catch (error) {
      console.error("TMDB delete TV rating error:", error);
      res.status(500).json({ error: "Failed to delete TV rating" });
    }
  });

  // Local user ratings and reviews endpoints
  app.get("/api/ratings", async (req, res) => {
    try {
      const { tmdbId, mediaType, userId } = req.query;
      let ratings;
      
      if (tmdbId && mediaType) {
        ratings = await storage.getRatingsByMedia(parseInt(tmdbId as string), mediaType as string);
      } else if (userId) {
        ratings = await storage.getUserRatings(userId as string);
      } else {
        ratings = await storage.getAllRatings();
      }
      
      res.json(ratings);
    } catch (error) {
      console.error("Get ratings error:", error);
      res.status(500).json({ error: "Failed to fetch ratings" });
    }
  });

  app.post("/api/ratings", async (req, res) => {
    try {
      const ratingData = insertUserRatingSchema.parse(req.body);
      const rating = await storage.createUserRating(ratingData);
      res.status(201).json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid rating data", details: error.errors });
      }
      console.error("Create rating error:", error);
      res.status(500).json({ error: "Failed to create rating" });
    }
  });

  app.put("/api/ratings/:ratingId", async (req, res) => {
    try {
      const { ratingId } = req.params;
      const updateData = insertUserRatingSchema.partial().parse(req.body);
      const rating = await storage.updateUserRating(ratingId, updateData);
      if (!rating) {
        return res.status(404).json({ error: "Rating not found" });
      }
      res.json(rating);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid rating data", details: error.errors });
      }
      console.error("Update rating error:", error);
      res.status(500).json({ error: "Failed to update rating" });
    }
  });

  app.delete("/api/ratings/:ratingId", async (req, res) => {
    try {
      const { ratingId } = req.params;
      const success = await storage.deleteUserRating(ratingId);
      if (!success) {
        return res.status(404).json({ error: "Rating not found" });
      }
      res.json({ message: "Rating deleted successfully" });
    } catch (error) {
      console.error("Delete rating error:", error);
      res.status(500).json({ error: "Failed to delete rating" });
    }
  });

  app.get("/api/tmdb/account/:accountId/favorite/movies", async (req, res) => {
    try {
      const accountId = req.params.accountId;
      const { page } = req.query;
      const favorites = await tmdbService.getAccountFavoriteMovies(accountId, { page: page ? parseInt(page as string) : 1 });
      res.json(favorites);
    } catch (error) {
      console.error("TMDB account favorite movies error:", error);
      res.status(500).json({ error: "Failed to fetch favorite movies" });
    }
  });

  app.get("/api/tmdb/account/:accountId/favorite/tv", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { page } = req.query;
      const favorites = await tmdbService.getAccountFavoriteTVShows(accountId, page ? parseInt(page as string) : 1);
      res.json(favorites);
    } catch (error) {
      console.error("TMDB account favorite TV shows error:", error);
      res.status(500).json({ error: "Failed to fetch favorite TV shows" });
    }
  });

  app.get("/api/tmdb/account/:accountId/watchlist/movies", async (req, res) => {
    try {
      const accountId = req.params.accountId;
      const { page } = req.query;
      const watchlist = await tmdbService.getAccountWatchlistMovies(accountId, { page: page ? parseInt(page as string) : 1 });
      res.json(watchlist);
    } catch (error) {
      console.error("TMDB account watchlist movies error:", error);
      res.status(500).json({ error: "Failed to fetch watchlist movies" });
    }
  });

  app.get("/api/tmdb/account/:accountId/watchlist/tv", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { page } = req.query;
      const watchlist = await tmdbService.getAccountWatchlistTVShows(accountId, page ? parseInt(page as string) : 1);
      res.json(watchlist);
    } catch (error) {
      console.error("TMDB account watchlist TV shows error:", error);
      res.status(500).json({ error: "Failed to fetch watchlist TV shows" });
    }
  });

  app.get("/api/tmdb/account/:accountId/rated/movies", async (req, res) => {
    try {
      const accountId = req.params.accountId;
      const { page } = req.query;
      const rated = await tmdbService.getAccountRatedMovies(accountId, { page: page ? parseInt(page as string) : 1 });
      res.json(rated);
    } catch (error) {
      console.error("TMDB account rated movies error:", error);
      res.status(500).json({ error: "Failed to fetch rated movies" });
    }
  });

  app.get("/api/tmdb/account/:accountId/rated/tv", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { page } = req.query;
      const rated = await tmdbService.getAccountRatedTVShows(accountId, page ? parseInt(page as string) : 1);
      res.json(rated);
    } catch (error) {
      console.error("TMDB account rated TV shows error:", error);
      res.status(500).json({ error: "Failed to fetch rated TV shows" });
    }
  });

  app.get("/api/tmdb/account/:accountId/lists", async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      const { page } = req.query;
      const lists = await tmdbService.getAccountLists(accountId.toString(), page ? parseInt(page as string) : 1);
      res.json(lists);
    } catch (error) {
      console.error("TMDB account lists error:", error);
      res.status(500).json({ error: "Failed to fetch account lists" });
    }
  });

  // Authentication endpoints
  app.get("/api/tmdb/authentication/guest_session/new", async (req, res) => {
    try {
      const session = await tmdbService.getGuestSession();
      res.json(session);
    } catch (error) {
      console.error("TMDB guest session error:", error);
      res.status(500).json({ error: "Failed to create guest session" });
    }
  });

  app.get("/api/tmdb/authentication/token/new", async (req, res) => {
    try {
      const token = await tmdbService.getRequestToken();
      res.json(token);
    } catch (error) {
      console.error("TMDB request token error:", error);
      res.status(500).json({ error: "Failed to get request token" });
    }
  });

  // Certification endpoints
  app.get("/api/tmdb/certification/movie/list", async (req, res) => {
    try {
      const certifications = await tmdbService.getMovieCertifications();
      res.json(certifications);
    } catch (error) {
      console.error("TMDB movie certifications error:", error);
      res.status(500).json({ error: "Failed to fetch movie certifications" });
    }
  });

  app.get("/api/tmdb/certification/tv/list", async (req, res) => {
    try {
      const certifications = await tmdbService.getTVCertifications();
      res.json(certifications);
    } catch (error) {
      console.error("TMDB TV certifications error:", error);
      res.status(500).json({ error: "Failed to fetch TV certifications" });
    }
  });

  // Changes endpoints
  app.get("/api/tmdb/movie/changes", async (req, res) => {
    try {
      const { page } = req.query;
      const changes = await tmdbService.getMovieChanges(page ? parseInt(page as string) : 1);
      res.json(changes);
    } catch (error) {
      console.error("TMDB movie changes error:", error);
      res.status(500).json({ error: "Failed to fetch movie changes" });
    }
  });

  app.get("/api/tmdb/person/changes", async (req, res) => {
    try {
      const { page } = req.query;
      const changes = await tmdbService.getPersonChanges(page ? parseInt(page as string) : 1);
      res.json(changes);
    } catch (error) {
      console.error("TMDB person changes error:", error);
      res.status(500).json({ error: "Failed to fetch person changes" });
    }
  });

  app.get("/api/tmdb/tv/changes", async (req, res) => {
    try {
      const { page } = req.query;
      const changes = await tmdbService.getTVChanges(page ? parseInt(page as string) : 1);
      res.json(changes);
    } catch (error) {
      console.error("TMDB TV changes error:", error);
      res.status(500).json({ error: "Failed to fetch TV changes" });
    }
  });

  // Collection endpoints
  app.get("/api/tmdb/collection/:id/images", async (req, res) => {
    try {
      const collectionId = req.params.id;
      const images = await tmdbService.getCollectionImages(collectionId);
      res.json(images);
    } catch (error) {
      console.error("TMDB collection images error:", error);
      res.status(500).json({ error: "Failed to fetch collection images" });
    }
  });

  app.get("/api/tmdb/collection/:id/translations", async (req, res) => {
    try {
      const collectionId = req.params.id;
      const translations = await tmdbService.getCollectionTranslations(collectionId);
      res.json(translations);
    } catch (error) {
      console.error("TMDB collection translations error:", error);
      res.status(500).json({ error: "Failed to fetch collection translations" });
    }
  });

  // Find endpoint
  app.get("/api/tmdb/find/:externalId", async (req, res) => {
    try {
      const { externalId } = req.params;
      const { external_source } = req.query;
      if (!external_source) {
        return res.status(400).json({ error: "external_source parameter is required" });
      }
      const results = await tmdbService.findByExternalId(externalId, external_source as string);
      res.json(results);
    } catch (error) {
      console.error("TMDB find error:", error);
      res.status(500).json({ error: "Failed to find by external ID" });
    }
  });

  // Movie/TV details endpoints have been moved earlier to handle enhanced lookup

  // Helper function to shuffle array for variety
  function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // AI chat endpoint using Gemini API directly for movie recommendations
  app.post("/api/ai/chat", aiLimiter, async (req, res) => {
    try {
      const { message } = req.body;
      
      if (!message || !message.trim()) {
        return res.status(400).json({ error: "message is required" });
      }

      console.log('[AI Chat] Received message:', message);

      const lowerMessage = message.toLowerCase();
      let chatResult;
      let usedFallback = false;

      // Special handling for UPCOMING movies - use TMDB upcoming endpoint
      if (/\b(upcoming|coming soon|not released|not yet released|future|unreleased|will be released)\b/i.test(message)) {
        console.log('[AI Chat] Detected upcoming movies query');
        try {
          const upcomingData = await tmdbService.getUpcomingMovies();
          const today = new Date();
          
          // Filter for movies that haven't been released yet
          const upcomingMovies = (upcomingData.results || [])
            .filter(movie => {
              if (!movie.release_date) return false;
              const releaseDate = new Date(movie.release_date);
              return releaseDate > today;
            })
            .slice(0, 10)
            .map(m => ({ ...m, media_type: 'movie' }));
          
          const responseText = `Here are the upcoming movies that haven't been released yet:\n\n${upcomingMovies.map(movie => 
            `🎬 **${movie.title}** (Releasing ${movie.release_date ? new Date(movie.release_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Soon'}) - ${movie.overview ? movie.overview.substring(0, 120) + '...' : 'An exciting upcoming release!'}`
          ).join('\n\n')}`;
          
          chatResult = {
            response: responseText,
            movies: upcomingMovies,
            suggestions: ['More upcoming movies', 'Latest releases', 'Popular movies'],
            source: 'tmdb-upcoming'
          };
        } catch (error) {
          console.error('[AI Chat] TMDB upcoming error:', error);
          chatResult = await geminiChatService.getMovieRecommendations(message, ['movies']);
        }
      }
      // Special handling for LATEST/NEW movies - use TMDB discover with date filtering
      else if (/\b(latest|newest|new|recent|2025|current|now playing|this year|just released|this month)\b/i.test(message)) {
        console.log('[AI Chat] Detected latest movies query');
        try {
          const currentDate = new Date();
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          
          const fromDate = threeMonthsAgo.toISOString().split('T')[0];
          const toDate = currentDate.toISOString().split('T')[0];
          
          const discoverParams: any = {
            'primary_release_date.gte': fromDate,
            'primary_release_date.lte': toDate,
            'sort_by': 'primary_release_date.desc',
            'vote_count.gte': 10
          };
          
          const latestMoviesData = await tmdbService.discoverMovies(discoverParams);
          const latestMovies = (latestMoviesData.results || [])
            .slice(0, 10)
            .map(m => ({ ...m, media_type: 'movie' }));
          
          const currentMonth = currentDate.toLocaleString('en-US', { month: 'long' });
          const currentYear = currentDate.getFullYear();
          
          const responseText = `Here are the latest movies from ${currentMonth} ${currentYear}:\n\n${latestMovies.map(movie => {
            const releaseDate = movie.release_date ? new Date(movie.release_date) : null;
            const dateStr = releaseDate ? releaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';
            return `🎬 **${movie.title}** (${dateStr}) - ${movie.overview ? movie.overview.substring(0, 120) + '...' : 'A must-watch new release!'}`;
          }).join('\n\n')}`;
          
          chatResult = {
            response: responseText,
            movies: latestMovies,
            suggestions: ['More new movies', 'Upcoming releases', 'Popular movies'],
            source: 'tmdb-latest'
          };
        } catch (error) {
          console.error('[AI Chat] TMDB latest error:', error);
          chatResult = await geminiChatService.getMovieRecommendations(message, ['movies']);
        }
      }
      // Default: Use Gemini as main engine with advanced search fallback
      else {
        let mediaTypes = ['movies'];
        
        if (lowerMessage.includes('tv show') || lowerMessage.includes('series') || lowerMessage.includes('tv series')) {
          mediaTypes = ['tv'];
        } else if (lowerMessage.includes('movie') || lowerMessage.includes('film')) {
          mediaTypes = ['movies'];
        } else {
          mediaTypes = ['both'];
        }

        try {
          // Try Gemini first
          console.log('[AI Chat] Using Gemini as main engine');
          chatResult = await geminiChatService.getMovieRecommendations(message, mediaTypes);
          
          // Check if Gemini returned valid results
          const validGeminiMovies = (chatResult.movies || []).filter((movie: any) => {
            return movie.id && (movie.title || movie.name) && movie.poster_path && movie.overview;
          });
          
          // If Gemini didn't return enough valid results, use advanced search fallback
          if (validGeminiMovies.length < 3) {
            console.log(`[AI Chat] Gemini returned only ${validGeminiMovies.length} valid movies, using advanced search fallback`);
            usedFallback = true;
            
            // Call the advanced search logic
            const queryResult = await intelligentQueryService.processQuery(message);
            
            // Search TMDB with intelligent query parsing
            const cleanedQuery = message
              .toLowerCase()
              .split(/\s+/)
              .filter((word: string) => !['movie', 'movies', 'film', 'films', 'show', 'shows', 'like'].includes(word))
              .join(' ')
              .trim() || message;
            
            const searchResults = await tmdbService.searchMulti(cleanedQuery, 1);
            let fallbackMovies = (searchResults.results || [])
              // Filter to only movies and TV shows with complete data
              .filter((item: any) => {
                if (!item.id) return false;
                if (!item.media_type || (item.media_type !== 'movie' && item.media_type !== 'tv')) return false;
                if (!item.title && !item.name) return false;
                if (!item.poster_path) return false;
                if (!item.overview || item.overview.trim().length === 0) return false;
                return true;
              });
            
            // If semantic search has high confidence results, add them
            if (queryResult.parsed.intent.confidence > 0.7 && queryResult.semanticResults?.length > 0) {
              console.log('[AI Chat Fallback] Using semantic search results');
              for (const match of queryResult.semanticResults.slice(0, 5)) {
                try {
                  // Semantic results are always movies from the database
                  const movieDetails = await tmdbService.getMovieDetails(match.tmdbId);
                  // Only add if it has required fields
                  if (movieDetails.id && movieDetails.title && movieDetails.poster_path && movieDetails.overview) {
                    fallbackMovies.push({
                      ...movieDetails,
                      media_type: 'movie',
                      semantic_similarity: match.similarity
                    });
                  }
                } catch (error) {
                  console.error(`Error fetching semantic movie ${match.tmdbId}:`, error);
                }
              }
            }
            
            // Deduplicate
            const seenIds = new Set();
            fallbackMovies = fallbackMovies.filter((m: any) => {
              if (seenIds.has(m.id)) return false;
              seenIds.add(m.id);
              return true;
            });
            
            console.log(`[AI Chat Fallback] Found ${fallbackMovies.length} valid results after filtering`);
            
            chatResult = {
              response: chatResult.response || `Here are some great recommendations based on your search:\n\n${fallbackMovies.slice(0, 5).map(m => 
                `🎬 **${m.title || m.name}** - ${m.overview ? m.overview.substring(0, 120) + '...' : 'A great movie!'}`
              ).join('\n\n')}`,
              movies: fallbackMovies,
              suggestions: chatResult.suggestions || ['Action movies', 'Comedies', 'Thrillers'],
              source: 'advanced-search-fallback'
            };
          }
        } catch (geminiError) {
          console.error('[AI Chat] Gemini error, using advanced search fallback:', geminiError);
          usedFallback = true;
          
          // Complete fallback to advanced search
          const cleanedQuery = message
            .toLowerCase()
            .split(/\s+/)
            .filter((word: string) => !['movie', 'movies', 'film', 'films', 'show', 'shows'].includes(word))
            .join(' ')
            .trim() || message;
          
          const searchResults = await tmdbService.searchMulti(cleanedQuery, 1);
          const fallbackMovies = (searchResults.results || [])
            // Filter to only movies and TV shows with complete data
            .filter((item: any) => {
              if (!item.id) return false;
              if (!item.media_type || (item.media_type !== 'movie' && item.media_type !== 'tv')) return false;
              if (!item.title && !item.name) return false;
              if (!item.poster_path) return false;
              if (!item.overview || item.overview.trim().length === 0) return false;
              return true;
            });
          
          console.log(`[AI Chat Error Fallback] Found ${fallbackMovies.length} valid results after filtering`);
          
          chatResult = {
            response: `Here are some recommendations based on your search:\n\n${fallbackMovies.slice(0, 5).map(m => 
              `🎬 **${m.title || m.name}** - ${m.overview ? m.overview.substring(0, 120) + '...' : 'A great movie!'}`
            ).join('\n\n')}`,
            movies: fallbackMovies,
            suggestions: ['Action movies', 'Comedies', 'Thrillers'],
            source: 'advanced-search-fallback'
          };
        }
      }
      
      console.log('[AI Chat] Result:', {
        source: chatResult.source,
        movieCount: chatResult.movies.length,
        responseLength: chatResult.response.length,
        usedFallback
      });

      // Filter out empty or incomplete movie results
      const validMovies = (chatResult.movies || []).filter((movie: any) => {
        if (!movie.id) return false;
        if (!movie.title && !movie.name) return false;
        if (!movie.poster_path) return false;
        if (!movie.overview || movie.overview.trim().length === 0) return false;
        if (typeof movie.vote_average !== 'number') {
          movie.vote_average = 7.0;
        }
        if (movie.adult === true) return false;
        return true;
      });

      console.log(`[AI Chat] Filtered to ${validMovies.length} valid movies`);

      // Generate structured recommendations for display
      const recommendations = validMovies.slice(0, 5).map((movie: any) => ({
        title: movie.title || movie.name,
        rating: Number((movie.vote_average || 7.0).toFixed(1)),
        reason: movie.overview ? movie.overview.substring(0, 150) + '...' : 'A great recommendation for you!'
      }));

      res.json({
        response: chatResult.response,
        recommendations,
        movies: validMovies,
        suggestions: chatResult.suggestions || [],
        source: chatResult.source,
        conversational: true
      });
    } catch (error) {
      console.error("[AI Chat] Error:", error);
      
      res.json({
        response: "I'm having trouble processing your request right now. Try asking me for movie recommendations like 'Show me action movies' or 'I want romantic comedies'!",
        recommendations: [],
        movies: [],
        suggestions: ["Action movies", "Romantic comedies", "Thriller films"],
        source: "error-fallback"
      });
    }
  });

  // Advanced recommendation endpoint with local database + TMDB API
  app.post('/api/recommendations/advanced', aiLimiter, async (req, res) => {
    try {
      const { query, preferences, userId } = req.body;
      
      if (!query?.trim()) {
        return res.status(400).json({ error: 'Query is required' });
      }

      console.log('Advanced search request:', { query, preferences });
      
      // Step 0: USE-based intent detection and query understanding
      console.log('[USE Intent] Analyzing query with Universal Sentence Encoder...');
      let extractedMovieName: string | null = null;
      let isSimilarityQuery = false;
      let searchQuery = query;
      
      try {
        // Patterns that indicate similarity search
        const similarityPatterns = [
          'movies like',
          'films like',
          'similar to',
          'movies similar to',
          'films similar to',
          'same as',
          'like the movie',
          'like the film'
        ];
        
        // Use USE to detect if this is a similarity query
        const queryLower = query.toLowerCase().trim();
        for (const pattern of similarityPatterns) {
          if (queryLower.includes(pattern)) {
            isSimilarityQuery = true;
            // Extract what comes after the pattern
            const patternIndex = queryLower.indexOf(pattern);
            const afterPattern = query.substring(patternIndex + pattern.length).trim();
            
            if (afterPattern) {
              extractedMovieName = afterPattern;
              searchQuery = extractedMovieName;
              console.log(`[USE Intent] Detected similarity query: "${query}" -> looking for movies like "${extractedMovieName}"`);
              break;
            }
          }
        }
        
        if (!isSimilarityQuery) {
          console.log(`[USE Intent] Regular search query: "${query}"`);
        }
      } catch (useIntentError) {
        console.warn('[USE Intent] Error in intent detection:', useIntentError);
      }
      
      console.log('[Database Search] Searching local TMDB database with 908K movies...');

      // Genre name to TMDB ID mapping
      const genreNameToId: Record<string, number> = {
        'action': 28, 'adventure': 12, 'animation': 16, 'comedy': 35,
        'crime': 80, 'documentary': 99, 'drama': 18, 'family': 10751,
        'fantasy': 14, 'history': 36, 'horror': 27, 'music': 10402,
        'mystery': 9648, 'romance': 10749, 'sci-fi': 878, 'science fiction': 878,
        'thriller': 53, 'war': 10752, 'western': 37
      };

      // TMDB ID to genre name mapping (for display)
      const genreIdToName: Record<number, string> = {
        28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
        80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
        14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
        9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
        53: 'Thriller', 10752: 'War', 37: 'Western'
      };

      // Step 1: Search local database first (908,000 movies)
      let dbResults: any[] = [];
      try {
        // Build database query with filters
        const conditions = [];
        
        // Text search on title, overview, cast, director, genres
        // Use searchQuery (which might be the extracted movie name for similarity queries)
        const searchTerm = `%${searchQuery}%`;
        conditions.push(
          or(
            ilike(tmdbTrainingData.title, searchTerm),
            ilike(tmdbTrainingData.overview, searchTerm),
            ilike(tmdbTrainingData.cast, searchTerm),
            ilike(tmdbTrainingData.director, searchTerm),
            ilike(tmdbTrainingData.genres, searchTerm)
          )
        );
        
        // Filter by year range if specified
        if (preferences?.releaseYearRange) {
          const [minYear, maxYear] = preferences.releaseYearRange;
          // Only apply if not default range
          if (minYear !== 1900 || maxYear !== 2025) {
            // Use NULLIF to handle empty strings, and only filter non-null dates
            conditions.push(
              sql`(
                ${tmdbTrainingData.releaseDate} IS NOT NULL 
                AND ${tmdbTrainingData.releaseDate} != ''
                AND EXTRACT(YEAR FROM ${tmdbTrainingData.releaseDate}::date) >= ${minYear}
                AND EXTRACT(YEAR FROM ${tmdbTrainingData.releaseDate}::date) <= ${maxYear}
              )`
            );
          }
        }
        
        // Filter by rating range if specified
        if (preferences?.ratingRange) {
          const [minRating, maxRating] = preferences.ratingRange;
          // Only apply if not default range
          if (minRating !== 0 || maxRating !== 10) {
            conditions.push(
              and(
                gte(tmdbTrainingData.voteAverage, minRating),
                lte(tmdbTrainingData.voteAverage, maxRating)
              )
            );
          }
        }
        
        // Filter by genres if specified
        if (preferences?.genres?.length > 0) {
          const genreConditions = preferences.genres.map((genre: string) => 
            ilike(tmdbTrainingData.genres, `%${genre}%`)
          );
          conditions.push(or(...genreConditions));
        }
        
        // Filter by runtime if specified
        if (preferences?.runtime && preferences.runtime !== 'any') {
          const runtimeMap: Record<string, [number, number]> = {
            'short': [0, 90],      // Short films: under 90 minutes
            'medium': [90, 150],   // Standard: 90-150 minutes
            'long': [150, 999]     // Long: over 150 minutes
          };
          
          const runtimeRange = runtimeMap[preferences.runtime];
          if (runtimeRange) {
            conditions.push(
              and(
                gte(tmdbTrainingData.runtime, runtimeRange[0]),
                lte(tmdbTrainingData.runtime, runtimeRange[1])
              )
            );
          }
        }
        
        // Filter by languages if specified
        if (preferences?.languages?.length > 0) {
          // Only apply if not empty array
          const langConditions = preferences.languages.map((lang: string) => 
            ilike(tmdbTrainingData.spokenLanguages, `%${lang}%`)
          );
          conditions.push(or(...langConditions));
        }
        
        // Execute database query with smart ordering to prioritize exact matches
        const dbQuery = db
          .select({
            id: tmdbTrainingData.id,
            title: tmdbTrainingData.title,
            overview: tmdbTrainingData.overview,
            voteAverage: tmdbTrainingData.voteAverage,
            voteCount: tmdbTrainingData.voteCount,
            releaseDate: tmdbTrainingData.releaseDate,
            popularity: tmdbTrainingData.popularity,
            posterPath: tmdbTrainingData.posterPath,
            genres: tmdbTrainingData.genres,
            director: tmdbTrainingData.director,
            cast: tmdbTrainingData.cast
          })
          .from(tmdbTrainingData)
          .where(and(...conditions))
          .orderBy(
            // Prioritize: 1) Exact title match, 2) Title starts with query, 3) Title contains query, 4) Popularity
            sql`CASE 
              WHEN LOWER(${tmdbTrainingData.title}) = LOWER(${searchQuery}) THEN 1
              WHEN LOWER(${tmdbTrainingData.title}) LIKE LOWER(${searchQuery} || '%') THEN 2
              WHEN LOWER(${tmdbTrainingData.title}) LIKE LOWER('% ' || ${searchQuery} || '%') THEN 3
              WHEN LOWER(${tmdbTrainingData.title}) LIKE LOWER('%' || ${searchQuery} || ':%') THEN 4
              ELSE 5
            END`,
            sql`${tmdbTrainingData.popularity} DESC NULLS LAST`
          )
          .limit(50); // Get top 50 from database
        
        dbResults = await dbQuery;
        console.log(`[Database Search] Found ${dbResults.length} movies in local database`);
      } catch (dbError) {
        console.error('[Database Search] Error searching local database:', dbError);
        // Continue with API search if database fails
      }

      // Step 2: Parse query using Intelligent Query Service
      const queryResult = await intelligentQueryService.processQuery(query);
      const tfIntent = {
        intent: mapIntentToLegacy(queryResult.parsed.intent.type),
        mood: queryResult.parsed.intent.semantic?.mood,
        genres: queryResult.parsed.intent.attributes?.genres || [],
        confidence: queryResult.parsed.intent.confidence,
        originalQuery: queryResult.parsed.originalQuery
      };
      console.log('[Intelligent Query Service] Intent analysis:', {
        intent: tfIntent.intent,
        mood: tfIntent.mood,
        genres: tfIntent.genres,
        confidence: tfIntent.confidence
      });

      // Step 2: Smart routing - use discover API for genre/mood queries, search API for specific titles
      let searchResults: any = { results: [] };
      const shouldUseDiscoverAPI = ['genre', 'mood', 'general'].includes(tfIntent.intent);

      if (shouldUseDiscoverAPI) {
        console.log('[TF.js Advanced Search] Using TMDB discover API for genre/mood query');
        
        // Map mood to genres
        const moodToGenres: Record<string, string[]> = {
          happy: ['comedy'],
          sad: ['drama'],
          scary: ['horror'],
          romantic: ['romance'],
          exciting: ['action', 'adventure']
        };

        // Collect all genres from intent
        let allGenres = [...tfIntent.genres];
        if (tfIntent.mood && moodToGenres[tfIntent.mood]) {
          allGenres = [...allGenres, ...moodToGenres[tfIntent.mood]];
        }

        // Convert genre names to TMDB IDs and remove duplicates
        const genreIdSet = new Set(
          allGenres
            .map((g: string) => genreNameToId[g.toLowerCase()])
            .filter(Boolean)
        );
        const genreIds = Array.from(genreIdSet);

        if (genreIds.length > 0) {
          // Build discover API parameters
          const discoverParams: Record<string, any> = {
            with_genres: genreIds.join(','),
            sort_by: 'popularity.desc',
            'vote_count.gte': 100 // Ensure quality results
          };

          // Add year filter if available
          if (preferences?.releaseYearRange) {
            discoverParams['primary_release_date.gte'] = `${preferences.releaseYearRange[0]}-01-01`;
            discoverParams['primary_release_date.lte'] = `${preferences.releaseYearRange[1]}-12-31`;
          }

          // Add rating filter if available
          if (preferences?.ratingRange) {
            discoverParams['vote_average.gte'] = preferences.ratingRange[0];
            discoverParams['vote_average.lte'] = preferences.ratingRange[1];
          }

          console.log('[TF.js Advanced Search] Discover API params:', discoverParams);
          
          // Call discover API
          searchResults = await tmdbService.discoverMovies(discoverParams);
          
          // Add media_type to results for consistency
          searchResults.results = (searchResults.results || []).map((item: any) => ({
            ...item,
            media_type: 'movie'
          }));
          
          console.log(`TMDB discover API returned ${searchResults.results?.length || 0} results`);
        } else {
          console.log('[TF.js Advanced Search] No genres detected, falling back to search API');
          // Fall back to search if no genres detected
          const cleanedQuery = query
            .toLowerCase()
            .split(/\s+/)
            .filter((word: string) => !['movie', 'movies', 'film', 'films', 'show', 'shows', 'series'].includes(word))
            .join(' ')
            .trim() || query;
          
          searchResults = await tmdbService.searchMulti(cleanedQuery, 1);
        }
      } else {
        // For specific queries, use TMDB search API
        console.log('[TF.js Advanced Search] Using TMDB search for specific query');
        
        // Use searchQuery (already extracted from similarity patterns in Step 0)
        // Just remove stopwords if it's not already a similarity query
        let cleanedQuery = searchQuery;
        if (!isSimilarityQuery) {
          const stopwords = ['movie', 'movies', 'film', 'films', 'show', 'shows', 'series', 'all', 'watch', 'latest', 'new', 'best', 'top', 'good'];
          cleanedQuery = searchQuery
            .toLowerCase()
            .split(/\s+/)
            .filter((word: string) => !stopwords.includes(word))
            .join(' ')
            .trim() || searchQuery;
          
          console.log(`Cleaned query: "${searchQuery}" -> "${cleanedQuery}"`);
        } else {
          console.log(`Using extracted movie name: "${cleanedQuery}"`);
        }
        
        // Search TMDB API for results
        let tmdbSearchResults: any[] = [];
        if (tfIntent.intent === 'specific' || isSimilarityQuery) {
          const page1 = await tmdbService.searchMulti(cleanedQuery, 1);
          const page2 = await tmdbService.searchMulti(cleanedQuery, 2);
          tmdbSearchResults = [...(page1.results || []), ...(page2.results || [])];
          console.log(`[TF.js Advanced Search] TMDB search API returned ${tmdbSearchResults.length} results for "${cleanedQuery}" (2 pages)`);
        } else {
          const page1 = await tmdbService.searchMulti(cleanedQuery, 1);
          tmdbSearchResults = page1.results || [];
          console.log(`[TF.js Advanced Search] TMDB search API returned ${tmdbSearchResults.length} results for "${cleanedQuery}"`);
        }
        
        searchResults = {
          results: tmdbSearchResults
        };
      }

      // Step 3: Get semantic search results if confidence is high
      let semanticResults: any[] = [];
      const usedSources: string[] = [];
      
      // Track which sources were used
      if (shouldUseDiscoverAPI) {
        usedSources.push('tmdb-discover');
      } else {
        usedSources.push('tmdb-search');
      }
      
      if (tfIntent.confidence > 0.7) {
        console.log('[Intelligent Query Service] High confidence, using semantic search results');
        const semanticMatches = queryResult.semanticResults || [];
        
        // Fetch full details for semantic matches
        for (const match of semanticMatches.slice(0, 10)) {
          try {
            const movieDetails = await tmdbService.getMovieDetails(match.tmdbId);
            semanticResults.push({
              ...movieDetails,
              id: match.tmdbId,
              media_type: 'movie',
              semantic_similarity: match.similarity
            });
          } catch (error) {
            console.error(`Error fetching semantic movie ${match.tmdbId}:`, error);
          }
        }
        
        if (semanticResults.length > 0) {
          usedSources.push('intelligent-query-semantic-search');
        }
        console.log(`[Intelligent Query Service] Added ${semanticResults.length} semantic results`);
      }

      // Step 3.5: Enrich database results with TMDB API details
      let enrichedDbResults: any[] = [];
      if (dbResults.length > 0) {
        console.log(`[Database Search] Fetching TMDB API details for ${dbResults.length} database results...`);
        usedSources.push('local-database');
        
        // Fetch TMDB API details for each database result (in parallel)
        const enrichmentPromises = dbResults.map(async (dbMovie: any) => {
          try {
            const tmdbDetails = await tmdbService.getMovieDetails(dbMovie.id);
            return {
              ...tmdbDetails,
              id: dbMovie.id,
              media_type: 'movie',
              database_source: true, // Mark as coming from database
              db_popularity: dbMovie.popularity || 0
            };
          } catch (error) {
            // If TMDB API fails, use database data
            console.error(`Failed to fetch TMDB details for movie ${dbMovie.id}, using database data`);
            return {
              id: dbMovie.id,
              title: dbMovie.title,
              overview: dbMovie.overview,
              vote_average: dbMovie.voteAverage || 0,
              vote_count: dbMovie.voteCount || 0,
              release_date: dbMovie.releaseDate,
              popularity: dbMovie.popularity || 0,
              poster_path: dbMovie.posterPath,
              media_type: 'movie',
              database_source: true,
              db_popularity: dbMovie.popularity || 0,
              // Parse genres from CSV string
              genre_ids: dbMovie.genres ? dbMovie.genres.split(',').map((g: string) => {
                const genreName = g.trim();
                return Object.entries(genreIdToName).find(([id, name]) => 
                  name.toLowerCase() === genreName.toLowerCase()
                )?.[0] || null;
              }).filter(Boolean).map(Number) : []
            };
          }
        });
        
        enrichedDbResults = await Promise.all(enrichmentPromises);
        console.log(`[Database Search] Enriched ${enrichedDbResults.length} results with TMDB API data`);
      }

      // Step 4: Merge database results + TMDB API results + semantic results
      const allResults = [...enrichedDbResults, ...(searchResults.results || []), ...semanticResults];
      const seenIds = new Set<number>();
      const uniqueResults = allResults.filter((item: any) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      });

      console.log(`[TF.js Advanced Search] Merged ${uniqueResults.length} unique results from ${usedSources.join(' + ')}`);

      // Step 4.5: Filter out empty or incomplete results
      const validResults = uniqueResults.filter((item: any) => {
        // Must have a valid ID
        if (!item.id) return false;
        
        // Must have a title or name
        const hasTitle = !!(item.title || item.name);
        if (!hasTitle) return false;
        
        // Only show movies and TV shows (exclude people, collections, etc.)
        if (item.media_type && item.media_type !== 'movie' && item.media_type !== 'tv') {
          return false;
        }
        
        // Must have a poster image (required for display)
        if (!item.poster_path) return false;
        
        // Must have a valid vote_average (at least 0) - set default if missing
        if (typeof item.vote_average !== 'number') {
          item.vote_average = 0;
        }
        
        // Filter out adult content if it's explicitly marked
        if (item.adult === true) return false;
        
        return true;
      });

      console.log(`[TF.js Advanced Search] Filtered to ${validResults.length} valid results (removed ${uniqueResults.length - validResults.length} empty/incomplete items)`);

      // Step 5: Filter by user preferences (only when preferences are actually restrictive)
      let filtered = validResults.filter((item: any) => {
        // Filter by media type - only if NOT allowing both
        if (preferences?.mediaType?.length > 0) {
          const itemType = item.media_type === 'tv' ? 'tv' : 'movie';
          
          // Skip filtering if both 'movie' and 'tv' are selected (allows everything)
          const allowsMovies = preferences.mediaType.includes('movie');
          const allowsTv = preferences.mediaType.includes('tv');
          
          if (allowsMovies && allowsTv) {
            // Both types allowed, don't filter
          } else if (allowsMovies && itemType !== 'movie') {
            return false;
          } else if (allowsTv && itemType !== 'tv') {
            return false;
          }
        }

        // Filter by genres - only if genres are specified
        if (preferences?.genres?.length > 0) {
          const itemGenreIds = item.genre_ids || [];
          const preferredGenreIds = preferences.genres
            .map((g: string) => genreNameToId[g.toLowerCase()])
            .filter(Boolean);
          
          const hasMatchingGenre = itemGenreIds.some((id: number) => 
            preferredGenreIds.includes(id)
          );
          if (!hasMatchingGenre) return false;
        }

        // Filter by year range - only if NOT the default broad range [1900, 2025]
        if (preferences?.releaseYearRange) {
          const isDefaultRange = preferences.releaseYearRange[0] === 1900 && 
                                 preferences.releaseYearRange[1] === 2025;
          
          if (!isDefaultRange) {
            const releaseDate = item.release_date || item.first_air_date;
            if (releaseDate) {
              const year = new Date(releaseDate).getFullYear();
              if (year < preferences.releaseYearRange[0] || 
                  year > preferences.releaseYearRange[1]) {
                return false;
              }
            }
          }
        }

        // Filter by rating - only if NOT the default full range [0, 10]
        if (preferences?.ratingRange) {
          const isDefaultRange = preferences.ratingRange[0] === 0 && 
                                 preferences.ratingRange[1] === 10;
          
          if (!isDefaultRange) {
            if (item.vote_average < preferences.ratingRange[0] || 
                item.vote_average > preferences.ratingRange[1]) {
              return false;
            }
          }
        }

        return true;
      });

      console.log(`[TF.js Advanced Search] Filtered to ${filtered.length} results after applying preferences`);

      // Step 6: Enhanced scoring with database priority, TensorFlow.js insights and exact match prioritization
      const scored = filtered.map((item: any) => {
        let matchScore = 0;
        const reasons: string[] = [];

        // Prioritize database results (better quality, local data)
        if (item.database_source) {
          matchScore += 0.3;
          reasons.push('From comprehensive database');
        }

        // Base score from TMDB popularity and rating
        matchScore += (item.vote_average / 10) * 0.3;
        matchScore += Math.min((item.popularity || item.db_popularity || 0) / 1000, 1) * 0.2;

        // Boost for semantic similarity (if available)
        if (item.semantic_similarity) {
          matchScore += item.semantic_similarity * 0.35;
          reasons.push('Semantically similar to query');
        }

        // Prioritize exact and partial title matches (use searchQuery which is the extracted movie name for similarity queries)
        const queryLower = searchQuery.toLowerCase().trim();
        const titleLower = (item.title || item.name || '').toLowerCase().trim();
        
        // Exact match gets highest priority
        if (titleLower === queryLower) {
          matchScore += 2.0; // Very high boost for exact match
          reasons.push(`Exact match: "${searchQuery}"`);
        }
        // Title starts with query (e.g., "Thor" matches "Thor: Ragnarok")
        else if (titleLower.startsWith(queryLower)) {
          matchScore += 1.5; // High boost for starts with
          reasons.push(`Title starts with "${searchQuery}"`);
        }
        // Title contains query anywhere
        else if (titleLower.includes(queryLower)) {
          matchScore += 0.8; // Medium boost for contains
          reasons.push(`Contains "${searchQuery}"`);
        }

        // Boost for TensorFlow.js detected mood alignment
        if (tfIntent.mood) {
          const moodGenreMap: Record<string, number[]> = {
            happy: [35], // Comedy
            sad: [18], // Drama
            scary: [27], // Horror
            romantic: [10749], // Romance
            exciting: [28, 12] // Action, Adventure
          };
          
          const moodGenres = moodGenreMap[tfIntent.mood] || [];
          const itemGenreIds = item.genre_ids || [];
          const hasMoodMatch = moodGenres.some((gid: number) => itemGenreIds.includes(gid));
          
          if (hasMoodMatch) {
            matchScore += 0.2;
            reasons.push(`Matches ${tfIntent.mood} mood`);
          }
        }

        // Boost for TensorFlow.js detected genre match
        if (tfIntent.genres.length > 0) {
          const detectedGenreIds = tfIntent.genres
            .map((g: string) => genreNameToId[g.toLowerCase()])
            .filter(Boolean);
          
          const itemGenreIds = item.genre_ids || [];
          const genreMatches = detectedGenreIds.filter((gid: number) => 
            itemGenreIds.includes(gid)
          );
          
          if (genreMatches.length > 0) {
            matchScore += genreMatches.length * 0.15;
            const genreNames = genreMatches.map((gid: number) => genreIdToName[gid]);
            reasons.push(`AI detected ${genreNames.join(', ')}`);
          }
        }

        // Boost for user preference genre match
        if (preferences?.genres?.length > 0) {
          const itemGenres = (item.genre_ids || [])
            .map((id: number) => genreIdToName[id])
            .filter(Boolean);
          const matchedGenres = itemGenres.filter((g: string) => 
            preferences.genres.some((pg: string) => pg.toLowerCase() === g.toLowerCase())
          );
          if (matchedGenres.length > 0) {
            matchScore += matchedGenres.length * 0.1;
            reasons.push(`${matchedGenres.join(', ')} genre${matchedGenres.length > 1 ? 's' : ''}`);
          }
        }

        // Add rating reason
        if (item.vote_average >= 7.5) {
          reasons.push(`Highly rated (${item.vote_average.toFixed(1)}/10)`);
        }

        // Add year info
        const releaseDate = item.release_date || item.first_air_date;
        if (releaseDate) {
          const year = new Date(releaseDate).getFullYear();
          if (preferences?.releaseYearRange && 
              year >= preferences.releaseYearRange[0] && 
              year <= preferences.releaseYearRange[1]) {
            reasons.push(`Released in ${year}`);
          }
        }

        const finalReason = reasons.length > 0 
          ? reasons.join(' • ') 
          : 'Matches your search';

        return {
          movie: {
            id: item.id,
            title: item.title || item.name,
            poster_path: item.poster_path,
            backdrop_path: item.backdrop_path,
            media_type: item.media_type || 'movie',
            vote_average: item.vote_average,
            overview: item.overview,
            release_date: item.release_date || item.first_air_date,
            genre_ids: item.genre_ids
          },
          matchScore: Math.min(matchScore, 1),
          confidence: tfIntent.confidence,
          reason: finalReason,
          source: item.semantic_similarity ? 'semantic' : 'keyword'
        };
      });

      // Step 6.5: Apply Universal Sentence Encoder semantic re-ranking
      console.log('[USE Re-rank] Applying USE semantic re-ranking to advanced search results...');
      let useReranked: any[] = scored;
      try {
        if (scored.length > 0) {
          // Prepare candidates for USE re-ranking
          const candidates = scored.map((item: any) => ({
            tmdbId: item.movie.id,
            text: `${item.movie.title} ${item.movie.overview || ''}`.toLowerCase()
          }));
          
          // Use USE to calculate semantic similarity
          const rankedResults = await useService.semanticSearch(query, candidates, scored.length);
          
          // Combine USE scores with existing matchScores
          const rerankedWithScores = rankedResults.map(result => {
            const originalItem = scored.find((s: any) => s.movie.id === result.tmdbId);
            if (originalItem) {
              return {
                ...originalItem,
                matchScore: originalItem.matchScore * 0.5 + result.similarity * 0.5, // Blend original score with USE similarity
                useSimilarity: result.similarity
              };
            }
            return null;
          }).filter((item): item is any => item !== null);
          
          useReranked = rerankedWithScores;
          
          console.log(`[USE Re-rank] Re-ranked ${useReranked.length} results with USE`);
          if (useReranked.length > 0 && useReranked[0].useSimilarity !== undefined) {
            console.log(`[USE Re-rank] Top match: ${useReranked[0].movie.title} (${(useReranked[0].useSimilarity * 100).toFixed(1)}% semantic match)`);
          }
        }
      } catch (useError) {
        console.warn('[USE Re-rank] Error in USE re-ranking, using original scores:', useError);
        useReranked = scored; // Fallback to original scores
      }

      // Step 7: Sort by match score (prioritize items matching both keyword + semantic)
      const recommendations = useReranked.sort((a: any, b: any) => b.matchScore - a.matchScore).slice(0, 20);

      console.log(`Returning ${recommendations.length} recommendations`);

      res.json({
        success: true,
        query: query,
        enhancedQuery: query,
        recommendations,
        searchInsights: { 
          sources: usedSources,
          algorithm: 'tf-semantic-enhanced',
          totalSearchResults: allResults.length,
          filteredResults: recommendations.length,
          tfIntent: {
            intent: tfIntent.intent,
            mood: tfIntent.mood,
            genres: tfIntent.genres,
            confidence: tfIntent.confidence
          }
        },
        totalResults: recommendations.length,
        source: usedSources.join('+')
      });

    } catch (error) {
      console.error('Advanced recommendation error:', error);
      res.status(500).json({
        error: 'Failed to get advanced recommendations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // MovieVanders-style query enhancement function
  async function enhanceUserQuery(message: string, history: any[] = []) {
    const lowercaseMessage = message.toLowerCase();
    
    // Advanced mood detection (MovieVanders style)
    const moodPatterns = {
      happy: ['funny', 'comedy', 'laugh', 'cheerful', 'uplifting', 'feel-good', 'lighthearted', 'amusing'],
      sad: ['emotional', 'tearjerker', 'cry', 'dramatic', 'melancholic', 'heartbreaking', 'touching'],
      scary: ['horror', 'frightening', 'terrifying', 'suspenseful', 'creepy', 'spine-chilling', 'scary', 'haunting'],
      romantic: ['love', 'romance', 'romantic', 'date night', 'passionate', 'relationship', 'couples'],
      energetic: ['action', 'exciting', 'thrilling', 'fast-paced', 'adrenaline', 'intense', 'explosive'],
      thoughtful: ['deep', 'philosophical', 'intellectual', 'thought-provoking', 'meaningful', 'profound']
    };

    const genrePatterns = {
      action: ['action', 'fight', 'adventure', 'superhero', 'martial arts', 'combat'],
      comedy: ['comedy', 'funny', 'humor', 'laugh', 'hilarious', 'amusing'],
      drama: ['drama', 'serious', 'emotional', 'life', 'realistic', 'character-driven'],
      horror: ['horror', 'scary', 'frightening', 'supernatural', 'zombie', 'ghost'],
      romance: ['romance', 'love', 'romantic', 'relationship', 'dating', 'marriage'],
      thriller: ['thriller', 'suspense', 'mystery', 'crime', 'detective', 'noir'],
      'sci-fi': ['sci-fi', 'science fiction', 'space', 'future', 'alien', 'technology'],
      fantasy: ['fantasy', 'magic', 'medieval', 'mythical', 'wizard', 'dragon'],
      animation: ['animated', 'cartoon', 'anime', 'pixar', 'disney', 'animation'],
      documentary: ['documentary', 'real', 'true story', 'biography', 'factual']
    };

    // Detect mood
    let detectedMood = null;
    for (const [mood, patterns] of Object.entries(moodPatterns)) {
      if (patterns.some(pattern => lowercaseMessage.includes(pattern))) {
        detectedMood = mood;
        break;
      }
    }

    // Detect genres
    const detectedGenres = [];
    for (const [genre, patterns] of Object.entries(genrePatterns)) {
      if (patterns.some(pattern => lowercaseMessage.includes(pattern))) {
        detectedGenres.push(genre);
      }
    }

    // Detect time preferences
    let yearPreference = null;
    const yearMatch = lowercaseMessage.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) yearPreference = parseInt(yearMatch[0]);

    let decadePreference = null;
    if (lowercaseMessage.includes('90s') || lowercaseMessage.includes('1990s')) decadePreference = '1990s';
    if (lowercaseMessage.includes('80s') || lowercaseMessage.includes('1980s')) decadePreference = '1980s';
    if (lowercaseMessage.includes('2000s')) decadePreference = '2000s';

    // Extract keywords
    const commonWords = ['movie', 'film', 'show', 'watch', 'like', 'want', 'need', 'find', 'good', 'best', 'great', 'suggest', 'recommend'];
    const words = lowercaseMessage.split(/\s+/).filter(word => 
      word.length > 2 && !commonWords.includes(word)
    );

    return {
      detectedMood,
      detectedGenres,
      detectedKeywords: words,
      yearPreference,
      decadePreference,
      originalQuery: message,
      conversationContext: history.slice(-3) // Last 3 messages for context
    };
  }

  // Generate MovieVanders-style reasoning for recommendations
  function generateMovieVandersReason(movie: any, queryAnalysis: any): string {
    const reasons = [];
    
    if (queryAnalysis.detectedMood) {
      const moodReasons: Record<string, string> = {
        happy: `Perfect for your uplifting mood`,
        scary: `Delivers the spine-chilling experience you're seeking`, 
        romantic: `Captures the romantic atmosphere you want`,
        energetic: `Packed with the exciting action you're craving`,
        thoughtful: `Offers the deep, meaningful story you're looking for`
      };
      if (moodReasons[queryAnalysis.detectedMood]) {
        reasons.push(moodReasons[queryAnalysis.detectedMood]);
      }
    }

    if (movie.vote_average > 8.0) {
      reasons.push(`exceptional ${movie.vote_average}/10 rating`);
    } else if (movie.vote_average > 7.0) {
      reasons.push(`strong ${movie.vote_average}/10 rating`);
    }

    if (queryAnalysis.decadePreference && movie.release_date) {
      const movieYear = new Date(movie.release_date).getFullYear();
      if (queryAnalysis.decadePreference === '1990s' && movieYear >= 1990 && movieYear < 2000) {
        reasons.push(`perfect 90s classic`);
      }
    }

    return reasons.length > 0 
      ? reasons.join(' with ') + '.'
      : `Great ${queryAnalysis.detectedGenres[0] || 'movie'} choice that matches your preferences.`;
  }

  // Enhance chat response with MovieVanders-style explanations
  function enhanceChatResponse(originalResponse: string, queryAnalysis: any, movies: any[]): string {
    let enhanced = originalResponse;

    // Add contextual insights
    if (queryAnalysis.detectedMood && movies.length > 0) {
      const moodContext: Record<string, string> = {
        happy: "I've found some wonderfully uplifting films",
        scary: "Here are some spine-tingling horror selections", 
        romantic: "These romantic gems should set the perfect mood",
        energetic: "Get ready for some heart-pounding action",
        thoughtful: "These thought-provoking films will give you plenty to consider"
      };
      
      if (moodContext[queryAnalysis.detectedMood]) {
        enhanced = `${moodContext[queryAnalysis.detectedMood]} based on your ${queryAnalysis.detectedMood} mood request!\n\n${enhanced}`;
      }
    }

    return enhanced;
  }

  // Generate MovieVanders-style follow-up suggestions
  function generateFollowUpSuggestions(queryAnalysis: any, movies: any[]): string[] {
    const suggestions = [];
    
    if (!queryAnalysis.detectedMood) {
      suggestions.push("Want to specify a mood? Try 'funny' or 'scary'");
    }
    
    if (queryAnalysis.detectedGenres.length === 0) {
      suggestions.push("Looking for a specific genre like 'action' or 'romance'?");
    }
    
    if (!queryAnalysis.decadePreference) {
      suggestions.push("Interested in movies from a specific decade like 'the 90s'?");
    }
    
    if (movies.length > 3) {
      suggestions.push("Want me to be more specific in my recommendations?");
    }
    
    return suggestions.slice(0, 3);
  }

  // ===============================
  // Phase 10: Production Infrastructure & Monitoring
  // ===============================
  
  // Cache Management Endpoints
  app.get("/api/production/cache/stats", async (req, res) => {
    try {
      const { cacheManager } = await import('./ml/productionCache');
      const stats = cacheManager.getAllStats();
      res.json({ stats });
    } catch (error: any) {
      console.error('Cache stats error:', error);
      res.status(500).json({ error: 'Failed to get cache stats' });
    }
  });

  app.delete("/api/production/cache/:pattern?", async (req, res) => {
    try {
      const { cacheManager } = await import('./ml/productionCache');
      const pattern = req.params.pattern || '.*';
      const count = await cacheManager.invalidatePattern(pattern);
      res.json({ success: true, invalidated: count, pattern });
    } catch (error: any) {
      console.error('Cache invalidation error:', error);
      res.status(500).json({ error: 'Failed to invalidate cache' });
    }
  });

  app.delete("/api/production/cache/clear-all", async (req, res) => {
    try {
      const { cacheManager } = await import('./ml/productionCache');
      await cacheManager.clearAll();
      res.json({ success: true, message: 'All caches cleared' });
    } catch (error: any) {
      console.error('Cache clear error:', error);
      res.status(500).json({ error: 'Failed to clear caches' });
    }
  });

  // Training Pipeline Endpoints
  app.get("/api/production/training/jobs", async (req, res) => {
    try {
      const { trainingPipeline } = await import('./ml/trainingPipeline');
      const jobs = trainingPipeline.getAllJobs();
      res.json({ jobs });
    } catch (error: any) {
      console.error('Training jobs error:', error);
      res.status(500).json({ error: 'Failed to get training jobs' });
    }
  });

  app.post("/api/production/training/jobs/:jobId/run", async (req, res) => {
    try {
      const { trainingPipeline } = await import('./ml/trainingPipeline');
      await trainingPipeline.runTrainingJob(req.params.jobId);
      res.json({ success: true, message: 'Training job started' });
    } catch (error: any) {
      console.error('Training job run error:', error);
      res.status(500).json({ error: 'Failed to run training job' });
    }
  });

  app.delete("/api/production/training/jobs/:jobId", async (req, res) => {
    try {
      const { trainingPipeline } = await import('./ml/trainingPipeline');
      trainingPipeline.stopJob(req.params.jobId);
      res.json({ success: true, message: 'Training job stopped' });
    } catch (error: any) {
      console.error('Training job stop error:', error);
      res.status(500).json({ error: 'Failed to stop training job' });
    }
  });

  // ML Monitoring Endpoints
  app.get("/api/production/monitoring/health", async (req, res) => {
    try {
      const { mlMonitoring } = await import('./ml/monitoringService');
      const health = mlMonitoring.getSystemHealth();
      res.json({ health });
    } catch (error: any) {
      console.error('Health check error:', error);
      res.status(500).json({ error: 'Failed to get system health' });
    }
  });

  app.get("/api/production/monitoring/metrics", async (req, res) => {
    try {
      const { mlMonitoring } = await import('./ml/monitoringService');
      const modelType = req.query.modelType as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const metrics = mlMonitoring.getModelMetrics(modelType, limit);
      res.json({ metrics });
    } catch (error: any) {
      console.error('Metrics error:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  app.get("/api/production/monitoring/latency", async (req, res) => {
    try {
      const { mlMonitoring } = await import('./ml/monitoringService');
      const endpoint = req.query.endpoint as string | undefined;
      const latency = mlMonitoring.getLatencyMetrics(endpoint);
      res.json({ latency });
    } catch (error: any) {
      console.error('Latency metrics error:', error);
      res.status(500).json({ error: 'Failed to get latency metrics' });
    }
  });

  app.get("/api/production/monitoring/alerts", async (req, res) => {
    try {
      const { mlMonitoring } = await import('./ml/monitoringService');
      const includeResolved = req.query.includeResolved === 'true';
      const alerts = mlMonitoring.getAlerts(includeResolved);
      res.json({ alerts });
    } catch (error: any) {
      console.error('Alerts error:', error);
      res.status(500).json({ error: 'Failed to get alerts' });
    }
  });

  app.post("/api/production/monitoring/alerts/:alertId/resolve", async (req, res) => {
    try {
      const { mlMonitoring } = await import('./ml/monitoringService');
      mlMonitoring.resolveAlert(req.params.alertId);
      res.json({ success: true, message: 'Alert resolved' });
    } catch (error: any) {
      console.error('Alert resolution error:', error);
      res.status(500).json({ error: 'Failed to resolve alert' });
    }
  });

  return httpServer;
}
