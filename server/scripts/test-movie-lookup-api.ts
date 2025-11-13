/**
 * Test script to verify movie lookup API handles missing TMDB IDs correctly
 * Tests that when a TMDB ID doesn't exist, it searches by title from MovieLens
 */

async function testMovieLookupAPI() {
  console.log('=== Testing Movie Lookup API with Missing TMDB IDs ===\n');
  
  try {
    const baseURL = 'http://localhost:5000';
    
    // Test Case 1: Movie ID that doesn't exist in TMDB (but exists in MovieLens)
    // These IDs are from the "thor" search that were failing
    const testMovieIds = [4339614, 4579195];
    
    for (const movieId of testMovieIds) {
      console.log(`\n--- Testing Movie ID: ${movieId} ---`);
      
      const response = await fetch(`${baseURL}/api/tmdb/movie/${movieId}`);
      const data = await response.json();
      
      console.log(`Response status: ${response.status}`);
      
      if (response.ok) {
        console.log(`✓ Success! Found movie:`);
        console.log(`  Title: ${data.title || 'Unknown'}`);
        console.log(`  ID: ${data.id}`);
        console.log(`  Release Date: ${data.release_date || 'Unknown'}`);
        console.log(`  Overview: ${data.overview?.substring(0, 100) || 'No overview'}...`);
      } else {
        console.log(`✗ Failed with error:`);
        console.log(`  ${data.error}: ${data.message}`);
      }
    }
    
    // Test Case 2: Valid TMDB ID (should work normally)
    console.log('\n\n--- Testing Valid TMDB ID: 10195 (Thor 2011) ---');
    const validResponse = await fetch(`${baseURL}/api/tmdb/movie/10195`);
    const validData = await validResponse.json();
    
    if (validResponse.ok) {
      console.log(`✓ Valid ID works correctly:`);
      console.log(`  Title: ${validData.title}`);
      console.log(`  ID: ${validData.id}`);
      console.log(`  Release Date: ${validData.release_date}`);
    } else {
      console.log(`✗ Unexpected error for valid ID`);
    }
    
    console.log('\n\n=== Test Complete ===');
    console.log('The API should now handle missing TMDB IDs by:');
    console.log('1. Getting movie title from MovieLens dataset');
    console.log('2. Searching TMDB API with that title');
    console.log('3. Returning the search result from TMDB API');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    throw error;
  }
}

testMovieLookupAPI()
  .then(() => {
    console.log('\n✅ All tests completed!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Test failed:', err);
    process.exit(1);
  });
