/**
 * TensorFlow.js Pattern Recognition Model
 * LSTM-based model to replace Brain.js for viewing pattern analysis
 */

import * as tf from '@tensorflow/tfjs-node';
import { db } from '../db';
import { userRatings, viewingHistory } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import MLConfig from './config';
import { detectViewingPatterns, normalize, createBatches } from './utils';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ViewingPattern {
  userId: string;
  sequence: number[];
  nextAction: number;
  timestamp: Date;
}

interface PatternPrediction {
  nextGenre: number;
  nextRating: number;
  probability: number;
  sessionType: 'binge' | 'casual' | 'explorer';
}

export class TFPatternRecognitionModel {
  private model: tf.LayersModel | null = null;
  private readonly config = MLConfig.tensorflow.patternModel;
  private readonly genreIds = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
  private isTraining: boolean = false;

  /**
   * Build LSTM model for pattern recognition
   */
  private buildModel(): tf.LayersModel {
    console.log('Building LSTM pattern recognition model...');

    // Input: sequence of ratings/genres (sequenceLength x features)
    const input = tf.input({
      shape: [this.config.sequenceLength, this.config.embeddingDim],
      name: 'pattern_input',
    });

    // LSTM layer for temporal pattern learning
    const lstm = tf.layers.lstm({
      units: this.config.lstmUnits,
      returnSequences: false,
      activation: 'tanh',
      recurrentActivation: 'sigmoid',
      dropout: this.config.dropout,
      recurrentDropout: this.config.dropout,
      name: 'lstm_layer',
    }).apply(input) as tf.SymbolicTensor;

    // Dense layers for prediction
    const dense1 = tf.layers.dense({
      units: 32,
      activation: 'relu',
      name: 'dense_1',
    }).apply(lstm) as tf.SymbolicTensor;

    const dropout1 = tf.layers.dropout({
      rate: this.config.dropout,
      name: 'dropout_1',
    }).apply(dense1) as tf.SymbolicTensor;

    // Multi-task outputs
    // 1. Next genre prediction
    const genreOutput = tf.layers.dense({
      units: this.genreIds.length,
      activation: 'softmax',
      name: 'genre_output',
    }).apply(dropout1) as tf.SymbolicTensor;

    // 2. Next rating prediction
    const ratingOutput = tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
      kernelInitializer: 'glorotUniform',
      name: 'rating_output',
    }).apply(dropout1) as tf.SymbolicTensor;

    // Scale rating to 0-10
    const scaledRating = tf.layers.dense({
      units: 1,
      activation: 'linear',
      useBias: true,
      kernelInitializer: tf.initializers.constant({ value: 10 }),
      biasInitializer: tf.initializers.constant({ value: 0 }),
      trainable: false,
      name: 'scale_rating',
    }).apply(ratingOutput) as tf.SymbolicTensor;

    // 3. Session type classification (binge=0, casual=1, explorer=2)
    const sessionOutput = tf.layers.dense({
      units: 3,
      activation: 'softmax',
      name: 'session_output',
    }).apply(dropout1) as tf.SymbolicTensor;

    // Create multi-output model
    const model = tf.model({
      inputs: input,
      outputs: [genreOutput, scaledRating, sessionOutput],
    });

    // Compile with multiple losses
    model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: {
        genre_output: 'categoricalCrossentropy',
        scale_rating: 'meanSquaredError',
        session_output: 'categoricalCrossentropy',
      },
      metrics: ['accuracy'],
    });

    console.log('LSTM Pattern Model:');
    model.summary();

    return model;
  }

  /**
   * Extract viewing sequences from user history
   */
  private async extractViewingSequences(userId: string): Promise<ViewingPattern[]> {
    const patterns: ViewingPattern[] = [];

    // Get user's viewing history
    const ratings = await db
      .select({
        tmdbId: userRatings.tmdbId,
        rating: userRatings.rating,
        createdAt: userRatings.createdAt,
      })
      .from(userRatings)
      .where(eq(userRatings.userId, userId))
      .orderBy(sql`${userRatings.createdAt} ASC`)
      .limit(1000);

    if (ratings.length < this.config.sequenceLength + 1) {
      return patterns;
    }

    // Create sliding window sequences
    for (let i = 0; i < ratings.length - this.config.sequenceLength; i++) {
      const window = ratings.slice(i, i + this.config.sequenceLength);
      const nextRating = ratings[i + this.config.sequenceLength];

      // Create sequence features (rating + normalized timestamp)
      const sequence = window.map(r => r.rating / 10); // Normalized ratings

      patterns.push({
        userId,
        sequence,
        nextAction: nextRating.rating,
        timestamp: window[window.length - 1].createdAt || new Date(),
      });
    }

    return patterns;
  }

  /**
   * Prepare training data from all users
   */
  private async prepareTrainingData(): Promise<{
    sequences: number[][][];
    genreTargets: number[][];
    ratingTargets: number[];
    sessionTargets: number[][];
  }> {
    console.log('Preparing pattern training data...');

    // Get all users with sufficient history
    const usersWithHistory = await db
      .select({ userId: userRatings.userId })
      .from(userRatings)
      .groupBy(userRatings.userId)
      .having(sql`COUNT(*) >= ${this.config.sequenceLength + 1}`);

    const allPatterns: ViewingPattern[] = [];

    // Extract patterns from each user (limit to 100 users for initial training)
    for (const { userId } of usersWithHistory.slice(0, 100)) {
      const patterns = await this.extractViewingSequences(userId);
      allPatterns.push(...patterns);
    }

    console.log(`Extracted ${allPatterns.length} viewing patterns`);

    if (allPatterns.length < 100) {
      throw new Error('Insufficient data for pattern training');
    }

    // Prepare training tensors
    const sequences: number[][][] = [];
    const genreTargets: number[][] = [];
    const ratingTargets: number[] = [];
    const sessionTargets: number[][] = [];

    for (const pattern of allPatterns) {
      // Create sequence with padding
      const paddedSequence: number[][] = [];
      for (let i = 0; i < this.config.sequenceLength; i++) {
        const features = new Array(this.config.embeddingDim).fill(0);
        if (i < pattern.sequence.length) {
          features[0] = pattern.sequence[i]; // Rating
          // Add more features as needed
        }
        paddedSequence.push(features);
      }

      sequences.push(paddedSequence);

      // Genre target (mock - would use actual genre in production)
      const genreTarget = new Array(this.genreIds.length).fill(0);
      genreTarget[0] = 1; // Mock genre
      genreTargets.push(genreTarget);

      // Rating target
      ratingTargets.push(pattern.nextAction);

      // Session type target (based on viewing behavior)
      const behavior = detectViewingPatterns([pattern.timestamp]);
      const sessionTarget = behavior.bingeWatcher ? [1, 0, 0] : [0, 1, 0];
      sessionTargets.push(sessionTarget);
    }

    return {
      sequences,
      genreTargets,
      ratingTargets,
      sessionTargets,
    };
  }

  /**
   * Train the LSTM pattern model
   */
  async train(): Promise<{ loss: number; accuracy: number }> {
    if (this.isTraining) {
      throw new Error('Model is already training');
    }

    this.isTraining = true;

    try {
      console.log('Starting LSTM pattern training...');

      // Prepare data
      const data = await this.prepareTrainingData();

      // Build model
      this.model = this.buildModel();

      // Convert to tensors
      const sequencesTensor = tf.tensor3d(data.sequences);
      const genreTargetsTensor = tf.tensor2d(data.genreTargets);
      const ratingTargetsTensor = tf.tensor2d(data.ratingTargets, [data.ratingTargets.length, 1]);
      const sessionTargetsTensor = tf.tensor2d(data.sessionTargets);

      // Train model
      console.log('Training LSTM...');
      const history = await this.model.fit(sequencesTensor, {
        genre_output: genreTargetsTensor,
        scale_rating: ratingTargetsTensor,
        session_output: sessionTargetsTensor,
      }, {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            console.log(`Epoch ${epoch + 1}: loss=${logs?.loss.toFixed(4)}`);
          },
        },
      });

      const finalLoss = history.history.loss[history.history.loss.length - 1] as number;
      const finalAcc = history.history.acc?.[history.history.acc.length - 1] as number || 0;

      console.log(`Training complete! Loss: ${finalLoss.toFixed(4)}, Accuracy: ${(finalAcc * 100).toFixed(2)}%`);

      // Cleanup
      sequencesTensor.dispose();
      genreTargetsTensor.dispose();
      ratingTargetsTensor.dispose();
      sessionTargetsTensor.dispose();

      // Save model
      await this.saveModel();

      return {
        loss: finalLoss,
        accuracy: finalAcc,
      };
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Predict next viewing action
   */
  async predict(userId: string): Promise<PatternPrediction> {
    if (!this.model) {
      await this.loadModel();
    }

    if (!this.model) {
      // Return default prediction
      return {
        nextGenre: 28, // Action
        nextRating: 7.5,
        probability: 0.5,
        sessionType: 'casual',
      };
    }

    // Get user's recent viewing sequence
    const patterns = await this.extractViewingSequences(userId);

    if (patterns.length === 0) {
      return {
        nextGenre: 28,
        nextRating: 7.5,
        probability: 0.5,
        sessionType: 'casual',
      };
    }

    const latestPattern = patterns[patterns.length - 1];

    // Prepare sequence
    const paddedSequence: number[][] = [];
    for (let i = 0; i < this.config.sequenceLength; i++) {
      const features = new Array(this.config.embeddingDim).fill(0);
      if (i < latestPattern.sequence.length) {
        features[0] = latestPattern.sequence[i];
      }
      paddedSequence.push(features);
    }

    const inputTensor = tf.tensor3d([paddedSequence]);

    // Predict
    const predictions = this.model.predict(inputTensor) as tf.Tensor[];

    const genrePredArray = await predictions[0].array() as number[][];
    const ratingPredArray = await predictions[1].array() as number[][];
    const sessionPredArray = await predictions[2].array() as number[][];

    // Extract results
    const genreProbs = genrePredArray[0];
    const topGenreIdx = genreProbs.indexOf(Math.max(...genreProbs));
    const nextGenre = this.genreIds[topGenreIdx];
    const probability = genreProbs[topGenreIdx];

    const nextRating = Math.max(0, Math.min(10, ratingPredArray[0][0]));

    const sessionProbs = sessionPredArray[0];
    const sessionIdx = sessionProbs.indexOf(Math.max(...sessionProbs));
    const sessionTypes: Array<'binge' | 'casual' | 'explorer'> = ['binge', 'casual', 'explorer'];
    const sessionType = sessionTypes[sessionIdx];

    // Cleanup
    inputTensor.dispose();
    predictions.forEach(t => t.dispose());

    return {
      nextGenre,
      nextRating,
      probability,
      sessionType,
    };
  }

  /**
   * Analyze user viewing patterns
   */
  async analyzePatterns(userId: string): Promise<{
    bingeWatcher: boolean;
    preferredGenres: number[];
    avgRating: number;
    predictedNextGenre: number;
  }> {
    const patterns = await this.extractViewingSequences(userId);

    if (patterns.length === 0) {
      return {
        bingeWatcher: false,
        preferredGenres: [],
        avgRating: 0,
        predictedNextGenre: 28,
      };
    }

    const timestamps = patterns.map(p => p.timestamp);
    const behavior = detectViewingPatterns(timestamps);

    const avgRating = patterns.reduce((sum, p) => {
      return sum + p.sequence.reduce((s, r) => s + r, 0) / p.sequence.length;
    }, 0) / patterns.length * 10;

    const prediction = await this.predict(userId);

    return {
      bingeWatcher: behavior.bingeWatcher,
      preferredGenres: [prediction.nextGenre],
      avgRating,
      predictedNextGenre: prediction.nextGenre,
    };
  }

  /**
   * Session-based recommender (fast inference)
   * Recommends movies based on current session activity
   */
  async getSessionRecommendations(userId: string, sessionData?: {
    recentViews?: number[];
    recentClicks?: number[];
    timeSpent?: { [tmdbId: number]: number };
  }): Promise<{
    recommendedGenres: number[];
    predictedRating: number;
    sessionType: 'binge' | 'casual' | 'explorer';
    confidence: number;
  }> {
    try {
      // Get user's viewing pattern prediction
      const prediction = await this.predict(userId);
      
      // If session data is provided, adjust recommendations
      if (sessionData && sessionData.recentViews && sessionData.recentViews.length > 0) {
        // Get genre distribution from recent views
        const recentGenres = await this.getRecentGenres(sessionData.recentViews);
        
        return {
          recommendedGenres: recentGenres.length > 0 ? recentGenres : [prediction.nextGenre],
          predictedRating: prediction.nextRating,
          sessionType: prediction.sessionType,
          confidence: prediction.probability,
        };
      }
      
      return {
        recommendedGenres: [prediction.nextGenre],
        predictedRating: prediction.nextRating,
        sessionType: prediction.sessionType,
        confidence: prediction.probability,
      };
    } catch (error) {
      console.error('Error getting session recommendations:', error);
      return {
        recommendedGenres: [28], // Default to Action
        predictedRating: 7.5,
        sessionType: 'casual',
        confidence: 0.5,
      };
    }
  }

  /**
   * Get genre distribution from recent movie views
   */
  private async getRecentGenres(tmdbIds: number[]): Promise<number[]> {
    // This would query TMDB API or database to get genres for these movies
    // For now, return a subset of popular genres
    return this.genreIds.slice(0, 3);
  }

  /**
   * Save model to disk
   */
  async saveModel(): Promise<void> {
    if (!this.model) {
      throw new Error('No model to save');
    }

    const modelPath = `file://${path.resolve(MLConfig.modelPaths.pattern)}`;
    await this.model.save(modelPath);
    console.log(`Pattern model saved to ${modelPath}`);
  }

  /**
   * Load model from disk
   */
  async loadModel(): Promise<void> {
    try {
      const modelPath = `file://${path.resolve(MLConfig.modelPaths.pattern)}/model.json`;
      this.model = await tf.loadLayersModel(modelPath);
      console.log(`Pattern model loaded from ${modelPath}`);
    } catch (error) {
      console.warn('Could not load pattern model:', error);
      this.model = null;
    }
  }
}

export const tfPatternModel = new TFPatternRecognitionModel();
