/**
 * ML Utility Functions
 * Feature engineering, data preprocessing, and helper functions
 */

import * as tf from '@tensorflow/tfjs-node';

/**
 * Normalize array to 0-1 range
 */
export function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  if (range === 0) return values.map(() => 0.5);
  
  return values.map(v => (v - min) / range);
}

/**
 * Standardize array to mean=0, std=1
 */
export function standardize(values: number[]): number[] {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  
  if (std === 0) return values.map(() => 0);
  
  return values.map(v => (v - mean) / std);
}

/**
 * One-hot encode categorical values
 */
export function oneHotEncode(value: number, numCategories: number): number[] {
  const encoded = new Array(numCategories).fill(0);
  if (value >= 0 && value < numCategories) {
    encoded[value] = 1;
  }
  return encoded;
}

/**
 * Multi-hot encode for multiple categories
 */
export function multiHotEncode(values: number[], numCategories: number): number[] {
  const encoded = new Array(numCategories).fill(0);
  values.forEach(value => {
    if (value >= 0 && value < numCategories) {
      encoded[value] = 1;
    }
  });
  return encoded;
}

/**
 * Create genre vector from genre IDs
 */
export function createGenreVector(genreIds: number[], allGenreIds: number[]): number[] {
  const vector = new Array(allGenreIds.length).fill(0);
  
  genreIds.forEach(genreId => {
    const idx = allGenreIds.indexOf(genreId);
    if (idx !== -1) {
      vector[idx] = 1;
    }
  });
  
  return vector;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (normA * normB);
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  
  return Math.sqrt(sum);
}

/**
 * Calculate Jaccard similarity for sets
 */
export function jaccardSimilarity(setA: Set<any>, setB: Set<any>): number {
  const arrayA = Array.from(setA);
  const arrayB = Array.from(setB);
  const intersection = new Set(arrayA.filter(x => setB.has(x)));
  const union = new Set([...arrayA, ...arrayB]);
  
  if (union.size === 0) return 0;
  
  return intersection.size / union.size;
}

/**
 * Extract temporal features from timestamp
 */
export function extractTemporalFeatures(timestamp: Date): {
  hour: number;
  dayOfWeek: number;
  isWeekend: number;
  month: number;
  season: number;
} {
  const hour = timestamp.getHours();
  const dayOfWeek = timestamp.getDay();
  const month = timestamp.getMonth();
  
  // Season: 0=Winter, 1=Spring, 2=Summer, 3=Fall
  const season = Math.floor((month % 12) / 3);
  
  return {
    hour: hour / 24, // Normalize to 0-1
    dayOfWeek: dayOfWeek / 7,
    isWeekend: (dayOfWeek === 0 || dayOfWeek === 6) ? 1 : 0,
    month: month / 12,
    season: season / 4,
  };
}

/**
 * Calculate diversity score for recommendations
 */
export function calculateDiversityScore(items: Array<{ genres?: number[] }>): number {
  if (items.length === 0) return 0;
  
  const allGenres = new Set<number>();
  items.forEach(item => {
    item.genres?.forEach(g => allGenres.add(g));
  });
  
  // Diversity = unique genres / total possible combinations
  const uniqueGenres = allGenres.size;
  const maxDiversity = items.length * 3; // Assume max 3 genres per item
  
  return Math.min(uniqueGenres / maxDiversity, 1);
}

/**
 * Apply exponential decay to values based on time
 */
export function applyTimeDecay(
  values: number[],
  timestamps: Date[],
  decayRate: number = 0.95
): number[] {
  const now = Date.now();
  
  return values.map((value, idx) => {
    const ageInDays = (now - timestamps[idx].getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.pow(decayRate, ageInDays);
    return value * decayFactor;
  });
}

/**
 * Calculate moving average
 */
export function movingAverage(values: number[], windowSize: number): number[] {
  const result: number[] = [];
  
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = values.slice(start, i + 1);
    const avg = window.reduce((sum, v) => sum + v, 0) / window.length;
    result.push(avg);
  }
  
  return result;
}

/**
 * Detect viewing patterns
 */
