/**
 * Train TensorFlow.js model using MovieLens dataset directly from CSV files
 * No database required - uses CSV files from attached_assets/Datasets/
 */

import * as tf from '@tensorflow/tfjs-node';
import * as path from 'path';
import * as fs from 'fs/promises';
import '../env.ts';
import { 
  loadTrainingDataset,
  MovieLensRating,
  MovieLensMovie,
  TMDBMovie 
} from '../ml/dataLoaders.js';

class MovieLensMLTrainer {
  private model: tf.LayersModel | null = null;
  private userIndexMap: Map<number, number> = new Map();
  private itemIndexMap: Map<number, number> = new Map();
  
  private readonly config = {
    userEmbeddingDim: 32,
    itemEmbeddingDim: 32,
    hiddenLayers: [128, 64, 32],
    dropout: 0.3,
    batchSize: 256,
    epochs: 20,
    validationSplit: 0.2,
    learningRate: 0.001,
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
   * Build neural network model
   */
  private buildModel(numUsers: number, numItems: number): tf.LayersModel {
    console.log(`Building model for ${numUsers} users and ${numItems} items...`);
    
    const userInput = tf.input({ shape: [1], name: 'user_input', dtype: 'int32' });
    const itemInput = tf.input({ shape: [1], name: 'item_input', dtype: 'int32' });
    const userFeaturesInput = tf.input({ shape: [this.config.userEmbeddingDim], name: 'user_features' });
    const itemFeaturesInput = tf.input({ shape: [this.config.itemEmbeddingDim], name: 'item_features' });
    
    const userEmbedding = tf.layers.embedding({
      inputDim: numUsers,
      outputDim: this.config.userEmbeddingDim,
      name: 'user_embedding',
    }).apply(userInput) as tf.SymbolicTensor;
    
    const itemEmbedding = tf.layers.embedding({
      inputDim: numItems,
      outputDim: this.config.itemEmbeddingDim,
      name: 'item_embedding',
    }).apply(itemInput) as tf.SymbolicTensor;
    
    const userEmbFlat = tf.layers.flatten().apply(userEmbedding) as tf.SymbolicTensor;
    const itemEmbFlat = tf.layers.flatten().apply(itemEmbedding) as tf.SymbolicTensor;
    
    const concatenated = tf.layers.concatenate().apply([
      userEmbFlat,
      itemEmbFlat,
      userFeaturesInput,
      itemFeaturesInput,
    ]) as tf.SymbolicTensor;
    
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
    
    const output = tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
      name: 'output',
    }).apply(dense) as tf.SymbolicTensor;
    
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
   * Extract user features from MovieLens ratings
   */
  private extractUserFeatures(
    userId: number, 
    ratings: MovieLensRating[], 
    movieLensMovies: Map<number, MovieLensMovie>
  ): number[] {
    const features = new Array(this.config.userEmbeddingDim).fill(0);
    
    const userRatings = ratings.filter(r => r.userId === userId);
    
    if (userRatings.length === 0) {
      return features;
    }
    
    const genreScores = new Map<number, { sum: number; count: number }>();
    
    for (const rating of userRatings) {
      const movie = movieLensMovies.get(rating.movieId);
      if (movie && movie.genres) {
        for (const genre of movie.genres) {
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
    
    const avgRating = userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length;
    const ratingVariance = userRatings.reduce((sum, r) => sum + Math.pow(r.rating - avgRating, 2), 0) / userRatings.length;
    
    features[19] = avgRating / 5.0;
    features[20] = Math.min(ratingVariance / 5.0, 1);
    features[21] = Math.min(userRatings.length / 100, 1);
    features[22] = userRatings.filter(r => r.rating >= 4).length / userRatings.length;
    features[23] = userRatings.filter(r => r.rating <= 2).length / userRatings.length;
    
    return features;
  }

  /**
   * Extract item features from MovieLens movie data
   */
  private extractItemFeatures(movie: MovieLensMovie): number[] {
    const features = new Array(this.config.itemEmbeddingDim).fill(0);
    
    if (!movie.genres || movie.genres.length === 0) {
      return features;
    }
    
    const tmdbGenreIds: number[] = [];
    
    for (const genre of movie.genres) {
      const mapped = this.genreMap[genre] || [];
      tmdbGenreIds.push(...mapped);
    }
    
    this.genreIds.forEach((genreId, idx) => {
      if (idx < 19) {
        features[idx] = tmdbGenreIds.includes(genreId) ? 1 : 0;
      }
    });
    
    features[19] = Math.min(movie.genres.length / 5, 1);
    
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

  /**
   * Prepare training data from CSV files
   */
  private async prepareTrainingData(ratingLimit?: number, tmdbLimit?: number): Promise<{
    userIds: number[];
    itemIds: number[];
    ratings: number[];
    userFeatures: number[][];
    itemFeatures: number[][];
  }> {
    console.log('Loading data from CSV files...');
    
    const dataset = await loadTrainingDataset(ratingLimit, tmdbLimit);
    const { ratings, movieLensMovies, tmdbMovies, movieLensToTMDB } = dataset;
    
    console.log(`Loaded ${ratings.length} ratings from CSV`);
    console.log(`Loaded ${movieLensMovies.size} MovieLens movies from CSV`);
    console.log(`Loaded ${tmdbMovies.size} TMDB movies from CSV`);
    
    const uniqueUsers = Array.from(new Set(ratings.map(r => r.userId)));
    const uniqueItems = Array.from(new Set(ratings.map(r => r.movieId)));
    
    uniqueUsers.forEach((userId, idx) => {
      this.userIndexMap.set(userId, idx);
    });
    
    uniqueItems.forEach((movieId, idx) => {
      this.itemIndexMap.set(movieId, idx);
    });
    
    console.log(`Users: ${this.userIndexMap.size}, Items: ${this.itemIndexMap.size}`);
    
    console.log('Extracting user features...');
    const userFeaturesMap = new Map<number, number[]>();
    for (const userId of uniqueUsers) {
      const features = this.extractUserFeatures(userId, ratings, movieLensMovies);
      userFeaturesMap.set(userId, features);
    }
    
    console.log('Extracting item features...');
    const itemFeaturesMap = new Map<number, number[]>();
    for (const movieId of uniqueItems) {
      const movie = movieLensMovies.get(movieId);
      if (movie) {
        const features = this.extractItemFeatures(movie);
        itemFeaturesMap.set(movieId, features);
      }
    }
    
    const userIds: number[] = [];
    const itemIds: number[] = [];
    const ratingValues: number[] = [];
    const userFeatures: number[][] = [];
    const itemFeatures: number[][] = [];
    
    for (const rating of ratings) {
      const userIdx = this.userIndexMap.get(rating.userId);
      const itemIdx = this.itemIndexMap.get(rating.movieId);
      
      if (userIdx !== undefined && itemIdx !== undefined) {
        userIds.push(userIdx);
        itemIds.push(itemIdx);
        ratingValues.push(rating.rating * 2);
        userFeatures.push(userFeaturesMap.get(rating.userId) || []);
        itemFeatures.push(itemFeaturesMap.get(rating.movieId) || []);
      }
    }
    
    return {
      userIds,
      itemIds,
      ratings: ratingValues,
      userFeatures,
      itemFeatures,
    };
  }

  /**
   * Train the model
   */
  async train(ratingLimit?: number, tmdbLimit?: number): Promise<void> {
    console.log('=== Training TensorFlow.js Model from CSV Files ===\n');
    
    const trainingData = await this.prepareTrainingData(ratingLimit, tmdbLimit);
    
    if (trainingData.userIds.length < 10) {
      throw new Error(`Insufficient training data. Need at least 10 samples, but only have ${trainingData.userIds.length}.`);
    }
    
    console.log(`Training samples: ${trainingData.userIds.length}`);
    
    this.model = this.buildModel(this.userIndexMap.size, this.itemIndexMap.size);
    
    console.log('\nModel architecture:');
    this.model.summary();
    
    const userIdsTensor = tf.tensor2d(trainingData.userIds.map(id => [id]), [trainingData.userIds.length, 1], 'int32');
    const itemIdsTensor = tf.tensor2d(trainingData.itemIds.map(id => [id]), [trainingData.itemIds.length, 1], 'int32');
    const userFeaturesTensor = tf.tensor2d(trainingData.userFeatures);
    const itemFeaturesTensor = tf.tensor2d(trainingData.itemFeatures);
    const ratingsTensor = tf.tensor2d(trainingData.ratings.map(r => [r]));
    
    console.log('\nTraining model...');
    const history = await this.model.fit(
      [userIdsTensor, itemIdsTensor, userFeaturesTensor, itemFeaturesTensor],
      ratingsTensor,
      {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        validationSplit: this.config.validationSplit,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch + 1}/${this.config.epochs} - loss: ${logs?.loss.toFixed(4)} - mae: ${logs?.mae.toFixed(4)} - val_loss: ${logs?.val_loss.toFixed(4)} - val_mae: ${logs?.val_mae.toFixed(4)}`);
          },
        },
      }
    );
    
    userIdsTensor.dispose();
    itemIdsTensor.dispose();
    userFeaturesTensor.dispose();
    itemFeaturesTensor.dispose();
    ratingsTensor.dispose();
    
    const finalLoss = history.history.loss[history.history.loss.length - 1] as number;
    const finalMae = history.history.mae[history.history.mae.length - 1] as number;
    const finalValLoss = history.history.val_loss[history.history.val_loss.length - 1] as number;
    const finalValMae = history.history.val_mae[history.history.val_mae.length - 1] as number;
    
    console.log('\n=== Training Complete ===');
    console.log(`Final Training Loss: ${finalLoss.toFixed(4)}`);
    console.log(`Final Training MAE: ${finalMae.toFixed(4)}`);
    console.log(`Final Validation Loss: ${finalValLoss.toFixed(4)}`);
    console.log(`Final Validation MAE: ${finalValMae.toFixed(4)}`);
    
    await this.saveModel();
  }

  /**
   * Save model to disk
   */
  private async saveModel(): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }
    
    const modelDir = path.resolve('server/ml/models/two-tower');
    await fs.mkdir(modelDir, { recursive: true });
    
    const modelPath = `file://${modelDir}`;
    await this.model.save(modelPath);
    
    const mappings = {
      userIndexMap: Array.from(this.userIndexMap.entries()),
      itemIndexMap: Array.from(this.itemIndexMap.entries()),
      version: '2.0.0-csv',
      trainedOn: 'MovieLens CSV + TMDB CSV',
      timestamp: new Date().toISOString(),
    };
    
    await fs.writeFile(
      path.join(modelDir, 'mappings.json'),
      JSON.stringify(mappings, null, 2)
    );
    
    console.log(`\nModel saved to ${modelPath}`);
    console.log('Mappings saved successfully');
  }
}

async function main() {
  const trainer = new MovieLensMLTrainer();
  
  try {
    await trainer.train(50000, 10000);
    
    console.log('\n✅ Model training completed successfully!');
    console.log('The model is now ready to use for recommendations.');
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
