/**
 * Test script to verify CSV loading works correctly
 */

import { loadTrainingDataset } from '../ml/dataLoaders.js';

async function testCSVLoading() {
  console.log('=== Testing CSV Data Loading ===\n');
  
  try {
    console.log('Loading small sample (1000 ratings, 1000 TMDB movies)...');
    const dataset = await loadTrainingDataset(1000, 1000);
    
    console.log('\n✅ Data loaded successfully!');
    console.log(`\nDataset Summary:`);
    console.log(`- Ratings: ${dataset.ratings.length}`);
    console.log(`- MovieLens Movies: ${dataset.movieLensMovies.size}`);
    console.log(`- TMDB Movies: ${dataset.tmdbMovies.size}`);
    console.log(`- MovieLens->TMDB Links: ${dataset.movieLensToTMDB.size}`);
    
    // Sample some data
    console.log('\n📊 Sample Ratings:');
    dataset.ratings.slice(0, 5).forEach(r => {
      console.log(`  User ${r.userId} rated Movie ${r.movieId}: ${r.rating}/5.0`);
    });
    
    console.log('\n🎬 Sample MovieLens Movies:');
    const mlMovies = Array.from(dataset.movieLensMovies.values()).slice(0, 3);
    mlMovies.forEach(m => {
      console.log(`  [${m.movieId}] ${m.title} - Genres: ${m.genres.join(', ')}`);
    });
    
    console.log('\n🎥 Sample TMDB Movies:');
    const tmdbMovies = Array.from(dataset.tmdbMovies.values()).slice(0, 3);
    tmdbMovies.forEach(m => {
      console.log(`  [${m.id}] ${m.title}`);
      console.log(`    Rating: ${m.voteAverage}/10 (${m.voteCount} votes)`);
      console.log(`    Genres: ${m.genres.join(', ')}`);
      console.log(`    Release: ${m.releaseDate}`);
    });
    
    console.log('\n🔗 Sample Links:');
    const links = Array.from(dataset.movieLensToTMDB.entries()).slice(0, 5);
    links.forEach(([mlId, tmdbId]) => {
      const mlMovie = dataset.movieLensMovies.get(mlId);
      const tmdbMovie = dataset.tmdbMovies.get(tmdbId);
      if (mlMovie && tmdbMovie) {
        console.log(`  MovieLens [${mlId}] "${mlMovie.title}" → TMDB [${tmdbId}] "${tmdbMovie.title}"`);
      }
    });
    
    console.log('\n✅ CSV loading test completed successfully!');
  } catch (error) {
    console.error('\n❌ CSV loading test failed:', error);
    throw error;
  }
}

testCSVLoading()
  .then(() => {
    console.log('\n🎉 Test finished!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  });
