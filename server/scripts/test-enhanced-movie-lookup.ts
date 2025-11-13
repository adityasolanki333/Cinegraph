/**
 * Test script for enhanced movie lookup with fallback strategies
 * Tests TMDB ID -> IMDB ID -> Title search fallback
 */

import { enhancedMovieLookup } from '../ml/enhancedMovieLookup.js';
import { loadMovieLensLinks, loadMovieLensMovies } from '../ml/dataLoaders.js';

async function testEnhancedLookup() {
  console.log('=== Testing Enhanced Movie Lookup ===\n');
  
  try {
    // Initialize the service
    console.log('Initializing enhanced lookup service...');
    await enhancedMovieLookup.initialize();
    
    // Load some sample MovieLens data
    const links = await loadMovieLensLinks();
    const movies = await loadMovieLensMovies();
    
    console.log(`\nLoaded ${links.length} MovieLens links and ${movies.length} movies\n`);
    
    // Test Case 1: Movie with valid TMDB ID
    console.log('--- Test 1: Valid TMDB ID ---');
    const toyStoryLink = links.find(l => l.tmdbId === 862); // Toy Story
    if (toyStoryLink) {
      const result1 = await enhancedMovieLookup.getMovieWithFallback(
        toyStoryLink.tmdbId, 
        toyStoryLink.movieId
      );
      console.log(`✓ TMDB ID ${toyStoryLink.tmdbId}:`);
      console.log(`  Title: ${result1.tmdbData?.title || 'Unknown'}`);
      console.log(`  Source: ${result1.source}`);
      console.log(`  Confidence: ${result1.confidence}`);
    }
    
    // Test Case 2: Movie with potentially invalid TMDB ID but valid IMDB ID
    console.log('\n--- Test 2: Fallback to IMDB ID ---');
    const sampleLink = links[10]; // Random movie
    const result2 = await enhancedMovieLookup.getMovieWithFallback(
      9999999, // Invalid TMDB ID
      sampleLink.movieId
    );
    console.log(`  MovieLens ID: ${sampleLink.movieId}`);
    console.log(`  IMDB ID: ${sampleLink.imdbId}`);
    console.log(`  Result: ${result2.tmdbData?.title || 'Unknown'}`);
    console.log(`  Source: ${result2.source}`);
    console.log(`  Confidence: ${result2.confidence}`);
    
    // Test Case 3: Batch lookup
    console.log('\n--- Test 3: Batch Lookup (10 movies) ---');
    const batchRequests = links.slice(0, 10).map(link => ({
      tmdbId: link.tmdbId,
      movieLensId: link.movieId
    }));
    
    const batchResults = await enhancedMovieLookup.getMoviesBatch(batchRequests);
    
    console.log('\nBatch Results Summary:');
    batchResults.forEach((result, index) => {
      const movie = movies.find(m => m.movieId === result.originalMovieLensId);
      console.log(`  ${index + 1}. ${movie?.title || 'Unknown'}`);
      console.log(`     -> ${result.tmdbData?.title || 'Not found'}`);
      console.log(`     -> Source: ${result.source}, Confidence: ${result.confidence}`);
    });
    
    // Test Case 4: Title search fallback
    console.log('\n--- Test 4: Title Search Fallback ---');
    const matrixMovie = movies.find(m => m.title.includes('Matrix'));
    if (matrixMovie) {
      const result4 = await enhancedMovieLookup.getMovieWithFallback(
        9999998, // Invalid TMDB ID
        matrixMovie.movieId
      );
      console.log(`  MovieLens: ${matrixMovie.title}`);
      console.log(`  Found: ${result4.tmdbData?.title || 'Unknown'}`);
      console.log(`  Source: ${result4.source}`);
      console.log(`  Confidence: ${result4.confidence}`);
    }
    
    // Statistics
    console.log('\n--- Lookup Statistics ---');
    const stats = {
      total: batchResults.length,
      tmdb_id: batchResults.filter(r => r.source === 'tmdb_id').length,
      imdb_id: batchResults.filter(r => r.source === 'imdb_id').length,
      title_search: batchResults.filter(r => r.source === 'title_search').length,
      fallback: batchResults.filter(r => r.source === 'fallback').length
    };
    
    console.log(`  Total lookups: ${stats.total}`);
    console.log(`  ✓ TMDB ID success: ${stats.tmdb_id} (${(stats.tmdb_id/stats.total*100).toFixed(1)}%)`);
    console.log(`  ✓ IMDB ID fallback: ${stats.imdb_id} (${(stats.imdb_id/stats.total*100).toFixed(1)}%)`);
    console.log(`  ✓ Title search fallback: ${stats.title_search} (${(stats.title_search/stats.total*100).toFixed(1)}%)`);
    console.log(`  ⚠ Fallback data: ${stats.fallback} (${(stats.fallback/stats.total*100).toFixed(1)}%)`);
    
    console.log('\n✅ Enhanced lookup test completed successfully!');
  } catch (error) {
    console.error('\n❌ Enhanced lookup test failed:', error);
    throw error;
  }
}

testEnhancedLookup()
  .then(() => {
    console.log('\n🎉 Test finished!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  });
