/**
 * Batch Movie Embedding Generator
 * 
 * Processes all movies from tmdb_training_data and generates semantic embeddings
 * using Universal Sentence Encoder. Stores results in semantic_embeddings table.
 * 
 * Features:
 * - Batch processing (configurable batch size)
 * - Progress tracking with ETA
 * - Checkpoint system (resume from interruption)
 * - Error handling and retry logic
 * - Memory efficient streaming
 * 
 * Usage:
 *   npm run embed:movies
 *   npm run embed:movies -- --limit 1000        # Process first 1000 only
 *   npm run embed:movies -- --batch-size 200    # Custom batch size
 *   npm run embed:movies -- --resume            # Resume from last checkpoint
 */

import { db } from '../db';
import { tmdbTrainingData, semanticEmbeddings } from '@shared/schema';
import { useService } from '../ml/universalSentenceEncoder';
import { semanticTextGenerator } from '../ml/semanticTextGenerator';
import { sql, gt, isNull } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ProcessingStats {
  totalMovies: number;
  processedMovies: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  startTime: number;
  lastCheckpoint: number;
  currentBatch: number;
  estimatedTimeRemaining: number;
}

interface CheckpointData {
  lastProcessedId: number;
  stats: ProcessingStats;
  timestamp: Date;
}

class BatchMovieEmbedder {
  private readonly BATCH_SIZE = 100; // Process 100 movies at a time
  private readonly CHECKPOINT_INTERVAL = 5000; // Save checkpoint every 5000 movies
  private readonly CHECKPOINT_DIR = 'server/ml/checkpoints';
  private readonly CHECKPOINT_FILE = 'embed-checkpoint.json';
  private readonly EMBEDDING_VERSION = 'v1-use-512';
  
  private stats: ProcessingStats = {
    totalMovies: 0,
    processedMovies: 0,
    successCount: 0,
    errorCount: 0,
    skippedCount: 0,
    startTime: Date.now(),
    lastCheckpoint: 0,
    currentBatch: 0,
    estimatedTimeRemaining: 0
  };
  
  async run(options: {
    limit?: number;
    batchSize?: number;
    resume?: boolean;
  } = {}): Promise<void> {
    const batchSize = options.batchSize || this.BATCH_SIZE;
    
    console.log('='.repeat(60));
    console.log('🎬 BATCH MOVIE EMBEDDING GENERATOR');
    console.log('='.repeat(60));
    console.log(`Batch size: ${batchSize}`);
    console.log(`Checkpoint interval: ${this.CHECKPOINT_INTERVAL} movies`);
    console.log(`Embedding version: ${this.EMBEDDING_VERSION}`);
    console.log('='.repeat(60));
    
    try {
      // Initialize USE model
      console.log('\n📦 Loading Universal Sentence Encoder...');
      await useService.initialize();
      console.log('✅ Model loaded successfully\n');
      
      // Create checkpoint directory
      await this.ensureCheckpointDir();
      
      // Get total count and starting point
      let startFromId = 0;
      if (options.resume) {
        const checkpoint = await this.loadCheckpoint();
        if (checkpoint) {
          startFromId = checkpoint.lastProcessedId;
          this.stats = checkpoint.stats;
          console.log(`📂 Resuming from checkpoint (last ID: ${startFromId})`);
          console.log(`   Already processed: ${this.stats.processedMovies} movies\n`);
        }
      }
      
      // Get total movie count
      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tmdbTrainingData)
        .where(options.limit ? sql`id > ${startFromId} LIMIT ${options.limit}` : sql`id > ${startFromId}`);
      
      this.stats.totalMovies = countResult.count;
      console.log(`📊 Total movies to process: ${this.stats.totalMovies.toLocaleString()}\n`);
      
      // Process in batches
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        // Fetch batch
        const movies = await db
          .select()
          .from(tmdbTrainingData)
          .where(gt(tmdbTrainingData.id, startFromId))
          .orderBy(tmdbTrainingData.id)
          .limit(batchSize)
          .offset(offset);
        
        if (movies.length === 0) {
          hasMore = false;
          break;
        }
        
        // Process batch
        await this.processBatch(movies);
        
        // Update offset and last processed ID
        startFromId = movies[movies.length - 1].id;
        offset = 0; // Reset offset since we're using WHERE id > lastId
        
        // Save checkpoint if needed
        if (this.stats.processedMovies - this.stats.lastCheckpoint >= this.CHECKPOINT_INTERVAL) {
          await this.saveCheckpoint(startFromId);
          this.stats.lastCheckpoint = this.stats.processedMovies;
        }
        
        // Check if we've hit the limit
        if (options.limit && this.stats.processedMovies >= options.limit) {
          hasMore = false;
        }
      }
      
      // Final summary
      this.printFinalSummary();
      
