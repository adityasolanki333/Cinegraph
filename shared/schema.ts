import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, jsonb, boolean, index, unique, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Custom vector type for pgvector support
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(768)';
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
  fromDriver(value: string): number[] {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value as any;
  },
});

// Session storage table for authentication
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  }
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  password: varchar("password"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  bio: text("bio"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const movies = pgTable("movies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  year: integer("year").notNull(),
  genre: text("genre").notNull(),
  rating: real("rating").notNull(),
  synopsis: text("synopsis"),
  posterUrl: text("poster_url"),
  director: text("director"),
  cast: text("cast").array(),
  duration: integer("duration"), // in minutes
  type: text("type").notNull().default("movie"), // "movie" or "tv"
  seasons: integer("seasons"), // for TV shows
});

export const userRatings = pgTable("user_ratings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(), // TMDB movie/TV show ID
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  title: text("title").notNull(), // Store title for easy display
  posterPath: text("poster_path"), // Store poster for easy display
  rating: integer("rating").notNull(), // 1-10 scale to match TMDB
  review: text("review"),
  sentimentScore: real("sentiment_score"), // -1 to 1 (negative to positive)
  sentimentLabel: text("sentiment_label"), // "positive", "negative", "neutral"
  helpfulCount: integer("helpful_count").default(0), // How many users found this helpful
  isVerifiedPurchase: boolean("is_verified_purchase").default(false), // If user watched the content
  isPublic: boolean("is_public").default(true), // Privacy setting
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_user_ratings_user_id").on(table.userId),
  tmdbIdIdx: index("idx_user_ratings_tmdb_id").on(table.tmdbId),
  createdAtIdx: index("idx_user_ratings_created_at").on(table.createdAt.desc()),
  tmdbMediaIdx: index("idx_user_ratings_tmdb_media").on(table.tmdbId, table.mediaType),
}));

export const userWatchlist = pgTable("user_watchlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(), // TMDB movie/TV show ID
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  title: text("title").notNull(), // Store title for easy display
  posterPath: text("poster_path"), // Store poster for easy display
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_user_watchlist_user_id").on(table.userId),
  tmdbIdIdx: index("idx_user_watchlist_tmdb_id").on(table.tmdbId),
}));

export const userFavorites = pgTable("user_favorites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(), // TMDB movie/TV show ID
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  title: text("title").notNull(), // Store title for easy display
  posterPath: text("poster_path"), // Store poster for easy display
  addedAt: timestamp("added_at").defaultNow(),
});

export const userCommunities = pgTable("user_communities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  communityName: text("community_name").notNull(),
  matchPercentage: integer("match_percentage").notNull(),
  memberCount: integer("member_count").notNull(),
});

export const viewingHistory = pgTable("viewing_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(), // TMDB movie/TV show ID
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  title: text("title").notNull(), // Store title for easy display
  posterPath: text("poster_path"), // Store poster for easy display
  watchedAt: timestamp("watched_at").defaultNow(),
  watchDuration: integer("watch_duration"), // in minutes
});

export const recommendations = pgTable("recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(), // TMDB movie/TV show ID
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  title: text("title").notNull(),
  posterPath: text("poster_path"),
  recommendationType: text("recommendation_type").notNull(), // "collaborative", "content", "ai", "hybrid"
  reason: text("reason").notNull(),
  confidence: real("confidence").notNull(), // 0-1 confidence score
  relevanceScore: real("relevance_score").notNull(), // 0-1 relevance to user preferences
  userInteracted: boolean("user_interacted").default(false), // Has user clicked/viewed
  userFeedback: text("user_feedback"), // "liked", "disliked", "not_interested"
  aiExplanation: text("ai_explanation"), // AI-generated explanation
  sourceData: jsonb("source_data"), // Store metadata about recommendation source
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// New table for user preferences and recommendation training
export const userPreferences = pgTable("user_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  preferredGenres: text("preferred_genres").array().default([]),
  dislikedGenres: text("disliked_genres").array().default([]),
  preferredDecades: text("preferred_decades").array().default([]),
  preferredRatings: text("preferred_ratings").array().default([]), // G, PG, PG-13, R
  moodPreferences: jsonb("mood_preferences"), // Store mood-based preferences
  actorPreferences: text("actor_preferences").array().default([]),
  directorPreferences: text("director_preferences").array().default([]),
  languagePreferences: text("language_preferences").array().default([]),
  durationPreference: text("duration_preference"), // "short", "medium", "long"
  recommendationFrequency: text("recommendation_frequency").default("daily"), // "hourly", "daily", "weekly"
  lastRecommendationUpdate: timestamp("last_recommendation_update").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Table for tracking recommendation performance and learning
export const recommendationMetrics = pgTable("recommendation_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommendationId: varchar("recommendation_id").notNull().references(() => recommendations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  clickedAt: timestamp("clicked_at"),
  viewDuration: integer("view_duration"), // seconds spent viewing recommendation details
  addedToWatchlist: boolean("added_to_watchlist").default(false),
  addedToWatchlistAt: timestamp("added_to_watchlist_at"),
  actuallyWatched: boolean("actually_watched").default(false),
  watchedAt: timestamp("watched_at"),
  userRating: integer("user_rating"), // If user rated after watching
  effectivenessScore: real("effectiveness_score"), // Calculated recommendation effectiveness
  createdAt: timestamp("created_at").defaultNow(),
});

// Table for collaborative filtering similarity scores
export const userSimilarity = pgTable("user_similarity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId1: varchar("user_id_1").notNull().references(() => users.id),
  userId2: varchar("user_id_2").notNull().references(() => users.id),
  similarityScore: real("similarity_score").notNull(), // 0-1 similarity score
  commonMovies: integer("common_movies").notNull(), // Number of movies both users interacted with
  calculatedAt: timestamp("calculated_at").defaultNow(),
});

