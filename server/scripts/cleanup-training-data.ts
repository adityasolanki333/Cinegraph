import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import '../env.ts';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function cleanupData() {
  try {
    console.log('Starting cleanup of TMDB and MovieLens data...\n');

    // Check which tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('tmdb_training_data', 'movielens_ratings', 'movielens_movies', 'movielens_links', 'movielens_tags')
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length === 0) {
      console.log('✓ No TMDB or MovieLens tables found. Database is already clean.');
      await pool.end();
      process.exit(0);
    }

    console.log('Found the following tables:');
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
    console.log('');

    // Get counts before deletion
    for (const row of tablesResult.rows) {
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${row.table_name}`);
      console.log(`${row.table_name}: ${countResult.rows[0].count} rows`);
    }
    console.log('');

    // Drop tables
    console.log('Dropping tables...');
    for (const row of tablesResult.rows) {
      await pool.query(`DROP TABLE IF EXISTS ${row.table_name} CASCADE`);
      console.log(`✓ Dropped table: ${row.table_name}`);
    }

    console.log('\n✓ All TMDB and MovieLens data has been removed successfully!');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    await pool.end();
    process.exit(1);
  }
}

cleanupData();
