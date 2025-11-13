/**
 * Test TensorFlow.js model with MovieLens data
 * Validates predictions and model performance
 */

import * as tf from '@tensorflow/tfjs-node';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import * as path from 'path';
import * as fs from 'fs/promises';
import '../env.ts';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface Mappings {
  userIndexMap: [number, number][];
  itemIndexMap: [number, number][];
  version: string;
  trainedOn: string;
}

interface Prediction {
  userId: number;
  movieId: number;
  movieTitle: string;
  actualRating: number;
  predictedRating: number;
  error: number;
}

class MovieLensModelTester {
  private model: tf.LayersModel | null = null;
  private userIndexMap: Map<number, number> = new Map();
  private itemIndexMap: Map<number, number> = new Map();
  
  private readonly config = {
    userEmbeddingDim: 32,
    itemEmbeddingDim: 32,
  };
  
  private readonly genreIds = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
  
  private readonly genreMap: { [key: string]: number[] } = {
    'Action': [28],
    'Adventure': [12],
    'Animation': [16],
    'Children': [10751],
    'Comedy': [35],
    'Crime': [80],
    'Documentary': [99],
    'Drama': [18],
    'Fantasy': [14],
    'Film-Noir': [80, 9648],
    'Horror': [27],
    'Musical': [10402],
    'Mystery': [9648],
    'Romance': [10749],
    'Sci-Fi': [878],
    'Thriller': [53],
    'War': [10752],
    'Western': [37],
  };

  async loadModel(): Promise<void> {
    try {
      const modelDir = path.resolve('server/ml/models/two-tower');
      const modelPath = `file://${modelDir}/model.json`;
      
      console.log(`Loading model from ${modelPath}...`);
      this.model = await tf.loadLayersModel(modelPath);
      
      // Load mappings
      const mappingsPath = path.join(modelDir, 'mappings.json');
      const mappingsData = await fs.readFile(mappingsPath, 'utf-8');
      const mappings: Mappings = JSON.parse(mappingsData);
      
      this.userIndexMap = new Map(mappings.userIndexMap);
      this.itemIndexMap = new Map(mappings.itemIndexMap);
      
      console.log(`✅ Model loaded successfully!`);
      console.log(`Version: ${mappings.version}`);
      console.log(`Trained on: ${mappings.trainedOn}`);
      console.log(`Users in model: ${this.userIndexMap.size}`);
      console.log(`Items in model: ${this.itemIndexMap.size}\n`);
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    }
  }

  private async extractUserFeatures(userId: number): Promise<number[]> {
    const features = new Array(this.config.userEmbeddingDim).fill(0);
    
    const ratingsResult = await pool.query(
      `SELECT r.*, m.genres 
       FROM movielens_ratings r 
       JOIN movielens_movies m ON r.movie_id = m.movie_id 
       WHERE r.user_id = $1 
       LIMIT 100`,
      [userId]
    );
    
    const userRatings = ratingsResult.rows;
    
    if (userRatings.length === 0) {
      return features;
    }
    
    // Genre preferences
    const genreScores = new Map<number, { sum: number; count: number }>();
    
    for (const rating of userRatings) {
      if (rating.genres) {
        const movieGenres = rating.genres.split('|');
        
        for (const genre of movieGenres) {
          const tmdbGenres = this.genreMap[genre] || [];
          for (const genreId of tmdbGenres) {
            const existing = genreScores.get(genreId) || { sum: 0, count: 0 };
            existing.sum += rating.rating;
            existing.count += 1;
            genreScores.set(genreId, existing);
          }
        }
      }
    }
    
    this.genreIds.forEach((genreId, idx) => {
      if (idx < 19) {
        const score = genreScores.get(genreId);
        if (score) {
          features[idx] = (score.sum / score.count) / 5.0;
        }
      }
    });
    
    // Rating statistics
    const avgRating = userRatings.reduce((sum: number, r: any) => sum + r.rating, 0) / userRatings.length;
    const ratingVariance = userRatings.reduce((sum: number, r: any) => sum + Math.pow(r.rating - avgRating, 2), 0) / userRatings.length;
    
    features[19] = avgRating / 5.0;
    features[20] = Math.min(ratingVariance / 5.0, 1);
    features[21] = Math.min(userRatings.length / 100, 1);
    features[22] = userRatings.filter((r: any) => r.rating >= 4).length / userRatings.length;
    features[23] = userRatings.filter((r: any) => r.rating <= 2).length / userRatings.length;
    
    return features;
  }

