import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import '../env.ts';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyData() {
  console.log('=== Database Data Verification ===\n');

  try {
    // TMDB Training Data
    const tmdbResult = await pool.query(`
      SELECT 
        COUNT(*) as total_records,
        MIN(id) as min_id,
        MAX(id) as max_id,
        COUNT(DISTINCT genres) as unique_genres,
        AVG(vote_average) as avg_rating,
        AVG(popularity) as avg_popularity
      FROM tmdb_training_data
    `);
    
    console.log('📊 TMDB Training Data:');
    console.log(`   Total Records: ${parseInt(tmdbResult.rows[0].total_records).toLocaleString()}`);
    console.log(`   ID Range: ${tmdbResult.rows[0].min_id} - ${tmdbResult.rows[0].max_id}`);
    console.log(`   Unique Genre Combinations: ${tmdbResult.rows[0].unique_genres}`);
    console.log(`   Average Rating: ${parseFloat(tmdbResult.rows[0].avg_rating).toFixed(2)}`);
    console.log(`   Average Popularity: ${parseFloat(tmdbResult.rows[0].avg_popularity).toFixed(2)}`);
    console.log('');

    // MovieLens Ratings
    const ratingsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_ratings,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT movie_id) as unique_movies,
        AVG(rating) as avg_rating,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating
      FROM movielens_ratings
    `);
    
    console.log('⭐ MovieLens Ratings:');
    console.log(`   Total Ratings: ${parseInt(ratingsResult.rows[0].total_ratings).toLocaleString()}`);
    console.log(`   Unique Users: ${parseInt(ratingsResult.rows[0].unique_users).toLocaleString()}`);
    console.log(`   Unique Movies: ${parseInt(ratingsResult.rows[0].unique_movies).toLocaleString()}`);
    console.log(`   Average Rating: ${parseFloat(ratingsResult.rows[0].avg_rating).toFixed(2)}`);
    console.log(`   Rating Range: ${ratingsResult.rows[0].min_rating} - ${ratingsResult.rows[0].max_rating}`);
    console.log('');

    // MovieLens Movies
    const moviesResult = await pool.query(`
      SELECT 
        COUNT(*) as total_movies,
        COUNT(DISTINCT genres) as unique_genre_combos
      FROM movielens_movies
    `);
    
    console.log('🎬 MovieLens Movies:');
    console.log(`   Total Movies: ${parseInt(moviesResult.rows[0].total_movies).toLocaleString()}`);
    console.log(`   Unique Genre Combinations: ${moviesResult.rows[0].unique_genre_combos}`);
    console.log('');

    // MovieLens Links (TMDB/IMDB connections)
    const linksResult = await pool.query(`
      SELECT 
        COUNT(*) as total_links,
        COUNT(tmdb_id) as with_tmdb,
        COUNT(imdb_id) as with_imdb
      FROM movielens_links
    `);
    
    console.log('🔗 MovieLens Links (TMDB/IMDB):');
    console.log(`   Total Links: ${parseInt(linksResult.rows[0].total_links).toLocaleString()}`);
    console.log(`   With TMDB ID: ${parseInt(linksResult.rows[0].with_tmdb).toLocaleString()}`);
    console.log(`   With IMDB ID: ${parseInt(linksResult.rows[0].with_imdb).toLocaleString()}`);
    console.log('');

    console.log('✅ All datasets loaded successfully!');
    console.log('\n=== Summary ===');
    console.log('Ready for ML model training with:');
    console.log(`- ${parseInt(tmdbResult.rows[0].total_records).toLocaleString()} TMDB movie records`);
    console.log(`- ${parseInt(ratingsResult.rows[0].total_ratings).toLocaleString()} user ratings from MovieLens`);
    console.log(`- ${parseInt(moviesResult.rows[0].total_movies).toLocaleString()} MovieLens movies with metadata`);

  } catch (error) {
    console.error('Error verifying data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

verifyData()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Verification failed:', err);
    process.exit(1);
  });
