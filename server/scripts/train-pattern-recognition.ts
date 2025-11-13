/**
 * Training Script for Pattern Recognition Model (Phase 7)
 * Trains LSTM model on user viewing patterns
 */

import { tfPatternModel } from '../ml/tfPatternRecognition';
import { db } from '../db';
import { userRatings } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('========================================');
  console.log('Pattern Recognition Model Training');
  console.log('========================================\n');

  try {
    // Check if we have enough data
    const userCount = await db
      .select({ count: sql<number>`count(distinct ${userRatings.userId})` })
      .from(userRatings);

    const totalUsers = Number(userCount[0]?.count || 0);
    console.log(`Found ${totalUsers} users in the database`);

    if (totalUsers < 10) {
      console.log('\n⚠️  Warning: Not enough users for meaningful training');
      console.log('Recommendation: Add more user ratings before training');
      console.log('You can use the MovieLens dataset for testing\n');
      
      // Train anyway for demonstration
      console.log('Proceeding with available data for demonstration...\n');
    }

    // Train the model
    console.log('Starting LSTM pattern recognition training...');
    const metrics = await tfPatternModel.train();

    // Display results
    console.log('\n========================================');
    console.log('Training Complete!');
    console.log('========================================');
    console.log(`Loss: ${metrics.loss.toFixed(4)}`);
    console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`);
    console.log('\nModel saved successfully');
    console.log('You can now use the pattern recognition API endpoints:');
    console.log('  - GET /api/recommendations/pattern/predict/:userId');
    console.log('  - GET /api/recommendations/pattern/analyze/:userId');
    console.log('  - POST /api/recommendations/pattern/session/:userId');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Training failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