  private async extractItemFeatures(movieId: number): Promise<number[]> {
    const features = new Array(this.config.itemEmbeddingDim).fill(0);
    
    const movieResult = await pool.query(
      `SELECT * FROM movielens_movies WHERE movie_id = $1`,
      [movieId]
    );
    
    if (movieResult.rows.length === 0) {
      return features;
    }
    
    const movie = movieResult.rows[0];
    
    if (!movie.genres) {
      return features;
    }
    
    const movieGenres = movie.genres.split('|');
    const tmdbGenreIds: number[] = [];
    
    for (const genre of movieGenres) {
      const mapped = this.genreMap[genre] || [];
      tmdbGenreIds.push(...mapped);
    }
    
    this.genreIds.forEach((genreId, idx) => {
      if (idx < 19) {
        features[idx] = tmdbGenreIds.includes(genreId) ? 1 : 0;
      }
    });
    
    features[19] = Math.min(movieGenres.length / 5, 1);
    
    const yearMatch = movie.title.match(/\((\d{4})\)/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      const decades = [1970, 1980, 1990, 2000, 2010, 2020];
      const decade = Math.floor(year / 10) * 10;
      
      decades.forEach((d, idx) => {
        if (20 + idx < features.length) {
          features[20 + idx] = (decade === d) ? 1 : 0;
        }
      });
      
      if (features.length > 26) {
        features[26] = Math.max(0, (year - 1950) / (new Date().getFullYear() - 1950));
      }
    }
    
    return features;
  }

  async predict(userId: number, movieId: number): Promise<number> {
    if (!this.model) {
      throw new Error('Model not loaded');
    }
    
    const userIdx = this.userIndexMap.get(userId);
    const itemIdx = this.itemIndexMap.get(movieId);
    
    if (userIdx === undefined || itemIdx === undefined) {
      return 7.0; // Default for unseen users/items
    }
    
    const userFeatures = await this.extractUserFeatures(userId);
    const itemFeatures = await this.extractItemFeatures(movieId);
    
    const userIdTensor = tf.tensor2d([userIdx], [1, 1], 'int32');
    const itemIdTensor = tf.tensor2d([itemIdx], [1, 1], 'int32');
    const userFeaturesTensor = tf.tensor2d([userFeatures]);
    const itemFeaturesTensor = tf.tensor2d([itemFeatures]);
    
    const prediction = this.model.predict([
      userIdTensor,
      itemIdTensor,
      userFeaturesTensor,
      itemFeaturesTensor,
    ]) as tf.Tensor;
    
    const predictionArray = await prediction.array() as number[][];
    const rating = Math.max(0, Math.min(10, predictionArray[0][0]));
    
    // Cleanup
    userIdTensor.dispose();
    itemIdTensor.dispose();
    userFeaturesTensor.dispose();
    itemFeaturesTensor.dispose();
    prediction.dispose();
    
    return rating;
  }