// New table for review interactions (likes, replies, reports)
export const reviewInteractions = pgTable("review_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reviewId: varchar("review_id").notNull().references(() => userRatings.id),
  interactionType: text("interaction_type").notNull(), // "helpful", "not_helpful", "report", "reply"
  createdAt: timestamp("created_at").defaultNow(),
});

// User-submitted recommendations: "If you like X, watch Y"
export const userRecommendations = pgTable("user_recommendations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  forTmdbId: integer("for_tmdb_id").notNull(), // The movie/show this recommendation is FOR
  forMediaType: text("for_media_type").notNull(), // "movie" or "tv"
  recommendedTmdbId: integer("recommended_tmdb_id").notNull(), // The movie/show being recommended
  recommendedMediaType: text("recommended_media_type").notNull(), // "movie" or "tv"
  recommendedTitle: text("recommended_title").notNull(), // Cached for display
  recommendedPosterPath: text("recommended_poster_path"), // Cached for display
  reason: text("reason"), // Optional reason for recommendation
  createdAt: timestamp("created_at").defaultNow(),
});

// Votes on user recommendations (likes/dislikes)
export const recommendationVotes = pgTable("recommendation_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  recommendationId: varchar("recommendation_id").notNull().references(() => userRecommendations.id),
  voteType: text("vote_type").notNull(), // "like" or "dislike"
  createdAt: timestamp("created_at").defaultNow(),
});

// Comments on user recommendations
export const recommendationComments = pgTable("recommendation_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  recommendationId: varchar("recommendation_id").notNull().references(() => userRecommendations.id),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Enhanced analytics for sentiment tracking
export const sentimentAnalytics = pgTable("sentiment_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  avgSentimentScore: real("avg_sentiment_score").notNull(),
  totalReviews: integer("total_reviews").notNull(),
  positiveCount: integer("positive_count").notNull(),
  negativeCount: integer("negative_count").notNull(),
  neutralCount: integer("neutral_count").notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

// User follows table - track who follows who
export const userFollows = pgTable("user_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  followerId: varchar("follower_id").notNull().references(() => users.id), // The user who is following
  followingId: varchar("following_id").notNull().references(() => users.id), // The user being followed
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  followerFollowingIdx: index("idx_user_follows_follower_following").on(table.followerId, table.followingId),
}));

// Review comments table - comments on reviews
export const reviewComments = pgTable("review_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reviewId: varchar("review_id").notNull().references(() => userRatings.id),
  comment: text("comment").notNull(),
  parentCommentId: varchar("parent_comment_id"), // For threaded replies - self-reference
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  reviewCreatedIdx: index("idx_review_comments_review_created").on(table.reviewId, table.createdAt.desc()),
}));

// Review awards/reactions table - awards given to reviews (Outstanding 🏆, Perfect 🎉, etc.)
export const reviewAwards = pgTable("review_awards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reviewId: varchar("review_id").notNull().references(() => userRatings.id),
  awardType: text("award_type").notNull(), // "outstanding", "perfect", "great", "helpful"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  reviewUserIdx: index("idx_review_awards_review_user").on(table.reviewId, table.userId),
}));

// User lists table - curated movie/TV lists created by users
export const userLists = pgTable("user_lists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  isPublic: boolean("is_public").default(true),
  followerCount: integer("follower_count").default(0),
  itemCount: integer("item_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userPublicIdx: index("idx_user_lists_user_public").on(table.userId, table.isPublic),
}));

// List items table - items in user lists
export const listItems = pgTable("list_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listId: varchar("list_id").notNull().references(() => userLists.id),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  title: text("title").notNull(),
  posterPath: text("poster_path"),
  note: text("note"), // Optional note about why this item is in the list
  position: integer("position").default(0), // For ordering items in list
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  listPositionIdx: index("idx_list_items_list_position").on(table.listId, table.position),
}));

// List follows table - track who follows which lists
export const listFollows = pgTable("list_follows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  listId: varchar("list_id").notNull().references(() => userLists.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// User activity stats table - track user activity for level calculation
export const userActivityStats = pgTable("user_activity_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  totalReviews: integer("total_reviews").default(0),
  totalLists: integer("total_lists").default(0),
  totalFollowers: integer("total_followers").default(0),
  totalFollowing: integer("total_following").default(0),
  totalAwardsGiven: integer("total_awards_given").default(0),
  totalAwardsReceived: integer("total_awards_received").default(0),
  totalComments: integer("total_comments").default(0),
  userLevel: integer("user_level").default(1), // User level based on activity
  experiencePoints: integer("experience_points").default(0), // XP for level calculation
  lastActivityAt: timestamp("last_activity_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Dynamic weight learning tables for next-gen recommendation engine
export const featureWeights = pgTable("feature_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // null for global weights
  featureName: text("feature_name").notNull(), // "genre_match", "rating_quality", "collaborative_boost", etc.
  weight: real("weight").notNull().default(0.5), // Current learned weight (0-1)
  successCount: integer("success_count").default(0), // Number of successful recommendations using this feature
  totalCount: integer("total_count").default(0), // Total recommendations using this feature
  successRate: real("success_rate").default(0), // successCount / totalCount
  learningRate: real("learning_rate").default(0.1), // How quickly to adapt this weight
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userFeatureIdx: index("idx_feature_weights_user_feature").on(table.userId, table.featureName),
}));

// Track feature contributions to recommendation outcomes
export const featureContributions = pgTable("feature_contributions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommendationId: varchar("recommendation_id").notNull().references(() => recommendations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  featureName: text("feature_name").notNull(),
  contributionScore: real("contribution_score").notNull(), // How much this feature contributed (0-1)
  featureValue: real("feature_value"), // The actual value of the feature at recommendation time
  wasSuccessful: boolean("was_successful"), // Whether the recommendation was successful
  outcomeType: text("outcome_type"), // "clicked", "watchlisted", "rated_high", "ignored", "dismissed"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  recommendationFeatureIdx: index("idx_feature_contributions_rec_feature").on(table.recommendationId, table.featureName),
}));

