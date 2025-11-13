/**
 * Database-Based Training Script for TensorFlow.js Two-Tower Model
 * Uses MovieLens ratings (39.5M) and Rotten Tomatoes reviews (1.4M) from database
 */

import * as tf from '@tensorflow/tfjs-node';
import * as path from 'path';
import * as fs from 'fs/promises';
import '../env.js';
import { db } from '../db.js';
import { movielensRatings, movielensMovies, movielensLinks, rottenTomatoesReviews } from '@shared/schema.js';
import { sql } from 'drizzle-orm';

interface TrainingExample {
  userId: number;
  itemId: number;
  rating: number;
}

interface UserFeatures {
  genrePreferences: number[];
  avgRating: number;
  ratingVariance: number;
  activityLevel: number;
}

interface ItemFeatures {
  avgRating: number;
  ratingCount: number;
  genres: number[];
  popularity: number;
}

class DatabaseMLTrainer {
  private model: tf.LayersModel | null = null;
  private userIndexMap: Map<number, number> = new Map();
  private itemIndexMap: Map<number, number> = new Map();
  
  private readonly config = {
    userEmbeddingDim: 32,
    itemEmbeddingDim: 32,
    hiddenLayers: [128, 64, 32],
    dropout: 0.3,
    batchSize: 256,
    epochs: 10,
    validationSplit: 0.2,
    learningRate: 0.001,
    sampleSize: 100000, // 100K ratings for memory constraints
  };
  
  // TMDB genre IDs
  private readonly genreIds = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
  
  // Map MovieLens genres to TMDB genre IDs
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

