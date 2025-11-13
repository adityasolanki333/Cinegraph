// ML and NLP Service Types
import type { TMDBMovie, TMDBSearchParams, TMDBDiscoverParams } from './tmdb-types';

// TensorFlow NLP Service Types
export interface TFNLPResult {
  intent: 'specific' | 'general' | 'mood' | 'genre';
  confidence: number;
  genres: string[];
  mood?: string;
  entities: {
    movies: string[];
    actors: string[];
    directors: string[];
    years: number[];
  };
  originalQuery: string;
}

export interface SemanticSearchResult {
  tmdbId: number;
  similarity: number;
  title: string;
}

// Query Analysis Types
export interface QueryAnalysis {
  mood?: string;
  genres: string[];
  keywords: string[];
  yearPreference?: number;
  descriptors: string[];
}

export interface QueryIntent {
  type: 'search' | 'recommendation' | 'discover' | 'mood' | 'genre';
  confidence: number;
  entities: {
    titles?: string[];
    actors?: string[];
    directors?: string[];
    genres?: string[];
    moods?: string[];
    years?: number[];
  };
  filters?: {
    mediaType?: string[];
    yearRange?: [number, number];
    minRating?: number;
  };
}

// Gemini Chat Service Types
export interface MovieChatResponse {
  response: string;
  movies: TMDBMovie[];
  suggestions: string[];
  source: 'tensorflow-nlp' | 'gemini-chat' | 'fallback';
}

export interface ChatContext {
  recentWatched?: TMDBMovie[];
  watchlist?: TMDBMovie[];
  favoriteActors?: string[];
}

// MovieVanders Service Types
export interface MovieVandersRequest {
  query: string;
  userId?: string;
  preferences?: {
    genres?: string[];
    mood?: string;
    yearRange?: [number, number];
    language?: string;
    includeAdult?: boolean;
  };
  context?: ChatContext;
}

export interface MovieVandersResponse {
  movies: TMDBMovie[];
  explanation: string;
  searchStrategy: string;
  confidence: number;
  suggestions: string[];
  queryInsights: {
    detectedMood?: string;
    detectedGenres: string[];
    detectedKeywords: string[];
    yearPreference?: number;
  };
}

// Advanced Search Types
export interface AdvancedSearchPreferences {
  mediaType?: ('movie' | 'tv')[];
  genres?: string[];
  yearRange?: [number, number];
  minRating?: number;
  sortBy?: 'popularity' | 'rating' | 'release_date' | 'relevance';
}

export interface AdvancedSearchResult {
  recommendations: TMDBMovie[];
  explanation: string;
  searchStrategy: string;
  metadata: {
    totalResults: number;
    queryIntent: QueryIntent;
    processingTime: number;
  };
}

// ML Recommendation Types
export interface RecommendationRequest {
  userId: string;
  limit?: number;
  includeExplanations?: boolean;
  diversityWeight?: number;
}

export interface RecommendationResult {
  tmdbId: number;
  title: string;
  mediaType: 'movie' | 'tv';
  predictedRating: number;
  confidence: number;
  explanation?: string;
  diversityScore?: number;
}

export interface RecommendationResponse {
  recommendations: RecommendationResult[];
  modelMetrics?: {
    mae: number;
    modelVersion: string;
    trainingDate: string;
  };
}

// TMDB types are imported from tmdb-types.ts (canonical source)

// Training and Model Types
export interface TrainingMetrics {
  mae: number;
  rmse: number;
  loss: number;
  validationLoss: number;
  epoch: number;
}

export interface ModelConfig {
  epochs?: number;
  batchSize?: number;
  learningRate?: number;
  validationSplit?: number;
  earlyStoppingPatience?: number;
}

export interface TrainingData {
  userId: string;
  tmdbId: number;
  rating: number;
  timestamp: number;
  genres?: number[];
  features?: number[];
}