// User embeddings for Two-Tower model
export const userEmbeddings = pgTable("user_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id).unique(),
  embedding: real("embedding").array().notNull(), // Dense vector representation
  embeddingVersion: text("embedding_version").notNull().default("v1"), // Track model version
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Item (movie/TV) embeddings for Two-Tower model
export const itemEmbeddings = pgTable("item_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  embedding: real("embedding").array().notNull(), // Dense vector representation
  embeddingVersion: text("embedding_version").notNull().default("v1"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tmdbMediaIdx: index("idx_item_embeddings_tmdb_media").on(table.tmdbId, table.mediaType),
}));

// Semantic embeddings for enhanced NLP search (Phase 12)
export const semanticEmbeddings = pgTable("semantic_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(), // 'movie' or 'tv'
  embedding: jsonb("embedding").notNull(), // 512-dim array stored as JSONB
  textSource: text("text_source").notNull(), // title + overview for debugging
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tmdbMediaUnique: unique("semantic_embeddings_tmdb_media_unique").on(table.tmdbId, table.mediaType),
  tmdbMediaIdx: index("idx_semantic_embeddings_tmdb_media").on(table.tmdbId, table.mediaType),
}));

// Contextual bandit experiments for exploration/exploitation
export const banditExperiments = pgTable("bandit_experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  experimentType: text("experiment_type").notNull(), // "epsilon_greedy", "thompson_sampling", "ucb"
  armChosen: text("arm_chosen").notNull(), // Which recommendation strategy was chosen
  reward: real("reward"), // Reward received (0-1, or null if not yet determined)
  context: jsonb("context"), // User context at time of decision
  explorationRate: real("exploration_rate"), // Epsilon value or exploration parameter
  createdAt: timestamp("created_at").defaultNow(),
});

// TMDB Training Data - comprehensive movie dataset for ML model training
export const tmdbTrainingData = pgTable("tmdb_training_data", {
  id: integer("id").primaryKey(), // TMDB movie ID
  title: text("title").notNull(),
  originalTitle: text("original_title"),
  voteAverage: real("vote_average"),
  voteCount: real("vote_count"),
  status: text("status"),
  releaseDate: text("release_date"),
  revenue: real("revenue"),
  runtime: real("runtime"),
  budget: real("budget"),
  imdbId: text("imdb_id"),
  originalLanguage: text("original_language"),
  overview: text("overview"),
  popularity: real("popularity"),
  tagline: text("tagline"),
  genres: text("genres"), // CSV string
  productionCompanies: text("production_companies"), // CSV string
  productionCountries: text("production_countries"), // CSV string
  spokenLanguages: text("spoken_languages"), // CSV string
  cast: text("cast"), // CSV string
  director: text("director"),
  directorOfPhotography: text("director_of_photography"),
  writers: text("writers"), // CSV string
  producers: text("producers"), // CSV string
  musicComposer: text("music_composer"),
  imdbRating: real("imdb_rating"),
  imdbVotes: real("imdb_votes"),
  posterPath: text("poster_path"),
}, (table) => ({
  genreIdx: index("idx_tmdb_genres").on(table.genres),
  popularityIdx: index("idx_tmdb_popularity").on(table.popularity),
  releaseDateIdx: index("idx_tmdb_release_date").on(table.releaseDate),
}));

// TMDB Movies Cache - persistent storage for TMDB API responses
export const tmdbMovies = pgTable("tmdb_movies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(), // 'movie' or 'tv'
  title: text("title").notNull(),
  overview: text("overview"),
  posterPath: text("poster_path"),
  backdropPath: text("backdrop_path"),
  releaseDate: text("release_date"), // YYYY-MM-DD string from TMDB
  voteAverage: real("vote_average"),
  voteCount: integer("vote_count"),
  popularity: real("popularity"),
  genreIds: integer("genre_ids").array(),
  originalLanguage: text("original_language"),
  adult: boolean("adult").default(false),
  rawData: jsonb("raw_data"), // Store full TMDB response
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tmdbIdMediaTypeUnique: unique("tmdb_movies_tmdb_id_media_type_unique").on(table.tmdbId, table.mediaType),
  tmdbIdIdx: index("idx_tmdb_movies_tmdb_id").on(table.tmdbId),
  mediaTypeIdx: index("idx_tmdb_movies_media_type").on(table.mediaType),
  popularityIdx: index("idx_tmdb_movies_popularity").on(table.popularity),
}));

// ============================================================================
// Phase 12+ Schema: Advanced ML Features (Text-Only)
// ============================================================================