  async testPredictions(numSamples: number = 20): Promise<void> {
    console.log(`\n=== Testing Model Predictions ===\n`);
    
    // Get random test samples
    const testSamplesResult = await pool.query(
      `SELECT r.user_id, r.movie_id, r.rating, m.title 
       FROM movielens_ratings r
       JOIN movielens_movies m ON r.movie_id = m.movie_id
       ORDER BY RANDOM()
       LIMIT $1`,
      [numSamples]
    );
    
    const predictions: Prediction[] = [];
    let totalError = 0;
    let totalAbsError = 0;
    
    console.log('Making predictions...\n');
    
    for (const sample of testSamplesResult.rows) {
      const predictedRating = await this.predict(sample.user_id, sample.movie_id);
      const actualRating = sample.rating * 2; // Scale to 0-10
      const error = predictedRating - actualRating;
      
      predictions.push({
        userId: sample.user_id,
        movieId: sample.movie_id,
        movieTitle: sample.title,
        actualRating,
        predictedRating,
        error,
      });
      
      totalError += error;
      totalAbsError += Math.abs(error);
    }
    
    // Display results
    console.log('User ID | Movie ID | Movie Title                          | Actual | Predicted | Error');
    console.log('--------|----------|--------------------------------------|--------|-----------|-------');
    
    for (const pred of predictions) {
      const titleShort = pred.movieTitle.substring(0, 36).padEnd(36);
      console.log(
        `${String(pred.userId).padEnd(7)} | ` +
        `${String(pred.movieId).padEnd(8)} | ` +
        `${titleShort} | ` +
        `${pred.actualRating.toFixed(1).padStart(6)} | ` +
        `${pred.predictedRating.toFixed(1).padStart(9)} | ` +
        `${pred.error > 0 ? '+' : ''}${pred.error.toFixed(2)}`
      );
    }
    
    // Calculate metrics
    const meanError = totalError / predictions.length;
    const mae = totalAbsError / predictions.length;
    const rmse = Math.sqrt(
      predictions.reduce((sum, p) => sum + p.error * p.error, 0) / predictions.length
    );
    
    console.log('\n=== Performance Metrics ===');
    console.log(`Mean Error (ME):           ${meanError.toFixed(4)}`);
    console.log(`Mean Absolute Error (MAE): ${mae.toFixed(4)}`);
    console.log(`Root Mean Square Error:    ${rmse.toFixed(4)}`);
    console.log(`\nInterpretation:`);
    console.log(`- MAE ${mae.toFixed(2)} means predictions are off by ~${mae.toFixed(1)} rating points on average`);
    console.log(`- On a 0-10 scale, this is ${((mae / 10) * 100).toFixed(1)}% error`);
  }

  async getTopRecommendations(userId: number, topK: number = 10): Promise<void> {
    console.log(`\n=== Top ${topK} Recommendations for User ${userId} ===\n`);
    
    // Get user's rated movies
    const ratedResult = await pool.query(
      `SELECT movie_id FROM movielens_ratings WHERE user_id = $1`,
      [userId]
    );
    const ratedMovies = new Set(ratedResult.rows.map(r => r.movie_id));
    
    // Get candidate movies (not rated by user)
    const candidatesResult = await pool.query(
      `SELECT movie_id, title FROM movielens_movies 
       WHERE movie_id NOT IN (SELECT movie_id FROM movielens_ratings WHERE user_id = $1)
       LIMIT 500`,
      [userId]
    );
    
    const recommendations: { movieId: number; title: string; score: number }[] = [];
    
    console.log('Generating recommendations...\n');
    
    for (const movie of candidatesResult.rows) {
      const score = await this.predict(userId, movie.movie_id);
      recommendations.push({
        movieId: movie.movie_id,
        title: movie.title,
        score,
      });
    }
    
    // Sort and take top K
    recommendations.sort((a, b) => b.score - a.score);
    const topRecs = recommendations.slice(0, topK);
    
    console.log('Rank | Movie ID | Predicted Rating | Title');
    console.log('-----|----------|------------------|----------------------------------');
    
    topRecs.forEach((rec, idx) => {
      const titleShort = rec.title.substring(0, 50);
      console.log(
        `${String(idx + 1).padStart(4)} | ` +
        `${String(rec.movieId).padEnd(8)} | ` +
        `${rec.score.toFixed(2).padStart(16)} | ` +
        `${titleShort}`
      );
    });
  }
}

async function main() {
  const tester = new MovieLensModelTester();
  
  try {
    // Load the trained model
    await tester.loadModel();
    
    // Test predictions on random samples
    await tester.testPredictions(20);
    
    // Get recommendations for a sample user
    await tester.getTopRecommendations(1, 10);
    
    console.log('\n✅ Model testing completed successfully!');
  } catch (error) {
    console.error('\n❌ Testing failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    console.log('\n🎉 Test script finished!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Test script failed:', err);
    process.exit(1);
  });
