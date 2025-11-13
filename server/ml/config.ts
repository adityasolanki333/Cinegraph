/**
 * ML Configuration for CineGraph
 * Central configuration for all machine learning models and settings
 */

export const MLConfig = {
  // TensorFlow.js Model Configuration
  tensorflow: {
    // Two-Tower Neural Network
    twoTowerModel: {
      userEmbeddingDim: 64,
      itemEmbeddingDim: 128, // Expanded from 64 to 128 for enhanced TMDB metadata
      hiddenLayers: [128, 64, 32],
      dropout: 0.3,
      learningRate: 0.001,
      batchSize: 32,
      epochs: 50,
      validationSplit: 0.2,
      earlyStoppingPatience: 5,
    },
    
    // Collaborative Filtering Model
    collaborativeModel: {
      embeddingDim: 32,
      layers: [64, 32, 16],
      dropout: 0.2,
      learningRate: 0.001,
      batchSize: 64,
      epochs: 30,
    },
    
    // Pattern Recognition Model (replaces Brain.js)
    patternModel: {
      sequenceLength: 10,
      embeddingDim: 32,
      lstmUnits: 64,
      dropout: 0.3,
      learningRate: 0.001,
      batchSize: 16,
      epochs: 40,
    },
  },

  // Model Persistence
  modelPaths: {
    twoTower: 'server/ml/models/two-tower',
    collaborative: 'server/ml/models/collaborative',
    pattern: 'server/ml/models/pattern-recognition',
    semanticEmbeddings: 'server/ml/models/semantic-embeddings',
  },

  // Training Configuration
  training: {
    // Batch training schedule
    batchTraining: {
      enabled: true,
      schedule: '0 2 * * *', // Daily at 2 AM
      minSamplesRequired: 100,
    },
    
    // Online learning
    onlineLearning: {
      enabled: true,
      updateFrequency: 3600000, // 1 hour in ms
      minFeedbackRequired: 10,
    },
    
    // Model versioning
    versioning: {
      enabled: true,
      maxVersionsToKeep: 5,
      autoRollbackThreshold: 0.15, // 15% accuracy drop triggers rollback
    },
  },

  // Inference Configuration
  inference: {
    // Caching
    enableCaching: true,
    cacheTTL: {
      embeddings: 86400000, // 24 hours
      predictions: 3600000, // 1 hour
      recommendations: 1800000, // 30 minutes
    },
    
    // Batch prediction
    batchSize: 100,
    maxConcurrentPredictions: 50,
    
    // GPU acceleration
    useGPU: true, // TensorFlow.js will auto-detect
    preferWebGL: true,
  },

  // Hybrid Engine Weights
  ensembleWeights: {
    tensorflowDeepLearning: 0.40,
    tensorflowPatterns: 0.25,
    geminiAI: 0.20,
    legacyCollaborative: 0.10,
    contentBased: 0.05,
  },

  // Feature Engineering
  features: {
    // User features
    userFeatures: [
      'genre_preferences',
      'rating_behavior',
      'viewing_patterns',
      'temporal_preferences',
      'social_connections',
      'engagement_level',
    ],
    
    // Item features
    itemFeatures: [
      'genre_vector',
      'quality_metrics',
      'popularity_score',
      'release_info',
      'cast_crew',
      'semantic_features',
    ],
    
    // Contextual features
    contextualFeatures: [
      'time_of_day',
      'day_of_week',
      'season',
      'user_mood',
      'session_context',
      'device_type',
    ],
  },

  // Performance Thresholds
  performance: {
    // Accuracy metrics
    minAcceptableAccuracy: 0.70,
    targetAccuracy: 0.90,
    
    // Latency thresholds
    maxInferenceLatency: 100, // ms
    maxTrainingTime: 3600000, // 1 hour
    
    // Diversity
    minDiversityScore: 0.6,
    targetDiversityScore: 0.8,
  },

  // A/B Testing
  abTesting: {
    enabled: true,
    trafficSplit: 0.5, // 50/50 split
    minSampleSize: 1000,
    confidenceLevel: 0.95,
  },

  // Monitoring & Alerts
  monitoring: {
    metricsToTrack: [
      'accuracy',
      'precision',
      'recall',
      'f1_score',
      'mae',
      'rmse',
      'diversity_score',
      'inference_latency',
      'cache_hit_rate',
    ],
    
    alerts: {
      accuracyDropThreshold: 0.15, // 15% drop
      latencySpike: 500, // ms
      errorRateThreshold: 0.05, // 5% error rate
    },
  },
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'production') {
  MLConfig.training.batchTraining.minSamplesRequired = 1000;
  MLConfig.abTesting.minSampleSize = 5000;
  MLConfig.monitoring.alerts.accuracyDropThreshold = 0.10;
}

if (process.env.NODE_ENV === 'development') {
  MLConfig.tensorflow.twoTowerModel.epochs = 10; // Faster training in dev
  MLConfig.training.batchTraining.enabled = false;
  MLConfig.abTesting.enabled = false;
}

// Model version tracking
export const MODEL_VERSION = '2.0.0-tfjs';
export const LEGACY_MODEL_VERSION = '1.0.0-custom';

export default MLConfig;