// Tone-of-voice analysis results - Phase 12
export const toneAnalysis = pgTable("tone_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  query: text("query").notNull(),
  userId: varchar("user_id").references(() => users.id),
  detectedTone: text("detected_tone").notNull(), // 'enthusiastic', 'casual', 'professional', 'urgent', 'exploratory'
  confidence: real("confidence").notNull(), // 0-1 confidence score
  sentiment: text("sentiment"), // 'positive', 'negative', 'neutral'
  formalityLevel: real("formality_level"), // 0-1, informal to formal
  emotionScores: jsonb("emotion_scores"), // {joy: 0.8, anger: 0.1, ...}
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_tone_analysis_user_id").on(table.userId),
}));

// PANAS-style mood analysis - Phase 12
export const moodAnalysis = pgTable("mood_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  positiveAffect: real("positive_affect").notNull(), // PANAS positive dimension (0-10)
  negativeAffect: real("negative_affect").notNull(), // PANAS negative dimension (0-10)
  energy: real("energy").notNull(), // Energy level (0-10)
  arousal: real("arousal").notNull(), // Arousal level (0-10)
  valence: real("valence").notNull(), // Emotional valence (-5 to 5)
  detectedMoods: text("detected_moods").array(), // ['excited', 'relaxed', 'stressed']
  recommendedGenres: text("recommended_genres").array(), // Genre recommendations based on mood
  contextFactors: jsonb("context_factors"), // {timeOfDay, dayOfWeek, season, ...}
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_mood_analysis_user_id").on(table.userId),
  createdAtIdx: index("idx_mood_analysis_created_at").on(table.createdAt),
}));

// Meta-learning configurations for cold start - Phase 12
export const metaLearningConfigs = pgTable("meta_learning_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  taskEmbedding: real("task_embedding").array(), // Meta-learned task representation
  adaptationSteps: integer("adaptation_steps").notNull().default(5), // Number of gradient steps for adaptation
  learningRate: real("learning_rate").notNull().default(0.01), // Meta-learning rate
  supportSetSize: integer("support_set_size").notNull().default(5), // Number of examples for quick adaptation
  coldStartPhase: text("cold_start_phase").notNull().default("initial"), // 'initial', 'transition', 'complete'
  ratingsCount: integer("ratings_count").notNull().default(0), // Track user's rating count
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdUnique: unique("meta_learning_configs_user_id_unique").on(table.userId),
}));

// Implicit feedback logs for Neural CF 2.0 - Phase 12
export const implicitFeedback = pgTable("implicit_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  interactionType: text("interaction_type").notNull(), // 'view', 'click', 'hover', 'scroll', 'play_trailer'
  duration: integer("duration"), // Time spent (seconds)
  scrollDepth: real("scroll_depth"), // 0-1, how much of content was scrolled
  timestamp: timestamp("timestamp").defaultNow(),
  sessionId: varchar("session_id"), // Group interactions by session
  deviceType: text("device_type"), // 'mobile', 'desktop', 'tablet'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_implicit_feedback_user_id").on(table.userId),
  tmdbIdIdx: index("idx_implicit_feedback_tmdb_id").on(table.tmdbId),
  timestampIdx: index("idx_implicit_feedback_timestamp").on(table.timestamp),
}));

// Active learning prompts for strategic rating requests - Phase 12
export const activeLearningPrompts = pgTable("active_learning_prompts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  informativeness: real("informativeness").notNull(), // Expected information gain (0-1)
  uncertainty: real("uncertainty").notNull(), // Model uncertainty (0-1)
  diversity: real("diversity").notNull(), // Diversity from known preferences (0-1)
  priority: real("priority").notNull(), // Combined priority score (0-1)
  promptedAt: timestamp("prompted_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
  rating: real("rating"), // User's rating if provided
  dismissed: boolean("dismissed").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_active_learning_prompts_user_id").on(table.userId),
  priorityIdx: index("idx_active_learning_prompts_priority").on(table.priority),
}));

// Real-time session tracking for WebSocket updates - Phase 12
export const realtimeSessions = pgTable("realtime_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  sessionId: varchar("session_id").notNull().unique(),
  socketId: varchar("socket_id"),
  isActive: boolean("is_active").notNull().default(true),
  lastActivity: timestamp("last_activity").defaultNow(),
  deviceInfo: jsonb("device_info"), // {userAgent, platform, ...}
  connectedAt: timestamp("connected_at").defaultNow(),
  disconnectedAt: timestamp("disconnected_at"),
}, (table) => ({
  userIdIdx: index("idx_realtime_sessions_user_id").on(table.userId),
  sessionIdIdx: index("idx_realtime_sessions_session_id").on(table.sessionId),
  isActiveIdx: index("idx_realtime_sessions_is_active").on(table.isActive),
}));

// Cache metadata for Redis L2 - Phase 12
export const cacheMetadata = pgTable("cache_metadata", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cacheKey: varchar("cache_key").notNull().unique(),
  cacheType: text("cache_type").notNull(), // 'recommendations', 'embeddings', 'user_profile'
  userId: varchar("user_id").references(() => users.id),
  dataSize: integer("data_size"), // Size in bytes
  hitCount: integer("hit_count").notNull().default(0),
  missCount: integer("miss_count").notNull().default(0),
  lastAccessed: timestamp("last_accessed").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  cacheKeyIdx: index("idx_cache_metadata_cache_key").on(table.cacheKey),
  expiresAtIdx: index("idx_cache_metadata_expires_at").on(table.expiresAt),
}));

// Social graph edges for friend recommendations - Phase 12
export const socialConnections = pgTable("social_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  friendId: varchar("friend_id").notNull().references(() => users.id),
  connectionType: text("connection_type").notNull().default("friend"), // 'friend', 'follower', 'following'
  trustScore: real("trust_score").notNull().default(0.5), // Social trust weight (0-1)
  tasteAlignment: real("taste_alignment"), // Similarity in movie preferences (0-1)
  interactionCount: integer("interaction_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userFriendUnique: unique("social_connections_user_friend_unique").on(table.userId, table.friendId),
  userIdIdx: index("idx_social_connections_user_id").on(table.userId),
  friendIdIdx: index("idx_social_connections_friend_id").on(table.friendId),
}));

