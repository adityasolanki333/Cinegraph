import 'dotenv/config';
import { db } from '../db';
import { movies, tmdbTrainingData } from '@shared/schema';

async function clearMovieData() {
  try {
    console.log('🗑️  Clearing all movie data from database...');
    
    // Delete all TMDB training data (if table exists)
    try {
      const deletedTraining = await db.delete(tmdbTrainingData);
      console.log(`✅ Deleted TMDB training data`);
    } catch (error: any) {
      if (error.code === '42P01') {
        console.log('ℹ️  TMDB training data table does not exist (skipping)');
      } else {
        throw error;
      }
    }
    
    // Delete all movies
    try {
      const deletedMovies = await db.delete(movies);
      console.log(`✅ Deleted all movies from database`);
    } catch (error: any) {
      if (error.code === '42P01') {
        console.log('ℹ️  Movies table does not exist (skipping)');
      } else {
        throw error;
      }
    }
    
    console.log('✨ All movie data cleared successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing movie data:', error);
    process.exit(1);
  }
}

clearMovieData();
