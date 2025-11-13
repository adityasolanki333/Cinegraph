/**
 * Batch Streaming Training Script
 * Runs the batch streaming trainer on the full database dataset
 * 
 * Dataset:
 *   - 39,535,408 MovieLens ratings
 *   - 84,275 unique movies with ratings
 *   - 908,000 TMDB movies for feature extraction (128D metadata)
 * 
 * Usage:
 *   npm run train-ml-batch                           # Full training (39.5M ratings, 84K movies)
 *   npm run train-ml-batch -- --test                 # Quick test (10K ratings)
 *   npm run train-ml-batch -- --limit 80000          # Train on first 80K ratings
 *   npm run train-ml-batch -- --epochs 3             # Custom epochs
 *   npm run train-ml-batch -- --batch-size 5000      # Custom batch size
 */

import '../env';
import { batchStreamingTrainer } from '../ml/batchStreamingTrainer';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const getArg = (name: string, defaultValue: number): number => {
    const index = args.indexOf(`--${name}`);
    if (index !== -1 && args[index + 1]) {
      return parseInt(args[index + 1]);
    }
    return defaultValue;
  };
  
  const isTest = args.includes('--test');
  
  // Configuration
  const config = {
    batchSize: isTest ? 2000 : getArg('batch-size', 10000),
    checkpointEvery: isTest ? 5000 : getArg('checkpoint-every', 100000),
    epochs: isTest ? 2 : getArg('epochs', 5),
    validationSplit: 0.1,
    limit: isTest ? 10000 : getArg('limit', 0), // 0 = no limit (all data)
  };
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       CineGraph ML Training - Two-Tower Neural Network   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  if (isTest) {
    console.log('🧪 TEST MODE - Quick validation run\n');
  } else if (config.limit > 0) {
    console.log(`📊 LIMITED MODE - Training on first ${config.limit.toLocaleString()} ratings\n`);
  } else {
    console.log('🚀 FULL TRAINING MODE - Processing all 39.5M ratings\n');
  }
  
  console.log('Configuration:');
  console.log(`  Batch Size: ${config.batchSize.toLocaleString()}`);
  console.log(`  Checkpoint Every: ${config.checkpointEvery.toLocaleString()} ratings`);
  console.log(`  Epochs: ${config.epochs}`);
  console.log(`  Validation Split: ${(config.validationSplit * 100)}%`);
  if (config.limit > 0) {
    console.log(`  Limit: ${config.limit.toLocaleString()} ratings`);
  }
  console.log('');
  
  try {
    await batchStreamingTrainer.trainStreaming(config);
    
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║              ✅ TRAINING COMPLETED SUCCESSFULLY!          ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');
    process.exit(0);
  } catch (error) {
    console.error('\n╔══════════════════════════════════════════════════════════╗');
    console.error('║                  ❌ TRAINING FAILED                       ║');
    console.error('╚══════════════════════════════════════════════════════════╝\n');
    console.error(error);
    process.exit(1);
  }
}

main();