// RL replay buffer for DQN - Phase 12
export const rlReplayBuffer = pgTable("rl_replay_buffer", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  state: jsonb("state").notNull(), // Current state representation
  action: text("action").notNull(), // Action taken (recommendation shown)
  reward: real("reward").notNull(), // Reward received
  nextState: jsonb("next_state").notNull(), // Resulting state
  done: boolean("done").notNull().default(false), // Terminal state flag
  priority: real("priority").default(1.0), // Prioritized experience replay weight
  timestep: integer("timestep").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdIdx: index("idx_rl_replay_buffer_user_id").on(table.userId),
  priorityIdx: index("idx_rl_replay_buffer_priority").on(table.priority),
  timestepIdx: index("idx_rl_replay_buffer_timestep").on(table.timestep),
}));

// DQN model checkpoints - Phase 12
export const dqnCheckpoints = pgTable("dqn_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  version: integer("version").notNull().unique(),
  modelWeights: text("model_weights").notNull(), // Serialized model weights
  targetWeights: text("target_weights"), // Target network weights
  epsilon: real("epsilon").notNull(), // Exploration rate at checkpoint
  totalReward: real("total_reward"), // Cumulative reward
  episodeCount: integer("episode_count").notNull(),
  performance: jsonb("performance"), // {avgReward, successRate, ...}
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  versionIdx: index("idx_dqn_checkpoints_version").on(table.version),
}));


export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User types for authentication
export type UpsertUser = typeof users.$inferInsert;

export const insertMovieSchema = createInsertSchema(movies).omit({
  id: true,
});

export const insertUserRatingSchema = createInsertSchema(userRatings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  sentimentScore: true,
  sentimentLabel: true,
  helpfulCount: true,
});

export const insertUserWatchlistSchema = createInsertSchema(userWatchlist).omit({
  id: true,
  addedAt: true,
});

export const insertUserFavoritesSchema = createInsertSchema(userFavorites).omit({
  id: true,
  addedAt: true,
});

export const insertReviewInteractionSchema = createInsertSchema(reviewInteractions).omit({
  id: true,
  createdAt: true,
});

export const insertSentimentAnalyticsSchema = createInsertSchema(sentimentAnalytics).omit({
  id: true,
  lastUpdated: true,
});

export const insertRecommendationSchema = createInsertSchema(recommendations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastRecommendationUpdate: true,
});

export const insertRecommendationMetricsSchema = createInsertSchema(recommendationMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertUserSimilaritySchema = createInsertSchema(userSimilarity).omit({
  id: true,
  calculatedAt: true,
});

export const insertViewingHistorySchema = createInsertSchema(viewingHistory).omit({
  id: true,
  watchedAt: true,
});

export const insertUserRecommendationSchema = createInsertSchema(userRecommendations).omit({
  id: true,
  createdAt: true,
});

export const insertRecommendationVoteSchema = createInsertSchema(recommendationVotes).omit({
  id: true,
  createdAt: true,
});

export const insertRecommendationCommentSchema = createInsertSchema(recommendationComments).omit({
  id: true,
  createdAt: true,
});

export const insertUserFollowSchema = createInsertSchema(userFollows).omit({
  id: true,
  createdAt: true,
});

export const insertReviewCommentSchema = createInsertSchema(reviewComments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReviewAwardSchema = createInsertSchema(reviewAwards).omit({
  id: true,
  createdAt: true,
});

export const insertUserListSchema = createInsertSchema(userLists).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  followerCount: true,
  itemCount: true,
});

export const insertListItemSchema = createInsertSchema(listItems).omit({
  id: true,
  addedAt: true,
});

export const insertListFollowSchema = createInsertSchema(listFollows).omit({
  id: true,
  createdAt: true,
});

export const insertUserActivityStatsSchema = createInsertSchema(userActivityStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastActivityAt: true,
});

// Insert schemas for dynamic learning tables
export const insertFeatureWeightSchema = createInsertSchema(featureWeights).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
  successCount: true,
  totalCount: true,
  successRate: true,
});

export const insertFeatureContributionSchema = createInsertSchema(featureContributions).omit({
  id: true,
  createdAt: true,
});

export const insertUserEmbeddingSchema = createInsertSchema(userEmbeddings).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertItemEmbeddingSchema = createInsertSchema(itemEmbeddings).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});

export const insertBanditExperimentSchema = createInsertSchema(banditExperiments).omit({
  id: true,
  createdAt: true,
});

export const insertTmdbTrainingDataSchema = createInsertSchema(tmdbTrainingData);

