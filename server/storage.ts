import { type User, type InsertUser, type Movie, type InsertMovie, type UserRating, type InsertUserRating, type UserWatchlist, type InsertUserWatchlist, type UserCommunity, type ViewingHistory, type Recommendation, type ReviewInteraction, type InsertReviewInteraction } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Movie methods
  getMovies(): Promise<Movie[]>;
  getMovie(id: string): Promise<Movie | undefined>;
  createMovie(movie: InsertMovie): Promise<Movie>;
  searchMovies(query: string): Promise<Movie[]>;

  // Rating methods - enhanced with sentiment analysis
  getUserRatings(userId: string): Promise<UserRating[]>;
  getRatingsByMedia(tmdbId: number, mediaType: string, userId?: string, sortBy?: string): Promise<UserRating[]>;
  getAllRatings(): Promise<UserRating[]>;
  createUserRating(rating: any): Promise<UserRating>; // Updated to handle sentiment fields
  updateUserRating(ratingId: string, updateData: any): Promise<UserRating | undefined>;
  deleteUserRating(ratingId: string): Promise<boolean>;

  // Review interaction methods
  createReviewInteraction(interaction: InsertReviewInteraction): Promise<ReviewInteraction>;
  incrementHelpfulCount(reviewId: string): Promise<void>;

  // Watchlist methods
  getUserWatchlist(userId: string): Promise<UserWatchlist[]>;
  addToWatchlist(watchlistItem: InsertUserWatchlist): Promise<UserWatchlist>;
  removeFromWatchlist(userId: string, movieId: string): Promise<boolean>;

  // Favorites methods
  getUserFavorites(userId: string): Promise<any[]>;
  addToFavorites(favoriteItem: any): Promise<any>;
  removeFromFavorites(userId: string, tmdbId: string): Promise<boolean>;

  // Community methods
  getUserCommunities(userId: string): Promise<UserCommunity[]>;

  // Viewing history methods
  getUserViewingHistory(userId: string): Promise<ViewingHistory[]>;
  createViewingHistory(viewingHistory: any): Promise<ViewingHistory>;
  removeWatchedItem(userId: string, tmdbId: number): Promise<boolean>;

  // Recommendation methods
  getUserRecommendations(userId: string): Promise<Recommendation[]>;

  // User-submitted recommendations methods
  getUserRecommendationsForMedia(forTmdbId: number, forMediaType: string): Promise<any[]>;
  createUserRecommendation(recommendation: any): Promise<any>;
  deleteUserRecommendation(recommendationId: string, userId: string): Promise<boolean>;
  getUserSubmittedRecommendations(userId: string): Promise<any[]>;

  // TMDB Movies Cache methods
  getTmdbMovie(tmdbId: number, mediaType: string): Promise<any | undefined>;
  getTmdbMovies(limit?: number, offset?: number): Promise<any[]>;
  createTmdbMovie(movie: any): Promise<any>;
  updateTmdbMovie(id: string, movie: any): Promise<any | undefined>;
  searchTmdbMovies(query: string, limit?: number): Promise<any[]>;
  getTmdbMoviesByIds(tmdbIds: number[], mediaType: string): Promise<any[]>;

}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private movies: Map<string, Movie>;
  private userRatings: Map<string, UserRating>;
  private userWatchlists: Map<string, UserWatchlist>;
  private userFavorites: Map<string, any>;
  private userCommunities: Map<string, UserCommunity>;
  private viewingHistory: Map<string, ViewingHistory>;
  private recommendations: Map<string, Recommendation>;
  private reviewInteractions: Map<string, ReviewInteraction>;
  private userRecommendations: Map<string, any>;
  private tmdbMovies: Map<string, any>;

  constructor() {
    this.users = new Map();
    this.movies = new Map();
    this.userRatings = new Map();
    this.userWatchlists = new Map();
    this.userFavorites = new Map();
    this.userCommunities = new Map();
    this.viewingHistory = new Map();
    this.recommendations = new Map();
    this.reviewInteractions = new Map();
    this.userRecommendations = new Map();
    this.tmdbMovies = new Map();

    // Initialize with sample data
    this.initializeSampleData();
  }

  private initializeSampleData() {
    // No sample movies - removed per user request (TMDB and MovieLens data removed)

    // Sample user communities
    const sampleCommunities: UserCommunity[] = [
      {
        id: "1",
        userId: "user1",
        communityName: "Sci-Fi Enthusiasts",
        matchPercentage: 85,
        memberCount: 2847,
      },
      {
        id: "2",
        userId: "user1",
        communityName: "Drama Connoisseurs", 
        matchPercentage: 78,
        memberCount: 1592,
      },
    ];

    sampleCommunities.forEach(community => this.userCommunities.set(community.id, community));

    // Sample watchlist items for demo
    const sampleWatchlistItems: UserWatchlist[] = [
      {
        id: "watchlist1",
        userId: "user1",
        tmdbId: 1,
        mediaType: "movie",
        title: "Quantum Nexus",
        posterPath: "https://images.unsplash.com/photo-1534447677768-be436bb09401?ixlib=rb-4.0.3&w=400&h=600&fit=crop",
        addedAt: new Date(),
      },
      {
        id: "watchlist2", 
        userId: "user1",
        tmdbId: 2,
        mediaType: "movie",
        title: "Neural Storm",
        posterPath: "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?ixlib=rb-4.0.3&w=400&h=600&fit=crop",
        addedAt: new Date(),
      }
    ];

    sampleWatchlistItems.forEach(item => this.userWatchlists.set(item.id, item));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt: new Date(), 
      updatedAt: new Date(),
      email: insertUser.email || null,
      password: insertUser.password || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      bio: insertUser.bio || null,
      profileImageUrl: insertUser.profileImageUrl || null
    };
    this.users.set(id, user);
    return user;
  }

  async getMovies(): Promise<Movie[]> {
    return Array.from(this.movies.values());
  }

  async getMovie(id: string): Promise<Movie | undefined> {
    return this.movies.get(id);
  }

  async createMovie(insertMovie: InsertMovie): Promise<Movie> {
    const id = randomUUID();
    const movie: Movie = { 
      ...insertMovie, 
      id,
      synopsis: insertMovie.synopsis || null,
      posterUrl: insertMovie.posterUrl || null,
      director: insertMovie.director || null,
      cast: insertMovie.cast || null,
      duration: insertMovie.duration || null,
      seasons: insertMovie.seasons || null,
      type: insertMovie.type || "movie"
    };
    this.movies.set(id, movie);
    return movie;
  }

  async searchMovies(query: string): Promise<Movie[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.movies.values()).filter(movie =>
      movie.title.toLowerCase().includes(lowercaseQuery) ||
      movie.genre.toLowerCase().includes(lowercaseQuery) ||
      movie.synopsis?.toLowerCase().includes(lowercaseQuery)
    );
  }

  async getUserRatings(userId: string): Promise<UserRating[]> {
    return Array.from(this.userRatings.values()).filter(rating => rating.userId === userId);
  }

  async createUserRating(insertRating: any): Promise<UserRating> {
    const id = randomUUID();
    const rating: UserRating = { 
      ...insertRating, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date(),
      review: insertRating.review || null,
      posterPath: insertRating.posterPath || null,
      sentimentScore: insertRating.sentimentScore || null,
      sentimentLabel: insertRating.sentimentLabel || null,
      helpfulCount: insertRating.helpfulCount || 0,
      isVerifiedPurchase: insertRating.isVerifiedPurchase || false,
      isPublic: insertRating.isPublic !== undefined ? insertRating.isPublic : true
    };
    this.userRatings.set(id, rating);
    return rating;
  }

  async updateUserRating(ratingId: string, rating: number): Promise<UserRating | undefined> {
    const userRating = this.userRatings.get(ratingId);
    if (userRating) {
      userRating.rating = rating;
      this.userRatings.set(ratingId, userRating);
      return userRating;
    }
    return undefined;
  }

  // New methods for comprehensive rating system
  async getRatingsForMedia(tmdbId: number, mediaType: string): Promise<UserRating[]> {
    return Array.from(this.userRatings.values()).filter(
      rating => rating.tmdbId === tmdbId && rating.mediaType === mediaType
    );
  }

  async getAllRatings(): Promise<UserRating[]> {
    return Array.from(this.userRatings.values());
  }

  async createRating(insertRating: any): Promise<UserRating> {
    const id = randomUUID();
    const rating: UserRating = { 
      ...insertRating, 
      id, 
      createdAt: new Date(),
      updatedAt: new Date(),
      review: insertRating.review || null,
      posterPath: insertRating.posterPath || null,
      sentimentScore: insertRating.sentimentScore || null,
      sentimentLabel: insertRating.sentimentLabel || null,
      helpfulCount: insertRating.helpfulCount || 0,
      isVerifiedPurchase: insertRating.isVerifiedPurchase || false,
      isPublic: insertRating.isPublic !== undefined ? insertRating.isPublic : true
    };
    this.userRatings.set(id, rating);
    return rating;
  }

  async updateRating(ratingId: string, updateData: Partial<InsertUserRating>): Promise<UserRating | undefined> {
    const rating = this.userRatings.get(ratingId);
    if (rating) {
      const updatedRating = { 
        ...rating, 
        ...updateData,
        updatedAt: new Date()
      };
      this.userRatings.set(ratingId, updatedRating);
      return updatedRating;
    }
    return undefined;
  }

  async deleteRating(ratingId: string): Promise<boolean> {
    return this.userRatings.delete(ratingId);
  }

  async getUserWatchlist(userId: string): Promise<UserWatchlist[]> {
    return Array.from(this.userWatchlists.values()).filter(item => item.userId === userId);
  }

  async addToWatchlist(insertWatchlistItem: InsertUserWatchlist): Promise<UserWatchlist> {
    const id = randomUUID();
    const watchlistItem: UserWatchlist = { 
      ...insertWatchlistItem, 
      id, 
      addedAt: new Date(),
      posterPath: insertWatchlistItem.posterPath || null
    };
    this.userWatchlists.set(id, watchlistItem);
    return watchlistItem;
  }

  async removeFromWatchlist(userId: string, tmdbId: string): Promise<boolean> {
    const item = Array.from(this.userWatchlists.values()).find(
      item => item.userId === userId && item.tmdbId.toString() === tmdbId
    );
    if (item) {
      this.userWatchlists.delete(item.id);
      return true;
    }
    return false;
  }

  async getUserFavorites(userId: string): Promise<any[]> {
    return Array.from(this.userFavorites.values()).filter(item => item.userId === userId);
  }

  async addToFavorites(favoriteItem: any): Promise<any> {
    const id = randomUUID();
    const favorite = { 
      ...favoriteItem, 
      id, 
      addedAt: new Date(),
      posterPath: favoriteItem.posterPath || null
    };
    this.userFavorites.set(id, favorite);
    return favorite;
  }

  async removeFromFavorites(userId: string, tmdbId: string): Promise<boolean> {
    const item = Array.from(this.userFavorites.values()).find(
      item => item.userId === userId && item.tmdbId.toString() === tmdbId
    );
    if (item) {
      this.userFavorites.delete(item.id);
      return true;
    }
    return false;
  }

  async getUserCommunities(userId: string): Promise<UserCommunity[]> {
    return Array.from(this.userCommunities.values()).filter(community => community.userId === userId);
  }

  async getUserViewingHistory(userId: string): Promise<ViewingHistory[]> {
    return Array.from(this.viewingHistory.values()).filter(history => history.userId === userId);
  }

  async createViewingHistory(viewingHistory: any): Promise<ViewingHistory> {
    const id = randomUUID();
    const newHistory: ViewingHistory = {
      id,
      userId: viewingHistory.userId,
      tmdbId: viewingHistory.tmdbId,
      mediaType: viewingHistory.mediaType,
      title: viewingHistory.title,
      posterPath: viewingHistory.posterPath || null,
      watchedAt: new Date(),
      watchDuration: viewingHistory.watchDuration || null,
    };
    this.viewingHistory.set(id, newHistory);
    return newHistory;
  }

  async removeWatchedItem(userId: string, tmdbId: number): Promise<boolean> {
    const item = Array.from(this.viewingHistory.values()).find(
      history => history.userId === userId && history.tmdbId === tmdbId
    );
    if (item) {
      this.viewingHistory.delete(item.id);
      return true;
    }
    return false;
  }

  async getUserRecommendations(userId: string): Promise<Recommendation[]> {
    return Array.from(this.recommendations.values()).filter(rec => rec.userId === userId);
  }

  // New methods for enhanced rating system with sentiment analysis
  async getRatingsByMedia(tmdbId: number, mediaType: string, userId?: string, sortBy: string = 'latest'): Promise<UserRating[]> {
    let ratings = Array.from(this.userRatings.values()).filter(
      rating => rating.tmdbId === tmdbId && rating.mediaType === mediaType
    );
    
    if (userId) {
      ratings = ratings.filter(rating => rating.userId === userId);
    }
    
    // Apply sorting
    switch (sortBy) {
      case 'latest':
        ratings.sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());
        break;
      case 'popular':
        ratings.sort((a, b) => {
          // Sort by helpfulCount first, then by rating as a tie-breaker
          const helpfulDiff = (b.helpfulCount || 0) - (a.helpfulCount || 0);
          if (helpfulDiff !== 0) return helpfulDiff;
          return b.rating - a.rating;
        });
        break;
      default:
        // Default to latest
        ratings.sort((a, b) => new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime());
    }
    
    return ratings;
  }

  async deleteUserRating(ratingId: string): Promise<boolean> {
    return this.userRatings.delete(ratingId);
  }

  async createReviewInteraction(interaction: InsertReviewInteraction): Promise<ReviewInteraction> {
    const id = randomUUID();
    const reviewInteraction: ReviewInteraction = {
      ...interaction,
      id,
      createdAt: new Date()
    };
    this.reviewInteractions.set(id, reviewInteraction);
    return reviewInteraction;
  }

  async incrementHelpfulCount(reviewId: string): Promise<void> {
    const rating = this.userRatings.get(reviewId);
    if (rating) {
      rating.helpfulCount = (rating.helpfulCount || 0) + 1;
      this.userRatings.set(reviewId, rating);
    }
  }

  // User-submitted recommendations methods
  async getUserRecommendationsForMedia(forTmdbId: number, forMediaType: string): Promise<any[]> {
    return Array.from(this.userRecommendations.values()).filter(
      rec => rec.forTmdbId === forTmdbId && rec.forMediaType === forMediaType
    );
  }

  async createUserRecommendation(recommendation: any): Promise<any> {
    const id = randomUUID();
    const newRecommendation = {
      ...recommendation,
      id,
      createdAt: new Date()
    };
    this.userRecommendations.set(id, newRecommendation);
    return newRecommendation;
  }

  async deleteUserRecommendation(recommendationId: string, userId: string): Promise<boolean> {
    const recommendation = this.userRecommendations.get(recommendationId);
    if (recommendation && recommendation.userId === userId) {
      return this.userRecommendations.delete(recommendationId);
    }
    return false;
  }

  async getUserSubmittedRecommendations(userId: string): Promise<any[]> {
    return Array.from(this.userRecommendations.values()).filter(
      rec => rec.userId === userId
    );
  }

  // TMDB Movies Cache methods
  async getTmdbMovie(tmdbId: number, mediaType: string): Promise<any | undefined> {
    const key = `${tmdbId}-${mediaType}`;
    return this.tmdbMovies.get(key);
  }

  async getTmdbMovies(limit: number = 100, offset: number = 0): Promise<any[]> {
    const allMovies = Array.from(this.tmdbMovies.values());
    return allMovies.slice(offset, offset + limit);
  }

  async createTmdbMovie(movie: any): Promise<any> {
    const id = randomUUID();
    const key = `${movie.tmdbId}-${movie.mediaType}`;
    const tmdbMovie = {
      ...movie,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tmdbMovies.set(key, tmdbMovie);
    return tmdbMovie;
  }

  async updateTmdbMovie(id: string, movieData: any): Promise<any | undefined> {
    const existingMovie = Array.from(this.tmdbMovies.values()).find(m => m.id === id);
    if (existingMovie) {
      const key = `${existingMovie.tmdbId}-${existingMovie.mediaType}`;
      const updatedMovie = {
        ...existingMovie,
        ...movieData,
        updatedAt: new Date(),
      };
      this.tmdbMovies.set(key, updatedMovie);
      return updatedMovie;
    }
    return undefined;
  }

  async searchTmdbMovies(query: string, limit: number = 20): Promise<any[]> {
    const lowercaseQuery = query.toLowerCase();
    const results = Array.from(this.tmdbMovies.values()).filter(movie =>
      movie.title?.toLowerCase().includes(lowercaseQuery) ||
      movie.overview?.toLowerCase().includes(lowercaseQuery)
    );
    return results.slice(0, limit);
  }

  async getTmdbMoviesByIds(tmdbIds: number[], mediaType: string): Promise<any[]> {
    const results: any[] = [];
    for (const tmdbId of tmdbIds) {
      const key = `${tmdbId}-${mediaType}`;
      const movie = this.tmdbMovies.get(key);
      if (movie) {
        results.push(movie);
      }
    }
    return results;
  }

}