  /**
   * Build the Two-Tower neural network model
   */
  private buildModel(numUsers: number, numItems: number): tf.LayersModel {
    console.log(`\nBuilding Two-Tower model for ${numUsers} users and ${numItems} items...`);
    
    const userInput = tf.input({ shape: [1], name: 'user_input', dtype: 'int32' });
    const itemInput = tf.input({ shape: [1], name: 'item_input', dtype: 'int32' });
    const userFeaturesInput = tf.input({ shape: [this.config.userEmbeddingDim], name: 'user_features' });
    const itemFeaturesInput = tf.input({ shape: [this.config.itemEmbeddingDim], name: 'item_features' });
    
    // User embedding layer
    const userEmbedding = tf.layers.embedding({
      inputDim: numUsers,
      outputDim: this.config.userEmbeddingDim,
      name: 'user_embedding',
    }).apply(userInput) as tf.SymbolicTensor;
    
    // Item embedding layer
    const itemEmbedding = tf.layers.embedding({
      inputDim: numItems,
      outputDim: this.config.itemEmbeddingDim,
      name: 'item_embedding',
    }).apply(itemInput) as tf.SymbolicTensor;
    
    const userEmbFlat = tf.layers.flatten().apply(userEmbedding) as tf.SymbolicTensor;
    const itemEmbFlat = tf.layers.flatten().apply(itemEmbedding) as tf.SymbolicTensor;
    
    // Concatenate embeddings with features
    const concatenated = tf.layers.concatenate().apply([
      userEmbFlat,
      itemEmbFlat,
      userFeaturesInput,
      itemFeaturesInput,
    ]) as tf.SymbolicTensor;
    
    // Deep neural network layers
    let dense: tf.SymbolicTensor = concatenated;
    
    for (let i = 0; i < this.config.hiddenLayers.length; i++) {
      dense = tf.layers.dense({
        units: this.config.hiddenLayers[i],
        activation: 'relu',
        kernelInitializer: 'heNormal',
        name: `dense_${i}`,
      }).apply(dense) as tf.SymbolicTensor;
      
      dense = tf.layers.dropout({
        rate: this.config.dropout,
        name: `dropout_${i}`,
      }).apply(dense) as tf.SymbolicTensor;
    }
    
    // Output layer (rating prediction 0-1)
    const output = tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
      name: 'output',
    }).apply(dense) as tf.SymbolicTensor;
    
    // Scale output to 0-10 range
    const scaledOutput = tf.layers.dense({
      units: 1,
      activation: 'linear',
      useBias: true,
      kernelInitializer: tf.initializers.constant({ value: 10 }),
      biasInitializer: tf.initializers.constant({ value: 0 }),
      trainable: false,
      name: 'scale_to_10',
    }).apply(output) as tf.SymbolicTensor;
    
    const model = tf.model({
      inputs: [userInput, itemInput, userFeaturesInput, itemFeaturesInput],
      outputs: scaledOutput,
    });
    
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: 'meanSquaredError',
      metrics: ['mae'],
    });
    
    return model;
  }

  /**
   * Load MovieLens ratings from database in batches
   */
  private async loadMovieLensRatings(limit: number): Promise<TrainingExample[]> {
    console.log(`\nLoading MovieLens ratings (limit: ${limit.toLocaleString()})...`);
    
    const examples: TrainingExample[] = [];
    const batchSize = 50000;
    let offset = 0;
    
    while (examples.length < limit) {
      const batchLimit = Math.min(batchSize, limit - examples.length);
      
      const batch = await db
        .select({
          userId: movielensRatings.userId,
          movieId: movielensRatings.movieId,
          rating: movielensRatings.rating,
        })
        .from(movielensRatings)
        .limit(batchLimit)
        .offset(offset);
      
      if (batch.length === 0) break;
      
      for (const row of batch) {
        // Normalize MovieLens ratings from 0-5 to 0-10 scale
        examples.push({
          userId: row.userId,
          itemId: row.movieId,
          rating: row.rating * 2, // 0-5 → 0-10
        });
      }
      
      offset += batchSize;
      console.log(`  Loaded ${examples.length.toLocaleString()} ratings...`);
    }
    
    console.log(`✓ Loaded ${examples.length.toLocaleString()} MovieLens ratings`);
    return examples;
  }

  /**
   * Load Rotten Tomatoes reviews from database
   */
  private async loadRottenTomatoesReviews(): Promise<TrainingExample[]> {
    console.log(`\nLoading Rotten Tomatoes reviews...`);
    
    const examples: TrainingExample[] = [];
    const batchSize = 50000;
    let offset = 0;
    const userIdOffset = 1000000; // Offset to avoid collision with MovieLens user IDs
    
    while (true) {
      const batch = await db
        .select({
          movieId: rottenTomatoesReviews.movieId,
          scoreSentiment: rottenTomatoesReviews.scoreSentiment,
          originalScore: rottenTomatoesReviews.originalScore,
        })
        .from(rottenTomatoesReviews)
        .where(sql`${rottenTomatoesReviews.scoreSentiment} IS NOT NULL`)
        .limit(batchSize)
        .offset(offset);
      
      if (batch.length === 0) break;
      
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        
        // Convert sentiment to numerical rating
        let rating = 5.0; // Default neutral
        
        if (row.scoreSentiment) {
          const sentiment = row.scoreSentiment.toLowerCase();
          if (sentiment.includes('fresh') || sentiment === 'fresh') {
            rating = 4.0; // Fresh = 4.0 → 8.0 on 0-10 scale
          } else if (sentiment.includes('rotten') || sentiment === 'rotten') {
            rating = 2.0; // Rotten = 2.0 → 4.0 on 0-10 scale
          }
        }
        
        // Parse movie_id to get numeric ID (assuming format like "m123")
        const movieIdMatch = row.movieId?.match(/\d+/);
        if (movieIdMatch) {
          const movieId = parseInt(movieIdMatch[0]);
          
          examples.push({
            userId: userIdOffset + i, // Create synthetic user IDs
            itemId: movieId + 100000, // Offset to avoid collision with MovieLens movie IDs
            rating: rating * 2, // Convert to 0-10 scale
          });
        }
      }
      
      offset += batchSize;
      console.log(`  Loaded ${examples.length.toLocaleString()} reviews...`);
      
      // Limit RT reviews to avoid memory issues
      if (examples.length >= 20000) break;
    }
    
    console.log(`✓ Loaded ${examples.length.toLocaleString()} Rotten Tomatoes reviews`);
    return examples;
  }

  /**
   * Extract user features from ratings
   */
  private extractUserFeatures(userId: number, userRatings: TrainingExample[]): number[] {
    const features = new Array(this.config.userEmbeddingDim).fill(0);
    
    if (userRatings.length === 0) {
      return features;
    }
    
    // Calculate average rating and variance
    const ratings = userRatings.map(r => r.rating);
    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
    const variance = ratings.reduce((sum, r) => sum + Math.pow(r - avgRating, 2), 0) / ratings.length;
    
    // Normalize to 0-1 range
    features[0] = avgRating / 10.0;
    features[1] = Math.min(variance / 10.0, 1);
    features[2] = Math.min(userRatings.length / 100, 1); // Activity level
    
    // High rating preference
    features[3] = userRatings.filter(r => r.rating >= 7).length / userRatings.length;
    
    // Low rating preference
    features[4] = userRatings.filter(r => r.rating <= 4).length / userRatings.length;
    
    // Fill remaining features with normalized rating distribution
    const ratingBuckets = [0, 2, 4, 6, 8, 10];
    for (let i = 0; i < ratingBuckets.length - 1 && i + 5 < features.length; i++) {
      const min = ratingBuckets[i];
      const max = ratingBuckets[i + 1];
      const count = userRatings.filter(r => r.rating >= min && r.rating < max).length;
      features[i + 5] = count / userRatings.length;
    }
    
    return features;
  }

  /**
   * Extract item features from ratings
   */
  private extractItemFeatures(itemId: number, itemRatings: TrainingExample[]): number[] {
    const features = new Array(this.config.itemEmbeddingDim).fill(0);
    
    if (itemRatings.length === 0) {
      return features;
    }
    
    // Calculate average rating
    const avgRating = itemRatings.reduce((sum, r) => sum + r.rating, 0) / itemRatings.length;
    
    // Normalize to 0-1 range
    features[0] = avgRating / 10.0;
    features[1] = Math.min(itemRatings.length / 100, 1); // Popularity
    features[2] = Math.log(itemRatings.length + 1) / 10; // Log popularity
    
    // Rating variance
    const variance = itemRatings.reduce((sum, r) => sum + Math.pow(r.rating - avgRating, 2), 0) / itemRatings.length;
    features[3] = Math.min(variance / 10.0, 1);
    
    return features;
  }

  /**
   * Prepare training data from database
   */
  private async prepareTrainingData(): Promise<{
    userIds: number[];
    itemIds: number[];
    ratings: number[];
    userFeatures: number[][];
    itemFeatures: number[][];
  }> {
    console.log('\n=== Loading Training Data from Database ===');
    
    // Load MovieLens ratings
    const movieLensExamples = await this.loadMovieLensRatings(this.config.sampleSize);
    
    // Load Rotten Tomatoes reviews
    const rtExamples = await this.loadRottenTomatoesReviews();
    
    // Combine datasets
    const allExamples = [...movieLensExamples, ...rtExamples];
    console.log(`\n✓ Total training examples: ${allExamples.length.toLocaleString()}`);
    
    // Build user and item mappings
    console.log('\nBuilding user and item index mappings...');
    const uniqueUsers = Array.from(new Set(allExamples.map(e => e.userId)));
    const uniqueItems = Array.from(new Set(allExamples.map(e => e.itemId)));
    
    uniqueUsers.forEach((userId, idx) => {
      this.userIndexMap.set(userId, idx);
    });
    
    uniqueItems.forEach((itemId, idx) => {
      this.itemIndexMap.set(itemId, idx);
    });
    
    console.log(`✓ Users: ${this.userIndexMap.size.toLocaleString()}`);
    console.log(`✓ Items: ${this.itemIndexMap.size.toLocaleString()}`);
    
    // Build feature maps
    console.log('\nExtracting user features...');
    const userRatingsMap = new Map<number, TrainingExample[]>();
    for (const example of allExamples) {
      const ratings = userRatingsMap.get(example.userId) || [];
      ratings.push(example);
      userRatingsMap.set(example.userId, ratings);
    }
    
    const userFeaturesMap = new Map<number, number[]>();
    for (const userId of uniqueUsers) {
      const ratings = userRatingsMap.get(userId) || [];
      const features = this.extractUserFeatures(userId, ratings);
      userFeaturesMap.set(userId, features);
    }
    console.log(`✓ Extracted features for ${userFeaturesMap.size.toLocaleString()} users`);
    
    console.log('\nExtracting item features...');
    const itemRatingsMap = new Map<number, TrainingExample[]>();
    for (const example of allExamples) {
      const ratings = itemRatingsMap.get(example.itemId) || [];
      ratings.push(example);
      itemRatingsMap.set(example.itemId, ratings);
    }
    
    const itemFeaturesMap = new Map<number, number[]>();
    for (const itemId of uniqueItems) {
      const ratings = itemRatingsMap.get(itemId) || [];
      const features = this.extractItemFeatures(itemId, ratings);
      itemFeaturesMap.set(itemId, features);
    }
    console.log(`✓ Extracted features for ${itemFeaturesMap.size.toLocaleString()} items`);
    
    // Prepare training arrays
    console.log('\nPreparing training arrays...');
    const userIds: number[] = [];
    const itemIds: number[] = [];
    const ratings: number[] = [];
    const userFeatures: number[][] = [];
    const itemFeatures: number[][] = [];
    
    for (const example of allExamples) {
      const userIdx = this.userIndexMap.get(example.userId);
      const itemIdx = this.itemIndexMap.get(example.itemId);
      
      if (userIdx !== undefined && itemIdx !== undefined) {
        userIds.push(userIdx);
        itemIds.push(itemIdx);
        ratings.push(example.rating);
        userFeatures.push(userFeaturesMap.get(example.userId) || []);
        itemFeatures.push(itemFeaturesMap.get(example.itemId) || []);
      }
    }
    
    console.log(`✓ Prepared ${userIds.length.toLocaleString()} training samples`);
    
    return {
      userIds,
      itemIds,
      ratings,
      userFeatures,
      itemFeatures,
    };
  }

  /**
   * Train the model
   */
  async train(): Promise<void> {
    console.log('=== TensorFlow.js Two-Tower Model Training ===');
    console.log(`Configuration: ${JSON.stringify(this.config, null, 2)}\n`);
    
    // Prepare data
    const data = await this.prepareTrainingData();
    
    if (data.userIds.length < 10) {
      throw new Error(`Insufficient training data. Need at least 10 samples, but only have ${data.userIds.length}.`);
    }
    
    // Build model
    this.model = this.buildModel(this.userIndexMap.size, this.itemIndexMap.size);
    
    console.log('\n=== Model Architecture ===');
    this.model.summary();
    
    // Convert to tensors
    console.log('\n=== Converting Data to Tensors ===');
    const userIdsTensor = tf.tensor2d(data.userIds.map(id => [id]), [data.userIds.length, 1], 'int32');
    const itemIdsTensor = tf.tensor2d(data.itemIds.map(id => [id]), [data.itemIds.length, 1], 'int32');
    const userFeaturesTensor = tf.tensor2d(data.userFeatures);
    const itemFeaturesTensor = tf.tensor2d(data.itemFeatures);
    const ratingsTensor = tf.tensor2d(data.ratings.map(r => [r]));
    
    console.log('✓ Tensors created successfully');
    
    // Train model
    console.log('\n=== Training Neural Network ===');
    console.log(`Epochs: ${this.config.epochs}, Batch Size: ${this.config.batchSize}, Validation Split: ${this.config.validationSplit}\n`);
    
    const history = await this.model.fit(
      [userIdsTensor, itemIdsTensor, userFeaturesTensor, itemFeaturesTensor],
      ratingsTensor,
      {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        validationSplit: this.config.validationSplit,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            const loss = logs?.loss.toFixed(4);
            const mae = logs?.mae.toFixed(4);
            const valLoss = logs?.val_loss.toFixed(4);
            const valMae = logs?.val_mae.toFixed(4);
            console.log(`Epoch ${epoch + 1}/${this.config.epochs} - loss: ${loss} - mae: ${mae} - val_loss: ${valLoss} - val_mae: ${valMae}`);
          },
        },
      }
    );
    
    // Calculate final metrics
    const finalLoss = history.history.loss[history.history.loss.length - 1] as number;
    const finalMae = history.history.mae[history.history.mae.length - 1] as number;
    const finalValLoss = history.history.val_loss[history.history.val_loss.length - 1] as number;
    const finalValMae = history.history.val_mae[history.history.val_mae.length - 1] as number;
    const rmse = Math.sqrt(finalLoss);
    const valRmse = Math.sqrt(finalValLoss);
    
    console.log('\n=== Training Complete ===');
    console.log(`Final Training Loss (MSE): ${finalLoss.toFixed(4)}`);
    console.log(`Final Training MAE: ${finalMae.toFixed(4)}`);
    console.log(`Final Training RMSE: ${rmse.toFixed(4)}`);
    console.log(`Final Validation Loss (MSE): ${finalValLoss.toFixed(4)}`);
    console.log(`Final Validation MAE: ${finalValMae.toFixed(4)}`);
    console.log(`Final Validation RMSE: ${valRmse.toFixed(4)}`);
    
    // Cleanup tensors
    userIdsTensor.dispose();
    itemIdsTensor.dispose();
    userFeaturesTensor.dispose();
    itemFeaturesTensor.dispose();
    ratingsTensor.dispose();
    
    // Save model
    await this.saveModel();
  }

  /**
   * Save trained model to disk
   */
  private async saveModel(): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }
    
    console.log('\n=== Saving Model ===');
    
    const modelDir = path.resolve('server/ml/models/two-tower');
    await fs.mkdir(modelDir, { recursive: true });
    
    const modelPath = `file://${modelDir}`;
    await this.model.save(modelPath);
    
    const mappings = {
      userIndexMap: Array.from(this.userIndexMap.entries()),
      itemIndexMap: Array.from(this.itemIndexMap.entries()),
      version: '3.0.0-database',
      trainedOn: 'MovieLens + Rotten Tomatoes (Database)',
      datasetSize: {
        users: this.userIndexMap.size,
        items: this.itemIndexMap.size,
        ratings: this.config.sampleSize,
      },
      config: this.config,
      timestamp: new Date().toISOString(),
    };
    
    await fs.writeFile(
      path.join(modelDir, 'mappings.json'),
      JSON.stringify(mappings, null, 2)
    );
    
    console.log(`✓ Model saved to: ${modelPath}`);
    console.log(`✓ Mappings saved to: ${path.join(modelDir, 'mappings.json')}`);
    console.log(`✓ Model version: ${mappings.version}`);
  }
}

async function main() {
  const trainer = new DatabaseMLTrainer();
  
  try {
    await trainer.train();
    
    console.log('\n✅ Model training completed successfully!');
    console.log('The trained model is ready to use for recommendations.');
  } catch (error) {
    console.error('\n❌ Training failed:', error);
    throw error;
  }
}

main()
  .then(() => {
    console.log('\n🎉 Training script finished!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Training script failed:', err);
    process.exit(1);
  });