export const insertTmdbMovieSchema = createInsertSchema(tmdbMovies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Movie = typeof movies.$inferSelect;
export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type UserRating = typeof userRatings.$inferSelect;
export type InsertUserRating = z.infer<typeof insertUserRatingSchema>;
export type UserWatchlist = typeof userWatchlist.$inferSelect;
export type InsertUserWatchlist = z.infer<typeof insertUserWatchlistSchema>;
export type UserFavorites = typeof userFavorites.$inferSelect;
export type InsertUserFavorites = z.infer<typeof insertUserFavoritesSchema>;
export type UserCommunity = typeof userCommunities.$inferSelect;
export type ViewingHistory = typeof viewingHistory.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;
export type ReviewInteraction = typeof reviewInteractions.$inferSelect;
export type InsertReviewInteraction = z.infer<typeof insertReviewInteractionSchema>;
export type SentimentAnalytics = typeof sentimentAnalytics.$inferSelect;
export type InsertSentimentAnalytics = z.infer<typeof insertSentimentAnalyticsSchema>;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type RecommendationMetrics = typeof recommendationMetrics.$inferSelect;
export type InsertRecommendationMetrics = z.infer<typeof insertRecommendationMetricsSchema>;
export type UserSimilarity = typeof userSimilarity.$inferSelect;
export type InsertUserSimilarity = z.infer<typeof insertUserSimilaritySchema>;
export type InsertViewingHistory = z.infer<typeof insertViewingHistorySchema>;
export type UserRecommendation = typeof userRecommendations.$inferSelect;
export type InsertUserRecommendation = z.infer<typeof insertUserRecommendationSchema>;
export type RecommendationVote = typeof recommendationVotes.$inferSelect;
export type InsertRecommendationVote = z.infer<typeof insertRecommendationVoteSchema>;
export type RecommendationComment = typeof recommendationComments.$inferSelect;
export type InsertRecommendationComment = z.infer<typeof insertRecommendationCommentSchema>;
export type UserFollow = typeof userFollows.$inferSelect;
export type InsertUserFollow = z.infer<typeof insertUserFollowSchema>;
export type ReviewComment = typeof reviewComments.$inferSelect;
export type InsertReviewComment = z.infer<typeof insertReviewCommentSchema>;
export type ReviewAward = typeof reviewAwards.$inferSelect;
export type InsertReviewAward = z.infer<typeof insertReviewAwardSchema>;
export type UserList = typeof userLists.$inferSelect;
export type InsertUserList = z.infer<typeof insertUserListSchema>;
export type ListItem = typeof listItems.$inferSelect;
export type InsertListItem = z.infer<typeof insertListItemSchema>;
export type ListFollow = typeof listFollows.$inferSelect;
export type InsertListFollow = z.infer<typeof insertListFollowSchema>;
export type UserActivityStats = typeof userActivityStats.$inferSelect;
export type InsertUserActivityStats = z.infer<typeof insertUserActivityStatsSchema>;
export type FeatureWeight = typeof featureWeights.$inferSelect;
export type InsertFeatureWeight = z.infer<typeof insertFeatureWeightSchema>;
export type FeatureContribution = typeof featureContributions.$inferSelect;
export type InsertFeatureContribution = z.infer<typeof insertFeatureContributionSchema>;
export type UserEmbedding = typeof userEmbeddings.$inferSelect;
export type InsertUserEmbedding = z.infer<typeof insertUserEmbeddingSchema>;
export type ItemEmbedding = typeof itemEmbeddings.$inferSelect;
export type InsertItemEmbedding = z.infer<typeof insertItemEmbeddingSchema>;
export type BanditExperiment = typeof banditExperiments.$inferSelect;
export type InsertBanditExperiment = z.infer<typeof insertBanditExperimentSchema>;
export type TmdbMovie = typeof tmdbMovies.$inferSelect;
export type InsertTmdbMovie = z.infer<typeof insertTmdbMovieSchema>;

// Notifications table - for user notifications (follows, comments, awards, list updates)
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id), // User receiving the notification
  actorId: varchar("actor_id").references(() => users.id), // User who triggered the notification
  type: text("type").notNull(), // "follow", "comment", "award", "list_update", "list_follow", "badge_earned"
  entityType: text("entity_type"), // "review", "list", "comment", "user", etc.
  entityId: varchar("entity_id"), // ID of the entity (review, list, etc.)
  message: text("message").notNull(), // Notification message
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userReadCreatedIdx: index("idx_notifications_user_read_created").on(table.userId, table.isRead, table.createdAt.desc()),
}));

// List collaborators table - for shared list editing
export const listCollaborators = pgTable("list_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  listId: varchar("list_id").notNull().references(() => userLists.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  permission: text("permission").notNull().default("editor"), // "editor" or "viewer"
  invitedBy: varchar("invited_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// User badges/achievements table
export const userBadges = pgTable("user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  badgeType: text("badge_type").notNull(), // "first_review", "100_reviews", "list_creator", "social_butterfly", "critic", "binge_watcher", etc.
  badgeName: text("badge_name").notNull(),
  badgeDescription: text("badge_description").notNull(),
  badgeIcon: text("badge_icon"), // Icon/emoji for the badge
  earnedAt: timestamp("earned_at").defaultNow(),
});

// Insert schemas for new tables
export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertListCollaboratorSchema = createInsertSchema(listCollaborators).omit({
  id: true,
  createdAt: true,
});

export const insertUserBadgeSchema = createInsertSchema(userBadges).omit({
  id: true,
  earnedAt: true,
});

// Types for new tables
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type ListCollaborator = typeof listCollaborators.$inferSelect;
export type InsertListCollaborator = z.infer<typeof insertListCollaboratorSchema>;
export type UserBadge = typeof userBadges.$inferSelect;
export type InsertUserBadge = z.infer<typeof insertUserBadgeSchema>;

// Analytics tables - User engagement, content tracking, growth metrics

// User engagement events table - track all user interactions
export const engagementEvents = pgTable("engagement_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  eventType: text("event_type").notNull(), // "view", "click", "search", "rate", "review", "list_create", "follow", "comment", etc.
  entityType: text("entity_type"), // "movie", "tv", "user", "list", "review"
  entityId: varchar("entity_id"), // ID of the entity
  metadata: jsonb("metadata"), // Additional event data
  sessionId: varchar("session_id"), // Track user sessions
  createdAt: timestamp("created_at").defaultNow(),
});

