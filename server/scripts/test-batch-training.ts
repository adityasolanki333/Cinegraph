/**
 * Test Batch Streaming Training Script
 * Tests the batch streaming trainer on a smaller sample to verify functionality
 */

import { batchStreamingTrainer } from '../ml/batchStreamingTrainer';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { movielensRatings } from '@shared/schema';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        Test Batch Streaming Training (100K sample)         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  try {
    // Check total ratings
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(movielensRatings);
    
    const totalRatings = result[0]?.count || 0;
    console.log(`📊 Total ratings in database: ${totalRatings.toLocaleString()}`);
    console.log(`🧪 Testing with 100K sample for verification\n`);
    
    // Create a temporary limited batch streaming trainer for testing
    // We'll override the streaming method to limit results
    const originalStream = batchStreamingTrainer.streamRatingsFromDB.bind(batchStreamingTrainer);
    let totalFetched = 0;
    const sampleLimit = 100000;
    
    // Override to limit to 100K for testing
    batchStreamingTrainer.streamRatingsFromDB = async function* (batchSize: number = 10000) {
      for await (const batch of originalStream(batchSize)) {
        if (totalFetched >= sampleLimit) {
          console.log(`\n✓ Reached sample limit of ${sampleLimit.toLocaleString()} ratings`);
          break;
        }
        
        const batchToYield = batch.slice(0, Math.min(batch.length, sampleLimit - totalFetched));
        totalFetched += batchToYield.length;
        yield batchToYield;
      }
    };
    
    // Run training on sample
    await batchStreamingTrainer.trainStreaming({
      batchSize: 5000,          // Smaller batches for testing
      checkpointEvery: 25000,   // Checkpoint more frequently
      epochs: 1,                // Just 1 epoch for testing
      validationSplit: 0.1,     // 10% validation
    });
    
    console.log('\n✅ Test training completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Review the checkpoint files in server/ml/checkpoints/');
    console.log('  2. Check the final model in server/ml/models/');
    console.log('  3. Run full training: npm run train:full');
    console.log(`\nFull training on ${totalRatings.toLocaleString()} ratings will take approximately 8-12 hours.`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test training failed:', error);
    process.exit(1);
  }
}

main();