import { eq, and, desc, sql as drizzleSql } from "drizzle-orm";
import { db } from "./db";
import * as schema from "@shared/schema";

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(schema.users).where(eq(schema.users.email, username));
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(schema.users).values(user).returning();
    return result[0];
  }

  // Movie methods
  async getMovies(): Promise<Movie[]> {
    return await db.select().from(schema.movies);
  }

  async getMovie(id: string): Promise<Movie | undefined> {
    const result = await db.select().from(schema.movies).where(eq(schema.movies.id, id));
    return result[0];
  }

  async createMovie(movie: InsertMovie): Promise<Movie> {
    const result = await db.insert(schema.movies).values(movie).returning();
    return result[0];
  }

  async searchMovies(query: string): Promise<Movie[]> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    return await db.select().from(schema.movies).where(
      drizzleSql`LOWER(${schema.movies.title}) LIKE ${lowercaseQuery} OR 
                 LOWER(${schema.movies.genre}) LIKE ${lowercaseQuery} OR 
                 LOWER(${schema.movies.synopsis}) LIKE ${lowercaseQuery}`
    );
  }

  // Rating methods
  async getUserRatings(userId: string): Promise<UserRating[]> {
    return await db.select().from(schema.userRatings).where(eq(schema.userRatings.userId, userId));
  }

  async getRatingsByMedia(tmdbId: number, mediaType: string, userId?: string, sortBy: string = 'latest'): Promise<UserRating[]> {
    const whereConditions = userId
      ? and(
          eq(schema.userRatings.tmdbId, tmdbId),
          eq(schema.userRatings.mediaType, mediaType),
          eq(schema.userRatings.userId, userId)
        )
      : and(
          eq(schema.userRatings.tmdbId, tmdbId),
          eq(schema.userRatings.mediaType, mediaType)
        );

    if (sortBy === 'popular') {
      return await db.select()
        .from(schema.userRatings)
        .where(whereConditions)
        .orderBy(desc(schema.userRatings.helpfulCount), desc(schema.userRatings.rating));
    } else {
      return await db.select()
        .from(schema.userRatings)
        .where(whereConditions)
        .orderBy(desc(schema.userRatings.createdAt));
    }
  }

  async getAllRatings(): Promise<UserRating[]> {
    return await db.select().from(schema.userRatings);
  }

  async createUserRating(rating: any): Promise<UserRating> {
    const result = await db.insert(schema.userRatings).values(rating).returning();
    return result[0];
  }

  async updateUserRating(ratingId: string, updateData: any): Promise<UserRating | undefined> {
    const result = await db.update(schema.userRatings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(schema.userRatings.id, ratingId))
      .returning();
    return result[0];
  }

  async deleteUserRating(ratingId: string): Promise<boolean> {
    const result = await db.delete(schema.userRatings).where(eq(schema.userRatings.id, ratingId));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Review interaction methods
  async createReviewInteraction(interaction: InsertReviewInteraction): Promise<ReviewInteraction> {
    const result = await db.insert(schema.reviewInteractions).values(interaction).returning();
    return result[0];
  }

  async incrementHelpfulCount(reviewId: string): Promise<void> {
    await db.update(schema.userRatings)
      .set({ helpfulCount: drizzleSql`${schema.userRatings.helpfulCount} + 1` })
      .where(eq(schema.userRatings.id, reviewId));
  }

  // Watchlist methods
  async getUserWatchlist(userId: string): Promise<UserWatchlist[]> {
    return await db.select().from(schema.userWatchlist).where(eq(schema.userWatchlist.userId, userId));
  }

  async addToWatchlist(watchlistItem: InsertUserWatchlist): Promise<UserWatchlist> {
    const result = await db.insert(schema.userWatchlist).values(watchlistItem).returning();
    return result[0];
  }

  async removeFromWatchlist(userId: string, tmdbId: string): Promise<boolean> {
    const result = await db.delete(schema.userWatchlist).where(
      and(
        eq(schema.userWatchlist.userId, userId),
        eq(schema.userWatchlist.tmdbId, parseInt(tmdbId))
      )
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Favorites methods
  async getUserFavorites(userId: string): Promise<any[]> {
    return await db.select().from(schema.userFavorites).where(eq(schema.userFavorites.userId, userId));
  }

  async addToFavorites(favoriteItem: any): Promise<any> {
    const result = await db.insert(schema.userFavorites).values(favoriteItem).returning();
    return result[0];
  }

  async removeFromFavorites(userId: string, tmdbId: string): Promise<boolean> {
    const result = await db.delete(schema.userFavorites).where(
      and(
        eq(schema.userFavorites.userId, userId),
        eq(schema.userFavorites.tmdbId, parseInt(tmdbId))
      )
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Community methods
  async getUserCommunities(userId: string): Promise<UserCommunity[]> {
    return await db.select().from(schema.userCommunities).where(eq(schema.userCommunities.userId, userId));
  }

  // Viewing history methods
  async getUserViewingHistory(userId: string): Promise<ViewingHistory[]> {
    return await db.select().from(schema.viewingHistory).where(eq(schema.viewingHistory.userId, userId));
  }

  async createViewingHistory(viewingHistory: any): Promise<ViewingHistory> {
    const result = await db.insert(schema.viewingHistory).values(viewingHistory).returning();
    return result[0];
  }

  async removeWatchedItem(userId: string, tmdbId: number): Promise<boolean> {
    const result = await db.delete(schema.viewingHistory).where(
      and(
        eq(schema.viewingHistory.userId, userId),
        eq(schema.viewingHistory.tmdbId, tmdbId)
      )
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Recommendation methods
  async getUserRecommendations(userId: string): Promise<Recommendation[]> {
    return await db.select().from(schema.recommendations).where(eq(schema.recommendations.userId, userId));
  }

  // User-submitted recommendations methods
  async getUserRecommendationsForMedia(forTmdbId: number, forMediaType: string): Promise<any[]> {
    return await db.select().from(schema.userRecommendations).where(
      and(
        eq(schema.userRecommendations.forTmdbId, forTmdbId),
        eq(schema.userRecommendations.forMediaType, forMediaType)
      )
    );
  }

  async createUserRecommendation(recommendation: any): Promise<any> {
    const result = await db.insert(schema.userRecommendations).values(recommendation).returning();
    return result[0];
  }

  async deleteUserRecommendation(recommendationId: string, userId: string): Promise<boolean> {
    const result = await db.delete(schema.userRecommendations).where(
      and(
        eq(schema.userRecommendations.id, recommendationId),
        eq(schema.userRecommendations.userId, userId)
      )
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getUserSubmittedRecommendations(userId: string): Promise<any[]> {
    return await db.select().from(schema.userRecommendations).where(eq(schema.userRecommendations.userId, userId));
  }

  // TMDB Movies Cache methods
  async getTmdbMovie(tmdbId: number, mediaType: string): Promise<any | undefined> {
    const result = await db.select().from(schema.tmdbMovies).where(
      and(
        eq(schema.tmdbMovies.tmdbId, tmdbId),
        eq(schema.tmdbMovies.mediaType, mediaType)
      )
    );
    return result[0];
  }

  async getTmdbMovies(limit: number = 100, offset: number = 0): Promise<any[]> {
    return await db.select().from(schema.tmdbMovies)
      .orderBy(desc(schema.tmdbMovies.popularity))
      .limit(limit)
      .offset(offset);
  }

  async createTmdbMovie(movie: any): Promise<any> {
    const result = await db.insert(schema.tmdbMovies).values(movie).returning();
    return result[0];
  }

  async updateTmdbMovie(id: string, movieData: any): Promise<any | undefined> {
    const result = await db.update(schema.tmdbMovies)
      .set({ ...movieData, updatedAt: new Date() })
      .where(eq(schema.tmdbMovies.id, id))
      .returning();
    return result[0];
  }

  async searchTmdbMovies(query: string, limit: number = 20): Promise<any[]> {
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    return await db.select().from(schema.tmdbMovies).where(
      drizzleSql`LOWER(${schema.tmdbMovies.title}) LIKE ${lowercaseQuery} OR 
                 LOWER(${schema.tmdbMovies.overview}) LIKE ${lowercaseQuery}`
    ).limit(limit);
  }

  async getTmdbMoviesByIds(tmdbIds: number[], mediaType: string): Promise<any[]> {
    if (tmdbIds.length === 0) return [];
    
    return await db.select().from(schema.tmdbMovies).where(
      and(
        drizzleSql`${schema.tmdbMovies.tmdbId} = ANY(${tmdbIds})`,
        eq(schema.tmdbMovies.mediaType, mediaType)
      )
    );
  }
}

export const storage = new DatabaseStorage();