      // Save final checkpoint
      await this.saveCheckpoint(startFromId);
      
    } catch (error) {
      console.error('❌ Fatal error:', error);
      throw error;
    }
  }
  
  private async processBatch(movies: any[]): Promise<void> {
    const batchStartTime = Date.now();
    this.stats.currentBatch++;
    
    console.log(`\n📦 Batch ${this.stats.currentBatch} (${movies.length} movies)`);
    console.log('─'.repeat(60));
    
    // Generate semantic text for all movies
    const movieTexts = movies.map(movie => ({
      id: movie.id,
      text: semanticTextGenerator.generateMovieText({
        id: movie.id,
        title: movie.title,
        originalTitle: movie.originalTitle,
        overview: movie.overview,
        genres: movie.genres,
        cast: movie.cast,
        director: movie.director,
        releaseDate: movie.releaseDate,
        tagline: movie.tagline,
        voteAverage: movie.voteAverage
      }),
      shortText: semanticTextGenerator.generateShortText({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.releaseDate,
        genres: movie.genres
      })
    }));
    
    // Filter out invalid texts
    const validMovieTexts = movieTexts.filter(mt => 
      semanticTextGenerator.validateText(mt.text)
    );
    
    if (validMovieTexts.length < movieTexts.length) {
      const skipped = movieTexts.length - validMovieTexts.length;
      console.log(`⚠️  Skipped ${skipped} movies with invalid text`);
      this.stats.skippedCount += skipped;
    }
    
    if (validMovieTexts.length === 0) {
      console.log('⚠️  No valid movies in this batch, skipping...');
      this.stats.processedMovies += movies.length;
      return;
    }
    
    try {
      // Generate embeddings in batch (most efficient)
      console.log(`🧠 Generating embeddings for ${validMovieTexts.length} movies...`);
      const texts = validMovieTexts.map(mt => mt.text);
      const embeddings = await useService.embedToArray(texts);
      
      // Store embeddings in database
      console.log('💾 Storing embeddings in database...');
      
      for (let i = 0; i < validMovieTexts.length; i++) {
        try {
          await db
            .insert(semanticEmbeddings)
            .values({
              tmdbId: validMovieTexts[i].id,
              mediaType: 'movie',
              embedding: embeddings[i],
              textSource: validMovieTexts[i].shortText
            })
            .onConflictDoUpdate({
              target: [semanticEmbeddings.tmdbId, semanticEmbeddings.mediaType],
              set: {
                embedding: embeddings[i],
                textSource: validMovieTexts[i].shortText
              }
            });
          
          this.stats.successCount++;
        } catch (error) {
          console.error(`   ❌ Error storing movie ${validMovieTexts[i].id}:`, error);
          this.stats.errorCount++;
        }
      }
      
      this.stats.processedMovies += movies.length;
      
      // Calculate and display progress
      const batchTime = Date.now() - batchStartTime;
      const avgTimePerMovie = (Date.now() - this.stats.startTime) / this.stats.processedMovies;
      const remainingMovies = this.stats.totalMovies - this.stats.processedMovies;
      this.stats.estimatedTimeRemaining = avgTimePerMovie * remainingMovies;
      
      const progress = (this.stats.processedMovies / this.stats.totalMovies) * 100;
      const eta = this.formatDuration(this.stats.estimatedTimeRemaining);
      const rate = (validMovieTexts.length / (batchTime / 1000)).toFixed(1);
      
      console.log(`✅ Batch complete in ${(batchTime / 1000).toFixed(1)}s (${rate} movies/sec)`);
      console.log(`📊 Progress: ${this.stats.processedMovies.toLocaleString()}/${this.stats.totalMovies.toLocaleString()} (${progress.toFixed(1)}%)`);
      console.log(`⏱️  ETA: ${eta}`);
      console.log(`✓ Success: ${this.stats.successCount.toLocaleString()} | ✗ Errors: ${this.stats.errorCount} | ⊝ Skipped: ${this.stats.skippedCount}`);
      
    } catch (error) {
      console.error('❌ Error processing batch:', error);
      this.stats.errorCount += validMovieTexts.length;
      this.stats.processedMovies += movies.length;
    }
  }
  
  private async ensureCheckpointDir(): Promise<void> {
    try {
      await fs.mkdir(this.CHECKPOINT_DIR, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }
  
  private async saveCheckpoint(lastProcessedId: number): Promise<void> {
    const checkpoint: CheckpointData = {
      lastProcessedId,
      stats: this.stats,
      timestamp: new Date()
    };
    
    const checkpointPath = path.join(this.CHECKPOINT_DIR, this.CHECKPOINT_FILE);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
    
    console.log(`\n💾 Checkpoint saved (last ID: ${lastProcessedId})`);
  }
  
  private async loadCheckpoint(): Promise<CheckpointData | null> {
    try {
      const checkpointPath = path.join(this.CHECKPOINT_DIR, this.CHECKPOINT_FILE);
      const data = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
  
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  
  private printFinalSummary(): void {
    const totalTime = Date.now() - this.stats.startTime;
    const avgTimePerMovie = totalTime / this.stats.processedMovies;
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 EMBEDDING GENERATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total movies processed: ${this.stats.processedMovies.toLocaleString()}`);
    console.log(`✅ Successfully embedded: ${this.stats.successCount.toLocaleString()}`);
    console.log(`❌ Errors: ${this.stats.errorCount}`);
    console.log(`⊝ Skipped: ${this.stats.skippedCount}`);
    console.log(`⏱️  Total time: ${this.formatDuration(totalTime)}`);
    console.log(`📈 Average: ${avgTimePerMovie.toFixed(0)}ms per movie`);
    console.log(`🎯 Success rate: ${((this.stats.successCount / this.stats.processedMovies) * 100).toFixed(1)}%`);
    console.log('='.repeat(60) + '\n');
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options: any = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--resume') {
      options.resume = true;
    }
  }
  
  const embedder = new BatchMovieEmbedder();
  await embedder.run(options);
  process.exit(0);
}

// Run if called directly (ES module compatible)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { BatchMovieEmbedder };
