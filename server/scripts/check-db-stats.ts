import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import '../env.ts';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkDatabaseStats() {
  console.log('=== Database Statistics ===\n');
  
  try {
    // Check TMDB data
    const tmdbResult = await pool.query('SELECT COUNT(*) as count FROM tmdb_training_data');
    console.log(`TMDB Training Data: ${parseInt(tmdbResult.rows[0].count).toLocaleString()} records`);
  } catch (err) {
    console.log('TMDB Training Data: Table not found or empty');
  }
  
  try {
    // Check MovieLens ratings
    const ratingsResult = await pool.query('SELECT COUNT(*) as count FROM movielens_ratings');
    console.log(`MovieLens Ratings: ${parseInt(ratingsResult.rows[0].count).toLocaleString()} records`);
  } catch (err) {
    console.log('MovieLens Ratings: Table not found');
  }
  
  try {
    // Check MovieLens movies
    const moviesResult = await pool.query('SELECT COUNT(*) as count FROM movielens_movies');
    console.log(`MovieLens Movies: ${parseInt(moviesResult.rows[0].count).toLocaleString()} records`);
  } catch (err) {
    console.log('MovieLens Movies: Table not found');
  }
  
  try {
    // Check MovieLens links
    const linksResult = await pool.query('SELECT COUNT(*) as count FROM movielens_links');
    console.log(`MovieLens Links: ${parseInt(linksResult.rows[0].count).toLocaleString()} records`);
  } catch (err) {
    console.log('MovieLens Links: Table not found');
  }
  
  await pool.end();
}

checkDatabaseStats()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error checking database stats:', err);
    process.exit(1);
  });