// Daily content statistics - aggregated daily metrics per content
export const dailyContentStats = pgTable("daily_content_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(), // "movie" or "tv"
  date: timestamp("date").notNull(),
  views: integer("views").default(0),
  ratings: integer("ratings").default(0),
  avgRating: real("avg_rating").default(0),
  reviews: integer("reviews").default(0),
  watchlistAdds: integer("watchlist_adds").default(0),
  listAdds: integer("list_adds").default(0), // Times added to user lists
  recommendationClicks: integer("recommendation_clicks").default(0),
  trendingScore: real("trending_score").default(0), // Calculated trending score
});

// User daily activity - aggregated daily user activity
export const dailyUserActivity = pgTable("daily_user_activity", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: timestamp("date").notNull(),
  pageViews: integer("page_views").default(0),
  contentViews: integer("content_views").default(0), // Movies/TV pages viewed
  searchQueries: integer("search_queries").default(0),
  ratingsGiven: integer("ratings_given").default(0),
  reviewsWritten: integer("reviews_written").default(0),
  listsCreated: integer("lists_created").default(0),
  commentsPosted: integer("comments_posted").default(0),
  awardsGiven: integer("awards_given").default(0),
  sessionDuration: integer("session_duration").default(0), // minutes
});

// Recommendation performance - track how effective recommendations are
export const recommendationPerformance = pgTable("recommendation_performance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recommendationType: text("recommendation_type").notNull(), // "ai", "similar_users", "trending", "personalized"
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  impressions: integer("impressions").default(0), // How many times shown
  clicks: integer("clicks").default(0),
  watchlistAdds: integer("watchlist_adds").default(0),
  ratings: integer("ratings").default(0),
  avgRating: real("avg_rating").default(0),
  clickThroughRate: real("click_through_rate").default(0), // clicks / impressions
  conversionRate: real("conversion_rate").default(0), // watchlist_adds / impressions
  date: timestamp("date").notNull(),
});

// Community growth metrics - track platform growth
export const communityGrowthMetrics = pgTable("community_growth_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp("date").notNull(),
  totalUsers: integer("total_users").default(0),
  newUsers: integer("new_users").default(0),
  activeUsers: integer("active_users").default(0), // Users active in last 7 days
  totalReviews: integer("total_reviews").default(0),
  newReviews: integer("new_reviews").default(0),
  totalLists: integer("total_lists").default(0),
  newLists: integer("new_lists").default(0),
  totalFollows: integer("total_follows").default(0),
  newFollows: integer("new_follows").default(0),
  totalComments: integer("total_comments").default(0),
  newComments: integer("new_comments").default(0),
  avgSessionDuration: real("avg_session_duration").default(0), // minutes
  retentionRate: real("retention_rate").default(0), // percentage
});

// Popular content rankings - updated periodically
export const popularContentRankings = pgTable("popular_content_rankings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  title: text("title").notNull(),
  posterPath: text("poster_path"),
  rankType: text("rank_type").notNull(), // "trending", "top_rated", "most_discussed", "most_listed"
  timeframe: text("timeframe").notNull(), // "daily", "weekly", "monthly", "all_time"
  rank: integer("rank").notNull(),
  score: real("score").notNull(), // Calculated ranking score
  metadata: jsonb("metadata"), // Additional ranking data (views, ratings, etc.)
  updatedAt: timestamp("updated_at").defaultNow(),
});

