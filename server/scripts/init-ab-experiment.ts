/**
 * Initialize A/B Test Experiment for Recommendation Algorithms
 * This script creates and starts an experiment to compare different recommendation strategies
 */

import { abTestingEngine } from '../ml/abTesting';

async function initRecommendationExperiment() {
  try {
    console.log('Creating recommendation algorithm A/B test...');

    // Create experiment comparing different recommendation algorithms
    const experiment = await abTestingEngine.createExperiment({
      name: 'Recommendation Algorithm Comparison',
      description: 'Compare performance of different recommendation algorithms: Neural Network vs Hybrid Ensemble vs Pipeline',
      sampleSize: 1000,
      confidenceLevel: 0.95,
      variants: [
        {
          id: 'control-hybrid',
          name: 'Control: Hybrid Ensemble',
          type: 'hybrid_ensemble',
          config: {
            description: 'Traditional hybrid recommendation system',
            endpoint: '/api/recommendations/hybrid'
          },
          trafficAllocation: 0.34, // 34% of traffic
        },
        {
          id: 'variant-neural',
          name: 'Variant A: Neural Network',
          type: 'tensorflow_neural',
          config: {
            description: 'TensorFlow-based neural recommendation',
            endpoint: '/api/recommendations/neural'
          },
          trafficAllocation: 0.33, // 33% of traffic
        },
        {
          id: 'variant-pipeline',
          name: 'Variant B: Multi-Stage Pipeline',
          type: 'hybrid_ensemble',
          config: {
            description: 'Advanced 3-stage pipeline with diversification',
            endpoint: '/api/recommendations/pipeline'
          },
          trafficAllocation: 0.33, // 33% of traffic
        }
      ]
    });

    console.log('✅ Experiment created:', experiment.id);
    console.log('   Name:', experiment.name);
    console.log('   Variants:', experiment.variants.length);

    // Start the experiment
    await abTestingEngine.startExperiment(experiment.id);
    console.log('✅ Experiment started successfully!');
    console.log('\nExperiment Details:');
    console.log('  - ID:', experiment.id);
    console.log('  - Status: running');
    console.log('  - Variants:');
    experiment.variants.forEach(v => {
      console.log(`    * ${v.name} (${(v.trafficAllocation * 100).toFixed(0)}%)`);
    });
    
    console.log('\n📊 Track experiment results at: /ml-dashboard');
    
    return experiment;
  } catch (error) {
    console.error('Error initializing A/B experiment:', error);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  initRecommendationExperiment()
    .then(() => {
      console.log('\n✨ A/B test experiment is now active!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed to initialize experiment:', error);
      process.exit(1);
    });
}

export { initRecommendationExperiment };