export function detectViewingPatterns(
  timestamps: Date[]
): {
  preferredHours: number[];
  preferredDays: number[];
  avgSessionGap: number;
  bingeWatcher: boolean;
} {
  const hours = new Map<number, number>();
  const days = new Map<number, number>();
  const gaps: number[] = [];
  
  timestamps.forEach((ts, idx) => {
    const hour = ts.getHours();
    const day = ts.getDay();
    
    hours.set(hour, (hours.get(hour) || 0) + 1);
    days.set(day, (days.get(day) || 0) + 1);
    
    if (idx > 0) {
      const gap = (ts.getTime() - timestamps[idx - 1].getTime()) / (1000 * 60); // minutes
      gaps.push(gap);
    }
  });
  
  // Get top 3 preferred hours
  const preferredHours = Array.from(hours.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hour]) => hour);
  
  // Get top 2 preferred days
  const preferredDays = Array.from(days.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([day]) => day);
  
  const avgSessionGap = gaps.length > 0 
    ? gaps.reduce((sum, g) => sum + g, 0) / gaps.length 
    : 0;
  
  // Binge watcher if average gap < 60 minutes
  const bingeWatcher = avgSessionGap < 60 && gaps.length > 5;
  
  return {
    preferredHours,
    preferredDays,
    avgSessionGap,
    bingeWatcher,
  };
}

/**
 * Create embedding from sparse features
 */
export function createEmbedding(
  sparseFeatures: Map<string, number>,
  embeddingSize: number
): number[] {
  const embedding = new Array(embeddingSize).fill(0);
  const features = Array.from(sparseFeatures.entries());
  
  // Simple hash-based embedding
  features.forEach(([key, value]) => {
    const hash = hashString(key);
    const idx = hash % embeddingSize;
    embedding[idx] += value;
  });
  
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    return embedding.map(v => v / norm);
  }
  
  return embedding;
}

/**
 * Simple string hash function
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Batch data for training
 */
export function createBatches<T>(data: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  
  for (let i = 0; i < data.length; i += batchSize) {
    batches.push(data.slice(i, i + batchSize));
  }
  
  return batches;
}

/**
 * Split data into train/validation/test sets
 */
export function trainValidationTestSplit<T>(
  data: T[],
  trainRatio: number = 0.7,
  validationRatio: number = 0.15
): {
  train: T[];
  validation: T[];
  test: T[];
} {
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  
  const trainSize = Math.floor(data.length * trainRatio);
  const validationSize = Math.floor(data.length * validationRatio);
  
  return {
    train: shuffled.slice(0, trainSize),
    validation: shuffled.slice(trainSize, trainSize + validationSize),
    test: shuffled.slice(trainSize + validationSize),
  };
}

/**
 * Calculate Mean Absolute Error
 */
export function calculateMAE(predictions: number[], actuals: number[]): number {
  if (predictions.length !== actuals.length) {
    throw new Error('Arrays must have the same length');
  }
  
  const sum = predictions.reduce((acc, pred, idx) => {
    return acc + Math.abs(pred - actuals[idx]);
  }, 0);
  
  return sum / predictions.length;
}

/**
 * Calculate Root Mean Squared Error
 */
export function calculateRMSE(predictions: number[], actuals: number[]): number {
  if (predictions.length !== actuals.length) {
    throw new Error('Arrays must have the same length');
  }
  
  const sum = predictions.reduce((acc, pred, idx) => {
    return acc + Math.pow(pred - actuals[idx], 2);
  }, 0);
  
  return Math.sqrt(sum / predictions.length);
}

/**
 * Calculate R² Score
 */
export function calculateR2Score(predictions: number[], actuals: number[]): number {
  if (predictions.length !== actuals.length) {
    throw new Error('Arrays must have the same length');
  }
  
  const mean = actuals.reduce((sum, v) => sum + v, 0) / actuals.length;
  
  const totalSS = actuals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
  const residualSS = predictions.reduce((sum, pred, idx) => {
    return sum + Math.pow(actuals[idx] - pred, 2);
  }, 0);
  
  return 1 - (residualSS / totalSS);
}

/**
 * Apply softmax to array
 */
export function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map(v => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(v => v / sum);
}

/**
 * Calculate precision@k
 */
export function precisionAtK(
  predictions: number[],
  actuals: number[],
  k: number
): number {
  const topKIndices = predictions
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(item => item.idx);
  
  const relevant = topKIndices.filter(idx => actuals[idx] === 1).length;
  
  return relevant / k;
}

/**
 * Calculate recall@k
 */
export function recallAtK(
  predictions: number[],
  actuals: number[],
  k: number
): number {
  const topKIndices = predictions
    .map((score, idx) => ({ score, idx }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(item => item.idx);
  
  const totalRelevant = actuals.filter(v => v === 1).length;
  if (totalRelevant === 0) return 0;
  
  const relevant = topKIndices.filter(idx => actuals[idx] === 1).length;
  
  return relevant / totalRelevant;
}