// A/B Testing Experiments (Phase 9)
export const abTestExperiments = pgTable("ab_test_experiments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"), // "draft", "running", "completed", "archived"
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  sampleSize: integer("sample_size").notNull(),
  confidenceLevel: real("confidence_level").notNull().default(0.95),
  winnerVariantId: varchar("winner_variant_id"),
  pValue: real("p_value"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// A/B Test Variants
export const abTestVariants = pgTable("ab_test_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").notNull().references(() => abTestExperiments.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // "tensorflow_neural", "collaborative", "content_based", "hybrid_ensemble", "trending"
  config: jsonb("config"), // Variant configuration
  trafficAllocation: real("traffic_allocation").notNull(), // 0.0 to 1.0
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  ctr: real("ctr").default(0),
  conversionRate: real("conversion_rate").default(0),
  avgEngagementTime: real("avg_engagement_time").default(0),
  returnRate7Day: real("return_rate_7_day").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// A/B Test Metrics - individual user events
export const abTestMetrics = pgTable("ab_test_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").notNull().references(() => abTestExperiments.id),
  variantId: varchar("variant_id").notNull().references(() => abTestVariants.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  metricType: text("metric_type").notNull(), // "impression", "click", "conversion", "engagement"
  metricValue: real("metric_value"), // Optional numeric value
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// A/B Test User Assignments
export const abTestUserAssignments = pgTable("ab_test_user_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  experimentId: varchar("experiment_id").notNull().references(() => abTestExperiments.id),
  variantId: varchar("variant_id").notNull().references(() => abTestVariants.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

// Diversity Metrics Tracking (Phase 9)
export const diversityMetrics = pgTable("diversity_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionId: varchar("session_id"),
  recommendationType: text("recommendation_type").notNull(), // "tensorflow", "hybrid", "collaborative", etc.
  intraDiversity: real("intra_diversity"), // Average dissimilarity within results
  genreBalance: real("genre_balance"), // Shannon entropy
  serendipityScore: real("serendipity_score"), // % of unexpected recommendations
  explorationRate: real("exploration_rate"), // % from exploration
  coverageScore: real("coverage_score"), // % of unique genres/categories
  diversityConfig: jsonb("diversity_config"), // Config used (lambda, epsilon, etc.)
  recommendationCount: integer("recommendation_count"),
  createdAt: timestamp("created_at").defaultNow(),
});

// MovieLens Dataset Tables (for ML training)
export const movielensRatings = pgTable("movielens_ratings", {
  userId: integer("user_id").notNull(),
  movieId: integer("movie_id").notNull(),
  rating: real("rating").notNull(),
  timestamp: integer("timestamp"),
}, (table) => ({
  pk: { columns: [table.userId, table.movieId] },
}));

export const movielensMovies = pgTable("movielens_movies", {
  movieId: integer("movie_id").primaryKey(),
  title: text("title").notNull(),
  genres: text("genres"),
});

export const movielensLinks = pgTable("movielens_links", {
  movieId: integer("movie_id").primaryKey(),
  imdbId: text("imdb_id"),
  tmdbId: integer("tmdb_id"),
});

export const movielensTags = pgTable("movielens_tags", {
  id: varchar("id").primaryKey(),
  userId: integer("user_id").notNull(),
  movieId: integer("movie_id").notNull(),
  tag: text("tag").notNull(),
  timestamp: integer("timestamp").notNull(),
});

// Rotten Tomatoes Dataset Tables (for ML training)
export const rottenTomatoesReviews = pgTable("rotten_tomatoes_reviews", {
  id: varchar("id").primaryKey(),
  movieId: text("movie_id"),
  reviewId: text("review_id"),
  creationDate: text("creation_date"),
  criticName: text("critic_name"),
  isTopCritic: boolean("is_top_critic"),
  originalScore: text("original_score"),
  scoreSentiment: text("score_sentiment"),
  reviewState: text("review_state"),
  publicationName: text("publication_name"),
  reviewText: text("review_text"),
});

export const rottenTomatoesMovies = pgTable("rotten_tomatoes_movies", {
  id: varchar("id").primaryKey(),
  movieId: text("movie_id"),
  movieTitle: text("movie_title"),
  movieInfo: text("movie_info"),
  audienceScore: integer("audience_score"),
  tomatoMeter: integer("tomato_meter"),
});

// Insert schemas for analytics tables
export const insertEngagementEventSchema = createInsertSchema(engagementEvents).omit({
  id: true,
  createdAt: true,
});

export const insertDailyContentStatsSchema = createInsertSchema(dailyContentStats).omit({
  id: true,
});

export const insertDailyUserActivitySchema = createInsertSchema(dailyUserActivity).omit({
  id: true,
});

export const insertRecommendationPerformanceSchema = createInsertSchema(recommendationPerformance).omit({
  id: true,
});

export const insertCommunityGrowthMetricsSchema = createInsertSchema(communityGrowthMetrics).omit({
  id: true,
});

export const insertPopularContentRankingsSchema = createInsertSchema(popularContentRankings).omit({
  id: true,
  updatedAt: true,
});

// A/B Testing insert schemas
export const insertABTestExperimentSchema = createInsertSchema(abTestExperiments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertABTestVariantSchema = createInsertSchema(abTestVariants).omit({
  id: true,
  createdAt: true,
});

export const insertABTestMetricSchema = createInsertSchema(abTestMetrics).omit({
  id: true,
  createdAt: true,
});

export const insertABTestUserAssignmentSchema = createInsertSchema(abTestUserAssignments).omit({
  id: true,
  assignedAt: true,
});

export const insertDiversityMetricsSchema = createInsertSchema(diversityMetrics).omit({
  id: true,
  createdAt: true,
});

// Types for analytics tables
export type EngagementEvent = typeof engagementEvents.$inferSelect;
export type InsertEngagementEvent = z.infer<typeof insertEngagementEventSchema>;
export type DailyContentStats = typeof dailyContentStats.$inferSelect;
export type InsertDailyContentStats = z.infer<typeof insertDailyContentStatsSchema>;
export type DailyUserActivity = typeof dailyUserActivity.$inferSelect;
export type InsertDailyUserActivity = z.infer<typeof insertDailyUserActivitySchema>;
export type RecommendationPerformance = typeof recommendationPerformance.$inferSelect;
export type InsertRecommendationPerformance = z.infer<typeof insertRecommendationPerformanceSchema>;
export type CommunityGrowthMetrics = typeof communityGrowthMetrics.$inferSelect;
export type InsertCommunityGrowthMetrics = z.infer<typeof insertCommunityGrowthMetricsSchema>;
export type PopularContentRankings = typeof popularContentRankings.$inferSelect;
export type InsertPopularContentRankings = z.infer<typeof insertPopularContentRankingsSchema>;

// A/B Testing types
export type ABTestExperiment = typeof abTestExperiments.$inferSelect;
export type InsertABTestExperiment = z.infer<typeof insertABTestExperimentSchema>;
export type ABTestVariant = typeof abTestVariants.$inferSelect;
export type InsertABTestVariant = z.infer<typeof insertABTestVariantSchema>;
export type ABTestMetric = typeof abTestMetrics.$inferSelect;
export type InsertABTestMetric = z.infer<typeof insertABTestMetricSchema>;
export type ABTestUserAssignment = typeof abTestUserAssignments.$inferSelect;
export type InsertABTestUserAssignment = z.infer<typeof insertABTestUserAssignmentSchema>;
export type DiversityMetrics = typeof diversityMetrics.$inferSelect;
export type InsertDiversityMetrics = z.infer<typeof insertDiversityMetricsSchema>;
